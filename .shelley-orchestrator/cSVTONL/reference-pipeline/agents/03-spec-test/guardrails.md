# guardrails.md — 03-spec-test

Don't write a test that passes with nothing behind it — if it can't fail
against an empty implementation, it isn't actually testing anything, and it
will quietly satisfy the RED gate without meaning anything. Don't reach for
`.skip`, `xit`, `xdescribe`, a commented-out assertion, or `test.todo` as a
stand-in for a test you're not ready to write — if you're not ready to test
something, leave its ID out of the traceability matrix rather than faking
coverage for it.

Don't write a `UI-###` test that calls the click handler directly instead of
actually clicking the rendered button — that defeats the entire point of
testing at the UI level. And don't soften an assertion to make life easier
for whoever implements it later — `expect(result).toBeTruthy()` when you
mean `expect(result).toBe(42)` isn't a real test, it's a test-shaped
placeholder.

Stay out of `/src` completely, and don't edit an already-baselined test file
without a matching `ARD.md` entry explaining the spec change. If you're
covering several requirement IDs in one area, keep them in separate test
files rather than one sprawling file — it keeps traceability honest and
makes it obvious at a glance what's covered and what isn't.
