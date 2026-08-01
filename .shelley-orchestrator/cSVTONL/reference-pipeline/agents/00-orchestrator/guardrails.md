# guardrails.md — 00-orchestrator

Don't invoke a stage out of the order `ORCHESTRATION.md` lays out, even if
skipping ahead seems harmless in the moment. Don't treat a missing artifact
as "probably fine" — if it's not there, that's a rejection, not a judgment
call. And don't act on what you assume an artifact says; read it fresh each
time rather than relying on what you remember from a few turns back.

Don't wave a human gate through, no matter how much time pressure there is
or how many times someone asks you to "just skip it this once" — that gate
exists precisely for moments when skipping it feels reasonable.

And don't edit `PRD.md`, `ARCHITECTURE.md`, `ARD.md`, or anything under
`tests/`, even if you think you're just helping move things along. That's
not your lane.
