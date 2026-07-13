# Complete Project Pkg — ZIP Download Audit & Fix Report

**Date:** 2026-07-13
**Audited file:** `/opt/prompt-forge/prompt-forge.html`
**Spec basis:** Task-3 `buildProjectZip` shared export pipeline.
**New test file:** `test_zip_download.js` (88 cases).

## Outcome

SUCCESS. The Complete Project Pkg ZIP download flow was audited end-to-end
across all three export entry points and hardened. All three routes converge
on the shared `buildProjectZip` (Forge `downloadZip`, Assembly
`asDownloadZip`, Agent Forge `afDownloadZip`). Each triggers a **real browser
download** via a blob URL + `<a download>` (`saveBlob` / `saveBlobShared`), not
just an in-memory blob. The ZIP integrity re-open check now also rejects
genuinely-empty directories and missing sidecar files. A new Playwright suite
proves every entry point fires a download and the archive contains the full
required file list. No regressions; Single Prompt mode unaffected.

## Three export entry points — all confirmed working

| Entry point | Button | Handler | Routes through `buildProjectZip` | Download trigger | Verified by |
|---|---|---|---|---|---|
| Forge view | `#zipBtn` (visible only in project mode via `setMode`) | `window.downloadZip` (line ~3767) | ✅ `buildProjectZip({ files, task, manifest })` then `saveBlob(blob, name)` | `<a download="…zip" href="blob:…">.click()` | Playwright `download` event + `AdmZip` |
| Assembly Line | `#asZipBtn` (enabled when `asOutputMode==='project'` & files parsed) | `window.asDownloadZip` (line ~6349) | ✅ `buildProjectZip({ files, task, manifest:{source:'assembly-line', test_types, stages}, extraFiles:[assembly-line.json] }, { jszipLoader: sharedJSZip })` then `saveBlobShared` | `<a download>.click()` | in-page anchor-click capture + JSZip re-inflate |
| Agent Forge | `#afZipBtn` (enabled when `afFiles.length`) | `window.afDownloadZip` (line ~6977) | ✅ `buildProjectZip({ files, manifest:{source:'agent-forge', answers, test_types, generator_models}, extraFiles:[agent-forge-spec.json] }, { jszipLoader, platform:'UNIX', execPattern:/^install.*\.sh$/ })` then `saveBlobShared` | `<a download>.click()` | in-page anchor-click capture + JSZip re-inflate |

`saveBlob` / `saveBlobShared` both: `URL.createObjectURL(blob)` →
`<a href=url download=name>` → `a.click()` → `URL.revokeObjectURL(url)`. This
is the standard programmatic-download flow and fires a real browser download
(verified by Playwright's `page.waitForEvent('download')` for the Forge path).

## Verified file list in a sample generated zip

From `test_output/complete_project.zip` (Forge path, 23 file entries + 4
folder markers + manifest = 28 zip entries, 11,982 bytes):

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
prompt-forge.json          # manifest
```

Folder markers `src/`, `src/before/`, `src/after/`, `tests/` are also
present (auto-emitted by JSZip for nested paths) — every one of them contains
real files (each folder has its own README), so **no empty directories**
exist in the archive (verified by the integrity check + the test suite).

### `prompt-forge.json` manifest (sample)
```json
{
  "forged_at": "2026-07-13T02:48:43.615Z",
  "schema": "prompt-forge.project.v2",
  "test_types": ["functional","unit","integration","e2e","contract","property"],
  "file_count": 23,
  "prd_hash": "464d846a",
  "spec_hash": "838f7243",
  "mode": "project",
  "backend": "ollama",
  "model": "",
  "template": null,
  "params": { "temperature": 0.3, ... },
  "task": "Build a Python token counter with TDD. ..."
}
```

## REQUIRED_PROJECT_FILES coverage

`REQUIRED_PROJECT_FILES` (line ~3822) is the validator's must-have list:
```
README.md, prd.md, spec.md, tdd.md, agent.md, drift.md,
capabilities.md, architectural.md, prompt-sequence.md,
CLAUDE.md, AGENTS.md, DONE.md, Makefile, .gitignore,
src/before/README.md, src/after/README.md, tests/README.md
```
plus stack-dependent `src/before/main.*`, `src/after/main.*`,
`tests/test_main.*`, `tests/conftest.*`, `requirements.txt`|`package.json`
matched by extension in `validateOutput`. All present in every generated
zip (asserted per-file by `test_zip_download.js` for all three entry points).

## ZIP integrity check (re-open + re-inflate every entry)

`buildProjectZip` performs, after `generateAsync`:
1. Re-opens the blob with `JSZip.loadAsync(blob)`.
2. **Empty-directory scan:** every `dir` entry must have at least one file
   beneath it; a genuinely-empty folder fails loudly.
3. **Per-file re-inflation:** every parsed `files[].path` must be present and
   non-empty (except allow-empty `__init__.py` / truly-empty bodies).
4. **Sidecar round-trip:** every `extraFiles[]` entry (e.g.
   `assembly-line.json`, `agent-forge-spec.json`) must survive.
5. **Manifest present:** `prompt-forge.json` must be in the re-opened archive.
6. (Pre-generation) **duplicate-path / empty-path / null-body scan** rejects
   malformed payloads before bytes reach JSZip.

Any failure surfaces via `opts.onError` (the caller's `showErr`/`asShowErr`/
`afShowErr`) and aborts the download — no corrupt archive is ever handed to
the browser.

## Naming / structure

- kebab/snake_case file names, ordered build sequence in `prompt-sequence.md`.
- Every directory has a `README.md` index — no empty folders.
- No duplicate paths (pre-gen scan + re-open round-trip).
- Executable bits preserved for Agent Forge `install*.sh` (0755).

## Test-type selection → tests/ + prompt-sequence.md

- UI checkboxes (Functional / Unit / Integration / E2E / Contract /
  Property / All) live in `#sec-testtypes` (Forge) and `#asTestTypesGrid`
  (Assembly), stored in `state.testTypes` / `localStorage pf.testtypes.v1`,
  mirrored between the two views.
- Fed into `SYSTEM_PROMPT_PROJECT` via `testTypesPromptFragment(testTypes)`,
  so the model emits matching executable specs/tests + per-type pass/fail
  criteria in `prompt-sequence.md`.
- Recorded in the manifest as `test_types` for **all three** entry points
  (Forge, Assembly, Agent Forge — Assembly & Agent Forge manifests were
  extended in this task to include `test_types`).

## Fixes made in this task

1. **`buildProjectZip` integrity check hardened** (`prompt-forge.html`):
   - Added empty-directory detection (every `dir` entry must have a child
     file) — fails loudly on a genuinely-empty folder.
   - Added sidecar round-trip verification (`extraFiles[]` must survive
     re-open).
   - Kept the existing per-file re-inflation + manifest-presence checks.
   - (Tried-and-reverted: stripping JSZip's auto-created folder-marker
     entries. `zip.remove('src/')` also nukes its children, and re-emitting a
     "clean" archive still re-creates the markers because JSZip emits them
     for any nested path. The correct guarantee is "no folder with zero
     files", which the new check enforces.)
2. **Assembly & Agent Forge manifests now include `test_types`** so the
   test-type selection is recorded in every exported archive, not just
   Forge's.
3. **Exposed `buildProjectZip` (and `downloadZip`, `saveBlob`) on
   `window.__pf`** so the test/introspection surface can drive the shared
   builder directly.
4. **New Playwright suite `test_zip_download.js`** (88 cases) proving:
   - `#zipBtn` is visible in project mode and fires a real browser download
     (Playwright `download` event); the saved zip contains every required
     file, the manifest, no empty directories, no duplicate paths, and
     `schema=prompt-forge.project.v2` + `test_types` + `prd_hash`/`spec_hash`.
   - `#asZipBtn` fires a download whose zip contains the full required list +
     `prompt-forge.json` + `assembly-line.json` sidecar.
   - `#afZipBtn` fires a download whose zip contains the full required list +
     `prompt-forge.json` + `agent-forge-spec.json` sidecar.
   - Single Prompt mode hides `#zipBtn` (guardrail).
5. **`package.json`**: added `test_zip_download.js` to the `test` script and
   a `test:zipdl` alias.
6. **`README.md`**: documented the new test suite.

## Before / after test counts

| Suite                     | Before  | After   |
|---------------------------|---------|---------|
| `test_e2e_project.js`     | 131 ✓   | 131 ✓   |
| `test_zip_runs_tdd.js`    | 8 ✓     | 8 ✓     |
| `test_tabs.js`            | 56 ✓    | 56 ✓    |
| `test_zip_download.js`    | — (new) | 88 ✓    |

**No regressions.** All pre-existing suites remain 100% green; the new suite
adds 88 passing cases. Total project test count rose by 88 with zero new
failures.

## Guardrails honored

- Real code only — the download works in a real browser (Playwright captures
  the actual `download` event for the Forge path; Assembly & Agent Forge
  paths capture the real `<a download>.click()` + blob URL and re-inflate the
  bytes).
- Single Prompt mode unaffected (`#zipBtn` hidden; `buildProjectZip` is
  project-mode only).
- `parseProjectFiles` regex unchanged — existing FILE-block payloads still
  parse.
- Commits on `main` with clear messages.
