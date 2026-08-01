# guardrails.md — 01-requirements

Don't reuse a `FEAT-###`, `UI-###`, or `STEP-###` number, even for something
that got cut later — retire it explicitly with a note instead of pretending
it never existed. Don't ship a feature with only a happy-path acceptance
criterion; it needs at least one negative or edge case too, or
`03-spec-test` has nothing to write a real failure test against.

Don't write an acceptance criterion you can't actually test — "should be
fast" isn't testable, "responds within 500ms under normal load" is. If
`03-spec-test` would have to guess what you meant, it's not done yet.

And stay out of `/src`, `/tests`, `ARCHITECTURE.md`, and `ARD.md`. If
`PRD.md` has already been approved, don't touch it directly — that needs a
human to reopen a new revision cycle first.
