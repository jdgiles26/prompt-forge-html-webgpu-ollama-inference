# PROMPT FORGE
<img width="3022" height="1644" alt="image" src="https://github.com/user-attachments/assets/8e38fe90-1912-47cc-b3ca-9db2b5477012" />


A single-file HTML application that transforms raw task descriptions into
production-grade Claude Code system prompts — with optional full-project
TDD scaffolding (before/after code + failing tests + Makefile, packaged as a
downloadable `.zip`).

Two inference backends, both run locally:

- **Browser AI (WebGPU)** — in-browser inference via [WebLLM](https://github.com/mlc-ai/web-llm).
  Models are downloaded once from HuggingFace and cached by the browser.
- **Ollama** — local Ollama server. Auto-discovers your installed models.

No accounts, no API keys, no telemetry. Everything runs on your machine.

---

## Quick start

```bash
# Browser AI (recommended): serve over localhost (needed for SAB + workers)
python3 serve.py
# → opens http://127.0.0.1:8765/prompt-forge.html in your default browser

# OR: Ollama only — works fine over file://, but you must allow null origin once:
launchctl setenv OLLAMA_ORIGINS "*"    # macOS app
# OR  OLLAMA_ORIGINS="*" ollama serve  # CLI
# then double-click prompt-forge.html
```

Then:
1. Paste your raw task into the left panel.
2. Pick **SINGLE PROMPT** for a one-file Claude Code system prompt, or
   **COMPLETE PROJECT PACKAGE** for a downloadable TDD scaffold.
3. Optionally pick a template (Refactor / Bugfix / Performance / Security / …).
4. Click **▶ FORGE PROMPT** (or `⌘/Ctrl+Enter`).

---

## Features

### Output modes
- **Single Prompt** — emits one structured Claude Code system prompt with ROLE,
  OBJECTIVE, WHAT TO BUILD, WHAT NOT TO BUILD, DELETE, PRESERVE, EXECUTION
  ORDER (TDD), GUARDRAILS, DONE-WHEN.
- **Complete Project Package** — emits a multi-file payload (README, CLAUDE.md,
  AGENTS.md, DONE.md, Makefile, `.gitignore`, `src/before/`, `src/after/`,
  `tests/`, requirements). Downloadable as a real `.zip` that goes RED on
  first `pytest` run and GREEN once a developer fills in `src/after/`.

### Inference
- **WebGPU (WebLLM)** — 18+ MLC-prebuilt models including Qwen2.5-Coder
  (0.5B / 1.5B / 7B), Llama-3.2 (1B / 3B), Llama-3.1-8B, SmolLM2 (135M / 360M /
  1.7B), DeepSeek-R1-Distill (Qwen-7B / Llama-8B), Phi-3.5 mini, Gemma-2 2B.
- **Ollama** — auto-discovers installed models from `/api/tags`.

### Workflow tooling
- **10 task templates** with built-in guardrails: Refactor / Greenfield /
  Bugfix / Performance / Security / Migration / Data Pipeline / ML / Embedded /
  API.
- **Editable meta-prompt** (saved to `localStorage`).
- **Prompt history** — last 25 forges, click to restore, individually deletable.
- **Refine** (iterate on previous output) and **Regen** (re-run same task).
- **Validator** — audits the output for every required section and flags
  `[CONFIRM WITH USER: …]` placeholders.
- **File viewer** for project-mode output — clickable file tree, inspect each
  file before downloading the zip.
- **Markdown tinting** — headings, code, fences, and FILE markers colored
  in-place after streaming completes.
- **Live tok/s meter**, **Stop button**, **draft autosave**, **context-overflow
  warning**, **draggable splitter**, **keyboard shortcuts**, **workspace
  export/import**.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + Enter` | Forge prompt |
| `⌘/Ctrl + .`     | Stop generation |
| `⌘/Ctrl + K`     | Clear all |
| `⌘/Ctrl + S`     | Save .md |
| `⌘/Ctrl + H`     | Open history |
| `?`              | Show keyboard help |
| `Esc`            | Close any modal |

---

## Files

| File | Purpose |
|---|---|
| `prompt-forge.html`        | The whole application — single standalone file |
| `serve.py`                 | Tiny local HTTP server with COOP / COEP headers (required for WebGPU) |
| `package.json`             | npm scripts + dev deps for the test suite |
| `test_features.js`         | 117 DOM / UI feature tests (Playwright) |
| `test_e2e_project.js`      | 76 end-to-end project-pipeline tests (stream → parse → zip) |
| `test_zip_runs_tdd.js`     | 8 tests that unzip the forged package and prove pytest goes RED → GREEN |
| `test_webgpu_local_http.js`| Local-HTTP WebGPU smoke test + dropdown-ID validation against WebLLM's prebuilt config |
| `list_webllm_models.js`    | Helper: enumerate WebLLM's prebuilt model list |

No build step. The HTML imports WebLLM directly from `https://esm.run/@mlc-ai/web-llm`
on first use and the browser caches it.

---

## Testing

```bash
npm install         # install Playwright + adm-zip (dev only)
npx playwright install chromium
npm test            # runs all four suites
```

Latest run:

```
RESULT     (features):  117 passed · 0 failed
E2E        (project):    76 passed · 0 failed
ZIP-TDD    (real pytest): 8 passed · 0 failed
Local-HTTP (webgpu):      3 passed · 0 failed · 1 skipped*
                        ──────────────────────────────────
TOTAL:                  204 passed · 0 failed · 1 skip
```

\* The skip is the live model-inference call. Headless Chromium lacks the
`shader-f16` WebGPU extension; real Chrome on macOS has it enabled by default.

The `test_zip_runs_tdd.js` suite proves the strongest claim: the forged
`.zip` is a **real working TDD scaffold** — `pytest` exits non-zero on
the stub (`NotImplementedError`) and exits zero after a correct
implementation is written into `src/after/main.py`.

---

## Why a local server?

Chrome treats `file://` URLs as opaque origins. This blocks:
1. **SharedArrayBuffer** — needed by the WebGPU/WASM runtime.
2. **Cross-origin Worker scripts** — WebLLM (and transformers.js) both spawn
   workers from CDN URLs.

`serve.py` sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, enabling cross-origin
isolation, which restores both. The HTML itself is unchanged — it's the
same file either way.

For **Ollama-only** use, `file://` works fine — Ollama is a plain
HTTP API. You just need to allow null origin once with
`OLLAMA_ORIGINS="*"`.

---

## Architecture notes

- **Project-payload protocol.** In project mode the model emits files between
  literal markers:
  ```
  === FILE: path/to/file.ext ===
  <file contents>
  === END FILE ===
  ```
  The page parses these into a JSZip-built archive on demand. The parser
  handles CRLF line endings.

- **Streaming-safe output buffer.** Streaming chunks are appended to a single
  `Text` node child (O(1) per chunk) instead of reassigning `textContent`
  (O(n) per chunk → O(n²) total). Scroll updates throttle via
  `requestAnimationFrame`. Markdown tint is applied **after** streaming
  completes, never during.

- **Validator HTML escaping.** Report lines containing `<…>` placeholders
  (e.g. `src/before/main.<ext>`) are escaped before injection into the
  modal so the browser doesn't strip them as unknown HTML tags.

- **Workspace export/import.** A single JSON file captures: full history,
  custom meta-prompt, current draft, all preferences (mode, backend,
  template, model, params, Ollama URL). Portable across machines.

---

## License

MIT.
