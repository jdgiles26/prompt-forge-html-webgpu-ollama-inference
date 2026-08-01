# GUARDRAILS.md — the rules every agent works under

This file outranks everything except a direct human instruction. Any agent's
own `guardrails.md` can narrow these further for its stage, but none of them
can loosen what's written here.

## Stay inside your lane

Check `FILE_OWNERSHIP.md` before you touch anything. If you're not sure
whether a path is yours, it isn't — write a `handoff.json` request instead of
guessing. Nobody edits another agent's `agent.md`, `instructions.md`, or
`guardrails.md`. And nobody except a human, acting deliberately, touches
`GUARDRAILS.md`, `FILE_OWNERSHIP.md`, an already-approved `PRD.md`, or
`ORCHESTRATION.md`'s gate definitions — if you think one of these needs to
change, that's an escalation, not a quiet edit.

## Tests are the spec, not a suggestion

Only `03-spec-test` writes or edits test files. If you're `04-implementation`
and a test looks wrong to you, you don't get to fix it yourself — you flag it
and let `03-spec-test` decide, with a matching `ARD.md` entry explaining why
the spec changed if it does. A test that gets weakened, skipped, or quietly
deleted to force a pass isn't a passing test, it's a lie the pipeline told
itself, and `06-drift-monitor` hash-checks every test file at every
transition specifically to catch that.

## Order matters: spec, then test, then code

Nothing gets implemented before a test exists that fails for the right reason
— missing implementation, not a typo in the test. And no stage runs out of
turn. If you're `04-implementation` and there's no `red-report.json` yet,
you're not ready to start.

## Trace everything back to the PRD

Every feature, screen element, and workflow step in `PRD.md` gets a unique
ID — `FEAT-###`, `UI-###`, `STEP-###` — and every one of those needs at least
one real test. A UI element needs a test that actually renders it and clicks
it, not just a unit test of the function behind it. A gap in coverage is a
release blocker, full stop, not a note for later.

## Two points where a human has to actually say yes

After the PRD is drafted, and before release — the pipeline stops and waits
for explicit approval both times. Don't read silence as a yes.

## When something's unclear, say so instead of guessing

If a requirement is ambiguous or two things in the PRD contradict each other,
write it up in `ESCALATION.md` and stop. Guessing at what someone probably
meant is how a pipeline built to catch drift ends up shipping drift anyway.

## Never hand off a secret

Don't write API keys, tokens, passwords, or credentials into anything you
create. Reference them by environment variable name or secrets-manager key,
never the value itself.

## Build what was asked for, nothing extra

If it doesn't trace back to an approved `FEAT-###`, `UI-###`, or `STEP-###`,
it doesn't belong in this run — no speculative features, no drive-by
refactors bundled into an unrelated change, no scope creep that nobody signed
off on.

## Log what you did

Before you hand off, append a timestamped line to `ORCHESTRATION.md`'s
run-log saying what happened. That log is append-only — it's a record of
what actually occurred, not a draft you get to revise later.

## Every project is a fresh instance of this pipeline

This scaffold gets run against a lot of different, unrelated projects over
time. Whatever project you're working on right now is defined entirely by
its own `PRD.md` — not by `tests/*/example/` or `src/example/`, which exist
only to prove the RED-to-GREEN mechanics work, and not by whatever the last
project run through here happened to look like.

Concretely: derive every requirement, architectural decision, test, and line
of code from this run's `PRD.md` alone. If this project has nothing to do
with authentication, nobody adds a login feature "just in case" or "as a
common pattern" — you build what's actually asked for, or clearly and
necessarily implied by it, and nothing else. `02-architecture` in particular
should let the actual shape of the project decide the actual shape of the
system — a CLI tool, an embedded system, and a three-tier web app all need
different architectures, and defaulting to whatever pattern got used last
time isn't a design decision, it's the absence of one. Record the real
reasoning in `ARD.md` so the choice is traceable to this project, not habit.

If you notice your own draft starting to resemble the shipped example, or a
previous project, in ways the current PRD doesn't actually justify — treat
that as a reason to double check, not a reason to assume you're on the right
track.
