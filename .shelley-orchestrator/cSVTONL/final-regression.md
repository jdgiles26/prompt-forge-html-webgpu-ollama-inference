# Final Integration Regression Report — prompt-forge

**Conversation:** cSVTONL
**Date:** 2025-07-13
**Scope:** Final regression check after all 5 tasks merged to `main`. No implementation work performed — suites run as-is.

---

## Per-Suite Results

| Suite | Passed | Failed | Skipped | Notes |
|---|---:|---:|---:|---|
| `node test_features.js` | 116 | 1 | 0 | Known pre-existing: `file:///ollama/api/tags` fetch scheme error (live Ollama at `file://` origin). ✅ matches baseline |
| `node test_tabs.js` | 56 | 0 | 0 | Clean |
| `node test_e2e_project.js` | 131 | 0 | 0 | Clean. Artifacts written to `test_output/` |
| `node test_zip_runs_tdd.js` | 8 | 0 | 0 | Clean. pytest 9.1.1 already installed |
| `node test_webgpu_local_http.js` | 2 | 1 | 1 | Known pre-existing: serve.py startup-timing 404 (1 fail) + headless Chromium lacks shader-f16 (1 skip). ✅ matches baseline |
| `node test_2026_features.js` | 35 | 0 | 0 | Clean (Task 5: 3D globe, context shield, drift compiler, PRD graph, mesh sync) |

**Totals:** 348 passed · 2 failed · 1 skipped

### Failure detail
1. **test_features.js** — `console.error: Fetch API cannot load file:///ollama/api/tags. URL scheme "file" is not supported.`
   → Known pre-existing environmental failure (live Ollama endpoint hit from a `file://` origin). Matches baseline. **NOT a regression.**
2. **test_webgpu_local_http.js** — `Failed to load resource: the server responded with a status of 404 (File not found)`
   → Known pre-existing serve.py startup-timing 404. Matches baseline. **NOT a regression.**
3. **test_webgpu_local_http.js (skip)** — `headless WebGPU feature gap … shader-f16, which is not enabled in this browser`
   → Known pre-existing skip (headless Chromium lacks shader-f16). Matches baseline. **NOT a regression.**

No failures outside the known pre-existing set were observed.

---

## Working-Tree Status

```
On branch main
Your branch is ahead of 'origin/main' by 13 commits.

Changes not staged for commit:
  modified:   .shelley-orchestrator/cSVTONL/task1-report.md
  modified:   .shelley-orchestrator/cSVTONL/task2-report.md
  modified:   .shelley-orchestrator/cSVTONL/task4-report.md
```

**Note:** The only uncommitted changes are to orchestrator report files under `.shelley-orchestrator/cSVTONL/` (subagent status reports being updated in-place). No source files (`prompt-forge.html`, `mesh-server.js`, tests, `package.json`, `serve.py`, `README.md`) are modified. The product code itself is clean on `main`.

---

## Commit List (last 12)

```
27ce263 feat(2026): 3D globe, context shield, drift compiler, PRD graph, mesh sync   ← Task 5
1b96263 docs: add task4 completion report (edge models + sandbox)
1443801 feat(edge): HF cloud backend, local gguf/onnx drag-drop, pyodide TDD sandbox ← Task 4
8906cad docs: add task2 completion report (assembly state + shared inference refactor)
9b034c6 test(hooks): expose Task-2 inference helpers on window.__pf for tests
d967102 feat(assembly): compaction, per-stage run controls, telemetry, dynamic penalty scaling
3b77694 feat(assembly): editable+persistent stages, drag-reorder, MoA tier router, tier tags
3cd5bcd feat(inference): extended sampling params + dynamic ctx-fill scaling + repetition-loop detector ← Task 2
cb3ea5a docs: add task3 completion report (TDD/SDD export pipeline)
1887108 docs(test-output): untrack regenerated test_output_, refresh README counts + test-type docs
f0ee7ae feat(export): ATDD/SDD project pipeline + shared buildProjectZip             ← Task 3
26be391 feat(ui/a11y): prominent accessible nav tabs, tooltips, section aria-expanded ← Task 1
```

Task → commit mapping (best match):
- **Task 1 (UI/a11y nav tabs):** `26be391`
- **Task 2 (assembly state + shared inference refactor):** `3cd5bcd`, `3b77694`, `d967102`, `9b034c6`
- **Task 3 (TDD/SDD export pipeline):** `f0ee7ae`, `1887108`
- **Task 4 (edge models + pyodide TDD sandbox):** `1443801`
- **Task 5 (2026 features: globe, context shield, drift compiler, PRD graph, mesh sync + mesh-server.js):** `27ce263`

---

## Verdict

# ✅ CLEAN — NO REGRESSIONS FOUND

All 6 suites execute successfully. The only 2 failures and 1 skip are exactly the documented pre-existing environmental issues (file:// Ollama fetch, serve.py startup 404, headless shader-f16 gap) and match the baseline. No new failures were introduced by the merged task work. `mesh-server.js` (Task 5) and the Task 5 feature suite (`test_2026_features.js`, 35/35 passing) confirm the new mesh-sync feature is integrated and stable alongside the existing forge/agentforge views.
