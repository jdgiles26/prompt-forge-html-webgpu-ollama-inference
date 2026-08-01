# instructions.md — 03-spec-test

## Notation standard: EARS
Write acceptance-criteria-derived test descriptions using EARS (Easy Approach
to Requirements Syntax) phrasing pulled from the PRD's Given/When/Then:
- Ubiquitous: "The system shall <response>."
- Event-driven: "When <trigger>, the system shall <response>."
- State-driven: "While <state>, the system shall <response>."
- Unwanted behavior: "If <condition>, then the system shall <response>."
This keeps every test name traceable 1:1 back to an unambiguous requirement —
an agent (or human) can read the test title and the PRD line side by side and
confirm they match, with no interpretation gap.

## Before you write anything

This pipeline is a reusable process definition run against many different,
unrelated projects over its lifetime. The project you're working on right now
is defined entirely by the current `PRD.md` — not by `tests/*/example/` or
`src/example/`, which are a one-time mechanical demo of RED→GREEN, not a
starting template. If this run's `PRD.md` has nothing to do with the shipped
example's domain, nothing you write should resemble it. See GUARDRAILS.md §10.

For UI-### tests specifically, read `agents/03-spec-test/PLAYWRIGHT_SETUP.md`
in full before writing your first e2e test — it covers config, locator
strategy, file/naming conventions tied to traceability, and what you're owed
by `04-implementation` for testability. Don't reinvent these conventions
per-project; they're deliberately project-agnostic.

## Steps

1. Read `PRD.md` and `ARCHITECTURE.md`'s module map.
2. For each `FEAT-###`:
   a. Write unit test(s) in `tests/unit/` covering each Given/When/Then in EARS
      phrasing, happy path + at least one edge/failure case.
   b. Write integration test(s) in `tests/integration/` if the feature spans
      modules per the architecture doc.
   c. Import against the interface path defined in `ARCHITECTURE.md`'s module
      map — even though the module doesn't exist yet. This import failure is
      part of a valid RED.
3. For each `UI-###`:
   a. Write an e2e test in `tests/e2e/` following the conventions in
      `agents/03-spec-test/PLAYWRIGHT_SETUP.md` (locator strategy, file
      naming, state coverage) — that file is the source of truth for HOW;
      don't improvise a different pattern per project.
4. For each `STEP-###`, write an integration or e2e test exercising the full
   sequence with its stated preconditions, asserting the final expected outcome.
5. Build `tests/reports/traceability-matrix.json`: an array of
   `{ id, type, testFiles: [...] }` for every FEAT/UI/STEP.
6. Run the entire suite. Every test MUST fail. Capture the full verbatim
   output into `tests/reports/red-report.json` with per-test id, file, and
   failure reason.
7. Inspect the failures: each must be "not implemented" / "module not found" /
   "element not found" / a real assertion mismatch against expected behavior —
   never a syntax error in the test itself. Fix and rerun until clean.
8. Record the checkpoint hash of all test files via `drift.js` (this is the
   baseline `06-drift-monitor` will compare against for the rest of the
   pipeline).
9. Emit handoff to `00-orchestrator` with `artifactsProduced` including
   `red-report.json` and `traceability-matrix.json`.

## If a later spec revision is needed
If `05-qa-verification` or a human finds a test was wrong (not the
implementation), only you may edit it — and only after adding a matching
`ARD.md` entry under "Special rule: test-spec changes." Re-run to confirm RED
or GREEN as appropriate, and re-baseline via `drift.js`.
