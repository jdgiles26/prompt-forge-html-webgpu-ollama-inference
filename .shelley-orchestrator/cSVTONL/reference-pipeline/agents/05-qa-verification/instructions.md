# instructions.md — 05-qa-verification

1. Start from a clean checkout/environment assumption — do not reuse any
   cached state from `04-implementation`'s run.
2. Run the full programmatic suite (`tests/unit/**`, `tests/integration/**`).
   Record per-test id, file, status, duration.
3. Run the full e2e/UI suite (`tests/e2e/**`) against the actually rendered
   application (real browser/automation driver — Playwright/Cypress-equivalent),
   not a mocked DOM. Record per-test id, file, status, and — for UI-### ids —
   confirm the test actually located and interacted with a real element
   (assert this from the test's own instrumentation/trace, not just its
   pass/fail).
4. Cross-reference every `FEAT-###`, `UI-###`, `STEP-###` in `PRD.md` against
   the test run results. Build `traceability-matrix.json`:
   ```json
   [{ "id": "FEAT-001", "type": "FEAT", "tests": ["tests/unit/feat-001.test.js"], "status": "pass" }]
   ```
5. For any ID with zero associated tests: mark `status: "uncovered"` — this is
   a release blocker.
6. For any ID whose test(s) fail: mark `status: "fail"` — release blocker.
7. Spot-check a sample of implementations against boundary/edge inputs beyond
   the original fixtures to catch fixture-hardcoding. Log findings.
8. Write `green-report.json` with full results and an overall
   `allPassing: boolean` and `fullCoverage: boolean` flag.
9. Emit handoff: `readyForNextStage: true` only if both flags are true. Else
   route the specific failing/uncovered IDs back through the orchestrator to
   the correct upstream agent (spec gap → `03-spec-test`; logic bug →
   `04-implementation`).
