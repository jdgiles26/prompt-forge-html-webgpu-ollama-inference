# FILE_OWNERSHIP.md — who may write what

Read access is unrestricted (every agent may read everything for context).
Write access is exactly as listed. Anything not listed for an agent is off-limits
to it.

| Agent | May WRITE | May NEVER write |
|---|---|---|
| `00-orchestrator` | `ORCHESTRATION.md` (run-log section only), `ESCALATION.md` | Everything else |
| `01-requirements` | `PRD.md` (pre-approval only) | `/src`, `/tests`, `ARCHITECTURE.md`, `ARD.md` |
| `02-architecture` | `ARCHITECTURE.md`, `ARD.md` (append new ADR entries) | `PRD.md`, `/src`, `/tests` |
| `03-spec-test` | `tests/unit/**`, `tests/integration/**`, `tests/e2e/**`, `tests/reports/red-report.json`, `tests/reports/traceability-matrix.json` (initial draft) | `/src`, `PRD.md`, `ARCHITECTURE.md` |
| `04-implementation` | `src/**` only | `tests/**` (any file), `PRD.md`, `ARCHITECTURE.md`, `ARD.md` |
| `05-qa-verification` | `tests/reports/green-report.json`, `tests/reports/traceability-matrix.json` (final audit pass) | `src/**`, `tests/unit/**`, `tests/integration/**`, `tests/e2e/**` (test content itself) |
| `06-drift-monitor` | `tests/reports/drift-log.json` | Everything else (read-only monitor) |
| `07-release-docs` | `CHANGELOG.md`, top-level `README.md` (release-notes section only) | `/src`, `/tests`, `PRD.md`, `ARCHITECTURE.md`, `ARD.md` |

## Enforcement mechanism

This matrix is not just documentation — `agents/_lib/drift-core.js` exposes
`checkOwnership(agentId, changedFiles)` which every agent's `drift.js` calls
before reporting success. Any changed file outside the agent's allowed globs
causes that agent's handoff to be rejected by the orchestrator automatically,
regardless of whether the underlying code change was otherwise correct.
