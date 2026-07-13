# Hallucination / Output-Corruption Guard Hardening — Completion Report

**Scope:** Verification + strengthening pass on `prompt-forge.html` (now 8169 lines) against LLM hallucinations and output-corruption loops, layered on top of Task 2 (sampling params, dynamic penalty scaling, repetition-loop detector) and Task 4 (Pyodide sandbox + auto-fix loop).

**Git commits (main):**
- `d075001` feat(guards): harden repetition detector, FILE-block integrity, MoA capability guardrail, compaction preservation, output-compromised state
- `5819edb` test(guards): add hallucination/output-corruption guard test suite (29 cases)

---

## Test counts (before → after)

| Suite | Before | After | Delta |
|---|---|---|---|
| `node test_tabs.js` | 56 passed · 0 failed | **56 passed · 0 failed** | 0 |
| `node test_features.js` | 116 passed · 1 failed | **116 passed · 1 failed** | 0 (pre-existing env `file:///ollama/api/tags`) |
| `node test_e2e_project.js` | 131 passed · 0 failed | **131 passed · 0 failed** | 0 |
| `node test_2026_features.js` | 35 passed · 0 failed · 0 skipped | **35 passed · 0 failed · 0 skipped** | 0 |
| `node test_hallucination_guards.js` | — (new) | **29 passed · 0 failed** | +29 (new suite) |

No regressions. The single `test_features.js` failure is the documented pre-existing environmental `file://` Ollama-probe error (unchanged). `test_tabs.js` was updated to enable the new heavy-tier override for its mock single-light-model pool (the test exercises the assembly run pipeline, not the guardrail) — this is the documented user-explicit-override escape hatch, not a weakening.

---

## 1. Repetition-loop detection — strengthened

`detectRepetitionLoop(text, opts)` at `prompt-forge.html:2774`. Three independent signals, any one trips the detector:

- **(a) LINE repeat** — last N non-empty lines byte-identical after whitespace normalization (the classic repeating-line failure mode). `lineMinRepeats = 3`.
- **(b) N-GRAM repeat** (NEW) — the most-recent 8-token n-gram appears ≥4 times anywhere in the trailing window (frequency count), **and** a contiguous-aligned streak check. Catches recycled phrases that vary per-line (e.g. the same import block re-emitted with changed headers) that the old line-only check missed.
- **(c) TOKEN STREAK breaker** (NEW) — ≥18 identical tokens in a row. Catches degenerate single-token spam (`            }            }            }`).

Thresholds centralized in `PF_GUARD_CFG.rep` (`prompt-forge.html:2711`) — tunable but safe defaults.

**Loop → FILE-block safety:** Wired into `appendOutput` (Forge, `:3115`) and `asAppendChunk` (Assembly, `:5804`). On a trip, if `scanFileBlocks` reports an open `=== FILE: ... ===` block (loop fired mid-file), the partial block is **truncated out** of the raw output and the generation is marked **COMPROMISED** (`pfMarkCompromised`, `:2874`) — a corrupt/half file never reaches `parseProjectFiles`/the zip builder. The detector still auto-stops (abort + toast) in all cases.

**Verified end-to-end** by `test_hallucination_guards.js` (line/n-gram/streak positives + normal-code/realistic-code/short negatives).

---

## 2. Dynamic penalty scaling — strengthened

`scaleParamsForCtxFill(p, usedTokens)` at `prompt-forge.html:2745`, curve driven by `PF_GUARD_CFG.scale` (`:2711`).

- **top_k floor (NEW):** clamped to ≥10 so scaling never collapses the model to greedy single-token decoding.
- **min_p (NEW):** forwarded and floored at 0.05 (was not previously scaled/forwarded).
- **Caps sane:** `repeat_penalty` cap 1.30, `presence`/`frequency` cap 0.50, `top_p` floor 0.50.
- **No-op below 70% fill** (unchanged).
- **Configurable but safe by default:** the entire curve (startFill, endFill, adds, caps, floors) lives in `PF_GUARD_CFG.scale`.

Verified by `test_hallucination_guards.js` (no-op below 70%, scales up, top_p floored, top_k floored, min_p floored, repeat_penalty capped).

---

## 3. Context compaction — strengthened

`asCompactContext(i, userTask)` at `prompt-forge.html:5856`; `asBuildPrompt(i, userTask)` at `:5688`.

- **Preserves FILE-block essentials (NEW):** the BODIES of PRD/spec/tdd/agent/drift/capabilities/architectural/prompt-sequence/README/CLAUDE/AGENTS/DONE `.md` files are kept verbatim in the compact payload under `keep_bodies` (regex `PF_COMPACT_KEEP_BODIES`, `:5939`) — never dropped. Other files keep just the path list. The immediately-prior stage's raw output is still passed through uncompacted (unchanged).
- **Token-budget hard cap (NEW):** `PF_COMPACT_TOKEN_CAP = 3500` approx tokens per handoff (`:5943`). Trimming drops tails first, then headings — essentials preserved last.
- **Valid-JSON check + raw fallback (NEW):** `asBuildPrompt` `JSON.parse`s the compacted payload before passing it onward; on failure it falls back to the legacy raw-concatenation format for that handoff (`:5688`).

Verified by the compaction test cases (body preservation, valid JSON, bounded payload, compacted-vs-raw prompt shape).

Compaction remains ON by default with the `⟡` badge on the progress track (unchanged).

---

## 4. FILE-block integrity — strengthened

`scanFileBlocks(text)` at `prompt-forge.html:2833` (NEW). Detects:
- **open/truncated** block (`=== FILE: ... ===` with no matching `=== END FILE ===`) → `openBlock` set.
- **duplicate** path.
- **orphan** `=== END FILE ===` (no open block).
- **nested** FILE header inside an open block.
- **empty** path.

Wired into:
- `downloadZip` (Forge, `:3744`) — refuses export on compromised/malformed, surfaces clear error + toast.
- `asDownloadZip` (Assembly, `:6349`) — same gate.
- `asRun` finalization (`:6284`) — drops a trailing open FILE block from `asFinalText` before anything consumes it; marks compromised on malformed.
- `buildProjectZip` (`:3648`) — adds empty-path + null-body (truncated) guards alongside the existing duplicate-path check (defense in depth before bytes reach JSZip).
- `appendOutput` / `asAppendChunk` — used by the repetition detector to decide mid-FILE-block truncation.

No half-written FILE block can reach the zip: the regex parser requires `=== END FILE ===` (so a truncated block is never emitted as a file), AND the scanner + truncation logic remove the partial header, AND the export gates refuse compromised/malformed payloads.

Verified by `test_hallucination_guards.js` (well-formed/open/duplicate/orphan/nested).

---

## 5. MoA guardrails — strengthened

`asCheckCapability()` at `prompt-forge.html:5239` (NEW); `HEAVY_ROLES` at `:5219`; override state `asHeavyTierOverride` persisted in localStorage (`:5223`).

- **Minimum-model-capability check (NEW):** if every model in the pool is `light` tier AND a heavy role (Planner / Plan Reviewer / Task Architect / Code Reviewer) is assigned a light model, the run is **refused** (`asValidateStages` returns the reason, `:5945`) unless the user explicitly enables the heavy-tier override.
- **asAutoAssign refuses** to auto-assign in the all-light + heavy-role case with a clear error (`:5536`).
- **Override UI:** a checkbox (`#asHeavyOverride`, `:1492`) toggles the guardrail; persisted across reloads; synced in `asEnsureInit` (`:5322`).
- **Per-stage ⚠ GUARDRAIL chip** rendered when a heavy role is on a light model (`:5482`).

Verified by `test_hallucination_guards.js` (refusal + override + HEAVY_ROLES membership).

---

## 6. Output validation before "done" — strengthened

`pfOutputCompromised` flag + `pfMarkCompromised`/`pfClearCompromised` at `:2872`.

- A generation is **never marked complete/done** if the repetition detector tripped, a FILE block is malformed/truncated, or (project mode) required project files are missing.
- **Forge view:** `setStatus('err', 'OUTPUT COMPROMISED')` + `showErr(...)` instead of `COMPLETE` (`:3331`).
- **Assembly:** surfaces `⚠ compromised · N files · review before export` (`:6320`); missing required files surface `incomplete · N files · missing M required` (warn, not hard-block — the user may intentionally ship a partial pkg); the zip export is hard-blocked only on real corruption (compromised/malformed), not on missing-required.
- **Validate panel** surfaces a `⚠ OUTPUT COMPROMISED` banner + a FILE-block integrity section at the top (`:3870`).

Verified by the compromised-state test cases.

---

## 7. Sandbox stderr feedback (Task 4) — strengthened

Auto-fix loop in `asRun` at `prompt-forge.html:6174`.

- **Hard cap (NEW):** `maxIter = Math.max(0, Math.min(userMax, 5))` (`:6197`) — guarantees termination even if the user-configured max is higher.
- **Stall detection (NEW):** if the same stderr signature repeats across iterations, the loop bails early (`:6202`) instead of burning tokens on a model that can't self-correct.
- **Loop count + final stderr surfaced (NEW):** on exhaustion, logs `Auto-fix loop exhausted after N iterations — tests still failing` + `Final stderr: ...` and toasts the count (`:6263`); on success, logs + toasts the iteration count (`:6268`).
- The package is never marked `done` while tests fail and the loop is exhausted (unchanged, now with clearer messaging).

stderr is still fed to the Code Reviewer as a literal `RUNTIME FEEDBACK` block (`sandboxFeedbackBlock` → `asBuildPrompt`, `:5688`).

---

## New default thresholds (centralized in `PF_GUARD_CFG`)

### Repetition detector (`PF_GUARD_CFG.rep`)
| Field | Default | Purpose |
|---|---|---|
| `window` | 1600 chars | trailing text inspected |
| `lineMinRepeats` | 3 | identical trailing lines → loop |
| `ngramN` | 8 | n-gram token window |
| `ngramMinRepeats` | 4 | n-gram frequency → loop |
| `tokenStreakMax` | 18 | identical-token streak → loop |
| `tokenSep` | `/[\s,;.:}\])\>\-]+/` | token splitter |

### Dynamic scaling (`PF_GUARD_CFG.scale`)
| Field | Default |
|---|---|
| `startFill` | 0.70 |
| `endFill` | 1.00 |
| `repeatAdd` / `repeatCap` | 0.20 / 1.30 |
| `presenceAdd` / `presenceCap` | 0.30 / 0.50 |
| `frequencyAdd` / `frequencyCap` | 0.30 / 0.50 |
| `topPDrop` / `topPFloor` | 0.15 / 0.50 |
| `topKFloor` | 10 (NEW) |
| `minPFloor` | 0.05 (NEW) |

### Compaction
| Field | Default |
|---|---|
| `PF_COMPACT_TOKEN_CAP` | 3500 approx tokens (NEW) |
| `PF_COMPACT_KEEP_BODIES` | PRD/spec/tdd/agent/drift/capabilities/architectural/prompt-sequence/README/CLAUDE/AGENTS/DONE `.md` (NEW) |

### MoA guardrail
| Field | Default |
|---|---|
| `HEAVY_ROLES` | `{plan, review_plan, taskout, codereview}` (NEW) |
| `asHeavyTierOverride` | `false` (persisted; user-toggleable) |

### Auto-fix loop
| Field | Default |
|---|---|
| User-configured max | 2 (Task 4, unchanged) |
| Hard cap | `min(userMax, 5)` (NEW) |
| Stall detection | identical stderr → bail early (NEW) |

---

## Key file:line references

| Guard | Location |
|---|---|
| `PF_GUARD_CFG` config | `prompt-forge.html:2711` |
| `scaleParamsForCtxFill` | `:2745` |
| `detectRepetitionLoop` (3-signal) | `:2774` |
| `scanFileBlocks` (integrity) | `:2833` |
| `pfMarkCompromised` / `pfClearCompromised` | `:2874` / `:2878` |
| `appendOutput` (Forge, loop+file guard) | `:3115` |
| Forge `forge()` compromised surfacing | `:3315`, `:3331` |
| `downloadZip` export gate | `:3744` |
| `validateOutput` compromised banner | `:3870` |
| `HEAVY_ROLES` / `asCheckCapability` | `:5219` / `:5239` |
| `asAutoAssign` guardrail | `:5536` |
| `asAppendChunk` (Assembly, loop+file guard) | `:5804` |
| `PF_COMPACT_KEEP_BODIES` / `PF_COMPACT_TOKEN_CAP` | `:5939` / `:5943` |
| `asCompactContext` (preserves bodies + cap) | `:5856` |
| `asBuildPrompt` (JSON validate + fallback) | `:5688` |
| Auto-fix hard cap + stall + surfacing | `:6197`, `:6202`, `:6263` |
| `asRun` finalization done-gate | `:6284` |
| `asDownloadZip` export gate | `:6349` |
| `buildProjectZip` integrity guards | `:3648` |
| Test/introspection surface `window.__pf` | `:8279` |

---

## Conclusion

All seven requested guard areas are verified-present and strengthened. The repeating-line / file-corruption failure mode is now caught by three independent detector signals; a loop firing mid-FILE-block is truncated and the output marked COMPROMISED so a corrupt file never ships; the dynamic scaling curve can't collapse the model to greedy decoding (top_k/min_p floors); compaction preserves downstream essentials under a token cap with JSON validation + raw fallback; the MoA guardrail refuses an all-light pool driving heavy roles unless explicitly overridden; "done" is never claimed on a compromised/malformed/missing-required output; and the sandbox auto-fix loop is hard-capped, stall-detected, and surfaces its iteration count + final stderr. 29 new guard tests pass; no existing test regressed.
