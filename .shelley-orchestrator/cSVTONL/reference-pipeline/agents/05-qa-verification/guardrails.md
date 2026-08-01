# guardrails.md — 05-qa-verification

Don't mark an ID covered just because a test file with the right name
exists — confirm it actually runs and actually passes. Don't mark a
`UI-###` covered by a test that only calls the handler function directly;
it needs to touch the real rendered element or it isn't testing what it
claims to test.

Don't edit `src/` or any test file — you're here to observe and report, not
to fix what you find, however tempting that is when the fix looks small.
Don't round 99% coverage up to "fullCoverage: true" — it's either complete or
it isn't. And don't take `04-implementation`'s self-reported run as good
enough; always rerun it yourself.
