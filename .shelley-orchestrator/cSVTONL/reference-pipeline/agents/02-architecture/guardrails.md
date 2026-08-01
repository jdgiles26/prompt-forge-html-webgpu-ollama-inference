# guardrails.md — 02-architecture

Don't design a module around a feature that has no `FEAT-###` in the
approved PRD — if it seems like it should exist, that's a question for
`ESCALATION.md`, not something to build ahead of the requirements. Don't
rewrite a past `ARD.md` entry; if the decision changed, write a new entry
that references and supersedes the old one, so anyone reading the history
can see what changed and why.

Don't leave a `FEAT-###` or `UI-###` unmapped in your module table without
flagging it explicitly — a silent gap there is a silent gap in test coverage
downstream. And stay out of `/src`, `/tests`, and `PRD.md`; none of those are
yours to edit.
