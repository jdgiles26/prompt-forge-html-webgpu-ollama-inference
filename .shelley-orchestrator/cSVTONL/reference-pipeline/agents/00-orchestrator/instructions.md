# instructions.md — 00-orchestrator

## The one rule this file exists to enforce

**Before invoking any agent, record a turn-start checkpoint for it. Without
this step, the drift-monitor's ownership check has no "before" state to
compare against and will correctly refuse to vouch for anything — see
`agents/_lib/drift-core.js`'s module comment for exactly why this exists.**

```
node scripts/turn-start.js <agentId>
```

This applies to the very first agent too (`01-requirements`) — there is no
special case for "the start of the pipeline."

## Sequence

1. On first run: receive the user's product ask.
   `node scripts/turn-start.js 01-requirements`, then invoke `01-requirements`
   with the ask as its only context.
2. When an agent hands back control (via its `handoff.json`):
   a. Read the `handoff.json`.
   b. Look up the current stage's config in `pipeline.config.json`.
   c. **Content check**: verify `producesArtifact` exists on disk and passes
      the stage's `gateCheck` (e.g. `03-spec-test`'s red-report actually shows
      every test failing; `05-qa-verification`'s green-report shows 100% id
      coverage). This is a check on WHAT the agent produced.
   d. **Process check**: run
      `node agents/06-drift-monitor/drift.js <agentId> <transitionLabel>`.
      This is the ONE call that covers file-ownership (via the turn-start
      checkpoint from step 1/2g), test-file integrity, governance-file
      integrity, and requirement-id integrity — don't reimplement any piece of
      this manually here; 06-drift-monitor owns all of it. This is a check on
      HOW the agent produced it.
   e. If either (c) or (d) fails: write a rejection entry to
      `ORCHESTRATION.md`'s run-log with the specific reason, and return
      control to the SAME agent. Do not advance. Do not record a turn-start
      checkpoint for a next agent yet — there isn't one until this turn is
      actually clean.
   f. If both pass: check `humanGateAfter` / `humanGateBefore` for this stage
      in `pipeline.config.json`. If a human gate applies here, halt and
      request explicit approval before continuing — do not invoke the next
      agent yet, and do not record its turn-start checkpoint yet either
      (recording it before approval would start that agent's "before" window
      too early, before the gate's own review activity — if any — has
      happened).
   g. Once clear to proceed: `node scripts/turn-start.js <nextAgentId>`, THEN
      invoke that agent with the accumulated context bundle.
3. Append every decision (advance / reject / halt-for-gate) to
   `ORCHESTRATION.md`'s run-log with an ISO timestamp.
4. If the same rejection reason repeats twice in a row for one agent, stop and
   write to `ESCALATION.md` instead of retrying a third time.
