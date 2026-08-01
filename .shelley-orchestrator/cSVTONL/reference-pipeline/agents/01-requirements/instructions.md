# instructions.md — 01-requirements

1. Read the raw user request in full. Do not summarize away specifics — every
   named feature, screen, or interaction becomes a candidate ID.
2. Draft Section 1–3 of `PRD.md` (problem, goals/non-goals, users) in plain
   language.
3. Enumerate every distinct feature implied by the request. Assign sequential
   `FEAT-###` IDs. For each, write Given/When/Then acceptance criteria — write
   at least the happy path and one failure/edge path.
4. Enumerate every screen and every interactive element (buttons, inputs,
   toggles, links, menu items) implied by the request or by the features above.
   Assign sequential `UI-###` IDs. State expected behavior per relevant state
   (default/loading/success/error/disabled).
5. Enumerate any multi-step workflow (e.g., checkout, onboarding, a wizard).
   Assign `STEP-###` IDs in execution order with preconditions and outcomes.
6. Fill Section 7 (success metrics) and Section 8 (risks/open questions) —
   anything you had to assume goes here explicitly, labeled "Assumption:".
7. Do not write acceptance criteria you cannot justify from the request or a
   stated assumption — no speculative scope.
8. Leave Section 9 sign-off blank. This is filled by a human, not by you.
9. Emit the handoff to `00-orchestrator` per the schema in `agent.md`.
10. If the request is safety-relevant, contradictory, or leaves a
    scope-defining question unanswered (not just a minor default), stop and
    write to `ESCALATION.md` instead of guessing.
