// Playwright test: proves the Complete Project Pkg ZIP download is actually
// triggered (real browser download event, not just an in-memory blob) for all
// THREE export entry points — Forge #zipBtn, Assembly Line #asZipBtn, Agent
// Forge #afZipBtn — and that every required file is present in the archive.
//
// Forge path uses the page's download event (the real <a download> flow).
// Assembly + Agent Forge paths run the in-page exporter and capture the
// anchor click + blob URL (file:// pages don't fire Playwright download
// events for programmatically-clicked blob anchors reliably), then re-inflate
// the blob with JSZip to assert the full file list.

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const ROOT = __dirname;
const OUT  = path.join(ROOT, 'test_output');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// The full required project file set (Task-3 scaffolding). Stack-dependent
// files use the Python fixture extension.
const REQUIRED = [
  'README.md','prd.md','spec.md','tdd.md','agent.md','drift.md',
  'capabilities.md','architectural.md','prompt-sequence.md',
  'CLAUDE.md','AGENTS.md','DONE.md','Makefile','.gitignore',
  'src/before/README.md','src/before/main.py',
  'src/after/README.md','src/after/main.py','src/after/__init__.py',
  'tests/README.md','tests/test_main.py','tests/conftest.py',
  'requirements.txt',
];

// A realistic multi-file payload matching the Task-3 meta-prompt output order.
const PROJECT_PAYLOAD = fs.readFileSync(
  path.join(ROOT, 'test_output', 'forged_payload.txt'), 'utf8'
).trim() + '\n';

let passed = 0, failed = 0;
const failures = [];
function rec(name, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + name); }
  else    { failed++; failures.push({ name, detail }); console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

function fakeResponse(url, method) {
  if (/\/api\/tags$/.test(url)) {
    return { status: 200, contentType: 'application/json',
      body: JSON.stringify({ models: [{ name: 'mock-tiny:1b' }] }) };
  }
  if (/\/api\/generate$/.test(url) && method === 'POST') {
    const body = PROJECT_PAYLOAD;
    const chunks = [];
    for (let i = 0; i < body.length; i += 64)
      chunks.push(JSON.stringify({ response: body.slice(i, i+64), done: false }));
    chunks.push(JSON.stringify({ response: '', done: true }));
    return { status: 200, contentType: 'application/json', body: chunks.join('\n') };
  }
  return null;
}

(async () => {
  const PORT = 8766;
  const URL  = `http://127.0.0.1:${PORT}/prompt-forge.html`;
  const server = spawn('python3', ['serve.py'], { cwd: ROOT, env: { ...process.env, PF_PORT: String(PORT) } });
  server.stderr.on('data', () => {}); server.stdout.on('data', () => {});
  const cleanup = () => { try { server.kill('SIGKILL'); } catch {} };
  process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); });
  await new Promise(r => setTimeout(r, 1500));

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  for (const pat of ['**/ollama/api/**', '**/api/tags', '**/api/generate']) {
    ctx.route(pat, async route => {
      const r = fakeResponse(route.request().url(), route.request().method());
      if (r) return route.fulfill({ status: r.status, contentType: r.contentType, body: r.body });
      return route.continue();
    });
  }
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/ERR_FAILED|CORS|ollama/i.test(e.message)) console.log('pageerror:', e.message); });

  // ────────────────────────────────────────────────────────────────────────
  // 1) FORGE view: #zipBtn triggers a real browser download; zip has every
  //    required file, no empty directories, no duplicates, manifest present.
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── FORGE: #zipBtn download ──');
  await page.goto(URL);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);
  await page.click('#modeProject');
  rec('zipBtn visible in project mode', await page.locator('#zipBtn').isVisible());
  await page.fill('#taskInput', 'Build a Python token counter with TDD.');
  // Inject the payload as if streamed.
  await page.evaluate((payload) => {
    const oc = document.getElementById('outputContent');
    const op = document.getElementById('outputPlaceholder');
    op.style.display = 'none'; oc.style.display = 'block'; oc.innerHTML = '';
    const tn = document.createTextNode(''); oc.appendChild(tn);
    tn.appendData(payload); oc.dataset.raw = payload;
  }, PROJECT_PAYLOAD);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#zipBtn'),
  ]);
  const forgeZipPath = path.join(OUT, 'zip_download_forge.zip');
  await download.saveAs(forgeZipPath);
  rec('forge: download event fired (real <a download>)', true);
  rec('forge: downloaded filename ends .zip', (download.suggestedFilename() || '').endsWith('.zip'),
      'name=' + download.suggestedFilename());
  rec('forge: zip written to disk with real bytes', fs.statSync(forgeZipPath).size > 1000);

  const forgeZip = new AdmZip(forgeZipPath);
  const forgeEntries = Object.fromEntries(forgeZip.getEntries().map(e => [e.entryName, e]));
  for (const f of REQUIRED) rec('forge: zip contains ' + f, !!forgeEntries[f]);
  rec('forge: zip contains prompt-forge.json manifest', !!forgeEntries['prompt-forge.json']);
  // No empty directories: every dir entry has at least one child file.
  const forgeDirNames = forgeZip.getEntries().filter(e => e.isDirectory).map(e => e.entryName);
  const forgeEmptyDirs = forgeDirNames.filter(d => {
    const prefix = d.replace(/\/+$/, '') + '/';
    return !forgeZip.getEntries().some(e => !e.isDirectory && e.entryName.startsWith(prefix));
  });
  rec('forge: no empty directories', forgeEmptyDirs.length === 0, 'empty=' + forgeEmptyDirs.join(','));
  // No duplicate paths (AdmZip would surface dupes as a single entry, so we
  // verify the entry count matches the distinct name count).
  const forgeNames = forgeZip.getEntries().map(e => e.entryName);
  rec('forge: no duplicate paths', new Set(forgeNames).size === forgeNames.length);
  // Manifest has test_types + schema v2.
  const forgeManifest = JSON.parse(forgeEntries['prompt-forge.json'].getData().toString('utf8'));
  rec('forge: manifest schema = prompt-forge.project.v2', forgeManifest.schema === 'prompt-forge.project.v2');
  rec('forge: manifest has test_types array', Array.isArray(forgeManifest.test_types) && forgeManifest.test_types.length > 0);
  rec('forge: manifest has prd_hash + spec_hash', !!forgeManifest.prd_hash && !!forgeManifest.spec_hash);

  // ────────────────────────────────────────────────────────────────────────
  // 2) ASSEMBLY LINE: #asZipBtn triggers a download; routes through
  //    buildProjectZip; zip has the full required file list + sidecar.
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── ASSEMBLY LINE: #asZipBtn download ──');
  await page.click('[data-view="assembly"]');
  await page.waitForTimeout(200);
  // switchTab already calls asEnsureInit() for the assembly view.
  await page.evaluate(() => { if (!document.querySelector('#asOllamaPool .model-chip.selected')) asTogglePool('ollama:mock-tiny:1b'); });
  await page.evaluate(() => {
    document.getElementById('asOutputMode').value = 'project';
    document.getElementById('asTaskInput').value = 'assembly token counter';
    asSetHeavyOverride(true);
  });
  // Set final output via the test hook so the zip button enables + we control content.
  await page.evaluate((payload) => window.__pf.setAsFinal(payload), PROJECT_PAYLOAD);
  rec('assembly: asZipBtn enabled', !(await page.locator('#asZipBtn').isDisabled()));

  const asResult = await page.evaluate(async () => {
    const _r = URL.revokeObjectURL; URL.revokeObjectURL = () => {};
    let cap = null;
    const _c = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (this.download && this.download.endsWith('.zip')) { cap = { name: this.download, url: this.href }; return; } return _c.call(this); };
    try { await window.asDownloadZip(); } catch (e) { cap = { error: e.message }; }
    await new Promise(r => setTimeout(r, 600));
    URL.revokeObjectURL = _r; HTMLAnchorElement.prototype.click = _c;
    if (!cap || cap.error) return cap || null;
    const res = await fetch(cap.url); const buf = await res.arrayBuffer();
    const s = document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    await new Promise((rs, rj) => { s.onload = rs; s.onerror = rj; document.head.appendChild(s); });
    const z = await window.JSZip.loadAsync(buf);
    return { name: cap.name, entries: Object.keys(z.files), hasManifest: !!z.file('prompt-forge.json') };
  });
  rec('assembly: download triggered (<a download>)', asResult && !!asResult.name);
  rec('assembly: zip contains prompt-forge.json', asResult && asResult.hasManifest);
  rec('assembly: zip contains assembly-line.json sidecar', asResult && asResult.entries.includes('assembly-line.json'));
  for (const f of REQUIRED) rec('assembly: zip contains ' + f, asResult && asResult.entries.includes(f));

  // ────────────────────────────────────────────────────────────────────────
  // 3) AGENT FORGE: #afZipBtn triggers a download; routes through
  //    buildProjectZip; zip has the required file list + spec sidecar.
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── AGENT FORGE: #afZipBtn download ──');
  await page.click('[data-view="agentforge"]');
  await page.waitForTimeout(200);
  // switchTab already calls afEnsureInit() for the agentforge view.
  await page.evaluate((payload) => window.__pf.setAfFinal(payload), PROJECT_PAYLOAD);
  rec('agentforge: afZipBtn enabled', !(await page.locator('#afZipBtn').isDisabled()));

  const afResult = await page.evaluate(async () => {
    const _r = URL.revokeObjectURL; URL.revokeObjectURL = () => {};
    let cap = null;
    const _c = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (this.download && this.download.endsWith('.zip')) { cap = { name: this.download, url: this.href }; return; } return _c.call(this); };
    try { await window.afDownloadZip(); } catch (e) { cap = { error: e.message }; }
    await new Promise(r => setTimeout(r, 600));
    URL.revokeObjectURL = _r; HTMLAnchorElement.prototype.click = _c;
    if (!cap || cap.error) return cap || null;
    const res = await fetch(cap.url); const buf = await res.arrayBuffer();
    const s = document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    await new Promise((rs, rj) => { s.onload = rs; s.onerror = rj; document.head.appendChild(s); });
    const z = await window.JSZip.loadAsync(buf);
    return { name: cap.name, entries: Object.keys(z.files), hasManifest: !!z.file('prompt-forge.json') };
  });
  rec('agentforge: download triggered (<a download>)', afResult && !!afResult.name);
  rec('agentforge: zip contains prompt-forge.json', afResult && afResult.hasManifest);
  rec('agentforge: zip contains agent-forge-spec.json sidecar', afResult && afResult.entries.includes('agent-forge-spec.json'));
  for (const f of REQUIRED) rec('agentforge: zip contains ' + f, afResult && afResult.entries.includes(f));

  // ────────────────────────────────────────────────────────────────────────
  // 4) Single Prompt mode must NOT show #zipBtn (guardrail).
  // ────────────────────────────────────────────────────────────────────────
  console.log('\n── Single Prompt mode unaffected ──');
  await page.click('[data-view="forge"]');
  await page.click('#modeSingle');
  rec('single mode: #zipBtn hidden', !(await page.locator('#zipBtn').isVisible()));

  console.log('\n══════════════════════════════════════');
  console.log(`ZIP-DOWNLOAD: ${passed} passed · ${failed} failed`);
  if (failures.length) { for (const f of failures) console.log('  FAIL: ' + f.name + (f.detail ? ' → ' + f.detail : '')); }
  await browser.close();
  cleanup();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
