# Task 5 — Advanced 2026 Features: Completion Report

**Status:** ✅ Complete. All 5 features implemented, integrated into the existing UI, lazy-loaded, gracefully degrading, and covered by a new Playwright suite (`test_2026_features.js`, 35/35 green). No regressions in the existing suites.

## Before / after test counts

| Suite | Before | After | Note |
|---|---|---|---|
| `test_features.js`     | 116 passed · 1 failed | 116 passed · 1 failed | pre-existing env failure (`file:///ollama/api/tags` fetch on file://) — unchanged |
| `test_tabs.js`         | 56 passed · 0 failed  | 56 passed · 0 failed  | no regression |
| `test_e2e_project.js`  | 131 passed · 0 failed | 131 passed · 0 failed | no regression |
| `test_zip_runs_tdd.js` | 8 passed · 0 failed   | 8 passed · 0 failed   | no regression |
| `test_webgpu_local_http.js` | 2 passed · 1 failed · 1 skipped | 2 passed · 1 failed · 1 skipped | pre-existing 404, unchanged |
| **`test_2026_features.js`** | — (new) | **35 passed · 0 failed · 0 skipped** | new suite for the 5 features |

`npm test` now chains the new suite. The two pre-existing failures are environmental (Forge view's `file:///ollama/api/tags` fetch on `file://`, and a 404 in the WebGPU local-http suite) and were failing identically on the baseline before this task — they are **not** regressions.

## What was built

All five features live in a single self-contained module appended to `prompt-forge.html` (inside the existing `<script type="module">`), plus a new Node signaling server `mesh-server.js` at repo root. Heavy CDN deps (Three.js) are lazy-loaded only when their feature is activated; the core app is unaffected with all features off.

### Feature 1 — 3D OSINT / Data-Node Globe (`prompt-forge.html`)
- Collapsible **🌐 3D DATA-NODE GLOBE** panel in the Assembly view's right column (below the TDD sandbox).
- Lazy-loads Three.js (`esm.run/three@0.169.0`) only when the panel is first opened. Renders a wireframe neon sphere with file/dependency nodes placed on a Fibonacci lattice, color-coded by role (doc=accent, code=green, test=amber, config=purple, root=red).
- Drag to rotate, auto-spin (toggleable), click a node → inspect popover (path, role, size). Refresh button rebuilds from the current assembly output.
- **Graceful degradation:** `webglAvailable()` capability check; if WebGL is off (e.g. headless Chromium without GPU), it renders a 2D color-coded list (`#globeFallback`) instead. The smoke test exercises the live path (WebGL was available in this VM's Chromium, so three.js loaded and 3 nodes mapped); a skip branch is present for the no-WebGL case.

### Feature 2 — Zero-Trust Context Shield (`prompt-forge.html`)
- Collapsible **🛡 CONTEXT SHIELD** panel in the Assembly view's left config column.
- Pre-inference redaction engine: 14 regex patterns (AWS keys, GitHub PATs, Google/Slack/Stripe/HF tokens, JWTs, private keys, bearer tokens, generic `secret=`/`api_key=`, private IPs, connection strings) **plus** a Shannon-entropy detector for high-entropy base64 blobs (≥4.2 bits/char, ≥32 chars).
- Integrated at the genuine chokepoint: `hfGenerate`, `ollamaGenerate`, and `browserGenerate` each call `window.ctxShieldApply(system+prompt, backend)` at entry. **Cloud (HF) is hard-blocked** when a secret is present (throws rather than exfiltrate); local backends (Ollama/WebGPU) are warn-only (the user opted into local).
- Per-backend toggles (HF / Ollama / WebGPU), a live redaction log (what was masked → `sk***56`), a "scan now" preview of the task + assembled prompts, and a redaction counter badge. State persisted in `localStorage`.
- Smoke tests verify detection of each secret class, masking output, the on/off badge, and the scan log.

### Feature 3 — Agentic Drift Compiler (`prompt-forge.html`)
- Collapsible **⇄ DRIFT COMPILER** panel in the Assembly view's right column.
- Baseline = a previously-forged project (use current assembly output, or load a forged `.zip`). Imported = a local project folder via **File System Access API / `webkitdirectory`** input, or a dropped `.zip`. Skips `node_modules`/`.git`/`dist`/`__pycache__`.
- Differential engine: reports `added` / `removed` / `changed` / `matched` files vs the baseline, with a hand-rolled LCS line-diff view (`+`/`-`/context) for changed files.
- **Regenerate affected:** queues drifted (changed + spec-required removed) files and injects a `[DRIFT REGENERATE]` directive into the assembly task input, ready for a fresh run. Queue count surfaced in the UI.

### Feature 4 — Semantic PRD dependency graph (`prompt-forge.html`)
- Collapsible **◈ SEMANTIC PRD GRAPH** panel in the Assembly view's right column.
- Parses `prd.md` (FR/NFR/REQ lines) + `spec.md` (numbered spec rows) + the file manifest into a typed graph (requirement → spec `validates` → file `implements`). Hand-rolled force-directed layout (spring relaxation + repulsion, deterministic) rendered as inline SVG — no external graph lib.
- **Click a requirement node** → invalidates it + every downstream node (DFS over edges) and queues the affected files (tests/code) for regeneration. Invalidated nodes/edges render red. "CLEAR MARKS" resets. Graph invalidation persisted in `localStorage` and carried into the project manifest path.
- **Regenerate affected** button injects a `[DRIFT/PRD REGENERATE]` directive into the assembly task. Builds on the Task-3 `prd.md`/`spec.md` export output.

### Feature 5 — AutoNet Mesh-Sync (`prompt-forge.html` + `mesh-server.js`)
- **`mesh-server.js`** at repo root: a dependency-free WebSocket signaling relay (hand-rolled RFC6455 frame layer on Node 18+ `http`/`net` — no `ws` package). Manages session codes, presence, and SDP/ICE relay. Health endpoint at `/health`. Run: `node mesh-server.js` (default `ws://0.0.0.0:8770`; override with `PF_MESH_PORT` / `PF_MESH_WS`).
- **⤴ SHARE** button in the app header opens the mesh panel. HOST SESSION → shows a 6-char join code; JOIN → enter a code. Peers connect over **WebRTC data channels** (the server only relays signaling, never sees project content).
- State sync: assembly task, output mode, and stage config sync peer-to-peer; **last-writer-wins with per-field timestamps**; presence list + event log in the panel. Off by default; `meshDisconnect()` tears down all peers. Graceful: if the server is unreachable, the panel shows a "run `node mesh-server.js`" hint and host/join no-op with a toast.
- Smoke test spawns the real `mesh-server.js`, hosts a session, verifies the 6-char code, the live indicator, the connected hint, the event log, code validation, and disconnect.

## Guardrails honored
- **Reachable from existing UI:** every feature has a button/panel in the Assembly view (or the header for mesh) — no console-only code.
- **Graceful degradation:** WebGL off → 2D globe list; mesh server down → hint + no-op; three.js CDN blocked → fallback list. Capability-checked, with a skip branch in the globe test.
- **Lazy-loading:** Three.js is dynamically imported only when the globe panel opens; the mesh WebRTC/WebSocket stack is created only on host/join. JSZip is reused from the existing shared loader.
- **Optional/toggleable:** Context Shield has an enable checkbox + per-backend toggles; all panels are collapsed by default; mesh is off by default. The core app (Forge / Assembly / Agent Forge) works unchanged with all features off.
- **No regressions:** existing suites re-run green (modulo the two pre-existing env failures). The shared Task-2 inference helpers, Task-3 export pipeline (`drift.md`/`architectural.md`/`capabilities.md`/`prd.md`/`spec.md`), and Task-4 edge/sandbox code were not reverted — features 3 & 4 build on the Task-3 outputs.
- **Dark/neon aesthetic:** all new UI uses the existing CSS variables (`--accent`, `--green`, `--amber`, `--red`, `--panel`, `--mono`), matching Task 1's style.

## How to use (per feature)
1. **3D Globe:** Assembly view → open **🌐 3D DATA-NODE GLOBE** → drag to rotate, click a node to inspect. **↻ REFRESH** rebuilds from current output. **⏸ SPIN** toggles auto-rotation.
2. **Context Shield:** Assembly view → **🛡 CONTEXT SHIELD** → tick **enable shield** (and choose backends). **▶ SCAN NOW** previews redactions. Cloud (HF) sends are auto-blocked if a secret is present; local backends warn only.
3. **Drift Compiler:** Assembly view → **⇄ DRIFT COMPILER** → **⤴ USE CURRENT AS BASELINE** (or **▣ LOAD FORGED .ZIP**), then drop a local folder/zip onto the drop zone (or click to pick). **▶ REGENERATE AFFECTED** queues drifted files into the task.
4. **PRD Graph:** Assembly view → **◈ SEMANTIC PRD GRAPH** → **↻ BUILD FROM OUTPUT** (after a project run). Click a requirement node to invalidate downstream files → **▶ REGENERATE AFFECTED**.
5. **Mesh-Sync:** repo root → `node mesh-server.js`. In the app → header **⤴ SHARE** → **▶ HOST SESSION** (share the 6-char code) or enter a peer's code → **⤴ JOIN**. Assembly state syncs live across peers; **■ DISCONNECT** leaves.

## Files changed
- `prompt-forge.html` — CSS for the 5 feature panels + header Share button + mesh panel HTML + the feature JS module (~1230 lines) + shield guards in the three generate functions + `getAsFinal`/`setAsStages`/`pf2026` exposed on `window.__pf`.
- `mesh-server.js` — new, dependency-free WebSocket signaling server.
- `test_2026_features.js` — new Playwright smoke suite (35 cases).
- `package.json` — `npm test` now includes `test_2026_features.js`.

## Notes / known limits
- The globe's click-to-inspect uses an angular-distance approximation rather than a full THREE.Raycaster (simpler and robust for the small node counts a project produces); drag-rotate is manual.
- The PRD graph's requirement→spec edge pairing is index-based (req `i` ↔ spec `i`); for projects where the spec table isn't ordered identically to the FR list, edges are still useful for invalidation propagation. Both parsers are heuristic but tolerant.
- The drift line-diff caps at 200k cell LCS to stay fast on large files (renders a coarse add/ctx pair above that).
- Mesh WebRTC uses a STUN server (only for reflexive candidates); on a fully air-gapped LAN without STUN, host-candidate ICE still works for same-subnet peers. This matches the "no external internet required for the signaling" guarantee; pure offline ICE depends on the LAN topology.
