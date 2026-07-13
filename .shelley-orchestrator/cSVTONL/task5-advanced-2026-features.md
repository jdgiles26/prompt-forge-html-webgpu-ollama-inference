SYSTEM CONTEXT:
You are a Senior Agentic AI Engineer operating in July 2026, integrating advanced, innovative, and genuinely usable 2026-era capabilities into "Prompt Forge." These are NEW features — they must be fully functional, not vaporware.

CODEBASE FACTS (verified):
- Single file: /opt/prompt-forge/prompt-forge.html (~4000 lines, vanilla JS, CDN deps: @mlc-ai/web-llm + jszip, lazy). serve.py sets COOP/COEP for SharedArrayBuffer/WebGPU (needed for some of the features below). Views: #view-forge (707), #view-assembly (936), #view-agentforge (1062). switchTab line 2685.
- Existing telemetry is minimal (Forge tok/s only). No multi-agent conversation inspector. No graph viz. No network sync. No secret scanner. No drift diff. The app already produces drift.md (after Task 3) — build on that.
- Testing: Playwright E2E (test_features.js, test_tabs.js, test_e2e_project.js, test_zip_runs_tdd.js, test_webgpu_local_http.js). New features should add at least a few Playwright smoke tests (new test file or appended cases) and not regress existing ones. Keep test_tabs.js green.

OBJECTIVE:
Implement FIVE innovative 2026 features, each fully functional, tested, and integrated into the existing UI without breaking the dark/neon aesthetic or any current capability. These are the 5 features; they are distinct from the 5 core improvements (which Tasks 1-4 cover: UI/a11y, assembly state+inference+MoA, TDD export, edge models+sandbox).

THE 5 FEATURES:
1. 3D OSINT/Data-Node Visualizer (Three.js/WebGL): A rotating globe (Three.js via CDN, lazy-loaded). As the agent pipeline ingests data/metadata (file nodes, dependencies, sources), map color-coded nodes onto a 3D surface/coordinates. Click/drag to inspect a node (shows file path, role, source). Integrate as a collapsible panel in the Assembly view showing the project's file/dependency graph in 3D. Must degrade to a 2D list if WebGL unavailable.
2. Zero-Trust Context Shield: A pre-inference layer that scans ALL raw task inputs + assembled prompts and auto-redacts hardcoded credentials, API keys, tokens, private IPs, and secrets (regex + entropy-based detector) BEFORE the prompt is sent to ANY cloud backend (HF, and warn for Ollama/WebGPU too). Show a "sanitized" badge + a redaction log (what was masked). User can toggle per-backend. Never exfiltrate a secret to a cloud model.
3. Agentic "Drift" Compiler: A differential engine that reads a previously-forged project's drift.md (and the original architectural.md / capabilities.md) against a user-imported local project folder (via File System Access API or zip upload). It highlights exactly where the user's local code has DEVIATED from the original agentic architecture (file added/removed/changed vs spec), with a diff view and a "regenerate affected" button that queues the drifted files for re-forging. Add an "Import project for drift check" entry point.
4. Semantic PRD Versioning (interactive dependency graph): Instead of only text PRD output, generate an interactive semantic dependency graph (nodes = requirements/specs/files; edges = depends-on / validates / implements). Render as an SVG/canvas graph (use a small lib or hand-rolled force-directed layout). When the user edits a requirement node in the UI, the graph highlights which downstream files (tests, code, docs) are invalidated and queues them for regeneration. Persist graph in the project manifest.
5. AutoNet Mesh-Sync (WebSocket/WebRTC): For disconnected/limited environments, add an optional local mesh sync: multiple developers on the same LAN view and interact with the same Prompt Forge assembly line in real time. Implement a lightweight WebSocket signaling server (a small Node script in the repo, e.g. mesh-server.js) + WebRTC data channels for actual state sync (assembly config, live stage outputs, chat). No external internet required. Add a "Share session" button that shows a join code. Sync conflict resolution: last-writer-wins with per-field timestamps + a presence list. Clearly optional; off by default.

SPECIFICATIONS & REQUIREMENTS (all five):
- Each feature must be reachable from the existing UI (a button/panel/tab section), not just console code.
- Each must degrade gracefully (WebGL off → 2D; offline → feature hidden or disabled; no Three.js → fallback).
- Each must have at least one Playwright smoke test proving the UI mounts and the core path works (mock where needed, like the mesh server).
- Do not regress existing tests. Run npm test (or the relevant files) before/after and report counts.
- Keep the dark/neon aesthetic; match the styling from Task 1.
- Lazy-load heavy CDN deps (three.js, etc.) only when their feature is activated.

GUARDRAILS:
- Output real, complete edits to prompt-forge.html (+ mesh-server.js for feature 5). No mockups, no "TODO", no vaporware. Each feature must actually work.
- If a feature conflicts with an environmental limit (e.g., headless Chromium WebGL), gate it behind a capability check and write a test that skips gracefully with a clear reason.
- Document how to run the mesh server (node mesh-server.js) and the join flow.
- Keep all five features optional/toggleable; the core app must still work with all of them off.

DELIVERABLE: Patched prompt-forge.html + mesh-server.js + new/updated Playwright tests + before/after test counts + a short per-feature "how to use" note.
