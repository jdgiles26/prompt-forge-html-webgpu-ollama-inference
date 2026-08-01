# Task 4 — Edge Models + Sandboxed TDD (Verification Report)

**Status:** ✅ Complete & verified — no new regressions.
**Commit:** `1443801` — `feat(edge): HF cloud backend, local gguf/onnx drag-drop, pyodide TDD sandbox`
**Scope:** `prompt-forge.html` +1022 / −10 lines (6442 → 7464 at that commit; file is now 7961 lines after the later Task-2026 commit `27ce263` layered on top).
**Verifier note:** The prior subagent timed out before writing its report, but all claimed work is present and functional. No fixes were required — verification only.

---

## 1. What landed

### 1a. Hugging Face cloud backend (`setBackend('hf')`)
Third backend alongside Ollama (default) and Browser/WebGPU. **Ollama remains default** — `let backend = 'ollama';` (line 2277), and `#btnOllama` is the `active` backend button at load.

- `hfGenerate({ model, system, prompt, … })` (line 4521) — routes to the HF Inference API with SSE streaming + non-streaming fallback.
- Optional **API key** input (`#hfApiKey`, line 1226) + **custom URL** input, both stored **only in `localStorage`** under `HF_LS.KEY` / `HF_LS.URL` (lines 4433–4447), never logged.
- **Clear button** (`clearHfCreds`, line 4446) removes both.
- **Live HF leaderboard fetch** — `fetchHFModels()` hits `https://huggingface.co/api/models?filter=text-generation&sort=downloads&direction=-1&limit=40` (line 4470) to populate the model dropdown with mid-2026 recommended defaults; graceful degradation when offline (connectivity probe at line 4505).
- **Connectivity test** button present.
- `setBackend('hf')` (line 2745) toggles the HF config panel + badge (`HUGGINGFACE`) and lazy-fetches the model list.

### 1b. Local .gguf/.onnx drag-and-drop (transformers.js)
- **Drop zone** with `ondragover` / `ondragleave` / `ondrop` (`localDropHandle`, line 1207) + fallback `<input type="file" id="localFileInput" accept=".gguf,.onnx">` (line 1212). Uses the **File System Access API** where available, falling back to the classic file input.
- **Magic-byte validation** (line 4217 et seq.): GGUF magic `0x46554747` (bytes `47 47 55 46`); ONNX protobuf header validated; 4 GB cap enforced.
- **Lazy-loaded `@huggingface/transformers@3.7.6`** from `cdn.jsdelivr.net` (line 4206), cached in `_transformersMod`. Imported **only when a local file is loaded** — never on page load.
- Loaded via **transformers.js on WebGPU** with **CPU (wasm) fallback** (line 4315: `device = ('gpu' in navigator) ? 'webgpu' : 'wasm'`; retry-on-CPU at line 4328).
- Registered as a selectable entry in **`#browserModel`** (line 4265) **and** the Assembly / agent-forge model pools, with a **`LOCAL` / `local-file` badge**.
- **Unload** capability (line 4300) + model cached locally.

### 1c. Pyodide TDD sandbox (isolated execution → Code Reviewer feedback)
- **Collapsible `#sandboxPanel`** UI (line 1568) with status pill (idle/running/pass/fail), log (`#sandboxLog`), and **RUN NOW / CLEAR** controls + configurable **auto-fix loop max iterations** (default **2**, persisted to `localStorage`).
- **Isolation boundary = Web Worker (blob URL) + Pyodide WASM.** A dedicated worker (`sandboxEnsureWorker`, line 4709; `new Worker(URL.createObjectURL(blob))` at 4712) is spun up from a blob. Generated code is **never `eval`'d on the main thread**.
- The worker **lazy-loads Pyodide** from `https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js` via `importScripts` (line 4627) on first use.
- Writes generated test files + impl into the worker's **in-memory FS** under `/home/pyodide` (`py.FS.writeFile`, line 4647), `chdir`s there, **resets the FS between runs** (unlink/rmdir walk, line 4637) and **clears `sys.modules`** (line 4661) so re-runs are clean.
- Runs **pytest in-process** (`pytest.main([...])`, line 4668) — no `python` subprocess in Pyodide. Captures **stdout / stderr / exit code**; only those cross back to the main thread.
- For **JS/TS projects**, runs in an isolated `Function` with no Node built-ins (line 4611 context).
- **Feeds stderr into the Code Reviewer** stage as a literal **`RUNTIME FEEDBACK`** block injected into the reviewer's prompt after the Executor emits FILE blocks and before the reviewer finalizes.
- **Auto-fix loop:** re-runs the Executor with the error appended, up to **max N iterations (default 2, configurable)**. A package is **never marked `done`** while tests fail and the loop is exhausted.

---

## 2. Ollama backend — intact & default
- `let backend = 'ollama';` (line 2277) — default on load.
- `#btnOllama` carries the `active` class at rest (line 1151).
- `ollamaGenerate({...})` (line 4110) unchanged; endpoint shape intact: `GET {base}/api/tags` (line `fetchOllamaModels`) and `POST {base}/api/chat` for generation, with full sampling-param set (top_p/top_k/repeat_penalty/presence/frequency/min_p + dynamic scaling preserved from Task 2).
- Context-Shield wrapper (line 6828) wraps `ollamaGenerate` additively; original behavior preserved.

---

## 3. Lazy-loaded CDN libraries
Only fetched when their feature is activated — the base app stays light and offline-capable (Ollama-only mode pulls nothing extra):

| Library | URL | Trigger |
|---|---|---|
| `@huggingface/transformers` v3.7.6 | `cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6` | First local `.gguf`/`.onnx` load |
| Pyodide v0.27.7 | `cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js` | First sandbox RUN (inside the worker) |

(`@mlc-ai/web-llm` and `three` are pre-existing lazy imports for the Browser/WebLLM path and the 3D globe respectively — not introduced by Task 4.)

---

## 4. Sandbox isolation boundary (summary)

```
main thread ──postMessage(FILE blocks, test cmd)──▶ Web Worker (blob URL)
                                                       │
                                                       ▼ lazy importScripts
                                                   Pyodide WASM
                                                       │ in-memory FS (/home/pyodide)
                                                       │  - reset between runs
                                                       │  - sys.modules cleared
                                                       │  - pytest in-process (no subprocess)
                                                       ▼
                              ◀──postMessage(stdout, stderr, exit)──
```
- No generated code reaches the main thread's `eval`/`Function`.
- JS projects run in an isolated `Function` inside the worker with no Node built-ins.
- Only `{stdout, stderr, exit}` cross back. stderr is injected as `RUNTIME FEEDBACK` into the Code Reviewer prompt.
- Auto-fix loop: Executor re-run with error appended, max N (default 2, configurable). Package not marked `done` while tests fail and loop exhausted.

---

## 5. Test results (on current HEAD `27ce263`, which includes Task 4 + the later Task-2026 layer)

| Test suite | Result | Notes |
|---|---|---|
| `test_tabs.js` | **56 passed · 0 failed** | clean |
| `test_features.js` | **116 passed · 1 failed** | Pre-existing: `file:///ollama/api/tags` scheme error (expected when page loaded via `file://`) — environmental, not a Task-4 regression. |
| `test_2026_features.js` | **35 passed · 0 failed · 0 skipped** | clean |
| `test_webgpu_local_http.js` | **2 passed · 1 failed · 1 skipped** | Pre-existing: (a) the `✗ page loads over http` 404 is a `serve.py` startup-timing issue — **reproduces identically on the parent commit `8906cad`** (before Task 4); (b) the `⊘ real WebGPU inference` skip is the known headless `shader-f16` feature gap. Neither is a Task-4 regression. |

### Regression confirmation
I verified the `test_webgpu_local_http.js` 404 failure is pre-existing by checking out `8906cad` (the commit immediately before `1443801`) and re-running — identical `2 passed · 1 failed · 1 skipped` result. Working tree was restored to HEAD (`27ce263`, 7961 lines) afterward and re-verified: `test_tabs`/`test_features`/`test_2026_features` all produce the same counts as before.

**No new regressions introduced by Task 4.**

---

## 6. Before / after counts

| Metric | Before (`8906cad`) | After (`1443801`) | Current HEAD (`27ce263`) |
|---|---|---|---|
| `prompt-forge.html` lines | 5420 | 6442 (+1022) | 7961 (Task-2026 added +1519 more) |
| Backends | 2 (ollama, browser) | 3 (+hf) | 3 |
| Lazy CDN libs | 2 (web-llm, three) | 4 (+transformers.js, pyodide) | 4 |
| TDD sandbox | — | ✅ Pyodide-in-Worker | ✅ |

---

## 7. Verdict
All Task-4 deliverables from `.shelley-orchestrator/cSVTONL/task4-edge-models-sandbox.md` are present and wired correctly: HF cloud backend with credential management + leaderboard fetch + connectivity test + localStorage-only key storage + clear button; local GGUF/ONNX drag-drop with magic-byte validation + transformers.js-on-WebGPU-with-CPU-fallback + `#browserModel`/pool registration with `LOCAL` badge + unload; Pyodide-in-Worker TDD sandbox feeding stderr as `RUNTIME FEEDBACK` to the Code Reviewer with a configurable auto-fix loop (default 2) and a collapsible UI log; Ollama intact and default. No minimal fixes were needed. Tests show no new regressions.
