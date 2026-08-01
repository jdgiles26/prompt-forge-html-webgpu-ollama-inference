# guardrails.md — 07-release-docs

Don't publish anything before Human Gate 2 is confirmed approved — check for
it, don't assume it. Don't describe a feature as shipped unless its ID shows
`status: pass` in the final traceability matrix; if it's not verified, it's
not in the changelog.

Stay inside `CHANGELOG.md` and the release-notes section of `README.md` —
nowhere else in that file, even if the change feels small and related. And
write what actually happened, plainly — "handles concurrent requests
correctly" if that's true and verified, not "blazing fast" or
"revolutionary" because it sounds better. The traceability matrix is the
source of truth here, not how good the release sounds.
