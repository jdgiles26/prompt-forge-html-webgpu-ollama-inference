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

The app now has **three independent tabs** (top-left tab bar), each fully
self-contained — switching tabs never touches another tab's state:

### Tabs

- **FORGE** *(original app, unchanged)* — the prompt-compiler / TDD-package
  builder described below. Single Prompt or Complete Project Package, WebGPU
  + Ollama, templates, history, validator, file viewer, zip export.
- **ASSEMBLY LINE** — a multi-agent project-development pipeline. Pick an
  ordered set of models from a shared pool (Ollama + WebGPU), each assigned to
  one stage of the assembly line of intelligence: **Plan → Review Plan →
  Task Out → Execute → Code Review → Final Review**. Each stage receives the
  user's task plus every prior stage's output, so intelligence compounds down
  the line. Add / remove / reorder stages, assign the same model to multiple
  stages, or auto-assign round-robin. The final stage emits a complete
  project (files → downloadable `.zip`) or a consolidated system prompt
  (`.md`). A live progress track shows which stage is running / done.
- **AGENT FORGE** — a guided interview that gathers everything needed to
  scaffold a custom **agent / team of agents**, then hands off to the
  multi-agent generator which emits a complete, downloadable, ready-to-run
  agent project folder. The interview asks: the goal; whether the agent lives
  inside a project or standalone; language & framework; host (Mac desktop /
  browser / server / CLI); single agent vs team (+ roles); browser headless
  vs headed; **what powers the AI** (API key / local Ollama / in-browser
  WebGPU / a dropped-in local GGUF file / no-AI rules) with follow-ups for
  each power source; extras (README, `install.sh`, `install-all.sh`, tests,
  Dockerfile, `.gitignore`); and a final ready-to-generate confirmation.
  Conditional questions appear only when relevant. The generated package
  includes `README.md`, an idempotent `install.sh`, a one-command
  `install-all.sh` that bootstraps everything (deps + model pulls + config
  check + ready message), the agent source, a config file capturing the
  interview answers, and tests. `install.sh` / `install-all.sh` are packaged
  with executable (`0755`) permissions.


### Output modes
- **Single Prompt** — emits one structured Claude Code system prompt with ROLE,
  OBJECTIVE, WHAT TO BUILD, WHAT NOT TO BUILD, DELETE, PRESERVE, EXECUTION
  ORDER (TDD), GUARDRAILS, DONE-WHEN.
- **Complete Project Package** — emits a structured agentic repo under
  rigorous ATDD/SDD: `README.md`, `prd.md`, `spec.md`, `agent.md`, `drift.md`,
  `capabilities.md`, `architectural.md`, `tdd.md`, `prompt-sequence.md`,
  `CLAUDE.md`, `AGENTS.md`, `DONE.md`, `Makefile`, `.gitignore`, `src/before/`,
  `src/after/`, `tests/` (every folder has a `README.md`), requirements.
  Tests are written RED against `src/after` stubs and go GREEN once a
  developer fills in `src/after/`. Downloadable as a real `.zip`.
- **Programmatic test types** (project mode, above FORGE PROMPT) — choose the
  TYPE/COVERAGE of programmatic testing the agent must spec and write Red→Green:
  Functional / Unit / Integration / End-to-End / Contract / Property-based, any
  combo, or an "All / Custom combo" convenience radio. Selection is persisted to
  `localStorage`, fed into the project meta-prompt, mirrored into the Assembly
  Line view, and recorded in `prompt-forge.json` (`test_types`). This is test
  TYPE/COVERAGE, not a library choice — the runner is still picked from the
  detected stack (pytest / jest / cargo test / go test / …).
- **Shared `buildProjectZip`** — a single source of truth used by the Forge,
  Assembly Line, and Agent Forge zip exports. It enforces duplicate-path /
  empty-entry integrity, writes the extended `prompt-forge.json` manifest
  (`test_types`, `prd_hash`, `spec_hash`), and re-opens the zip to verify every
  entry before triggering the download.

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
| `test_e2e_project.js`      | 131 end-to-end project-pipeline tests (stream → parse → zip → TDD/SDD scaffolding) |
| `test_zip_runs_tdd.js`     | 8 tests that unzip the forged package and prove pytest goes RED → GREEN |
| `test_webgpu_local_http.js`| Local-HTTP WebGPU smoke test + dropdown-ID validation against WebLLM's prebuilt config |
| `test_tabs.js`             | 56 tests for the ASSEMBLY LINE + AGENT FORGE tabs (tab switching, pool, stages, run, zip, interview, perms) |
| `test_zip_download.js`     | 88 tests proving all three export entry points (Forge `#zipBtn`, Assembly `#asZipBtn`, Agent Forge `#afZipBtn`) trigger a real browser download and the archive contains the full required file list |
| `list_webllm_models.js`    | Helper: enumerate WebLLM's prebuilt model list |

No build step. The HTML imports WebLLM directly from `https://esm.run/@mlc-ai/web-llm`
on first use and the browser caches it.

---

## Testing

```bash
npm install         # install Playwright + adm-zip (dev only)
npx playwright install chromium
npm test            # runs all five suites (features, tabs, e2e, zip-tdd, webgpu)
```

Latest run (offline / mocked):

```
RESULT     (features):  116 passed · 1 failed*   (pre-existing: Ollama now live → /ollama fetch on file://)
TABS       (new tabs):   56 passed · 0 failed
E2E        (project):    131 passed · 0 failed   (TDD/SDD scaffolding + shared buildProjectZip)
ZIP-TDD    (real pytest): 8 passed · 0 failed     (pip install --break-system-packages pytest)
Local-HTTP (webgpu):      2 passed · 1 failed* · 1 skipped***
                        ──────────────────────────────────
New-tabs total:          56 passed · 0 failed
```

\* The features / webgpu failures are environmental and pre-existing (present
on `HEAD` before the new tabs were added): they come from the FORGE view's
relative `/ollama` URL being fetched from a `file://` or non-proxied origin
now that Ollama is running on the VM. They are unrelated to the new tabs,
which are fully covered by `test_tabs.js` (mocked Ollama, deterministic).

\** Install pytest with `pip install --break-system-packages pytest` to make
the zip-tdd suite green.

\*** The skip is the live model-inference call. Headless Chromium lacks the
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

- **Tab isolation.** The three tabs (FORGE / ASSEMBLY LINE / AGENT FORGE) are
  independent `<section class="view">` elements, only one visible at a time.
  The FORGE view is the original app, untouched. The two new tabs share a
  private module-scope inference layer (Ollama streaming + cached WebLLM
  engines, one engine per model id) and their own model-pool / state — they
  never reach into the FORGE view's globals. The active tab is persisted in
  `localStorage` and restored on load.

- **Assembly line handoff.** Each stage's prompt is the user task plus the
  full raw output of every prior stage, so a later model can build on (or
  correct) what earlier models produced. The final stage's output is treated
  as the product: FILE blocks → zip, otherwise → `.md`. Per-role system
  prompts define the line's roles (Planner / Plan Reviewer / Task Architect /
  Executor / Code Reviewer / Final Reviewer); stages are add / remove /
  reorder-able and any stage role can be set to `custom`.

- **Agent Forge interview → generation.** Answers are captured in a single
  JS object; conditional questions use `showIf` predicates against that
  object. The generator runs the selected pool models in sequence (first
  model scaffolds, later models refine & complete) and emits the FILE-block
  payload. `install.sh` / `install-all.sh` are given `0o755` unix
  permissions in the generated zip so they're ready to run after unzip.

- **Thinking-model streaming.** Ollama thinking models (e.g. `qwen3`) stream
  reasoning in a `thinking` field with an empty `response`. The shared
  Ollama generator surfaces live progress during that phase and only the
  `response` tokens count toward the final output.

---

## License

MIT.
