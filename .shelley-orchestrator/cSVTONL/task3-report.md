# Task 3 — TDD/Spec-Driven Export Pipeline — Completion Report

**Date:** 2026-07-13
**Spec:** `.shelley-orchestrator/cSVTONL/task3-tdd-export-pipeline.md`
**File edited:** `/opt/prompt-forge/prompt-forge.html` (+ `test_e2e_project.js`, `test_zip_runs_tdd.js`, `README.md`, `package.json`)
**Commits:** `f0ee7ae feat(export): ATDD/SDD project pipeline + shared buildProjectZip` · `1887108 docs(test-output): untrack regenerated test_output/, refresh README counts + test-type docs`

## Outcome

SUCCESS. The Complete Project Pkg export pipeline was overhauled into a
fully structured agentic repo with PRD/TDD/SDD artifacts and Red→Green
enforcement. A shared `buildProjectZip(parts, opts)` is now the single
source of truth used by all three export paths (Forge `downloadZip`,
Assembly Line `asDownloadZip`, Agent Forge `afDownloadZip`). Single Prompt
mode is untouched. The RED→GREEN proof still holds.

## Before / After test counts

| Suite                     | Before | After  |
|---------------------------|--------|--------|
| `test_e2e_project.js`     | 76  ✓  | **131 ✓** |
| `test_zip_runs_tdd.js`    | 7 ✓ / 1 ✗ (PEP 668 blocked `pip install pytest`) | **8 ✓** |

- The single before-failure (`test_zip_runs_tdd.js` — `pytest installed`)
  was fixed by switching the install command to
  `python3 -m pip install --quiet --break-system-packages pytest`
  (PEP 668 externally-managed environments refuse bare `--user`). pytest 9.1.1
  is installed on the VM.
- Both suites are 100% green after the change. No new regressions.
- The E2E suite grew from 76 → 131 because the fixture payload and the
  required-file / validator assertions were extended to cover the new
  TDD/SDD scaffolding (23 file blocks, per-directory READMEs, TDD post-parse
  check, ZIP integrity, manifest hashes).

## What was built (mapped to the spec)

### 1. Test-type radio/checkbox group (UI)
- New `PROGRAMMATIC TEST TYPES` section in project mode, above `#forgeBtn`
  (`#sec-testtypes`, `prompt-forge.html` UI + CSS).
- Checkboxes: Functional / Unit / Integration / End-to-End (E2E) / Contract /
  Property-based, plus an **All / Custom combo** convenience radio.
- Selection stored in `state.testTypes`, persisted to `localStorage`
  (`pf.testtypes.v1`), included in workspace export/import
  (`payload.test_types`).
- Fed into `SYSTEM_PROMPT_PROJECT` via `testTypesPromptFragment(testTypes)` so
  the model generates the matching executable spec/test files + pass/fail
  criteria. This is test **TYPE/COVERAGE**, not a library choice — the runner
  is still chosen from the detected stack (pytest / jest / cargo test / go
  test / …), stated explicitly in the prompt fragment.
- Mirrored into the Assembly Line view (`#asTestTypesGrid`,
  `onAsTestTypeCheckboxChange`, `syncAsTestTypes`) defaulting from Forge's
  choice — single source of truth, both stay in sync.

### 2. Repo scaffolding (meta-prompt + JS validation)
`SYSTEM_PROMPT_PROJECT` rewritten to emit, in order: `README.md`, `prd.md`,
`spec.md`, `agent.md`, `drift.md`, `capabilities.md`, `architectural.md`,
`CLAUDE.md`, `AGENTS.md`, `DONE.md`, `tdd.md`, `prompt-sequence.md`,
`Makefile`, `.gitignore`, `src/before/README.md`, `src/before/main.<ext>`,
`src/after/README.md`, `src/after/main.<ext>`, `src/after/__init__.py`,
`tests/README.md`, `tests/test_main.<ext>`, `tests/conftest.<ext>`,
`requirements.txt`|`package.json`. Every directory has a README/index — no
empty directories.

**New `REQUIRED_PROJECT_FILES` list** (`prompt-forge.html:2987`):
```
README.md, prd.md, spec.md, tdd.md, agent.md, drift.md,
capabilities.md, architectural.md, prompt-sequence.md,
CLAUDE.md, AGENTS.md, DONE.md, Makefile, .gitignore,
src/before/README.md, src/after/README.md, tests/README.md
```
(plus stack-dependent `src/before/main.*`, `src/after/main.*`,
`tests/test_main.*`, `tests/conftest.*`, `requirements.txt`|`package.json`
matched by extension in `validateOutput`). Validation warns per missing file
in the validator modal.

### 3. PRD → executable spec → Red-Green-Refactor enforcement
- Meta-prompt dictates the methodology explicitly (RED→GREEN, no drift):
  PRD first → executable spec second → tests third (RED, import `src/after`,
  assert from spec, **tautological tests forbidden**) → implementation last
  (GREEN, never edit tests) → record transition in `tdd.md` + `DONE.md`.
- JS post-parse validator (`validateOutput`) checks:
  - test files exist under `tests/` matching `test_*.<ext>`,
  - they reference the `src/after` implementation module,
  - they contain real `assert`/`expect`/`toEqual`/… calls,
  - anti-tautology: flags wildcard imports from the implementation.

### 4. Naming & structure
kebab/snake_case file names, ordered build sequence in `prompt-sequence.md`
(table: # / Prompt / Build / Pass criteria / Fail criteria / Guardrails),
every folder has a `README.md`. `prompt-forge.json` manifest extended with
`schema: prompt-forge.project.v2`, `test_types`, `prd_hash`, `spec_hash`
(FNV-1a 32-bit fingerprints of `prd.md` / `spec.md` bodies).

### 5. Assembly Line + Agent Forge wired in
- `asDownloadZip` and `afDownloadZip` both route through `buildProjectZip`
  with their own `manifest` extras (`source: 'assembly-line'` /
  `'agent-forge'`, stages / answers / generator_models). Agent Forge still
  marks `install*.sh` executable (`execPattern: /^install.*\.sh$/`,
  `platform: 'UNIX'`).
- Assembly view gains the same test-type selector, defaulting from Forge.

### 6. ZIP integrity
`buildProjectZip` performs:
1. duplicate-path scan before zipping,
2. writes `prompt-forge.json` manifest,
3. **re-opens** the generated blob with JSZip, re-inflates every entry, and
   confirms each file is present, non-empty (except `__init__.py` / truly
   empty bodies), and that the manifest survived — fails the download with a
   clear message otherwise.

## Sample generated tree (from `test_output/complete_project.zip`, 23 files)

```
README.md
prd.md
spec.md
agent.md
drift.md
capabilities.md
architectural.md
CLAUDE.md
AGENTS.md
DONE.md
tdd.md
prompt-sequence.md
Makefile
.gitignore
src/before/README.md
src/before/main.py
src/after/README.md
src/after/main.py
src/after/__init__.py
tests/README.md
tests/test_main.py
tests/conftest.py
requirements.txt
prompt-forge.json   # schema=v2, test_types=[functional,unit,integration,e2e,contract,property],
                    #   prd_hash=464d846a, spec_hash=838f7243
```

`validation_report.txt` (in-page validator) now reports: `23 file blocks
parsed`, `no duplicate paths`, `1 test file(s) reference src/after
implementation`, `1 test file(s) contain assertion/expect calls`,
`no tautological wildcard imports`.

## RED→GREEN proof (still holds)

`test_zip_runs_tdd.js` unzips the forged package into `test_output/sandbox/`
and runs real pytest:
1. `pytest` exits **non-zero on RED** — output mentions `NotImplementedError`
   (src/after stubs raise it).
2. After a real implementation is written into `src/after/main.py`,
   `pytest` exits **zero on GREEN** — all tests pass.
3. `make -n test` parses.

## Guardrails honored
- Real, complete edits to `prompt-forge.html` (meta-prompt replacement +
  JS validator + shared `buildProjectZip` + UI radio/checkbox group). No
  mock/fake/simulated code.
- Single Prompt mode unaffected (it still produces a `.md`; the test-type
  selector and `buildProjectZip` are project-mode only; `setMode` hides
  `#sec-testtypes` in single mode).
- `parseProjectFiles` regex unchanged — existing FILE-block payloads still
  parse (the fixture payload was extended, not the parser).

## Notes / deviations
- `test_output/` was previously tracked in git despite being gitignored and
  regenerated on every test run. It has been removed from git tracking
  (`git rm -r --cached test_output/`) in commit `1887108`; the directory is
  still generated locally by the tests and ignored by `.gitignore`.
- The short `prd_hash` / `spec_hash` are FNV-1a 32-bit fingerprints used as
  drift/identity tags (not cryptographic) — sufficient for the manifest's
  "did the PRD/spec change?" purpose.
