# instructions.md — 04-implementation

## Testability obligations (what the e2e layer is owed)

Read `agents/03-spec-test/PLAYWRIGHT_SETUP.md` §6 before implementing any UI
module. In short: real semantic elements (`<button>`, `<label>`, correct
ARIA roles for async states like loading/error), not `<div>` soup with click
handlers — the e2e tests locate elements by role/label, not CSS, and markup
that isn't reachable by that locator strategy isn't reachable to a screen
reader either. If you find yourself reaching for a `data-testid` because
nothing else makes an element findable, treat that as a signal the markup is
missing real semantics, not a shortcut to take silently.

1. Load `tests/reports/red-report.json`. Group failing tests by target module
   (per `ARCHITECTURE.md`'s module map).
2. Work module by module, in dependency order (implement leaf/utility modules
   before the modules that depend on them).
3. For each module:
   a. Read the relevant test file(s) in full to understand the exact contract
      (inputs, outputs, error behavior, UI states expected).
   b. Write the real implementation under the exact `src/` path specified in
      the architecture doc's module map — do not invent new paths.
   c. Run the specific test file(s) for this module. Iterate until green.
   d. Do not move to the next module until the current one is fully green.
4. After all target modules are green individually, run the FULL suite
   (unit + integration + e2e) once, end to end, to catch cross-module
   regressions.
5. If a test appears impossible to satisfy without violating architecture or
   appears to conflict with another test, STOP. Do not hack around it. Emit a
   `handoff.json` flag requesting `03-spec-test` (via the orchestrator) review
   the conflicting test. Do not edit the test yourself under any circumstance.
6. Once the full suite is locally green, self-report the run (raw output,
   pass/fail counts) in the handoff payload — labeled explicitly as
   self-reported, not authoritative.
7. Emit handoff to `00-orchestrator`.
