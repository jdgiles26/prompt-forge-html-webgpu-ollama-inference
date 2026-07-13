# Prompt Forge — Bug Confirmation / Refutation

Each bug is verified against `prompt-forge.html` with file:line citations. No fixes applied (recon only).

Legend: CONFIRMED · PARTIALLY CONFIRMED · NOT FOUND · DIFFERENT-THAN-REPORTED.

---

## 1. Assembly Line: cannot edit a stage's name or instructional text after "ADD STAGE"; no save button; no entry form after creation.
**CONFIRMED.**

`asAddStage()` (`prompt-forge.html:3111`):
```js
window.asAddStage = function() {
  asStages.push({ role: 'custom', modelKey: '' });
  asRenderStages();
};
```
`asRenderStages()` (line 3089) renders each stage as:
```js
return `<div class="role-stage" data-i="${i}">
  <div class="stage-num">${i+1}</div>
  <div class="stage-role">${escapeHtmlShared(role.label)}<span class="role-sub">${escapeHtmlShared(role.sub)}</span></div>
  <select onchange="asSetStageModel(${i}, this.value)">${opts(s.modelKey)}</select>
  <button class="stage-del" title="Remove stage" onclick="asDelStage(${i})">✕</button>
</div>`;
```
A newly added stage gets `role:'custom'`, whose label is hardcoded to "Custom" via `ASSEMBLY_ROLES.find(...) || { label: 'Custom', sub: '' }` (line 3098). There is **no `<input>` for the stage name, no textarea for instructional text, no save button** — only a model-assignment `<select>` and a delete button. The stage's system prompt is the fixed `ASSEMBLY_SYSTEMS.custom` string (line ~2974): `"You are a specialist stage in a multi-agent assembly line. Build on the prior stages' outputs. Be specific and terse."` Existing (non-custom) stages also have no edit affordance — their role label is read-only text. `asSetStageModel` (line 3109) only sets `modelKey`.

---

## 2. Navigation tabs (Forge / Assembly Line / Agent Forge): no hover tooltips; not visually prominent; no clear active state; poor contrast (dark gray on black) failing WCAG.
**PARTIALLY CONFIRMED.** (Contrast claim is accurate; "no clear active state" is refuted — there IS an active state.)

Tab markup (`prompt-forge.html:683-686`):
```html
<button class="tab active" data-view="forge"      onclick="switchTab('forge')"      role="tab"><span class="tab-dot"></span>FORGE</button>
<button class="tab"        data-view="assembly"   onclick="switchTab('assembly')"   role="tab"><span class="tab-dot"></span>ASSEMBLY LINE</button>
<button class="tab"        data-view="agentforge" onclick="switchTab('agentforge')" role="tab"><span class="tab-dot"></span>AGENT FORGE</button>
```
- **No tooltips**: the tab `<button>`s have **no `title=` attribute** (confirmed by grep — `title=` appears only on HELP/EXPORT/IMPORT/regen/refine/refresh/splitter/del buttons, lines 693-695, 788, 886-887, 895, etc., never on `.tab`). CONFIRMED.
- **Active state EXISTS**: `.tab.active` CSS (line 502-505): `background: rgba(0,200,255,0.14); color: var(--accent); text-shadow: 0 0 12px rgba(0,200,255,0.5);` plus `.tab.active .tab-dot { box-shadow: 0 0 7px currentColor; }` (line 509). `switchTab` toggles `.active` (line 2691-2693). So "no clear active state" is **REFUTED** — there is a clear cyan active state.
- **Contrast**: default `.tab` color is `var(--muted)` = `#4a6878` (line 21) on `--surface` `#0d1318` / `--bg` `#080c0f` (header background `--surface` line 57). `#4a6878` on `#0d1318` is a low-contrast combination (contrast ratio ≈ 3.0:1, below WCAG AA 4.5:1 for normal text; the font is 11px mono uppercase — small text). Font size 11px (line 495). CONFIRMED for the inactive state.
- **Hover**: `.tab:hover { background: rgba(0,200,255,0.06); color: var(--text); }` (line 500) improves contrast on hover.
- **Prominence**: tabs are 11px uppercase mono in a thin bordered bar (line 486-498); not visually prominent relative to the rest of the UI. CONFIRMED.
- **No `aria-selected`** on the tabs (only `role="tab"`); no `aria-controls`/`aria-labelledby` wiring to panels. The active state is visual-only (`.active` class), not reflected in ARIA.

---

## 3. Complete Project Pkg: no radio-button group to select test framework/type before forging.
**CONFIRMED.**

The MODE section (line 721-732) only has two buttons: `Single Prompt` / `Complete Project Pkg` (`setMode`). The TEMPLATE section (line 774-793) is a `<select>` of task-type templates (refactor/greenfield/bugfix/performance/security/migration/datapipeline/ml/embedded/api) — **not** test frameworks. There is **no UI element (radio or select) anywhere** to choose a test framework (pytest/jest/vitest/unittest/go test/etc.). Grep for `pytest|jest|vitest|unittest|testFramework|test_fw|framework_sel` finds only `pytest` inside the `SYSTEM_PROMPT_PROJECT` example text (line 1255: `pytest test_[task_name].py -v`) and the test_output artifacts — no UI control. The Makefile `test:` target and `requirements.txt` are left as model-filled placeholders in `SYSTEM_PROMPT_PROJECT` (lines 1393-1407).

---

## 4. Template dropdown: only "None (vanilla forge)" — no task-type templates.
**DIFFERENT-THAN-REPORTED / NOT FOUND.**

`#templateSel` (`prompt-forge.html:774-791`) contains **11 options**: "None (vanilla forge)" plus 10 task-type templates: refactor, greenfield, bugfix, performance, security, migration, datapipeline, ml, embedded, api. Presets live in `TEMPLATE_PREFIX` (line 1562) and are prepended by `baseSystemPrompt()` (line 1554). The bug as reported is **REFUTED** — the templates exist in markup and are wired to `onTemplateChange()` (line 1617). (If a user sees only "None", that would be a runtime rendering bug, not a code defect — the options are statically present in the HTML.)

---

## 5. No drag-and-drop for .gguf/.onnx model files.
**CONFIRMED** (with nuance).

There is **no `ondrop`/`ondragover`/`dragenter` handler and no `<input type="file">` for model files** anywhere in the app. Grep for `ondrop|dragover|dragenter|\.gguf|\.onnx|type="file"|FileReader` returns no model-file drop zone. The only `dragging` references are the panel **splitter** resize handlers (lines 2245-2276, 3382-3391, 3986-3995). "GGUF" appears only as an **Agent Forge interview answer option** (`gguf_file`, line 3485) and follow-up text question `gguf_detail` (line 3502) — these capture how the *generated agent package* should expect a GGUF, they do NOT accept a model file in Prompt Forge itself. The inference backends only consume Ollama model names (via `/api/tags`) or WebLLM prebuilt model IDs from the `BROWSER_MODELS` catalog / `#browserModel` `<select>`. No custom-model-file loading path exists.

---

## 6. No live Hugging Face leaderboard / HF API key input.
**CONFIRMED.**

Grep for `hugging|leaderboard|hf_api|hf_key|HF_TOKEN` finds only two static text mentions: (a) help-modal tip line 1168: `"Custom HF model ID accepts any text-generation ONNX model on Hugging Face."` (this is help text; there is no actual "custom HF model ID" input wired to anything — the `#browserModel` select only lists WebLLM prebuilt IDs); (b) README prose. There is **no HF API key `<input>`, no leaderboard fetch, no HF API call**. The app is explicitly "No accounts, no API keys, no telemetry" (README). Inference is Ollama (local) or WebLLM (in-browser) only.

---

## 7. PARAMS section: TEMP/MAX TOKENS/CTX numerical inputs visually overlap with sliders; potentially dual-editable causing event-listener conflicts.
**DIFFERENT-THAN-REPORTED / NOT FOUND.**

The PARAMS section (Forge: lines 844-860; Assembly: 999-1014) uses **only `<input type="range">` sliders**. There are **no `<input type="number">` or `<input type="text">` param inputs** (grep for `type="number"` returns only a CSS selector at line 197, not an actual element). Each `.slider-row` (CSS line 217-233) is a flex row: `<span class="lbl">` + `<input type="range">` + `<span class="val">` (read-only display span, NOT an input). The `.val` span is updated by `updateParamsBadge()` (line 1662) / `asUpdateParamsBadge()` (line 3135) on `oninput`. Therefore: **no numerical text inputs exist to overlap with sliders, and there is no dual-editable conflict** (single source of truth = the slider's `.value`). The reported overlap/dual-edit conflict does not exist in the code. (If the report describes a *visual* overlap of the `.val` span text on the slider thumb at small widths, that's a cosmetic CSS concern, not a dual-input event conflict — the CSS gives `.val` `min-width:42px; text-align:right` and `gap:8px`, so overlap is unlikely but not pixel-audited here.)

---

## 8. Live Pipeline: only global STOP, no per-stage pause/edit/resume.
**CONFIRMED.**

Assembly run loop `asRun()` (line 3245-3338) iterates `for (let i = 0; i < asStages.length; i++)` and the only cancel is `asStop()` (line 3187):
```js
window.asStop = function() {
  asStopReq = true;
  if (asAbort) { try { asAbort.abort(); } catch {} }
  toast('Stop requested');
};
```
`#asStopBtn` (line 980) is a single global button. Inside the loop, the only per-stage check is `if (asStopReq) break;` (line 3269) and `if (asStopReq)` after generation (line 3294). There is **no per-stage pause, no per-stage resume, no per-stage edit, no per-stage re-run**. The progress track (`asRenderProgressTrack` line 3153) is display-only (`.pstep` spans); clicking a stage does nothing. Each stage `<select>` only changes the model assignment before a run, not during.

---

## 9. No per-stage token consumption telemetry.
**CONFIRMED.**

The only token telemetry is in the **Forge view**: `tokCount`/`genStartTs`/`tokRateTimer` (lines 1465-1467), `startTokRate()`/`stopTokRate()` (1917/1930), `approxTokens(s)=ceil(len/4)` (1506), displayed in `#tokrateText` ("X tok/s · Y tok"). This is global to a single Forge generation and is **not wired into the Assembly or Agent Forge views**. In `asRun`, chunks go to `asAppendChunk` (line 3217) which only updates `body.dataset.raw` and re-tints — **no token counting, no tok/s, no per-stage token display**. Assembly shows only `asCharCount` (char count) and `asState` (status label). Agent Forge similarly has only `afCharCount`. No per-stage token budget, no cumulative token total, no context-fill fraction per stage.

---

## 10. Inference engine: repeating line-by-line text output loops causing file corruption; no dynamic repetition/presence/frequency penalty scaling as context fills.
**PARTIALLY CONFIRMED.** (The "repeating line-by-line loops / file corruption" claim is a runtime model-behavior issue, not a code defect; the "no dynamic penalty scaling" claim is CONFIRMED.)

- **No repetition/presence/frequency penalty params exist at all.** `getParams()` (line 1672) returns only `{temperature, maxTokens, numCtx}`. `asParams()` (line 3145) returns the same three. The Ollama request body (Forge `runOllama` line 1738-1747; shared `ollamaGenerate` line 2839-2842) sends `options: { temperature, num_ctx, num_predict }` — **no `repeat_penalty`, `repeat_last_n`, `presence_penalty`, `frequency_penalty`, `top_p`, `top_k`**. The WebLLM call (line 1831-1837; `browserGenerate` line 2889-2891) sends only `{messages, temperature, max_tokens, stream}` — WebLLM's `chat.completions.create` could accept more but none are passed. CONFIRMED: no penalty params, and certainly no *dynamic scaling* of them as context fills (there is no logic reading context fill ratio to adjust any param).
- **Repeating output / file corruption**: This is a known failure mode of small models (esp. qwen3:0.6b / SmolLM2) when generating long structured FILE-block payloads with no repetition penalty and a small `num_ctx`. The code does **nothing to detect or break repetition loops** — `appendOutput` (line 1902) and `asAppendChunk` (line 3217) blindly append every chunk; there is no loop/repetition detector, no output-length circuit breaker beyond `maxTokens`/`num_predict`. So the app is structurally vulnerable to the reported behavior, but there is no code that *causes* a loop per se (it's model-driven). The `checkCtxOverflow()` warning (line 1951) exists only in the Forge view and only warns the user; it does not change params or stop generation.
- Note: the `obj.thinking` handling in `ollamaGenerate` (line 2856) calls `onChunk('')` for thinking tokens — a no-op for chunk append, so it does not corrupt output, but it also does not surface thinking text to the user in the shared layer (only Forge's `runOllama` ignores `thinking` entirely; line 1773 only checks `obj.response`).

---

## 11. Expand/collapse glitch in WebGPU vs Ollama "Inference Backend" section: aria-expanded / display state desynced on first and subsequent renders, visual clipping/overlapping.
**PARTIALLY CONFIRMED.** (aria-expanded desync is CONFIRMED — there is no aria-expanded at all; "visual clipping/overlapping" not reproduced in code review.)

- **`aria-expanded` is entirely absent.** Grep for `aria-expanded` across the file returns **zero matches**. The section expand/collapse is handled by `toggleSection(id)` (line 1528):
  ```js
  window.toggleSection = function(id) {
    document.getElementById(id).classList.toggle('open');
  };
  ```
  CSS (lines 155-173): `.section-body { display: none; ... }` and `.section.open .section-body { display: flex; }`. The chevron `›` rotates via `.section.open .section-chev { transform: rotate(90deg); }` (line 171). State is carried **only** by the `.open` class on the section — there is no `aria-expanded` on `.section-head` and no `aria-controls`. So the "aria-expanded desync" is really "aria-expanded is missing entirely" — screen readers get no state. CONFIRMED (different mechanism than reported).
- **Backend section default state**: `#sec-backend` has `class="section open"` in markup (line 765), so it starts expanded. `ollamaConfig` has `class="backend-config visible"` (line 781) and `browserConfig` has `class="backend-config"` (no `visible`, line 799) — so only the Ollama config shows initially, matching `backend='ollama'` default (line 1463). `setBackend` (line 1684) toggles `.visible` on both. The `.backend-config` CSS uses `display:none` / `.visible{display:block}` (need to confirm) — the toggle is symmetric, so no first-render desync is evident in code. The "visual clipping/overlapping on first/subsequent renders" was not reproduced by static review; it may be a runtime layout issue (e.g., the `#modelProgress` block or `#fileProtoBanner` pushing layout) but is not obviously present in the CSS. The backend section itself is a normal collapsible `.section`.
- **Note**: the backend toggle is two buttons (Ollama / Browser AI), not a single expand/collapse — the expand/collapse is the whole "INFERENCE BACKEND" section via `toggleSection('sec-backend')`. There is no separate "WebGPU vs Ollama" expand/collapse pair; there is one section with two sub-configs toggled by `setBackend`.

---

## 12. All 7 complex stages routed through a single small model (qwen3:0.6b) — no Mixture-of-Agents routing.
**PARTIALLY CONFIRMED.** (No MoA routing is CONFIRMED; "single small model qwen3:0.6b for all stages" is NOT hardcoded — it depends on user selection.)

- **No Mixture-of-Agents routing.** The Assembly Line runs stages **sequentially**, each stage = exactly one model from the pool, chosen by the user via the per-stage `<select>` (`asSetStageModel` line 3109) or `asAutoAssign` round-robin (line 3122). There is no router model, no dynamic per-task model selection, no parallel agent aggregation/voting. `asRun` (line 3245) is a simple `for` loop. CONFIRMED: no MoA.
- **"All 7 stages through a single small model"**: There are **6** default stages (not 7) per `ASSEMBLY_ROLES` (line 2907). Nothing in the code forces `qwen3:0.6b` — model assignment is user-driven; a user *could* assign the same small model to every stage (and `asAutoAssign` with a 1-model pool would do exactly that, line 3123: `pool[i % pool.length]`), but it is not hardcoded. `qwen3:0.6b` is not in the `BROWSER_MODELS` WebGPU catalog (line 2718-2735); it appears only as an example string in the Agent Forge interview help text (`qwen3:0.6b` line 3496) and README prose. So the "single small model for all stages" is a **user-configuration outcome**, not a code fact — but the *absence of any guardrail or MoA routing* that would prevent it is CONFIRMED. There is no model-diversity enforcement, no capability-tier matching per role.

---

## 13. No context compaction between stages (raw output passed forward — "lost in the middle" risk).
**CONFIRMED.**

`asBuildPrompt(i, userTask)` (line 3234):
```js
function asBuildPrompt(i, userTask) {
  const parts = ['USER TASK:\n' + userTask];
  for (let j = 0; j < i; j++) {
    const o = asStepOutputs[j];
    if (!o) continue;
    const role = ASSEMBLY_ROLES.find(r => r.id === asStages[j].role) || { label: 'Stage ' + (j+1) };
    parts.push(`\n--- PRIOR STAGE ${j+1}: ${role.label} ---\n${o.output}`);
  }
  return parts.join('\n');
}
```
The full, raw, uncompacted `o.output` of every prior stage is concatenated into the next stage's prompt. No summarization, no truncation, no token-budgeting, no "compact" step. By stage 6, the prompt contains the raw output of stages 1-5 plus the user task — which can easily exceed `numCtx` (default 8192) for any non-trivial project, causing Ollama to truncate the front of the context ("lost in the middle"/truncation). There is **no per-stage context-overflow check** in the assembly view (the `checkCtxOverflow` at line 1951 is Forge-view-only and not called from `asRun`). Agent Forge's `afGenerate` (line 3808) similarly passes `accumulated` raw prior output forward (line 3854: `userPrompt + '\n\n--- PRIOR MODEL OUTPUT ---\n' + accumulated`), no compaction.

---

## 14. No sandbox execution (WASM/WebContainers) for the executor output; reviewer relies on weights alone.
**CONFIRMED.**

Grep for `webcontainer|wasm|sandbox|pyodide|exec|eval(` (runtime execution) finds **no in-browser code execution**. The Executor stage (`ASSEMBLY_SYSTEMS.execute` line ~2950) instructs the model to emit FILE blocks; the Code Reviewer stage (`ASSEMBLY_SYSTEMS.codereview` line ~2960) is instructed: `"Do NOT rewrite the code. Only review it. Be specific (cite file paths)."` and bases its review on reading the emitted text — it does **not** execute the code, run tests, or observe runtime behavior. There is no Pyodide, no WebContainers, no WASM interpreter, no test-runner — the reviewer "relies on weights alone" (i.e., the model's priors) to judge correctness. The only actual test execution in the whole project is in the **external Node test harness** `test_zip_runs_tdd.js` (runs `pytest` in `test_output/sandbox/` outside the browser), not in the app. CONFIRMED: no sandboxed execution inside the app; reviewer is text-only.

---

## Summary table

| # | Bug | Verdict | Key location |
|---|---|---|---|
| 1 | Assembly stage name/text not editable after add | CONFIRMED | `asAddStage` 3111, `asRenderStages` 3089-3106 |
| 2 | Tabs: no tooltip/contrast/active state | PARTIALLY CONFIRMED (active state exists; contrast & no-tooltip confirmed; no aria-selected) | tabs 683-686, CSS 486-509, vars 10-24 |
| 3 | No test-framework radio before forging | CONFIRMED | MODE 721-732, SYSTEM_PROMPT_PROJECT 1278-1430 |
| 4 | Template dropdown only "None" | DIFFERENT-THAN-REPORTED (10 templates exist) | `#templateSel` 774-791, `TEMPLATE_PREFIX` 1562 |
| 5 | No drag-drop for .gguf/.onnx | CONFIRMED | no ondrop/file input anywhere; GGUF only as AF interview option 3485 |
| 6 | No HF leaderboard / API key input | CONFIRMED | only help text 1168; no HF calls |
| 7 | Params number inputs overlap sliders, dual-edit conflict | DIFFERENT-THAN-REPORTED (sliders only, no number inputs) | PARAMS 844-860, CSS 217-233 |
| 8 | Live Pipeline: only global STOP, no per-stage pause/edit/resume | CONFIRMED | `asRun` 3245, `asStop` 3187 |
| 9 | No per-stage token telemetry | CONFIRMED | only Forge tokRate 1917; assembly has none |
| 10 | Repeating output loops / no dynamic penalty scaling | PARTIALLY CONFIRMED (no penalty params at all; loop = model behavior, no detector) | getParams 1672, ollamaGenerate 2836, appendOutput 1902 |
| 11 | Expand/collapse aria-expanded desync / clipping | PARTIALLY CONFIRMED (no aria-expanded at all; clipping not reproduced in code) | toggleSection 1528, CSS 155-173 |
| 12 | All stages → single small model, no MoA | PARTIALLY CONFIRMED (no MoA; single-model is user choice, not hardcoded; 6 stages not 7) | asRun 3245, asAutoAssign 3122, ASSEMBLY_ROLES 2907 |
| 13 | No context compaction between stages | CONFIRMED | asBuildPrompt 3234 |
| 14 | No sandbox execution; reviewer weights-only | CONFIRMED | codereview system prompt ~2960; no pyodide/webcontainer/wasm |

