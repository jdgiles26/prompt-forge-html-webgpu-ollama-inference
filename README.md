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
  ordered set of models from a shared pool (Ollama + WebGPU + HF Cloud), each
  assigned to one stage of the assembly line of intelligence: **Plan → Review
  Plan → Task Out → Execute → Code Review → Final Review**. Each stage
  receives the user's task plus every prior stage's output, so intelligence
  compounds down the line. Add / remove / reorder stages, assign the same
  model to multiple stages, or auto-assign round-robin. The final stage emits
  a complete project (files → downloadable `.zip`) or a consolidated system
  prompt (`.md`). A live progress track shows which stage is running / done.
  A **Fact-Check Gate** (`+ ADD FACT-CHECK GATE`) can be inserted anywhere in
  the line: a dedicated, heavy-tier-only stage that re-checks the immediately
  prior stage's claims against the user task and pauses the run — blocking
  zip export — the moment it returns a `FAIL` verdict (or no parseable
  verdict at all, treated as a soft-fail). This is a real gate, not a
  warning: the pipeline halts and export stays disabled until a human
  reviews the flagged stage and explicitly Resumes or re-runs from an
  earlier point. It builds on the existing MoA capability guardrail (weak
  models are refused for heavy roles) and the repetition-loop /
  FILE-block-integrity guards (`test_hallucination_guards.js`).
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
- **WebGPU (WebLLM)** — 27 MLC-prebuilt open models including Qwen3.5
  (0.8B–9B), Qwen3 (0.6B–8B), Qwen2.5-Coder (0.5B / 1.5B / 3B / 7B), Llama-3.2
  (1B / 3B) / Llama-3.1-8B, SmolLM2 (135M / 360M / 1.7B), DeepSeek-R1-Distill
  (Qwen-7B / Llama-8B), Phi-4 mini / Phi-3.5 mini, Gemma-2 (2B / 9B).
- **Ollama** — auto-discovers installed models from `/api/tags`.
- **HF Cloud** — optional third backend against the HF Inference API. The
  recommended-model dropdown (`HF_RECOMMENDED`) is a curated, individually
  Hub-verified list spanning Qwen3 / Qwen3.5, DeepSeek-V3.x/R1, Llama
  3.1/3.3/4, Mistral, and Gemma 3 — every ID is checked to actually resolve
  on huggingface.co before being pinned (a prior list shipped three
  nonexistent `-Instruct`-suffixed Qwen3 IDs; fixed). Deliberately excludes
  "uncensored"/"abliterated" community re-finetunes.

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
| `mesh-server.js`           | AutoNet Mesh-Sync signaling server (WebSocket relay for join codes + WebRTC SDP/ICE) — `node mesh-server.js`, optional, LAN-only |
| `package.json`             | npm scripts + dev deps for the test suite |
| `test_features.js`         | 117 DOM / UI feature tests (Playwright) |
| `test_e2e_project.js`      | 131 end-to-end project-pipeline tests (stream → parse → zip → TDD/SDD scaffolding) |
| `test_zip_runs_tdd.js`     | 8 tests that unzip the forged package and prove pytest goes RED → GREEN |
| `test_webgpu_local_http.js`| Local-HTTP WebGPU smoke test + dropdown-ID validation against WebLLM's prebuilt config |
| `test_tabs.js`             | 63 tests for the ASSEMBLY LINE + AGENT FORGE tabs (tab switching, pool, stages, run, zip, interview, perms, repetition-loop auto-repair retry) |
| `test_hallucination_guards.js` | 39 tests: repetition-loop / FILE-block-integrity / MoA capability guardrail / context-compaction / output-compromised flag / Fact-Check Gate |
| `test_agentic_features.js` | 54 tests, one section per new feature: Agentic Dev Tips panel + guardrail injection, secret & unsafe-code scanner, Definition-of-Done auto-validator, token budget guardrail, Fact-Check Gate consensus ensemble |
| `test_2026_features.js`    | 45+ tests for the 5 "2026" features (Context Shield, PRD graph, Drift compiler, 3D globe, AutoNet Mesh) — includes a real two-browser-page WebRTC handshake against a real spawned `mesh-server.js`, not mocked |
| `test_zip_download.js`     | 88 tests proving all three export entry points (Forge `#zipBtn`, Assembly `#asZipBtn`, Agent Forge `#afZipBtn`) trigger a real browser download and the archive contains the full required file list |
| `list_webllm_models.js`    | Helper: enumerate WebLLM's prebuilt model list |
| `test_sandbox_requirements.js` | Extracts the real `sandboxWorkerSrc()` (Pyodide TDD-sandbox worker) out of `prompt-forge.html` and verifies it installs `requirements.txt` packages before running pytest — no Playwright/network needed, pure Node `vm` |
| `test_hosting_portability.js` | 10 tests for hosting Prompt Forge somewhere other than `127.0.0.1`: AutoNet Mesh's signaling URL derives from the page's own host (not a hardcoded loopback default) and has a real UI field to override it, and FORGE PROMPT's Ollama-unreachable error is actionable instead of a bare "select a model" dead end |

No build step. The HTML imports WebLLM directly from `https://esm.run/@mlc-ai/web-llm`
on first use and the browser caches it.

---

## Testing

```bash
npm install         # install Playwright + adm-zip (dev only)
npx playwright install chromium
npm test            # runs every suite: features, tabs, e2e, zip-tdd, zip-download,
                     # pipeline-scaffold, webgpu, 2026-features, hallucination-guards,
                     # agentic-features, sandbox-requirements, hosting-portability
npm run test:guards  # just the hallucination / Fact-Check Gate guard suite
npm run test:agentic # just the new-features suite (tips panel, secret scanner, …)
npm run test:sandbox-reqs # just the TDD-sandbox requirements.txt installer test (no browser needed)
npm run test:hosting # just the mesh-host-detection / Ollama-unreachable-message suite
```

Latest run (offline / mocked):

```
RESULT     (features):  116 passed · 1 failed*   (pre-existing: Ollama now live → /ollama fetch on file://)
TABS       (new tabs):   56 passed · 0 failed
E2E        (project):    131 passed · 0 failed   (TDD/SDD scaffolding + shared buildProjectZip)
ZIP-TDD    (real pytest): 8 passed · 0 failed     (pip install --break-system-packages pytest)
Local-HTTP (webgpu):      2 passed · 1 failed* · 1 skipped***
GUARDS     (hallucination): 38 passed · 1 failed* (net::ERR_CONNECTION_RESET fetching the WebLLM CDN import — sandbox-only)
AGENTIC    (5 new features): 54 passed · 0 failed
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

- **Consensus/voting ensemble for the Fact-Check Gate.** "Use different
  model families/vendors for generation vs. verification" and "give every
  agent role a narrow, single responsibility" (📚 Best Practices →
  Orchestration) — a fact-check gate answered by one model is still one
  model's opinion. A Fact-Check Gate stage can now be given a **consensus
  ensemble**: additional models (from the same pool) that receive the exact
  same system+prompt as the primary. `computeConsensusVerdict()` decides the
  gate's final verdict by **strict majority** across the primary + every
  ensemble member — a single model's false PASS can no longer rubber-stamp
  the pipeline forward on its own, and a tie (e.g. 2/4) FAILs rather than
  passing by chance. Every member's individual verdict is recorded in an
  appended `## CONSENSUS` block in the stage's output (a structured
  hand-off, not a hidden average). Ensemble members run **sequentially**
  (not concurrently) to avoid GPU/VRAM contention between multiple
  in-browser WebLLM engines, but still route through the same token-budget
  and repetition-loop guards as the primary model, into a detached element
  so they never visually corrupt the primary stage's rendered output.
  Configured per-stage via "+ add ensemble model" chips shown only on
  Fact-Check Gate stages; heavy-tier-gated like the primary model, since a
  weak ensemble member is exactly as capable of producing a false PASS.

- **Token budget guardrail.** "Track running token/cost usage live during a
  multi-stage run, not only after it finishes — a runaway stage is far
  cheaper to stop mid-run than to discover in the bill afterward" (📚 Best
  Practices → Cost). An optional per-run token budget (empty/0 = no cap) is
  checked on *every streamed chunk*, not just between stages — the moment
  cumulative usage across all stages crosses the cap, the in-flight
  generation is aborted, the partial output is kept as a normal (non-error)
  stage result, and the run pauses via the same mechanism the Pause button
  uses (Resume continues once you've reviewed/raised the budget). This is a
  cost control, not a correctness gate: unlike the Fact-Check Gate or the
  secret scanner, a budget trip never marks output compromised or blocks
  export. The telemetry bar shows a live "current / budget" readout.

- **Definition-of-Done auto-validator.** "Write the DoD before the first line
  of code, and make it falsifiable" (📚 Best Practices → Planning).
  `auditDoneWhen()` reads `DONE.md` (project mode) or the `## DONE WHEN`
  section (single-prompt mode), splits it into checklist bullets, and flags
  ones that are vague/unfalsifiable ("works well", "should work", "no bugs",
  "handles edge cases") — *unless* the same bullet also contains a concrete,
  checkable anchor (a backtick command, an exit code, a test-runner name, a
  number/threshold), in which case the anchor is what makes it checkable and
  the surrounding language is fine. Surfaced in the Forge tab's VALIDATE
  modal under a new "Definition of Done" section, and as a non-blocking
  "N vague DoD criteria" state in the Assembly Line once a run completes —
  never a hard block, since a weak DoD is a quality smell, not corruption.

- **Secret & unsafe-code scanner (pre-export gate).** `buildProjectZip` — the
  single choke point behind all three tabs' zip exports (Forge, Assembly
  Line, Agent Forge) — now runs every generated file through
  `scanSecretsAndUnsafe()` before a byte reaches JSZip. High-confidence
  secret patterns (private keys, live Stripe/GitHub/Slack/AWS/Google
  credentials) are an unconditional hard block, same tier as a malformed
  FILE block — there is no override, because there's no legitimate reason a
  forged project should ship a real credential. It deliberately does **not**
  flag `sk_test_`-style fixture keys (this repo's own test fixtures rely on
  that distinction — see the `5aad045` commit). Unsafe *code* patterns
  (`eval`, `shell=True`, `pickle.loads`, unsafe `yaml.load`, disabled TLS
  verification) are heuristic and sometimes legitimate, so they surface as a
  non-blocking toast warning instead of blocking export.

- **Repetition-loop auto-repair retry.** A repetition loop anywhere in the
  line used to hard-stop the *entire* multi-stage run immediately, discarding
  every prior stage's work over what is frequently a one-off bad sample. The
  stage that trips the guard is now retried in place (bounded —
  `AS_REPETITION_RETRY_MAX`, currently 2) with tightened anti-repetition
  sampling (`repeat_penalty` scaled up, `top_k` scaled down each attempt) and
  the failure fed back into the prompt as an explicit correction ("your
  previous attempt repeated the same line... do not repeat"), before falling
  back to the original hard-stop (mark compromised, block export) only if
  every retry ALSO trips the guard. `asGenerateOnce()` — previously used only
  by the Fact-Check Gate's consensus ensemble — is now the single shared
  dispatch point for the primary per-stage call too, so the retry attempt
  reuses the exact same ollama/hf/local/browser routing instead of a second
  near-duplicate implementation. Verified end to end (not just the detection
  primitive) with a mocked backend that loops on attempt 1 and streams
  cleanly on attempt 2 — driven through the real `asRun()` run loop — plus a
  companion test confirming a stage that loops on *every* attempt still gives
  up after exactly `1 + AS_REPETITION_RETRY_MAX` calls rather than retrying
  forever.

- **Hosting away from `127.0.0.1` broke two things: AutoNet Mesh, and the
  Ollama error path.** Reported after deploying Prompt Forge somewhere other
  than a local `python3 serve.py` on the same machine as Ollama/mesh-server.js.
  1. **AutoNet Mesh's default signaling URL was hardcoded to
     `ws://127.0.0.1:8770`.** `mesh-server.js` is meant to run on the same
     machine that serves the page — so the *right* default host is wherever
     the page itself was loaded from, not always the viewer's own loopback
     address. Hosted from anywhere but localhost, "HOST SESSION" silently
     tried to reach a signaling server on the viewer's own machine and never
     found one — `meshWsUrl()` now derives the default from
     `window.location.hostname` (`meshDefaultWs()`), falling back to
     loopback only when there's no real hostname (`file://`). The panel's
     hint used to tell users to "Set PF_MESH_WS to override" — a variable
     nothing in the codebase ever read; the only real override
     (`window.meshSetWsUrl()`, writing `localStorage['pf.mesh.ws']`) had no
     UI path to it. Added a real `#meshWsInput` field + SET HOST button,
     prefilled with the current effective URL, wired to `meshSetWsUrl()`
     with reconnect-if-connected behavior, and fixed the hint text.
  2. **FORGE PROMPT's Ollama-unreachable error was a dead end.** When Ollama
     can't be reached, `fetchOllamaModels()` (called on page init) already
     produces a real diagnosis — the file:// CORS explanation, or "is
     `ollama serve` running?" — but `forge()` → `runOllama()`'s "no model
     selected" guard discarded it and showed a bare "Select an Ollama model
     first.", giving no indication Ollama itself was the problem or that
     the Browser (WebGPU) / Hugging Face backends need no local Ollama at
     all. `ollamaUnreachableReason` now carries that diagnosis from
     `fetchOllamaModels()` into the guard, and both messages explicitly
     point at switching backends as a way out. Verified with
     `test_hosting_portability.js` — pure-logic extraction test for
     `meshDefaultWs()` against several hostnames (no browser needed), plus
     live-Playwright checks that the actionable error text appears, the URL
     field prefills and persists a custom host, and the hint updates
     accordingly.

- **TDD Sandbox — `requirements.txt` was never installed.** The Pyodide
  Web Worker that runs a forged Python project's tests (`sandboxWorkerSrc()`)
  only ever called `py.loadPackage('pytest')` — any project whose tests (or
  source) imported a third-party dependency (`jsonschema`, `requests`,
  `flask`, ...) failed every run with a bare `ModuleNotFoundError`, reported
  to the user as "tests are failing" with no indication the dependency was
  simply never installed. Fixed by parsing the generated project's
  `requirements.txt` (stripping comments, blank lines, `-`-flag lines,
  version specifiers, and extras brackets) and installing each package
  before pytest collects any tests: Pyodide's own WASM-compiled package
  index first (`py.loadPackage`, fast and reliable for supported packages),
  falling back to `micropip.install` for pure-Python PyPI wheels. `pytest`
  itself is skipped in this loop (already installed by the existing step).
  A package that fails both install paths is recorded as a warning
  prepended to `stdout` rather than aborting the run — partial signal beats
  none, and some tests may not even touch the missing import. Verified via
  `test_sandbox_requirements.js`, which extracts the real
  `sandboxWorkerSrc()` function straight out of `prompt-forge.html` (not a
  reimplementation), confirms the generated worker source is syntactically
  valid and installs requirements before running pytest, and runs the
  *exact* parsing expression from that generated source against realistic
  `requirements.txt` content. **Not** verified against real Pyodide
  execution (the `py.loadPackage`/`micropip.install` network calls
  themselves) — `cdn.jsdelivr.net`, where Pyodide is lazy-loaded from, is
  unreachable from this sandbox (same network restriction that blocks the
  WebLLM/JSZip CDNs elsewhere in this app); verify manually in a browser
  with network access if in doubt.

- **Fact-Check Gate (`verify` role).** Opt-in, so it never appears in the
  default 6-stage line or changes existing behavior unless added explicitly.
  Heavy-tier-gated like Plan / Plan Review / Task Architect / Code Review
  (`HEAVY_ROLES`), because a weak model asked to fact-check produces a false
  PASS, which is worse than no check. `parseVerifyVerdict()` reads the
  stage's `Verdict: PASS|FAIL` line (case/whitespace-tolerant); anything
  else — including a `FAIL` or a response that skips the required format —
  calls `pfMarkCompromised()` and pauses the run before the next stage
  (`asPaused = true`), which also disables zip export via the existing
  `pfOutputCompromised` gate. The run only continues past a failed gate on
  an explicit Resume or a re-run from an earlier stage — never silently.

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

- **AutoNet Mesh-Sync (⤴ SHARE) — LAN sync via `mesh-server.js`.** A small
  WebSocket signaling relay pairs peers by a 6-char join code; actual state
  syncs peer-to-peer over a WebRTC data channel (star topology: the host
  offers to every joiner it sees in presence, joiners never offer, avoiding
  host-vs-joiner glare). Fixed in this pass — real bugs, not fakery:
  1. **The WebRTC connection was never initiated.** Signaling worked (host/
     join/presence all connected fine), but nothing ever reacted to a
     `presence` update by creating an SDP offer, so two peers would sit
     connected to the signaling server forever without ever opening a data
     channel. `meshOnSignal`'s presence handler now calls
     `meshEnsurePeerConnection()` for every peer it sees.
  2. **`meshBroadcastField` was dead code** — fully implemented, but never
     called from any input. Wired to `#asTaskInput` (`input`), `#asOutputMode`
     (`change`), and `asSaveStages()` (every stage edit), with an
     echo-loop guard (`window._meshApplyingRemote`) so applying an incoming
     stages update doesn't immediately re-broadcast it back to its sender.
  3. **Host now relays** `state`/`update` messages to its other connected
     peers, so a 3+ peer session converges (joiners only connect directly to
     the host — a star, not a full mesh — so without relay a joiner's edit
     would only ever reach the host).
  All verified with a real two-browser-page WebRTC handshake against a real
  `mesh-server.js` process (`test_2026_features.js`, F5 section) — not
  mocked: real `RTCPeerConnection`, real ICE, real data channel, real
  cross-peer field sync, with an explicit assertion that fixing the echo
  risk didn't turn it into a broadcast loop.

- **`window.X` cross-feature reachability.** This file's `<script>` is
  `type="module"`; the "2026 features" pack (Context Shield, the 3D globe,
  the PRD graph, the drift compiler, AutoNet Mesh) additionally lives in its
  own lexical closure inside that module (that's *why* it can declare its
  own `SECRET_PATTERNS` without colliding with the unrelated one in
  `buildProjectZip`'s secret scanner — different scope, same name). Code
  outside that closure — or in a different scope entirely, like `window.__pf`
  — can only reach a function declared inside it via an explicit
  `window.foo = foo`; a bare `function foo(){}` isn't enough, and neither is
  `window.__pf.foo` (that object is a test hook, not a real API). Three real
  bugs from this: `window.asStages` / `window.setAsStages` were referenced
  (via `typeof window.X === 'function'` guards) by AutoNet Mesh's state
  sync and never actually existed, so the full-state snapshot and the
  stages field silently never synced; `window.asBuildPrompt` was referenced
  the same way by Context Shield's per-stage prompt scan, so it only ever
  scanned the raw task text, never the assembled per-stage prompts a secret
  could otherwise leak through into; and `window.parseFiles` was referenced
  by the globe's real-data refresh path and, combined with a fallback branch
  that also evaluated to nothing, meant the globe could never show nodes
  from an actual assembly-line run — only whatever a caller fed it directly.
  Fixed by exposing real `window.asStages` / `window.setAsStages` /
  `window.asBuildPrompt` globals (①) and by having the globe refresh call
  `parseFilesShared` directly, in the same scope, instead of routing through
  a `window.parseFiles` that nothing ever assigned (②). Also removed
  `ctxShieldHook()` — a monkey-patch-`window.hfGenerate`/`ollamaGenerate`/
  `browserGenerate` mechanism that could never work (guarded on those same
  never-assigned globals, and every real call site invokes them as bare
  identifiers anyway, which a patched `window.X` copy can't intercept) and,
  unlike the bugs above, wasn't actually needed: the real protection was
  already inline — `hfGenerate`/`ollamaGenerate`/`browserGenerate` each call
  `window.ctxShieldApply()` directly at the top of their own bodies, gated
  purely by `ctxShieldState().enabled`, so it works regardless of any "hook"
  step. Left as dead code, it looked like the enforcement mechanism without
  being one; removed rather than patched around.

---

## License

MIT.
