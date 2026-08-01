# Pipeline Integration Report — 8-Agent Spec-Driven TDD Scaffold

**Date:** 2026-07-13  
**Task:** Integrate the reference 8-agent spec-driven TDD pipeline scaffold into Prompt Forge's export pipeline  
**File edited:** `/opt/prompt-forge/prompt-forge.html` (+ `test_pipeline_scaffold.js`, `package.json`)  
**Reference source:** `.shelley-orchestrator/cSVTONL/reference-pipeline/` (45 files)

## Outcome

SUCCESS. The complete 8-agent spec-driven TDD pipeline scaffold from the
reference-pipeline directory is now embedded verbatim in `prompt-forge.html`
and injected into every Complete Project Pkg export ZIP, alongside the
existing Task-3 files (prd.md, spec.md, agent.md, drift.md, etc.). The
current generation is NOT removed — both coexist in the exported project.

## What was embedded

### PIPELINE_SCAFFOLD constant

A new `PIPELINE_SCAFFOLD` constant (inserted before `buildProjectZip` at
line ~3691) contains all 45 files from the reference-pipeline directory,
embedded verbatim as a `JSON.parse()` string. Every file is included in
full — no summarization, no truncation:

- `GUARDRAILS.md` — the rules every agent works under (10 sections)
- `FILE_OWNERSHIP.md` — who may write what matrix (8 agents)
- `ESCALATION.md` — append-only ambiguity log template
- `PRD.md` — the reference template with FEAT/UI/STEP ID conventions
- `pipeline.config.json` — 8 stages with writeGlobs, humanGates, gateChecks
- `playwright.config.js` — wired to src/example/ demo
- `agents/_lib/drift-core.js` — shared integrity/hash/ownership/diff engine
- `agents/00-orchestrator/` — agent.md, instructions.md, guardrails.md, drift.js
- `agents/01-requirements/` — same 4 files
- `agents/02-architecture/` — same 4 files
- `agents/03-spec-test/` — same 4 files + PLAYWRIGHT_SETUP.md
- `agents/04-implementation/` — same 4 files
- `agents/05-qa-verification/` — same 4 files
- `agents/06-drift-monitor/` — same 4 files
- `agents/07-release-docs/` — same 4 files
- `.github/CODEOWNERS` — mirrors FILE_OWNERSHIP.md for GitHub
- `.github/workflows/pipeline-gate.yml` — CI gate stub
- `src/example/server.js` — zero-dependency HTTP server (login demo)
- `src/example/login.js` — real implementation for FEAT-001
- `src/example/README.md` — explains RED state

### buildProjectZip modification

The shared `buildProjectZip(parts, opts)` function was modified to inject
all scaffold files into the ZIP after the model-generated files and extra
sidecar files. The injection is **additive** — model-generated files always
win; scaffold files fill the gaps. This means:

1. Model-generated files (prd.md, spec.md, tests/, src/after/, etc.) remain
   at their current paths.
2. Scaffold files (agents/, GUARDRAILS.md, pipeline.config.json, etc.) are
   added at their natural paths.
3. If a model-generated file happens to have the same path as a scaffold
   file, the model's version is kept (the scaffold file is skipped).

The ZIP integrity re-open check was extended to verify all scaffold files
survive the round-trip.

The manifest (`prompt-forge.json`) was extended with a `pipeline_scaffold`
field containing the pipeline type, version, agent list, and scaffold file
count.

### SYSTEM_PROMPT_PROJECT update

The meta-prompt was updated with a new section (before the "Hard rules")
instructing the model that the exported ZIP contains an 8-agent spec-driven
TDD pipeline scaffold. The model is told to:
- Use FEAT-###/UI-###/STEP-### requirement IDs in prd.md
- Write Given/When/Then acceptance criteria matching the 03-spec-test format
- Reference requirement IDs in capabilities.md and prompt-sequence.md
- Align tests/ with the pipeline's tests/unit/, tests/integration/, tests/e2e/ layout
- Follow the FILE_OWNERSHIP.md separation (04-implementation writes src/** only)

The README.md template's "Repo layout" section was also updated to mention
the 8-agent pipeline scaffold.

### REQUIRED_PROJECT_FILES update

The `REQUIRED_PROJECT_FILES` array was extended with 16 scaffold files:
```
GUARDRAILS.md, FILE_OWNERSHIP.md, ESCALATION.md, PRD.md,
pipeline.config.json, playwright.config.js,
agents/_lib/drift-core.js,
agents/00-orchestrator/agent.md through agents/07-release-docs/agent.md,
.github/CODEOWNERS
```

The `validateOutput` function was updated to split the required-files check
into model-generated (checked against parsed output) and scaffold-injected
(checked against PIPELINE_SCAFFOLD constant) sections. The validator now
shows a separate "8-agent pipeline scaffold (auto-injected)" section.

The Assembly Line's missing-files check was also updated to exclude
scaffold files (since they're injected by buildProjectZip, not the model).

### Path collision resolution

| Reference file | Current file | Resolution |
|---|---|---|
| `PRD.md` | `prd.md` | Keep both — PRD.md is the reference template, prd.md is the generated version (case-sensitive, different files) |
| `src/example/README.md` | `src/before/README.md`, `src/after/README.md` | No collision — different paths |
| `playwright.config.js` | (none) | No collision |
| `GUARDRAILS.md` | (none, current uses agent.md/drift.md) | No collision |
| `README.md` | `README.md` (model-generated) | Model wins — scaffold doesn't ship a top-level README.md |
| `.github/CODEOWNERS` | (none) | No collision |
| `agents/*` | (none) | No collision |

**No path collisions exist.** All reference pipeline files are at distinct
paths from the current export files.

### `</script>` escaping fix

The `src/example/server.js` file contains literal `</script>` HTML as part
of its embedded login page. When embedded in the HTML's `<script>` element,
this would prematurely close the script tag. Fixed by replacing `</script>`
with `<\/script>` in the JSON string (valid JSON escape, prevents HTML
parser from closing the script element).

### Export access

`PIPELINE_SCAFFOLD` is exported via `window.__pf.PIPELINE_SCAFFOLD()` for
test introspection.

## Before / After test counts

| Suite | Before | After |
|---|---|---|
| `test_e2e_project.js` | 131 passed | **131 passed** |
| `test_zip_runs_tdd.js` | 8 passed | **8 passed** |
| `test_tabs.js` | 56 passed | **56 passed** |
| `test_zip_download.js` | 88 passed | **88 passed** |
| `test_pipeline_scaffold.js` | (new) | **43 passed** |

No regressions. All existing tests remain green. The new test suite
(`test_pipeline_scaffold.js`) adds 43 tests verifying the scaffold presence,
content integrity, and coexistence with model-generated files.

## Sample exported tree

From `test_output/pipeline_scaffold_test.zip` (69 files):

```
.github/CODEOWNERS
.github/workflows/pipeline-gate.yml
.gitignore
AGENTS.md
CLAUDE.md
DONE.md
ESCALATION.md
FILE_OWNERSHIP.md
GUARDRAILS.md
Makefile
PRD.md                          ← reference template
README.md                        ← model-generated
agent.md
agents/
  00-orchestrator/ (agent.md, drift.js, guardrails.md, instructions.md)
  01-requirements/ (same 4 files)
  02-architecture/ (same 4 files)
  03-spec-test/ (5 files: + PLAYWRIGHT_SETUP.md)
  04-implementation/ (same 4 files)
  05-qa-verification/ (same 4 files)
  06-drift-monitor/ (same 4 files)
  07-release-docs/ (same 4 files)
  _lib/drift-core.js
architectural.md
capabilities.md
drift.md
pipeline.config.json
playwright.config.js
prd.md                           ← model-generated (filled-in)
prompt-forge.json                ← manifest with pipeline_scaffold field
prompt-sequence.md
requirements.txt
spec.md
src/
  after/ (README.md, __init__.py, main.py)      ← model-generated
  before/ (README.md, main.py)                   ← model-generated
  example/ (README.md, login.js, server.js)      ← scaffold RED→GREEN demo
tdd.md
tests/ (README.md, conftest.py, test_main.py)   ← model-generated
```

## Guardrails honored

- **Do NOT remove current functionality:** All Task-3 files (prd.md, spec.md,
  agent.md, drift.md, capabilities.md, architectural.md, tdd.md,
  prompt-sequence.md, CLAUDE.md, AGENTS.md, DONE.md, Makefile, .gitignore,
  src/before/, src/after/, tests/, requirements.txt) remain at their current
  paths. The scaffold is purely additive.
- **Real code only:** All 45 reference pipeline files embedded verbatim —
  no placeholders, no truncation.
- **Single Prompt mode unaffected:** `PIPELINE_SCAFFOLD` and scaffold
  injection are only used by `buildProjectZip` (project mode). Single Prompt
  mode still produces a `.md` file.
- **All three export paths updated:** `downloadZip` (Forge), `asDownloadZip`
  (Assembly Line), and `afDownloadZip` (Agent Forge) all route through
  `buildProjectZip`, so all automatically include the scaffold.
- **No regressions:** All 4 existing test suites pass with identical counts.

## Commits

`edfeeb6 feat(export): integrate 8-agent spec-driven TDD pipeline scaffold`