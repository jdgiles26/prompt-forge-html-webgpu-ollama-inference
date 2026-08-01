# instructions.md — 06-drift-monitor

Run this full sequence after EVERY stage transition (00→01, 01→02, ..., 06→07):

1. Invoke the just-completed agent's own `drift.js` (each agent's script
   already checks its own scoped concerns — ownership, RED validity, append-
   only logs, etc.) and collect its report.
2. Run a global ownership sweep: diff the full repo against the last known-good
   snapshot, and call `checkOwnership()` from `drift-core.js` for the acting
   agent's `writeGlobs` from `pipeline.config.json` against every changed file
   in the repo (not just the files the agent claims to have changed — trust
   but verify).
3. Run a global test-integrity sweep: hash every file under `tests/**` and
   compare to the `tests-red-baseline` checkpoint. Any diff not attributable to
   `03-spec-test` with a fresh `ARD.md` "spec revision" entry is a violation.
4. Run a governance-file sweep: hash `GUARDRAILS.md`, `FILE_OWNERSHIP.md`,
   `ORCHESTRATION.md` (gate-definition section), and `PRD.md` (if past Gate 1).
   Any diff without an explicit human-authorized change note is a violation.
5. Run an ID-integrity sweep: re-extract all `FEAT-###`/`UI-###`/`STEP-###`
   from `PRD.md` and confirm no duplicates and no gaps that suggest silent
   renumbering.
6. Append this run's full result (timestamp, stage transition, all sub-checks,
   overall `clean`) to `tests/reports/drift-log.json` — this file is
   cumulative; never truncate or overwrite prior entries, only append.
7. Return `clean: true/false` plus itemized violations to `00-orchestrator`.
