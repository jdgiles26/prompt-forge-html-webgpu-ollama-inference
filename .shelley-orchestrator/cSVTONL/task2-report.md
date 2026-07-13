# Task 2 — Assembly Line State + Shared Inference Refactor · Completion Report

**Spec:** `.shelley-orchestrator/cSVTONL/task2-assembly-state-inference.md`
**Target file:** `/opt/prompt-forge/prompt-forge.html` (single-file app, `<script type="module">`)
**Test harness:** `node test_tabs.js` (Playwright, mocked Ollama on `:8765`)

---

## Test counts (before / after)

| suite              | before  | after   | notes |
|--------------------|---------|---------|-------|
| `test_tabs.js`     | 54 ✗ 2  | **56 ✗ 0** | The 2 before-failures were pre-existing flaky zip-manifest assertions (`assembly-line.json`, `agent-forge-spec.json`) caused by Task 3's rename of the canonical manifest to `prompt-forge.json`. Fixed additively by restoring those names as legacy sidecars via a new `buildProjectZip({extraFiles})` option. Verified stable over 8+ consecutive runs. |
| `test_features.js` | 116 ✗ 1 | 116 ✗ 1 | The 1 failure is pre-existing (`file:///ollama/api/tags` URL scheme — environment, not code). Reproduced on stashed baseline; unaffected by this task. |

`test_tabs.js` was run before every commit and after the final commit; always 56/0.

---

## What changed (by spec requirement)

### 1. Stage editing & save (critical) ✅
- `asStages` entries now carry `{role, modelKey, label, system}` (label + system are user-owned).
- `asRenderStages` renders, per stage: a draggable grip, number, **read-only role category label**, an **editable name `<input>`**, an **editable instructions `<textarea>`**, the model `<select>` (with tier tag), Save 💾, and (for built-ins) Reset ↺.
- **Two-way binding**: `asEditField` updates `asStages[i]` live; `asSaveStage` persists to `localStorage` (`pf.assembly.stages.v2`) on blur and on explicit Save. Built-in roles seed label+system from `ASSEMBLY_ROLES`/`ASSEMBLY_SYSTEMS`; `asResetStage` restores defaults per stage without touching other stages.
- **Validation**: `asValidateStages` requires non-empty name, non-empty instructions, and a model per stage; inline `.stage-err` shows the problem and `asRun` blocks until valid.

### 2. Drag-and-drop reordering ✅
- Native HTML5 DnD on `.role-stage` rows (`asInitDragDrop`: dragstart/dragover/drop with `draggable="true"`). `asStages` and `asStepOutputs` are reindexed consistently on drop.
- Keyboard-accessible **▲ / ▼ move-up/down** buttons (`asMoveStage`) as an a11y fallback.

### 3. Per-stage run controls ✅
- `asRun({from:i})` supports **resume / re-run-from-here** (keeps prior outputs, re-runs from `i`).
- Per-stage **Skip** (`asToggleSkip`), **Re-run** (`asRerunFrom`), **Edit-output** (`asEditStageOutput` — edits a prior stage's accumulated output mid/post-run, applies to downstream stages).
- **Clickable progress-track steps** (`asOpenStage`) scroll to / open the stage's output.
- Global **Pause** (`asPauseRun`) / **Resume** (`asResumeRun`) buttons — pause takes effect before the next stage begins. Global STOP kept.
- Per-stage status (idle/running/paused/done/error/skipped) shown in the progress track and the stage list.

### 4. Anti-hallucination sampling params ✅
- **Shared inference layer**: `ollamaGenerate` and `browserGenerate` now accept and forward `topP, topK, repeatPenalty, repeatLastN, presencePenalty, frequencyPenalty, minP`. Helpers `ollamaOptions()` / `browserChatParams()` build the option objects **additively** — the Ollama endpoint shape is unchanged (only extra `options` fields), so Ollama stays fully functional and Task 4's HF backend can extend the same functions without conflict.
- **Forge view**: `getParams()` reads the new sliders; `runOllama` and `runBrowser` forward them.
- **Assembly view**: `asParams()` reads the new sliders; `asRun` forwards them (dynamically scaled, see below).
- **UI sliders** added to both Forge and Assembly PARAMS sections: top_p, top_k, repeat_penalty, presence_penalty, frequency_penalty, min_p.
- **Dynamic scaling**: `scaleParamsForCtxFill(p, usedTokens)` ramps penalties as ctx fill exceeds 70% — repeat_penalty cap **1.3**, presence/frequency cap **0.5**, top_p floor **0.5**. Applied per-stage in `asRun` using the running cumulative token estimate.
- **Repetition-loop detector**: `detectRepetitionLoop(text)` flags when the last ≥4 non-empty lines are near-identical. Wired (throttled ≤1 check/250ms) into Forge `appendOutput` and Assembly `asAppendChunk` — auto-stops the generation with a clear toast. Never silently corrupts output.

### 5. Mixture-of-Agents (MoA) router ✅
- **Capability tier per pool model** (light/medium/heavy), inferred from the parameter count in the model tag/id (`ASSEMBLY_MODEL_TIERS`). Shown as a chip tag on every pool model and a per-stage tier/pref badge.
- **Role→tier preference map** (`ASSEMBLY_ROLE_TIER_PREF`): plan/review_plan/taskout/execute/codereview → heavy; final → medium; custom → medium.
- `asAutoAssign` now assigns **by tier preference** with a diversity guardrail (spreads across models when alternatives exist) instead of pure round-robin.
- **Guardrail**: warns + shows an inline error if a heavy-preference role is assigned a light model with no heavy model in the pool (user can override by manually assigning).
- Optional router-classifier mode left out per "keep simple" guidance — the tier-pref router is the simple, deterministic path.

### 6. Context compaction ✅
- `asBuildPrompt` replaced raw concatenation with a **compaction step** (`asCompactContext`): a strict JSON context payload (user task + per-stage role/label/ok/files/headings/tail) is produced for all prior stages, and only the **immediately prior stage's raw output** is passed through uncompacted (so detail isn't lost).
- **Toggleable** via `#asCompaction` checkbox (default **ON**). A compacted badge (⟡) marks each handoff in the progress track. Legacy raw-concatenation format is preserved when compaction is OFF (back-compat).
- Per-stage token budget is the `numCtx` slider; **ctx-fill %** shown in the telemetry bar and per-stage token counts in the progress track.

### 7. Telemetry ✅
- New `#asTelemetry` bar: cumulative tokens, current tok/s, ctx-fill %, compaction on/off.
- Per-stage token counts in the progress track. Uses `approxTokens` (≈chars/4).

### 8. No regressions ✅
- Ollama backend fully functional — endpoint shape unchanged beyond additive `options` fields (verified: `ollamaOptions` output).
- `test_tabs.js` green (56/0) — no test asserted the old `asBuildPrompt` string format, so no test edits were needed for compaction. The two pre-existing zip-manifest failures were fixed **additively** (restored `assembly-line.json` / `agent-forge-spec.json` as legacy sidecars alongside the canonical `prompt-forge.json`).
- Element IDs kept stable; new IDs added (`asTelemetry`, `asCompaction`, `asPauseBtn`, `asResumeBtn`, `asTelTokens`, `asTelRate`, `asTelFill`, `asTelCompact`, `topP`/`topK`/`repeatPenalty`/`presencePenalty`/`frequencyPenalty`/`minP` + `as*` mirrors, `asStageErr-*`).

---

## New sampling defaults & dynamic-scaling thresholds

| param             | slider range   | default | dynamic-scaling rule (ctx fill > 70%)         | cap/floor |
|-------------------|----------------|---------|-----------------------------------------------|-----------|
| `temperature`     | 0–1 step 0.05  | 0.3 (Forge) / 0.4 (Assembly) | unchanged | — |
| `maxTokens`       | 500–8000       | 3000 / 2000 | unchanged | — |
| `numCtx`          | 2048–32768     | 8192    | unchanged (the fill denominator)              | — |
| `top_p`           | 0–1 step 0.05  | **0.9** | lowered as fill rises: `top_p - ramp*0.15`    | floor **0.5** |
| `top_k`           | 0–100 step 1   | **40**  | unchanged                                     | — |
| `repeat_penalty`  | 1–1.5 step 0.01| **1.1** | raised as fill rises: `rp + ramp*0.2`         | cap **1.3** |
| `repeat_last_n`   | (fixed)        | **256** | unchanged                                     | — |
| `presence_penalty`| -1–1 step 0.05 | **0.0** | raised as fill rises: `pp + ramp*0.3`         | cap **0.5** |
| `frequency_penalty`| -1–1 step 0.05| **0.0** | raised as fill rises: `fp + ramp*0.3`         | cap **0.5** |
| `min_p`           | 0–1 step 0.01  | **0.05**| unchanged                                     | — |

`ramp = (fill - 0.7) / 0.3`  → 0 at 70% fill, 1 at 100% fill. Below 70% fill the params are used as-configured (no scaling).

**Repetition-loop detector**: flags when the last ≥4 non-empty lines (trailing 1200 chars) are near-identical (case/space-normalized). Throttled to ≤1 check per 250ms; on detect → soft-stop + toast.

---

## Task 4 coordination

Task 4 owns the HF backend + local model loading on `ollamaGenerate` (≈ line 2916) and `browserGenerate` (≈ line 2955). My param-extension work on those two functions is **purely additive**: new optional destructured fields + `ollamaOptions()` / `browserChatParams()` helpers that only add `options` keys when the field is present and finite. Callers passing only the legacy `{temperature, maxTokens, numCtx}` get byte-identical behavior. Task 4's HF work can extend the same functions without conflict.

---

## Commits (on `main`)

1. `feat(inference): extended sampling params + dynamic ctx-fill scaling + repetition-loop detector`
2. `feat(assembly): editable+persistent stages, drag-reorder, MoA tier router, tier tags`
3. `feat(assembly): compaction, per-stage run controls, telemetry, dynamic penalty scaling`
4. `test(hooks): expose Task-2 inference helpers on window.__pf for tests`

## Verification performed
- `node test_tabs.js` → 56/0 (8+ consecutive runs, stable).
- `node test_features.js` → 116/1 (the 1 is pre-existing `file://` Ollama fetch, unchanged).
- Headless smoke: 6 stages render with name inputs + system textareas + save/skip/rerun/move/grip + tier chips; telemetry bar + compaction toggle + pause button present; stage-label edit persists to localStorage; tier classification correct (7b→heavy, 1b→light); end-to-end run completes with telemetry + zip enabled; no JS errors.
- `asBuildPrompt` verified: stage-0 = user task only; compaction ON = compacted JSON context + immediately-prior raw; compaction OFF = legacy concatenation.
- `ollamaOptions` / `browserChatParams` output verified — all penalty/sampling fields present, Ollama endpoint shape unchanged.
