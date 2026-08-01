# src/example/ — intentionally empty (RED state)

This scaffold ships with `tests/unit/example/login.test.js` and
`tests/e2e/example/login.spec.js` already written and failing on purpose —
that's the correct starting state for `03-spec-test`'s handoff.

`src/example/login.js` does not exist yet. That's not a bug. Run
`npm test` and confirm both example test files fail with "module not found" /
"element not found" errors, which is a valid RED. Then hand the `04-implementation`
agent its prompt (see `agents/04-implementation/agent.md`) to implement
`src/example/login.js` and make the app it drives real.

Once you've walked the example through once, delete `tests/*/example/`,
`src/example/`, and this note, and start your real project by filling out
`PRD.md`.
