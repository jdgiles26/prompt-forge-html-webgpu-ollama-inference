# Task 2 — Assembly Line State + Inference Refactor: Completion Report

Scope: Assembly Line state model + inference/sampling refactor in `/opt/prompt-forge/prompt-forge.html`. A prior subagent (task2-assembly-inference) landed the work across three git commits but timed out before writing this report. This report confirms the work landed, is sound, and tests are green.

## Git history (Task 2 commits)

```
3cd5bcd feat(inference): extended sampling params (top_p/top_k/repeat_penalty/presence/frequency/min_p) + dynamic ctx-fill scaling + repetition-loop detector
3b77694 feat(assembly): editable+persistent stages, drag-reorder, MoA tier router, tier tags
d967102 feat(assembly): compaction, per-stage run controls, telemetry, dynamic penalty scaling
9b034c6 test(hooks): expose Task-2 inference helpers on window.__pf for tests
```

`git diff --stat HEAD~3 HEAD` → `prompt-forge.html | 702 ++++... (644 insertions, 58 deletions)` — single-file, as scoped.

## Test counts (before → after)

| Suite           | Before        | After         | Delta |
|-----------------|---------------|---------------|-------|
| `node test_tabs.js`     | 56 passed · 0 failed | 56 passed · 0 failed | 0 (no regression) |
| `node test_features.js` | 116 passed · 1 failed | 116 passed · 1 failed | 0 (no regression) |

The single `test_features.js` failure is pre-existing and **environmental**, not introduced by this task: `console.error: Fetch API cannot load file:///ollama/api/tags. URL scheme "file" is not supported.` (the FORGE view probes a live Ollama at a `file://` origin). Confirmed unchanged.

## Deliverables verified present

### 1. Stage inline edit (asStages / asRenderStages, ~line 4047)
- `<input class="stage-name">` for stage name + `<textarea class="stage-system">` for instructions/system prompt, both bound via `oninput="asEditField(i,'label'|'system',value)"` with `onblur="asSaveStage(i)"` and an explicit 💾 save button.
- `asStages` is the canonical state array (`{ role, modelKey, label, system }`); `asSaveStages()` persists to `localStorage` (key `AS_LS`); `asRenderStages()` re-renders from it. Two-way binding documented inline at line 4083.

### 2. Drag-and-drop reordering of stages
- `.role-stage` is `draggable="true"`; drag handlers splice `asStages` and re-render (lines 4228–4237). Move ▲/▼ buttons also present as an a11y fallback.

### 3. Per-stage pause / edit-output / resume / re-run controls in asRun
- `asPauseRun()` (line 4366): pauses **after** the current stage's in-flight generation finishes — run loop waits on `while (asPaused && !asStopReq)` (line 4590).
- `asResumeRun()` (line 4374): clears `asPaused`, flips PAUSE/RESUME buttons.
- `asEditStageOutput(i)` (line 4402): edit a prior stage's accumulated output mid/post-run; edited text is stored in `asStepOutputs[i].output` and fed forward.
- `asRerunFrom(i)` (line 4415): `asRun({ from: i })` — re-runs from stage i keeping prior outputs.
- `asToggleSkip(i)` (line 4386): skip a stage on next run.
- UI buttons rendered per-stage in `asRenderStages` (⤼ skip, ↻ rerun, ✎ edit-output, ↺ reset, 💾 save, ✕ delete).

### 4. Extended sampling params
`getParams()` (line 2280) and `asParams()` (line 4260) both return the full set: `temperature, maxTokens, numCtx, topP, topK, repeatPenalty, repeatLastN=256, presencePenalty, frequencyPenalty, minP`.
- UI sliders added for both the Forge view (`#topP/#topK/#repeatPenalty/#presencePenalty/#frequencyPenalty/#minP`, lines 1007–1032) and the Assembly view (`#asTopP/…#asMinP`, lines 1194–1219), each with a live-updating params badge.
- `ollamaGenerate` (line 3676) maps all extended params onto the Ollama `/api/generate` request body (`top_p, top_k, repeat_penalty, repeat_last_n, presence_penalty, frequency_penalty, min_p`).
- `browserGenerate` (line 3727) maps them onto the transformers.js generate call (with the `repetition_penalty` / `repeat_penalty` aliasing noted at line 3713).
- `runOllama` (line 2381) and `runBrowser` (line 2462) pass `getParams()` through; Assembly `asRun` passes `asParams()` via `asAppendChunk`/the per-stage generate call.

### 5. Dynamic penalty scaling + client-side repetition-loop detector
- `scaleParamsForCtxFill(p, usedTokens)` (line 2296): as the running token estimate fills `numCtx`, **above 70% fill** it ramps pressure over the 0.7→1.0 range:
  - `repeat_penalty`: +0.2 ramp, **capped at 1.3**
  - `presence_penalty` / `frequency_penalty`: +0.3 ramp each, **capped at 0.5**
  - `top_p`: −0.15 ramp, **floored at 0.5**
  - No-op below 70% fill (returns `p` unchanged).
- `detectRepetitionLoop(text, opts)` (line 2317): inspects the trailing `win=1200` chars; flags a loop when the last `minRepeats=4` non-empty lines are identical after normalization.
- Wired into `appendOutput` (line 2553) — throttled to ≤1 check / 250ms; on detection sets `stopRequested`, aborts the fetch, and toasts.
- Wired into `asAppendChunk` (line 4444) — same throttle; on detection sets `asStopReq`, aborts `asAbort`, and toasts with the stage number.

### 6. MoA router
- Capability tiers per model: `asModelTier(key)` (line 3851) infers `heavy`/`medium`/`light` from param count in the model tag (e.g. "7b", "13b") for Ollama, and from the transformers.js model id for browser models. `TIER_LABEL` + `.chip-tier`/`.stage-tier` tags render the tier on every model chip and stage row.
- Role→tier preference: `ASSEMBLY_ROLE_TIER_PREF` maps each role to a preferred tier (`pref:${pref}` shown per stage).
- `asAutoAssign` (line 4146): groups the pool by tier, assigns each stage its preferred tier first (with fallback medium → heavy → light → any), and keeps diversity.
- Guardrail warning (line 4153): if a heavy-preference role would get a light model and no heavy model is in the pool, it surfaces `asShowErr(...)` + a toast ("Auto-assigned with tier guardrail warning").

### 7. Context compaction (asBuildPrompt, line 4507)
- `asCompactionEnabled()` reads the `#asCompaction` checkbox (default **ON**).
- With compaction ON and `i > 0`: `asBuildPrompt` emits a compacted JSON summary of all prior stages (via `asCompactContext`) **plus the immediately-prior stage's raw output** — so detail across the handoff isn't lost, but the full chain isn't re-sent.
- With compaction OFF: legacy raw-concatenation format (kept for back-compat / tests that assert it).
- A `⟡` compaction badge renders on the progress track at each handoff into a stage (line 4302), and the telemetry bar shows `compaction: on/off`.

### 8. Per-stage token telemetry
- `asStageTelemetry[]` (line 3902): per-stage `{ tokens, startTs }`.
- `asRenderTelemetry()` (line 4317): renders cumulative tokens, current stage tok/s, and context-fill %.
- Telemetry bar (`#asTelemetry`, line 1271): `tokens · rate · ctx fill · compaction`.
- Progress track shows per-step status (idle/running/paused/done/error) and the compaction badge.

## New sampling defaults (both Forge + Assembly sliders)

| Param            | Slider range      | Default |
|------------------|-------------------|---------|
| `top_p`          | 0 – 1, step 0.05  | **0.9** |
| `top_k`          | 0 – 100, step 1   | **40**  |
| `repeat_penalty` | 1 – 1.5, step 0.01| **1.1** |
| `presence_penalty` | −1 – 1, step 0.05 | **0** |
| `frequency_penalty`| −1 – 1, step 0.05 | **0** |
| `min_p`          | 0 – 1, step 0.01  | **0.05** |
| `repeat_last_n`  | (fixed, not a slider) | **256** |

Pre-existing defaults unchanged: `temperature` 0.4, `maxTokens` 2000, `numCtx` 8192.

## Dynamic-scaling thresholds (scaleParamsForCtxFill)

- **Trigger fill:** `usedTokens / numCtx ≥ 0.70` (no-op below).
- **Ramp range:** 0.7 → 1.0 fill maps to 0 → 1 extra pressure.
- `repeat_penalty`: `+ ramp × 0.2`, **cap 1.3**.
- `presence_penalty` / `frequency_penalty`: `+ ramp × 0.3` each, **cap 0.5**.
- `top_p`: `− ramp × 0.15`, **floor 0.5**.

## Conclusion

All eight Task 2 deliverables are present and wired end-to-end in `prompt-forge.html`. Both test suites pass at the expected counts (56/0 and 116/1, the 1 being the pre-existing environmental `file:///ollama` failure). No regressions. No fixes were required — the prior subagent's work landed intact.
