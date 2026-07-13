# Prompt Forge — Codebase Recon Map

## Tech stack
- **Single-file HTML application.** The entire app lives in `prompt-forge.html` (~4000 lines, 186 KB). No framework (vanilla JS), no build step, no bundler.
- Language: HTML + CSS + ES module JS (inline `<script type="module">`).
- Entry point: `prompt-forge.html` (declared `"main"` in `package.json`). Opened via `python3 serve.py` (a 50-line `http.server` that sets COOP/COEP headers at `serve.py:32-34` for SharedArrayBuffer/WebGPU) → `http://127.0.0.1:8765/prompt-forge.html`.
- External runtime deps loaded from CDN at runtime: `@mlc-ai/web-llm` (ESM, `https://esm.run/@mlc-ai/web-llm`) and `jszip@3.10.1` (UMD script, `https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js`). No npm runtime deps; dev deps are `playwright` + `adm-zip` (test-only).
- `package.json` type: `commonjs`, engines node>=18, python>=3.8.

## File layout (root)
| File | Purpose |
|---|---|
| `prompt-forge.html` | The whole app — single standalone file (lines 1-4000). `<head>` + `<style>` lines 7-674; `<body>` 676-3999; inline `<script type="module">` 1188-3998. |
| `serve.py` | Local HTTP server w/ COOP+COEP headers (needed for WebGPU SAB/workers). |
| `package.json` | npm scripts + dev deps for the test suite. |
| `list_webllm_models.js` | Helper: enumerate WebLLM prebuilt model list (Playwright). |
| `test_features.js` | 117 Playwright DOM/UI tests for the FORGE view (file://). |
| `test_tabs.js` | 56 Playwright tests for ASSEMBLY LINE + AGENT FORGE tabs (localhost, mocked Ollama). |
| `test_e2e_project.js` | 76 e2e project-pipeline tests (stream → parse → zip); writes `test_output/`. |
| `test_zip_runs_tdd.js` | 8 tests: unzip forged zip, prove pytest RED→GREEN. |
| `test_webgpu_local_http.js` | WebGPU smoke test + dropdown ID validation vs WebLLM prebuilt config. |
| `test_output/` | Generated artifacts (gitignored) — see testing-infra.md. |
| `node_modules/` | dev-only (playwright, adm-zip). |

## HTML structure
- `:root` CSS vars (lines 10-24): `--bg:#080c0f`, `--surface:#0d1318`, `--panel:#111820`, `--border:#1e2d3a`, `--accent:#00c8ff`, `--text:#c8dde8`, `--muted:#4a6878`, `--amber/red/green`.
- Header (lines 679-695): title, tabbar, status pills, HELP/EXPORT/IMPORT buttons.
- `.views-host` (line 706) contains three `<section class="view">` panels.

## Three navigation views/tabs
- **Tab bar markup** — `prompt-forge.html:683-686`:
  - `<div class="tabbar" id="tabbar" role="tablist">`
  - three `<button class="tab" data-view="forge|assembly|agentforge" onclick="switchTab(...)">` with a `<span class="tab-dot">` and label.
- **Tab CSS** — `.tabbar`/`.tab`/`.tab.active`/`.tab:hover` at lines 486-509. `.tab` default color is `var(--muted)` (#4a6878, a dim teal-gray on `--bg` #080c0f / `--surface`). `.tab.active` → `color:var(--accent)` (#00c8ff) with cyan text-shadow. `.tab:hover` → `background: rgba(0,200,255,0.06); color: var(--text)`.
- **switchTab()** — `prompt-forge.html:2685-2700`:
  ```js
  window.switchTab = function(name) {
    if (!TABS.includes(name)) return;   // TABS = ['forge','assembly','agentforge'] (line 2683)
    activeTab = name;
    for (const t of TABS) document.getElementById('view-' + t).classList.toggle('hidden', t !== name);
    document.querySelectorAll('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    try { localStorage.setItem('pf.activeTab.v1', name); } catch {}
    if (name === 'assembly')   asEnsureInit();
    if (name === 'agentforge') afEnsureInit();
  };
  ```
  Restore on load: IIFE at line 2702-2707 reads `pf.activeTab.v1` from localStorage.
- **Views**:
  - `#view-forge` (line 707, not hidden by default) — original app.
  - `#view-assembly` (line 936, `class="view hidden"`).
  - `#view-agentforge` (line 1062, `class="view hidden"`).
- `.view.hidden { display: none; }` (line 521). Each view is independent; switching only toggles `hidden` + `active` and lazily inits the new tab.

## FORGE view (key functions, all in `prompt-forge.html`)
- MODE toggle: `setMode('single'|'project')` line 1536; toggles `modeSingle`/`modeProject` buttons, `modeBadge`, `modeHelp`, and shows/hides `zipBtn`.
- TEMPLATE select: `#templateSel` (line 774) with 10 options (refactor, greenfield, bugfix, performance, security, migration, datapipeline, ml, embedded, api) + "None". `onTemplateChange()` line 1617; presets in `TEMPLATE_PREFIX` (line 1562). `baseSystemPrompt()` line 1551 prepends template prefix.
- BACKEND toggle: `setBackend('ollama'|'browser')` line 1684 — toggles `btnOllama`/`btnBrowser` active classes, `ollamaConfig`/`browserConfig` `.visible` class, `backendBadge`, shows file:// banner if browser+file://, warns if no `navigator.gpu`.
- PARAMS: sliders only — `#temperature` (range 0-1 step .05, default 0.3), `#maxTokens` (500-8000 step 100, default 3000), `#numCtx` (2048-32768 step 1024, default 8192). `updateParamsBadge()` line 1662; `getParams()` line 1672. **No number/text inputs, no repetition/presence/frequency/top_p/top_k.**
- Ollama (Forge view): `fetchOllamaModels()` line 1705 → `GET {base}/api/tags` (base default `/ollama`). `runOllama(userText)` line 1729 → `POST {base}/api/generate` with `{model, system, prompt, stream:true, options:{temperature, num_ctx, num_predict}}` (line 1738-1747). Streams NDJSON, appends `obj.response` via `appendOutput`.
- Browser/WebGPU (Forge view): `loadWebLLM()` line 1807 (dynamic `import('https://esm.run/@mlc-ai/web-llm')`). `runBrowser(userText)` line 1814 → `webllm.CreateMLCEngine(modelId, {initProgressCallback})`, then `engine.chat.completions.create({messages, temperature, max_tokens, stream:true})`. Default model selected in `#browserModel`: `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` (line 806, `selected`).
- **forge button handler**: `window.forge` at line 2044 — `onclick="forge()"` on `#forgeBtn` (line 885). Sets `streaming`, calls `runOllama` or `runBrowser`, then `applyTint()`, `saveHistory()`. Stop: `stopGeneration()` line 1936. Regen line 2111, Refine line 1969.
- Output streaming: `appendOutput(chunk)` line 1902 appends to a single Text node (O(1)) + `dataset.raw`. `tintMarkdown`/`applyTint` post-stream (line 2126/2166). Token rate meter: `startTokRate`/`stopTokRate` lines 1917/1930 (global, Forge only).
- Project file parser: `parseProjectFiles(text)` line 2345 — regex `/^===\s*FILE:\s*(.+?)\s*===\s*$([\s\S]*?)^===\s*END FILE\s*===\s*$/gm`, handles CRLF.

## Complete Project Pkg / export pipeline (FORGE)
- Triggered by `downloadZip()` — `window.downloadZip` line 2381 (`#zipBtn` shown only in project mode via `setMode`).
- Parses `getRawOutput()` with `parseProjectFiles`, builds a `JSZip` archive (`loadJSZip()` line 2366, loads jszip UMD from jsdelivr), adds each `f.path`/`f.body`, plus a `prompt-forge.json` manifest (forged_at, mode, backend, model, template, params, task, file_count).
- **Scaffolding is NOT generated in JS** — it is dictated by the `SYSTEM_PROMPT_PROJECT` meta-prompt (line 1278-1430). The model is instructed to emit these files in order: `README.md`, `CLAUDE.md`, `AGENTS.md`, `DONE.md`, `Makefile`, `.gitignore`, `src/before/main.<ext>`, `src/after/main.<ext>`, `tests/test_main.<ext>`, `tests/conftest.<ext>`, `requirements.txt` (or `package.json` for JS). **No `drift.md`, no `agent.md`, no `architectural.md`, no `capabilities.md`** in the prompt. Extensions are chosen by the model from the detected stack.
- Validation expected files: `REQUIRED_PROJECT_FILES` line 2443 = `['README.md','CLAUDE.md','AGENTS.md','DONE.md','Makefile','.gitignore']`.
- **No test-framework radio/select in the UI.** The Makefile `test:` target and `requirements.txt`/`package.json` content are left as `[test command — must run tests/ directory]` / `[Pinned dependencies]` placeholders for the model to fill — there is no UI control to pick pytest vs jest vs vitest etc.

## ASSEMBLY LINE view (`#view-assembly`, line 936)
- Init: `asEnsureInit()` line 3004 (sets `asInited`, builds default stages from `ASSEMBLY_ROLES`, renders pool/stages/params/progress, inits splitter).
- **Model pool**: `asRefreshModels()` line 3021 (Ollama via `fetchOllamaTagsRaw`), `asRenderBrowserPool()` line 3046 (renders `BROWSER_MODELS` chips), `asTogglePool(k)` line 3064 toggles membership in `asPool` Set. Pool list: `asPoolList()` line 3074.
- **Stages**: `asStages` array of `{role, modelKey}`. `asRenderStages()` line 3089 renders each stage as `.role-stage` with a number, role label, a `<select onchange="asSetStageModel(i, value)">` listing pool models, and a delete `✕`. `asSetStageModel` line 3109. `asAddStage()` line 3111 pushes `{role:'custom', modelKey:''}`. `asDelStage` 3116, `asAutoAssign` 3122 (round-robin), `asResetStages` 3130.
- **Roles** (`ASSEMBLY_ROLES` line 2907): plan / review_plan / taskout / execute / codereview / final — 6 default stages. Per-role system prompts in `ASSEMBLY_SYSTEMS` (line 2917), plus a `custom` fallback. **Stage role is fixed at creation; for custom stages the role label is "Custom" and there is NO UI to edit the stage's name or instructional text — `asAddStage` hardcodes `role:'custom'` and no input field is rendered.**
- **PARAMS** (assembly): `asTemperature` (default 0.4), `asMaxTokens` (default 2000), `asNumCtx` (8192) — sliders only, `asParams()` line 3145. Output mode select `#asOutputMode` (project zip | prompt .md), line 1019.
- **Run**: `asRun()` line 3245. For each stage in order: builds prompt via `asBuildPrompt(i, task)` line 3234 = `USER TASK:\n<task>` + for each prior stage `\n--- PRIOR STAGE j: label ---\n<full raw output>`. Calls `ollamaGenerate` (line 2836) or `browserGenerate` (line 2873) from the shared inference layer. Chunks → `asAppendChunk` (line 3217) which sets `body.dataset.raw` and re-tints. Output stored in `asStepOutputs[i] = {role,label,model,output[,err]}`.
- **Per-stage controls**: only a global STOP (`asStop()` line 3187 sets `asStopReq`, aborts `asAbort`). **No per-stage pause/edit/resume.** No per-stage token counter — only the global Forge-view tok/s meter exists, and it is NOT wired into the assembly view (assembly uses `asState`/`asCharCount` only).
- **Progress track**: `asRenderProgressTrack()` line 3153 — renders `.pstep` spans (idle/active/done/err) based on `asStepOutputs`.
- **Handoff / compaction**: NO compaction. `asBuildPrompt` concatenates the **raw full output** of every prior stage (line 3234-3243). Final product = last non-error stage output; `parseFilesShared` → zip (`asDownloadZip` line 3339) or `.md` (`asDownloadMd` line 3360).

## AGENT FORGE view (`#view-agentforge`, line 1062)
- Guided interview. Questions defined in `AF_QUESTIONS` array (line ~3430 onward): goal, existence, language, framework, host, team, browser headless, power source (multichips: api_key/ollama/webgpu/gguf_file/no_ai), api_provider, ollama_models, gguf_detail, extras, confirm.
- `afEnsureInit()` line 3542; `afRenderWizard()` 3551; `afRenderQuestion` 3565; `afPick` 3588; `afRefreshVisibility` 3605 (uses `showIf` predicates for conditional questions); `afBuildSpec()` 3758 serializes answers to text.
- Generate: `afGenerate()` line 3808 — runs pool models in sequence (first scaffolds, later refine) using shared `ollamaGenerate`/`browserGenerate`, accumulates output, parses files → zip (`afDownloadZip` 3928) + file tree (`afRenderFileTree` 3913). Uses `asParams()` for params (shares assembly's param inputs).

## Shared inference layer (used by Assembly + Agent Forge tabs; Forge view has its own copies)
- `BROWSER_MODELS` catalog (line 2718-2735) — 15 WebLLM model IDs (Qwen2.5-Coder 0.5B/1.5B/7B, Qwen2.5 1.5/3/7B, Llama 3.2 1B/3B, Llama 3.1 8B, SmolLM2 135M/360M/1.7B, DeepSeek-R1-Distill 7B/8B, Phi-3.5 mini, Gemma 2 2B). **No `qwen3:0.6b` in the WebGPU catalog** (qwen3 is referenced only in README text and as an Ollama example string in AF_QUESTIONS help text `qwen3:0.6b` line 3496, and in `ollamaGenerate` comments about thinking models).
- `_engines` registry (line 2739): one MLCEngine per modelId, cached. `sharedWebLLM()` line 2742.
- `fetchOllamaTagsRaw(base)` line 2827 → `GET {base}/api/tags`.
- `ollamaGenerate({base,model,system,prompt,temperature,maxTokens,numCtx,onChunk,stopFlag,signal})` line 2836 → `POST {base}/api/generate` with `options:{temperature, num_ctx, num_predict}`. Handles `obj.thinking` (qwen3 reasoning) by calling `onChunk('')` (no-op) so UI shows progress. **No repeat_penalty/presence/frequency/top_p/top_k sent.**
- `browserGenerate({modelId,system,prompt,temperature,maxTokens,onChunk,stopFlag,progressCb})` line 2873 → `engine.chat.completions.create({messages, temperature, max_tokens, stream:true})`.

## Token tracking / telemetry
- **Forge view only**: `tokCount`, `genStartTs`, `tokRateTimer` (lines 1465-1467); `startTokRate()`/`stopTokRate()` (1917/1930) update `#tokrateText` with "X tok/s · Y tok". `approxTokens(s)=ceil(len/4)` line 1506.
- Input/output meters: `updateInputMeter()`/`updateOutputMeter()` (1515/1519).
- Context-overflow warning: `checkCtxOverflow()` line 1951 (Forge, Ollama only) — warns if `inputTok + maxTokens > numCtx`.
- **Assembly Line & Agent Forge: NO token telemetry.** No tok/s, no per-stage token count, no context-overflow check. Only char count (`asCharCount`, `afCharCount`).

## Stages definition & inter-stage handoff (Assembly Line)
- 6 default roles from `ASSEMBLY_ROLES` (Planner → Plan Reviewer → Task Architect → Executor → Code Reviewer → Final Reviewer). Each stage = one model from the pool.
- Inter-stage: `asBuildPrompt(i, task)` (line 3234) concatenates the **raw, uncompacted** output of every prior stage prefixed with `--- PRIOR STAGE j: label ---`. No summarization, no compaction, no truncation — full raw text accumulates down the line.
- Final stage's output is the product (FILE blocks → zip, else → .md).

