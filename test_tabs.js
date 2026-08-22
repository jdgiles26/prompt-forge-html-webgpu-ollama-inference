// Headless-browser tests for the two new PROMPT FORGE tabs:
//   - ASSEMBLY LINE (multi-model project pipeline)
//   - AGENT FORGE  (guided agent-package generator)
//
// Loads the real page over http://localhost:8765 via serve.py. Ollama calls
// are mocked at the network layer so tests are deterministic and fast.

const { chromium } = require('playwright');
const { spawn } = require('child_process');

const PORT = 8765;
const URL  = `http://127.0.0.1:${PORT}/prompt-forge.html`;
const ROOT = __dirname;

let passed = 0, failed = 0;
const failures = [];
function rec(name, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + name); }
  else    { failed++; failures.push({ name, detail }); console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

const hasClass = (sel, cls) => page.locator(sel).evaluate((el, c) => el.classList.contains(c), cls);
const isDisabled = (sel) => page.locator(sel).evaluate(el => el.disabled);

// Fake Ollama: deterministic model list + a tiny streamed FILE payload.
// requests tagged REPAIR_TEST_MARKER (see the auto-repair-retry test below)
// loop on the FIRST /api/generate call and stream cleanly from the second
// call onward, to drive the real auto-repair path end to end through the
// real UI/run loop rather than reimplementing it. REPAIR_EXHAUST_MARKER
// loops on EVERY call, to drive the "retries exhausted, give up" fallback.
let repairTestCallCount = 0;
let repairExhaustCallCount = 0;
// The repetition-loop guard is throttled to once per 250ms of real
// wall-clock time (see asAppendChunk) — a mocked HTTP response has no real
// network latency, so splitting a trigger payload into many small chunks
// the way the other branches do risks the whole thing landing inside a
// single throttle window and never actually getting checked (a real timing
// race, not a test artifact). Both loop payloads below are sent as ONE
// ndjson line — one onChunk call — so whichever throttle window it lands
// in sees the complete repetitive text.
const LOOP_PAYLOAD = 'x'.repeat(60) + '\nfoo\nfoo\nfoo\nfoo\nfoo\nfoo\nfoo\nfoo\nfoo\nfoo\n';
function loopResponseBody() {
  return [JSON.stringify({ response: LOOP_PAYLOAD, done: false }), JSON.stringify({ response: '', done: true })].join('\n');
}
function fakeResponse(url, method, postData) {
  if (/\/api\/tags$/.test(url)) {
    return { status: 200, contentType: 'application/json',
      body: JSON.stringify({ models: [{ name: 'mock-tiny:1b' }, { name: 'mock-mid:7b' }] }) };
  }
  if (/\/api\/generate$/.test(url) && method === 'POST') {
    let prompt = '';
    try { prompt = (JSON.parse(postData || '{}').prompt) || ''; } catch {}
    if (/REPAIR_EXHAUST_MARKER/.test(prompt)) {
      repairExhaustCallCount++;
      return { status: 200, contentType: 'application/json', body: loopResponseBody() };
    }
    const isRepairTest = /REPAIR_TEST_MARKER/.test(prompt);
    if (isRepairTest && repairTestCallCount === 0) {
      repairTestCallCount++;
      return { status: 200, contentType: 'application/json', body: loopResponseBody() };
    }
    let payload;
    if (isRepairTest) {
      repairTestCallCount++;
      payload = `=== FILE: repaired.py ===\ndef ok(): return "recovered after retry"\n=== END FILE ===\n`;
    } else {
      payload = `=== FILE: main.py ===\ndef hello(): return "hi"\n=== END FILE ===\n`;
    }
    const chunks = [];
    for (let i = 0; i < payload.length; i += 20)
      chunks.push(JSON.stringify({ response: payload.slice(i, i+20), done: false }));
    chunks.push(JSON.stringify({ response: '', done: true }));
    return { status: 200, contentType: 'application/json', body: chunks.join('\n') };
  }
  return null;
}

let page;
(async () => {
  const cleanup = () => { try { server.kill('SIGKILL'); } catch {} };
  process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); });
  const server = spawn('python3', ['serve.py'], { cwd: ROOT, env: { ...process.env, PF_PORT: String(PORT) } });
  server.stderr.on('data', () => {}); server.stdout.on('data', () => {});
  await new Promise(r => setTimeout(r, 1500));

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  for (const pat of ['**/ollama/api/**', '**/api/tags', '**/api/generate']) {
    await ctx.route(pat, async route => {
      const postData = route.request().postData();
      // The repetition-loop guard is throttled to one check per 250ms of
      // REAL wall-clock time. A mocked HTTP response has no network latency,
      // so back-to-back retry attempts (this route firing again within
      // milliseconds) can land inside the same throttle window and never
      // actually get checked — a real timing race, not a test artifact.
      // Simulate a little network latency for the auto-repair test
      // scenarios specifically so consecutive attempts are reliably spaced
      // more than 250ms apart, same as they would be against a real model.
      if (postData && /REPAIR_(TEST|EXHAUST)_MARKER/.test(postData)) await new Promise(r => setTimeout(r, 320));
      const r = fakeResponse(route.request().url(), route.request().method(), postData);
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

  // ── TAB BAR ─────────────────────────────────────────────────────────────
  console.log('\n── TABS: tab bar & view switching ──');
  rec('three tabs present', await page.locator('#tabbar .tab').count() === 3);
  rec('forge visible by default', !(await hasClass('#view-forge', 'hidden')));
  rec('assembly hidden by default', await hasClass('#view-assembly', 'hidden'));
  rec('agentforge hidden by default', await hasClass('#view-agentforge', 'hidden'));

  await page.click('#tabbar .tab[data-view="assembly"]');
  rec('assembly visible after click', !(await hasClass('#view-assembly', 'hidden')));
  rec('forge hidden after switch', await hasClass('#view-forge', 'hidden'));
  rec('assembly tab active', await hasClass('#tabbar .tab[data-view="assembly"]', 'active'));

  await page.click('#tabbar .tab[data-view="agentforge"]');
  rec('agentforge visible after click', !(await hasClass('#view-agentforge', 'hidden')));
  rec('assembly hidden after switch', await hasClass('#view-assembly', 'hidden'));

  await page.click('#tabbar .tab[data-view="forge"]');
  rec('forge visible again', !(await hasClass('#view-forge', 'hidden')));

  // ── ASSEMBLY LINE: config ───────────────────────────────────────────────
  console.log('\n── ASSEMBLY LINE: config ──');
  await page.click('#tabbar .tab[data-view="assembly"]');
  await page.waitForTimeout(300);

  rec('default 6 stages', await page.locator('#asLineList .role-stage').count() === 6);
  const roles = await page.locator('#asLineList .stage-role').evaluateAll(els => els.map(e => e.firstChild.textContent.trim()));
  rec('stage 1 = Planner',        roles[0] === 'Planner');
  rec('stage 2 = Plan Reviewer',  roles[1] === 'Plan Reviewer');
  rec('stage 3 = Task Architect', roles[2] === 'Task Architect');
  rec('stage 4 = Executor',       roles[3] === 'Executor');
  rec('stage 5 = Code Reviewer',  roles[4] === 'Code Reviewer');
  rec('stage 6 = Final Reviewer', roles[5] === 'Final Reviewer');

  rec('mocked Ollama models discovered', (await page.textContent('#asOllamaCount')) === '2');
  const chips = await page.locator('#asBrowserPool .model-chip').count();
  rec('browser model pool populated', chips >= 12, 'chips=' + chips);

  await page.evaluate(() => asTogglePool('ollama:mock-tiny:1b'));
  rec('pool count after select', (await page.textContent('#asPoolCount')) === '1 model selected');
  const opts = await page.locator('#asLineList select').first().evaluateAll(els => Array.from(els[0].options).map(o => o.value));
  rec('stage dropdown lists selected model', opts.includes('ollama:mock-tiny:1b'));

  // The mock pool is a single 1b (light-tier) model; the heavy-tier
  // guardrail would refuse to auto-assign heavy roles to it. Enable the
  // documented override (the test is exercising the run pipeline with a
  // mock, not the guardrail itself).
  await page.evaluate(() => asSetHeavyOverride(true));
  await page.evaluate(() => asAutoAssign());
  const assigned = await page.locator('#asLineList select').evaluateAll(els => els.map(e => e.value));
  rec('auto-assign fills all 6 stages', assigned.every(v => v === 'ollama:mock-tiny:1b'));

  await page.evaluate(() => asAddStage());
  rec('add stage → 7', await page.locator('#asLineList .role-stage').count() === 7);
  await page.evaluate(() => asDelStage(6));
  rec('delete stage → 6', await page.locator('#asLineList .role-stage').count() === 6);
  await page.evaluate(() => asResetStages());
  rec('reset → 6 stages', await page.locator('#asLineList .role-stage').count() === 6);

  // ── ASSEMBLY LINE: run ──────────────────────────────────────────────────
  console.log('\n── ASSEMBLY LINE: run (mocked) ──');
  await page.evaluate(() => {
    while (document.querySelectorAll('#asLineList .role-stage').length > 1) asDelStage(document.querySelectorAll('#asLineList .role-stage').length - 1);
    if (!document.getElementById('asOllamaPool').querySelector('.model-chip.selected')) asTogglePool('ollama:mock-tiny:1b');
    asSetHeavyOverride(true);   // override guardrail for the mock light-tier pool
    asAutoAssign();
    document.getElementById('asMaxTokens').value = 500; asUpdateParamsBadge();
    document.getElementById('asTaskInput').value = 'tiny test task';
    document.getElementById('asOutputMode').value = 'project';
  });
  await page.click('#asRunBtn');
  await page.waitForFunction(() => !document.getElementById('asRunBtn').disabled, null, { timeout: 8000 });
  rec('run produced a step block', await page.locator('#asStream .as-step').count() >= 1);
  rec('step marked done', await page.locator('#asStream .as-step.done').count() === 1);
  rec('zip enabled (FILE blocks parsed)', !(await isDisabled('#asZipBtn')));

  const asZip = await page.evaluate(async () => {
    const _r = URL.revokeObjectURL; URL.revokeObjectURL = () => {};
    let cap = null;
    const _c = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (this.download?.endsWith('.zip')) { cap = { name: this.download, url: this.href }; return; } return _c.call(this); };
    asDownloadZip();
    await new Promise(r => setTimeout(r, 800));
    URL.revokeObjectURL = _r; HTMLAnchorElement.prototype.click = _c;
    if (!cap) return null;
    const res = await fetch(cap.url); const buf = await res.arrayBuffer();
    await new Promise((res2, rej) => { const s = document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; s.onload=res2; s.onerror=rej; document.head.appendChild(s); });
    const zip = await window.JSZip.loadAsync(buf);
    return { name: cap.name, entries: Object.keys(zip.files), hasMain: !!zip.file('main.py'), hasMeta: !!zip.file('assembly-line.json') };
  });
  rec('assembly zip downloaded', asZip !== null);
  rec('assembly zip contains main.py', asZip && asZip.hasMain);
  rec('assembly zip contains assembly-line.json', asZip && asZip.hasMeta);

  // ── ASSEMBLY LINE: auto-repair retry on a repetition loop ────────────────
  // A stage that trips the repetition-loop guard used to hard-stop the
  // ENTIRE run immediately (asStopReq), discarding every prior stage's
  // work. It now retries just that one stage (bounded, tightened sampling)
  // before giving up. Drives this through the real run loop against a mock
  // that loops on attempt 1 and streams cleanly on attempt 2 — not a
  // reimplementation of the retry logic, the actual asRun() code path.
  console.log('\n── ASSEMBLY LINE: auto-repair retry (mocked repetition loop) ──');
  await page.evaluate(() => { window.__pf.pfClearCompromised(); window.__pf.resetAsRepLast(); });
  repairTestCallCount = 0; // reset the module-level mock counter for a clean run
  await page.evaluate(() => {
    document.getElementById('asTaskInput').value = 'REPAIR_TEST_MARKER tiny test task';
  });
  await page.click('#asRunBtn');
  await page.waitForFunction(() => !document.getElementById('asRunBtn').disabled, null, { timeout: 10000 });
  const repair = await page.evaluate(() => ({
    compromised: window.__pf.pfOutputCompromised(),
    final: window.__pf.getAsFinal(),
  }));
  rec('auto-repair: exactly 2 /api/generate calls (1 failed attempt + 1 retry, not a silent pass-through or infinite loop)', repairTestCallCount === 2, 'calls=' + repairTestCallCount);
  rec('auto-repair: run recovers — output NOT marked compromised', repair.compromised === false, JSON.stringify(repair));
  rec('auto-repair: final output is the retry\'s clean payload, not the looping garbage', /repaired\.py/.test(repair.final || '') && !/foo\nfoo\nfoo/.test(repair.final || ''), (repair.final || '').slice(0, 200));
  rec('zip export still enabled after a successful auto-repair', !(await isDisabled('#asZipBtn')));

  // Exhaustion path: a stage that loops on EVERY attempt must still give up
  // eventually (bounded retries, never an infinite loop) and fall back to
  // the original hard-stop — marked compromised, export blocked — rather
  // than silently shipping looping output or retrying forever.
  console.log('\n── ASSEMBLY LINE: auto-repair gives up after exhausting retries ──');
  const retryMax = await page.evaluate(() => window.__pf.AS_REPETITION_RETRY_MAX);
  await page.evaluate(() => { window.__pf.pfClearCompromised(); });
  repairExhaustCallCount = 0;
  await page.evaluate(() => {
    document.getElementById('asTaskInput').value = 'REPAIR_EXHAUST_MARKER tiny test task';
  });
  await page.click('#asRunBtn');
  await page.waitForFunction(() => !document.getElementById('asRunBtn').disabled, null, { timeout: 10000 });
  const exhausted = await page.evaluate(() => ({
    compromised: window.__pf.pfOutputCompromised(),
    reason: window.__pf.pfCompromiseReason(),
  }));
  rec('auto-repair exhaustion: exactly 1 + max-retries calls, then stops (bounded, not infinite)', repairExhaustCallCount === 1 + retryMax, 'calls=' + repairExhaustCallCount + ' expected=' + (1 + retryMax));
  rec('auto-repair exhaustion: output marked compromised after giving up', exhausted.compromised === true, JSON.stringify(exhausted));
  rec('auto-repair exhaustion: zip export blocked', await isDisabled('#asZipBtn'));
  await page.evaluate(() => { window.__pf.pfClearCompromised(); });

  // ── AGENT FORGE: interview ──────────────────────────────────────────────
  console.log('\n── AGENT FORGE: interview ──');
  await page.click('#tabbar .tab[data-view="agentforge"]');
  await page.waitForTimeout(300);

  rec('14 questions rendered', await page.locator('#afWizard .q-card').count() === 14);
  rec('readiness 0/7 at start', (await page.textContent('#afReadinessMeta'))?.includes('0 / 7'));
  rec('generate disabled at start', await isDisabled('#afGenerateBtn'));

  const trBefore = await page.locator('#af-q-team_roles').evaluate(el => getComputedStyle(el).display);
  await page.evaluate(() => afPick('team', 'team'));
  const trAfter = await page.locator('#af-q-team_roles').evaluate(el => getComputedStyle(el).display);
  rec('team_roles hidden before team=team', trBefore === 'none');
  rec('team_roles visible after team=team', trAfter !== 'none');

  await page.evaluate(() => afPick('power', 'api_key'));
  rec('api_provider visible after power=api_key', (await page.locator('#af-q-api_provider').evaluate(el => getComputedStyle(el).display)) !== 'none');
  rec('ollama_models still hidden', (await page.locator('#af-q-ollama_models').evaluate(el => getComputedStyle(el).display)) === 'none');

  await page.evaluate(() => afLoadSample());
  await page.waitForTimeout(100);
  rec('sample answers → 7/7', (await page.textContent('#afReadinessMeta'))?.includes('7 / 7'));
  rec('generate disabled with answers but no model', await isDisabled('#afGenerateBtn'));
  await page.evaluate(() => afTogglePool('ollama:mock-tiny:1b'));
  rec('generate enabled after selecting model', !(await isDisabled('#afGenerateBtn')));

  // ── AGENT FORGE: generate + zip ─────────────────────────────────────────
  console.log('\n── AGENT FORGE: generate + zip ──');
  await page.evaluate(() => window.__pf.setAfFinal(
`=== FILE: README.md ===
# Agent
=== END FILE ===
=== FILE: agent.py ===
print("hi")
=== END FILE ===
=== FILE: install.sh ===
#!/usr/bin/env bash
echo install
=== END FILE ===
=== FILE: install-all.sh ===
#!/usr/bin/env bash
bash install.sh
=== END FILE ===
=== FILE: tests/test_agent.py ===
def test(): assert True
=== END FILE ===`
  ));
  rec('file view visible after setAfFinal', await hasClass('#afFileView', 'visible'));
  rec('5 files parsed into tree', await page.locator('#afFileTree .af-ft-item').count() === 5);
  rec('zip enabled after generation', !(await isDisabled('#afZipBtn')));

  await page.evaluate(() => afSelectFile(1));
  const fc = await page.textContent('#afFileContent');
  rec('file content viewer renders agent.py', fc.includes('print'));

  const afZip = await page.evaluate(async () => {
    const _r = URL.revokeObjectURL; URL.revokeObjectURL = () => {};
    let cap = null;
    const _c = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() { if (this.download?.endsWith('.zip')) { cap = { name: this.download, url: this.href }; return; } return _c.call(this); };
    afDownloadZip();
    await new Promise(r => setTimeout(r, 800));
    URL.revokeObjectURL = _r; HTMLAnchorElement.prototype.click = _c;
    if (!cap) return null;
    const res = await fetch(cap.url); const buf = await res.arrayBuffer();
    const zip = await window.JSZip.loadAsync(buf);
    const perms = {};
    for (const n of Object.keys(zip.files)) { const f = zip.files[n]; if (!f.dir) perms[n] = f.unixPermissions ? '0'+(f.unixPermissions & 0o777).toString(8) : 'none'; }
    return { name: cap.name, entries: Object.keys(zip.files), perms };
  });
  rec('agent zip has install.sh', afZip && afZip.entries.includes('install.sh'));
  rec('agent zip has install-all.sh', afZip && afZip.entries.includes('install-all.sh'));
  rec('agent zip has README.md', afZip && afZip.entries.includes('README.md'));
  rec('agent zip has agent-forge-spec.json', afZip && afZip.entries.includes('agent-forge-spec.json'));
  rec('install.sh is executable (0755)', afZip && afZip.perms['install.sh'] === '0755', 'perms=' + (afZip && afZip.perms['install.sh']));
  rec('install-all.sh is executable (0755)', afZip && afZip.perms['install-all.sh'] === '0755', 'perms=' + (afZip && afZip.perms['install-all.sh']));

  await page.evaluate(() => afReset());
  rec('reset clears readiness', (await page.textContent('#afReadinessMeta'))?.includes('0 / 7'));

  // ── FORGE VIEW UNTOUCHED ────────────────────────────────────────────────
  console.log('\n── FORGE: existing view still intact ──');
  await page.click('#tabbar .tab[data-view="forge"]');
  rec('forge forgeBtn present', await page.locator('#forgeBtn').count() === 1);
  rec('forge modeSingle active', await page.locator('#modeSingle.active').count() === 1);
  rec('forge ollama model select present', await page.locator('#ollamaModel').count() === 1);

  const realErrs = errs.filter(s => !/404|Failed to load resource|ERR_FAILED|CORS|localhost:11434|file:|Access to fetch/i.test(s));
  rec('no unexpected JS errors', realErrs.length === 0, realErrs.join(' | '));

  await browser.close();
  server.kill();

  console.log('\n══════════════════════════════════════');
  console.log(`TABS: ${passed} passed · ${failed} failed`);
  if (failed) { console.log('\nFAILURES:'); failures.forEach(f => console.log(' ✗ ' + f.name + (f.detail ? ' → ' + f.detail : ''))); }
  process.exit(failed ? 1 : 0);
})();
