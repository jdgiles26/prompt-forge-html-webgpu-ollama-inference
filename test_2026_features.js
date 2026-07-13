// ─────────────────────────────────────────────────────────────────────────────
// Playwright smoke tests for the 5 Task-5 "2026 advanced features":
//   1) 3D OSINT / Data-Node Globe (Three.js, lazy, WebGL→2D fallback)
//   2) Zero-Trust Context Shield (pre-inference secret redaction)
//   3) Agentic Drift Compiler (baseline vs imported local project)
//   4) Semantic PRD dependency graph (SVG force layout, invalidation)
//   5) AutoNet Mesh-Sync (WebSocket signaling + WebRTC join code)
//
// Loads the real page over http://localhost:8765 via serve.py. Ollama calls
// are mocked. The mesh signaling server (mesh-server.js) is spawned for the
// mesh test; the globe test gracefully skips when headless Chromium lacks
// WebGL. Mirrors the harness style of test_tabs.js.
// ─────────────────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');
const { spawn } = require('child_process');

const PORT = 8765;
const URL  = `http://127.0.0.1:${PORT}/prompt-forge.html`;
const ROOT = __dirname;
const MESH_PORT = 8770;

let passed = 0, failed = 0, skipped = 0;
const failures = [];
function rec(name, ok, detail) {
  if (ok === 'skip') { skipped++; console.log('  ○ ' + name + (detail ? '  (skipped: ' + detail + ')' : '')); return; }
  if (ok) { passed++; console.log('  ✓ ' + name); }
  else    { failed++; failures.push({ name, detail }); console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}
const hasClass = (sel, cls) => page.locator(sel).evaluate((el, c) => el.classList.contains(c), cls);

function fakeResponse(url, method) {
  if (/\/api\/tags$/.test(url)) {
    return { status: 200, contentType: 'application/json',
      body: JSON.stringify({ models: [{ name: 'mock-tiny:1b' }] }) };
  }
  if (/\/api\/generate$/.test(url) && method === 'POST') {
    const payload = `=== FILE: main.py ===\ndef hello(): return "hi"\n=== END FILE ===\n`;
    const chunks = [];
    for (let i = 0; i < payload.length; i += 20)
      chunks.push(JSON.stringify({ response: payload.slice(i, i+20), done: false }));
    chunks.push(JSON.stringify({ response: '', done: true }));
    return { status: 200, contentType: 'application/json', body: chunks.join('\n') };
  }
  return null;
}

let page, browser, ctx;
let server, meshServer;
const procs = [];
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch {} } }

(async () => {
  process.on('exit', killAll); process.on('SIGINT', () => { killAll(); process.exit(130); });

  server = spawn('python3', ['serve.py'], { cwd: ROOT, env: { ...process.env, PF_PORT: String(PORT) } });
  procs.push(server);
  server.stderr.on('data', () => {}); server.stdout.on('data', () => {});
  await new Promise(r => setTimeout(r, 1500));

  browser = await chromium.launch();
  ctx = await browser.newContext();
  for (const pat of ['**/ollama/api/**', '**/api/tags', '**/api/generate']) {
    await ctx.route(pat, async route => {
      const r = fakeResponse(route.request().url(), route.request().method());
      if (r) return route.fulfill({ status: r.status, contentType: r.contentType, body: r.body });
      return route.continue();
    });
  }
  page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  for (let attempt = 0; attempt < 5; attempt++) { try { await page.goto(URL, { waitUntil: 'domcontentloaded' }); break; } catch (e) { if (attempt === 4) throw e; await new Promise(r => setTimeout(r, 600)); } }
  await page.waitForTimeout(400);

  // ── FEATURE 2: CONTEXT SHIELD ────────────────────────────────────────────
  console.log('\n── F2: Zero-Trust Context Shield ──');
  await page.click('#tabbar .tab[data-view="assembly"]');
  await page.waitForTimeout(200);
  rec('shield panel present', await page.locator('#ctxShieldPanel').count() === 1);
  rec('shield off by default', (await page.textContent('#ctxShieldBadge')) === 'off');

  const scan = await page.evaluate(() => {
    document.getElementById('asTaskInput').value = 'use key AKIAIOSFODNN7EXAMPLE and db 10.0.0.5 and token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
    ctxShieldScanNow();
    return { count: document.getElementById('ctxShieldCount').textContent, log: document.getElementById('ctxShieldLog').textContent };
  });
  rec('shield scan detects secrets', /redacted/.test(scan.count) && parseInt(scan.count) >= 3, 'count=' + scan.count);
  rec('shield log lists redactions', /AWS Access Key|Private IP|GitHub PAT/.test(scan.log), scan.log.slice(0,120));

  // enable shield → badge updates + hook active
  await page.evaluate(() => {
    document.getElementById('ctxShieldHF').checked = true;
    document.getElementById('ctxShieldHF').dispatchEvent(new Event('change'));
    document.getElementById('ctxShieldEnable').checked = true;
    document.getElementById('ctxShieldEnable').dispatchEvent(new Event('change'));
  });
  rec('shield badge shows on · HF', (await page.textContent('#ctxShieldBadge')).includes('on'));

  // the scan engine detects each secret class
  const classes = await page.evaluate(() => {
    const t = 'AKIAIOSFODNN7EXAMPLE ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789 sk_test_' + 'abc123def456ghi789jkl012 xoxb-1234567890123-abcdefghij jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c 10.0.0.5';
    const r = window.__pf2026.ctxShieldScan(t);
    return r.redactions.map(x => x.label);
  });
  rec('detects AWS/GitHub/Stripe/Slack/JWT/IP', classes.length >= 5, 'got: ' + classes.join(','));
  rec('masked output contains ***', await page.evaluate(() => window.__pf2026.ctxShieldScan('sk_test_' + 'abcdefghijklmnop').clean.includes('***')));

  // ── FEATURE 4: SEMANTIC PRD GRAPH ─────────────────────────────────────────
  console.log('\n── F4: Semantic PRD dependency graph ──');
  rec('prd panel present', await page.locator('#prdPanel').count() === 1);
  await page.evaluate(() => window.__pf.setAsFinal(
`=== FILE: prd.md ===
FR1: ingest CSV uploads
FR2: validate rows against schema
NFR1: respond under 200ms
=== END FILE ===
=== FILE: spec.md ===
| 1 | ingest | csv file | 200 ok |
| 2 | validate | bad row | 400 error |
=== END FILE ===
=== FILE: src/after/main.py ===
def main(): pass
=== END FILE ===
=== FILE: tests/test_main.py ===
def test(): assert True
=== END FILE ===`));
  await page.evaluate(() => { pfTogglePanel('prdPanel'); prdBuildFromOutput(); });
  await page.waitForTimeout(250);
  const prdSvg = await page.locator('#prdGraphSvg .prd-node').count();
  const prdEdges = await page.locator('#prdGraphSvg .prd-edge').count();
  rec('prd graph renders nodes', prdSvg >= 4, 'nodes=' + prdSvg);
  rec('prd graph renders edges', prdEdges >= 2, 'edges=' + prdEdges);
  rec('prd badge shows node count', (await page.textContent('#prdBadge')).includes('nodes'));

  // click a requirement → invalidates downstream + queues files
  const inv = await page.evaluate(() => {
    const n = document.querySelector('#prdGraphSvg .prd-node[data-id^="FR"]');
    if (!n) return null;
    n.dispatchEvent(new Event('click'));
    return { invalid: document.getElementById('prdInvalidBadge').textContent, queued: window.prdQueuedFiles().length };
  });
  rec('invalidating a req marks downstream', inv && parseInt(inv.invalid) >= 2, 'invalid=' + (inv && inv.invalid));
  rec('invalidated files queued for regen', inv && inv.queued >= 1, 'queued=' + (inv && inv.queued));
  rec('prd queue row visible', await page.locator('#prdQueueRow').evaluate(el => getComputedStyle(el).display) !== 'none');

  // ── FEATURE 3: AGENTIC DRIFT COMPILER ─────────────────────────────────────
  console.log('\n── F3: Agentic Drift Compiler ──');
  rec('drift panel present', await page.locator('#driftPanel').count() === 1);
  const drift = await page.evaluate(() => {
    window.__pf2026.driftSetBaseline([
      { path: 'src/after/main.py', body: 'def main(): pass' },
      { path: 'tests/test_main.py', body: 'def test(): assert True' },
      { path: 'README.md', body: '# proj' },
    ]);
    window.__pf2026.driftSetImported([
      { path: 'src/after/main.py', body: 'def main(): return 1' },     // changed
      { path: 'src/extra.py', body: 'x = 1' },                          // added
      // tests/test_main.py removed
    ]);
    driftRun();
    return {
      entries: document.querySelectorAll('#driftReport .drift-entry').length,
      changed: document.querySelectorAll('#driftReport .drift-tag.changed').length,
      added:   document.querySelectorAll('#driftReport .drift-tag.added').length,
      removed: document.querySelectorAll('#driftReport .drift-tag.removed').length,
      queue:   document.getElementById('driftQueueBadge').textContent,
    };
  });
  rec('drift detects changed file', drift.changed >= 1, 'changed=' + drift.changed);
  rec('drift detects added file', drift.added >= 1, 'added=' + drift.added);
  rec('drift detects removed file', drift.removed >= 1, 'removed=' + drift.removed);
  rec('drift queue populated', /queue: [1-9]/.test(drift.queue), drift.queue);
  // diff view contains + / - lines
  rec('drift diff view renders', await page.locator('#driftReport .drift-diff').count() >= 1);

  // ── FEATURE 1: 3D GLOBE ───────────────────────────────────────────────────
  console.log('\n── F1: 3D Data-Node Globe ──');
  rec('globe panel present', await page.locator('#globePanel').count() === 1);
  const globe = await page.evaluate(async () => {
    pfTogglePanel('globePanel');
    await new Promise(r => setTimeout(r, 1200)); // allow three.js lazy load
    const webgl = window.globeWebGL();
    window.globeSetNodes([
      { path: 'src/main.py', role: 'code', body: 'x' },
      { path: 'README.md', role: 'doc', body: 'y' },
      { path: 'tests/t.py', role: 'test', body: 'z' },
    ]);
    return {
      webgl,
      fallback: window.globeIsFallback(),
      badge: document.getElementById('globeBadge').textContent,
      legend: document.getElementById('globeLegend').innerHTML.length > 0,
    };
  });
  if (!globe.webgl) {
    rec('globe degrades to 2D list (no WebGL)', 'skip', 'headless Chromium has no WebGL');
    rec('globe fallback shows nodes', await page.locator('#globeFallback.visible').count() === 1);
  } else {
    rec('globe: WebGL available + three.js loaded', !globe.fallback, 'fallback=' + globe.fallback);
    rec('globe: 3 nodes mapped', /3 node/.test(globe.badge), globe.badge);
    rec('globe: legend rendered', globe.legend);
  }

  // ── FEATURE 5: AUTONET MESH-SYNC ──────────────────────────────────────────
  console.log('\n── F5: AutoNet Mesh-Sync ──');
  // spawn the signaling server
  meshServer = spawn('node', ['mesh-server.js'], { cwd: ROOT, env: { ...process.env, PF_MESH_PORT: String(MESH_PORT) } });
  procs.push(meshServer);
  meshServer.stderr.on('data', () => {}); meshServer.stdout.on('data', () => {});
  await new Promise(r => setTimeout(r, 900));
  // point the app at the local server
  await page.evaluate(() => window.meshSetWsUrl('ws://127.0.0.1:8770'));
  rec('mesh share button present', await page.locator('#meshShareBtn').count() === 1);
  const mesh = await page.evaluate(async () => {
    meshTogglePanel();
    await new Promise(r => setTimeout(r, 150));
    await meshHost();
    await new Promise(r => setTimeout(r, 700));
    return {
      code: document.getElementById('meshCode').textContent,
      live: document.getElementById('meshShareBtn').classList.contains('live'),
      hint: document.getElementById('meshServerHint').textContent,
      log:  document.getElementById('meshLog').textContent,
    };
  });
  rec('mesh host produces 6-char code', mesh.code.length === 6, 'code=' + mesh.code);
  rec('mesh connected to signaling server', /Connected/.test(mesh.hint), mesh.hint);
  rec('mesh live indicator on', mesh.live);
  rec('mesh event log shows host', /hosting session/.test(mesh.log), mesh.log.slice(0,100));
  // code validation
  rec('mesh code validator accepts valid', await page.evaluate(() => meshIsValidCode('ABC123')));
  rec('mesh code validator rejects invalid', await page.evaluate(() => !meshIsValidCode('xyz')));
  // disconnect
  await page.evaluate(() => meshDisconnect());
  await page.waitForTimeout(200);
  rec('mesh disconnect clears code', (await page.textContent('#meshCode')) === '—');

  // ── REGRESSION: existing tabs + no unexpected errors ───────────────────────
  console.log('\n── REGRESSION ──');
  const realErrs = errs.filter(s => !/404|Failed to load resource|ERR_FAILED|CORS|localhost:11434|file:|Access to fetch|ollama\/api\/tags/i.test(s));
  rec('no unexpected JS errors', realErrs.length === 0, realErrs.join(' | '));
  await page.click('#tabbar .tab[data-view="forge"]');
  rec('forge view still intact', !(await hasClass('#view-forge', 'hidden')));
  await page.click('#tabbar .tab[data-view="agentforge"]');
  rec('agentforge view still intact', !(await hasClass('#view-agentforge', 'hidden')));

  await browser.close();
  killAll();

  console.log('\n══════════════════════════════════════');
  console.log(`F2026: ${passed} passed · ${failed} failed · ${skipped} skipped`);
  if (failed) { console.log('\nFAILURES:'); failures.forEach(f => console.log(' ✗ ' + f.name + (f.detail ? ' → ' + f.detail : ''))); }
  process.exit(failed ? 1 : 0);
})();
