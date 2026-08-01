# PRD.md — Product Requirements Document

> Filled and owned by `01-requirements`. Frozen after Human Gate 1. Every ID
> defined here is load-bearing — the test suite and traceability matrix are
> generated directly from this file's IDs.

## 1. Problem statement
What problem are we solving, for whom, and why now.

## 2. Goals / Non-goals
- **Goals:** ...
- **Non-goals (explicitly out of scope):** ...

## 3. Users / personas
Who uses this and in what context.

## 4. Features & acceptance criteria

Each feature gets a stable ID, numbered sequentially starting at `FEAT-001`
for your first real feature. The block below uses the non-numeric placeholder
`FEAT-EXAMPLE` on purpose: every drift script in `agents/*/drift.js` extracts
real requirement IDs by matching a feature prefix followed by digits, so any
genuinely-numbered ID left sitting in template prose would be misread as an
actual requirement the moment this file starts getting filled in. Delete the
whole example block below and replace it with your real, sequentially
numbered entries.

```
### FEAT-EXAMPLE: <feature name>
**Description:** ...
**Acceptance criteria (Given/When/Then):**
- Given <state>, when <action>, then <expected result>.
- Given <state>, when <action>, then <expected result>.
**Priority:** must-have | should-have | nice-to-have
```

## 5. UI inventory (every screen, button, and interactive element)

Every clickable/tappable/interactive thing gets its own ID. This table is the
direct input to the e2e/UI test suite in `03-spec-test`.

Number sequentially starting at `UI-001` for your first real element.
(`UI-EXAMPLE` below is a non-numeric placeholder for the same regex-collision
reason noted in §4 — replace it with your real, numbered entries.)

| ID | Screen | Element | Expected behavior |
|---|---|---|---|
| UI-EXAMPLE | Login | "Sign in" button | Submits form, shows loading state, redirects on success, shows inline error on failure |

## 6. Workflow steps (multi-step processes)

Number sequentially starting at `STEP-001` for your first real step.
(`STEP-EXAMPLE` below is a non-numeric placeholder — replace it.)

| ID | Step | Preconditions | Expected outcome |
|---|---|---|---|
| STEP-EXAMPLE | ... | ... | ... |

## 7. Success metrics
How we'll know this worked, quantitatively where possible.

## 8. Risks & open questions
Anything ambiguous goes here first — if still unresolved, escalate per
`GUARDRAILS.md` §6 rather than letting downstream agents guess.

## 9. Sign-off (Human Gate 1)
- [ ] Approved by: _______  Date: _______
