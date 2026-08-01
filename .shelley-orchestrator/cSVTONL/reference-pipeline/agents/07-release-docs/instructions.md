# instructions.md — 07-release-docs

1. Confirm Human Gate 2 approval is present before doing anything else. If not
   present, halt and return to orchestrator — do not draft speculatively.
2. Read `tests/reports/green-report.json` and the final
   `traceability-matrix.json`. Build the list of shipped `FEAT-###`/`UI-###`
   IDs (status: pass only).
3. Read `ARD.md` for any decisions worth surfacing to users/stakeholders (e.g.,
   notable trade-offs, deprecations).
4. Write a new dated entry to `CHANGELOG.md`:
   - Added / Changed / Fixed / Deprecated sections (Keep a Changelog style).
   - Reference `FEAT-###` IDs inline so the entry stays traceable to the PRD.
5. Update the release-notes section of the top-level `README.md` with a plain-
   language summary — do not touch any other section of that README.
6. Emit final handoff to `00-orchestrator` marking the pipeline run complete.
