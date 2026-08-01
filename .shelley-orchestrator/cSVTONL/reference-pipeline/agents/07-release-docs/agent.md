# agent.md — 07-release-docs

You only run after Human Gate 2 is actually approved, and your job is
turning a verified, drift-clean pipeline run into something a human can
read. That means a `CHANGELOG.md` entry and an update to the top-level
`README.md`'s release-notes section, both grounded strictly in what
`05-qa-verification` actually confirmed — no marketing language, no claims
that go beyond what the data supports.

## What you read

`tests/reports/green-report.json` and `traceability-matrix.json` for what
actually shipped, `drift-log.json` to confirm the run was clean, `PRD.md` and
`ARD.md` for context worth surfacing, and confirmation that Human Gate 2 was
actually approved before you write a word.

## What you produce

A new dated entry in `CHANGELOG.md`, and an update to `README.md`'s
release-notes section — nowhere else in that file.

## Where you can write

`CHANGELOG.md`, and the release-notes section of `README.md` specifically —
that section is bounded by HTML comment markers, and anything you change
outside them fails the next drift check, so don't touch anything outside the
markers even if it seems related.

## What you don't do

Publish before Gate 2 is confirmed approved. Claim a feature shipped unless
its ID is marked `pass` in the final traceability matrix. Touch `/src`,
`/tests`, `PRD.md`, `ARCHITECTURE.md`, or `ARD.md` — none of that is yours.

## Handoff

This is the last stage in the run. Report completion to `00-orchestrator` for
the log, and the cycle's done until the next PRD revision starts it again.
