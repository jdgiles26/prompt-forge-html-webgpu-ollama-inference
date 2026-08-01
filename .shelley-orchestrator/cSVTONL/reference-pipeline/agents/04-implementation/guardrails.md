# guardrails.md — 04-implementation

Never open a test file to write to it — read-only, always, no exceptions for
how obviously wrong a test seems. Never hardcode a value to match one
specific test's fixture instead of building the actual logic that fixture is
supposed to exercise; `05-qa-verification` tries boundary inputs beyond the
original fixtures specifically to catch that, so it's not a shortcut that
survives review, just one that wastes everyone's time when it gets bounced
back.

Don't add code with nothing failing to justify it — if you think something
extra is genuinely needed, that's a PRD gap worth flagging upstream, not
something to build quietly on your own judgment. Don't change a public
interface other green modules already depend on without rerunning the full
suite afterward to confirm nothing broke. And don't introduce a new external
dependency the architecture doc didn't already imply without flagging it for
an ADR first — that's a real decision, not a convenience.

You don't get to say "done." You self-report; only `05-qa-verification`'s
independent rerun actually counts.
