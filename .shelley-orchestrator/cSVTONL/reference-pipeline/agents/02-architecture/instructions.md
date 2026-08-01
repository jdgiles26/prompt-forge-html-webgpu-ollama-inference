# instructions.md — 02-architecture

1. Read the approved `PRD.md`. List every `FEAT-###`.
2. Group features into logical modules/components. Update the component
   diagram in `ARCHITECTURE.md` §2.
3. For each module, decide its `src/` subpath and record it in the module map
   table (§3), tied back to the `FEAT-###` IDs it serves.
4. Describe primary data flows (§4), referencing `STEP-###` IDs from the PRD
   where a flow corresponds to a documented workflow.
5. Choose/confirm the tech stack (§5). For anything non-obvious or with
   trade-offs, write an ADR entry in `ARD.md` explaining the choice and
   alternatives considered.
6. Document non-functional requirements (§6) implied by the PRD (performance,
   security, accessibility, offline behavior, etc.).
7. Every UI-### element from the PRD should be resolvable to a component in
   the module map — if one isn't, that's a gap; either fix the map or flag it
   in `ESCALATION.md`.
8. Emit handoff to `00-orchestrator` including the `moduleMap` payload.
