// Regression tests for two "it fails when Prompt Forge isn't hosted at
// 127.0.0.x" bugs reported after a real deployment attempt:
//
//   1. AutoNet Mesh-Sync defaulted its signaling-server URL to a hardcoded
//      ws://127.0.0.1:8770 — correct only when the page itself was opened
//      from localhost. Hosted anywhere else, "HOST SESSION" silently tried
//      to reach a signaling server on the VIEWER'S OWN machine instead of
//      wherever mesh-server.js actually runs, and there was no UI to
//      override it (only an undocumented localStorage key + a hint that
//      told users to "Set PF_MESH_WS", a variable nothing ever read).
//
//   2. FORGE PROMPT's Ollama backend, when Ollama is unreachable, discarded
//      the actual diagnostic (CORS/file:// explanation, or "is `ollama
//      serve` running?") and instead showed a bare "Select an Ollama model
//      first." — true, but useless: it gives no indication Ollama itself
//      is the problem, nor that switching to the Browser/Hugging Face
//      backend needs no local Ollama at all.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { chromium } = require('playwright');

let passed = 0, failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + name); }
  else    { failed++; failures.push({ name, detail }); console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

const html = fs.readFileSync(path.join(__dirname, 'prompt-forge.html'), 'utf8');
const FILE = 'file://' + path.resolve(__dirname, 'prompt-forge.html');

// ── Part 1: meshDefaultWs() — pure-logic extraction test, no browser needed ──
(function testMeshDefaultWs() {
  console.log('\n── Mesh signaling URL derives from the page\'s own host ──');
  const m = html.match(/function meshDefaultWs\(\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'meshDefaultWs() not found in prompt-forge.html');

  function withHostname(hostname) {
    const sandbox = { window: { location: { hostname } } };
    vm.createContext(sandbox);
    vm.runInContext(m[0] + '\nthis.__r = meshDefaultWs();', sandbox);
    return sandbox.__r;
  }

  record('remote IP host → ws:// on that same IP',
    withHostname('192.0.2.2') === 'ws://192.0.2.2:8770', withHostname('192.0.2.2'));
  record('remote domain host → ws:// on that same domain',
    withHostname('my-remote-box.example.com') === 'ws://my-remote-box.example.com:8770', withHostname('my-remote-box.example.com'));
  record('explicit "localhost" hostname is passed through as-is (not forced to 127.0.0.1)',
    withHostname('localhost') === 'ws://localhost:8770', withHostname('localhost'));
  record('IPv6 loopback hostname is passed through as-is',
    withHostname('[::1]') === 'ws://[::1]:8770', withHostname('[::1]'));
  record('no hostname (file://) → falls back to loopback',
    withHostname('') === 'ws://127.0.0.1:8770', withHostname(''));
  record('no hostname is the ONLY case that falls back — it is not a generic default that masks a real host',
    withHostname('0.0.0.0') === 'ws://0.0.0.0:8770', withHostname('0.0.0.0'));
})();

// ── Part 1b: meshHttpsWarning() — mesh-server.js has no TLS support, so an
// https:-hosted page trying a ws:// signaling connection is a real dead end
// (browsers block it as mixed content), not just a cosmetic mismatch. ──────
(function testMeshHttpsWarning() {
  console.log('\n── HTTPS-hosted page gets an explicit mesh mixed-content warning ──');
  const m = html.match(/function meshHttpsWarning\(\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'meshHttpsWarning() not found in prompt-forge.html');

  function withProtocol(protocol) {
    const sandbox = { window: { location: { protocol } } };
    vm.createContext(sandbox);
    vm.runInContext(m[0] + '\nthis.__r = meshHttpsWarning();', sandbox);
    return sandbox.__r;
  }

  const httpsResult = withProtocol('https:');
  record('https: page gets a non-null warning', typeof httpsResult === 'string' && httpsResult.length > 0, httpsResult);
  record('warning names the real cause (mesh-server.js has no TLS / mixed content)',
    /mesh-server\.js/.test(httpsResult) && /mixed content|TLS/i.test(httpsResult), httpsResult);
  record('warning gives an actionable next step (wss:// behind a TLS proxy, or drop to plain HTTP/LAN)',
    /wss:\/\//.test(httpsResult), httpsResult);
  record('http: page gets no warning', withProtocol('http:') === null, withProtocol('http:'));
  record('file: page gets no warning (only https: is a mixed-content dead end)',
    withProtocol('file:') === null, withProtocol('file:'));
})();

// ── Part 1c: ollamaUnreachableReason — the real fetchOllamaModels()
// diagnosis must survive into forge()/runOllama()'s "no model selected"
// guard instead of being discarded for a bare "select a model" message.
// Extracted straight out of prompt-forge.html and run against a mocked
// fetch (no real Ollama / network needed). ─────────────────────────────────
async function testOllamaUnreachableReason() {
  console.log('\n── ollamaUnreachableReason carries the real diagnosis out of fetchOllamaModels() ──');
  const m = html.match(/let ollamaUnreachableReason = null;\n\nwindow\.fetchOllamaModels = async function\(\) \{[\s\S]*?\n\};/);
  assert.ok(m, 'fetchOllamaModels() (with its ollamaUnreachableReason declaration) not found in prompt-forge.html');

  async function run(fetchImpl, protocol, base) {
    const elements = {
      ollamaUrl: { value: base },
      ollamaModel: { innerHTML: '' },
    };
    const calls = { setStatus: [], showErr: null, clearErr: 0 };
    const sandbox = {
      document: { getElementById: (id) => elements[id] },
      fetch: fetchImpl,
      AbortSignal: { timeout: () => undefined },
      setStatus: (...args) => calls.setStatus.push(args),
      showErr: (msg) => { calls.showErr = msg; },
      clearErr: () => { calls.clearErr++; },
      window: { location: { protocol } },
    };
    vm.createContext(sandbox);
    vm.runInContext(m[0] + `
this.__p = window.fetchOllamaModels().then(() => { this.__reason = ollamaUnreachableReason; });
`, sandbox);
    await sandbox.__p;
    return { reason: sandbox.__reason, innerHTML: elements.ollamaModel.innerHTML, calls };
  }

  const okModels = await run(
    async () => ({ ok: true, json: async () => ({ models: [{ name: 'llama3.2:3b' }] }) }),
    'http:', 'http://localhost:11434');
  record('Ollama reachable with models → ollamaUnreachableReason is cleared to null',
    okModels.reason === null, JSON.stringify(okModels));

  const okEmpty = await run(
    async () => ({ ok: true, json: async () => ({ models: [] }) }),
    'http:', 'http://localhost:11434');
  record('Ollama reachable but zero models pulled → a specific "no models pulled" reason, not the dead end',
    /reachable but has no models pulled/i.test(okEmpty.reason || ''), okEmpty.reason);
  record('the "no models pulled" reason tells the user the exact fix (ollama pull)',
    /ollama pull/i.test(okEmpty.reason || ''), okEmpty.reason);

  const httpFail = await run(
    async () => { throw new Error('fetch failed'); },
    'http:', 'http://unreachable-host.invalid:11434');
  record('Ollama unreachable over http: → reason names the configured base URL',
    typeof httpFail.reason === 'string' && httpFail.reason.includes('http://unreachable-host.invalid:11434'), httpFail.reason);
  record('Ollama unreachable over http: → reason suggests the Browser/Hugging Face fallback',
    /browser|hugging face/i.test(httpFail.reason || ''), httpFail.reason);

  const fileFail = await run(
    async () => { throw new Error('fetch failed'); },
    'file:', '/ollama');
  record('Ollama unreachable over file: → reason explains the Origin:null / CORS cause specifically',
    /file:\/\//.test(fileFail.reason || '') && /OLLAMA_ORIGINS/.test(fileFail.reason || ''), fileFail.reason);
}

// ── Part 1d: package.json / README.md stay wired together for the new
// test file — pure fs/JSON checks, no browser needed. ──────────────────────
(function testDocsAndScriptsWiring() {
  console.log('\n── package.json & README.md reference the new test file consistently ──');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');

  record('scripts.test runs test_hosting_portability.js as part of the full suite',
    /node test_hosting_portability\.js(\s|$)/.test(pkg.scripts.test), pkg.scripts.test);
  record('a dedicated scripts["test:hosting"] entry runs just this file',
    pkg.scripts['test:hosting'] === 'node test_hosting_portability.js', pkg.scripts['test:hosting']);

  // Every test:* script must point at a file that actually exists in the repo —
  // catches the exact class of drift this PR's own README/package.json edits
  // could have introduced (a script added to one but not the other).
  for (const [key, cmd] of Object.entries(pkg.scripts)) {
    if (!key.startsWith('test')) continue;
    const invocations = cmd.match(/node (test_[\w.]+\.js)/g) || [];
    for (const invocation of invocations) {
      const file = invocation.replace('node ', '');
      record(`scripts["${key}"] references an existing file (${file})`,
        fs.existsSync(path.join(__dirname, file)), file);
    }
  }

  record('README documents test_hosting_portability.js in the file-listing table',
    /`test_hosting_portability\.js`/.test(readme), 'not found in README.md');
  record('README documents "npm run test:hosting"',
    /npm run test:hosting/.test(readme), 'not found in README.md');
})();

// ── Part 2: live-browser checks ──────────────────────────────────────────────
(async () => {
  await testOllamaUnreachableReason();

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(FILE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400); // let init() + fetchOllamaModels() settle

  console.log('\n── Ollama-unreachable error is actionable, not a dead end ──');
  await page.fill('#taskInput', 'Build a small REST API for a todo list app.');
  await page.click('#forgeBtn');
  await page.waitForTimeout(500);
  const errText = await page.evaluate(() => document.getElementById('errMsg').textContent);
  record('error explains Ollama is unreachable (not the bare "select a model" dead end)',
    /cannot reach ollama/i.test(errText), errText);
  record('error points to a working alternative (Browser/Hugging Face backends need no local Ollama)',
    /browser|hugging face/i.test(errText), errText);
  record('the old dead-end message is gone as the ONLY signal (no diagnosis attached)',
    errText.trim() !== 'Select an Ollama model first.', errText);

  console.log('\n── Mesh panel: URL field is real, not just a hint ──');
  await page.evaluate(() => window.meshTogglePanel());
  const prefill = await page.inputValue('#meshWsInput');
  record('URL field is prefilled with the current effective signaling URL',
    prefill === 'ws://127.0.0.1:8770', prefill);

  await page.fill('#meshWsInput', 'ws://example-remote-host.test:8770');
  await page.click('button[onclick="meshApplyWsInput()"]');
  await page.waitForTimeout(200);
  const stored = await page.evaluate(() => { try { return localStorage.getItem('pf.mesh.ws'); } catch { return null; } });
  record('SET HOST persists the typed URL (pf.mesh.ws)',
    stored === 'ws://example-remote-host.test:8770', stored);
  const hint = await page.evaluate(() => document.getElementById('meshServerHint').textContent);
  record('hint reflects the newly-set host, not the stale loopback default',
    hint.includes('ws://example-remote-host.test:8770'), hint);
  record('hint no longer references the dead "PF_MESH_WS" env var',
    !/PF_MESH_WS/.test(hint), hint);

  console.log('\n── Mesh panel: signaling URL is escaped before reaching innerHTML ──');
  // meshServerHint() interpolates meshWsUrl() into innerHTML — that value can
  // be attacker/user-controlled: meshApplyWsInput() only requires it START
  // with ws:// or wss://, so "ws://x\"><img ...>" is a value a real user
  // could type into #meshWsInput and have SET HOST accept. A prior version
  // concatenated it into innerHTML raw; confirm it's HTML-escaped now, not
  // just "happens not to contain a quote in this one test input".
  await page.evaluate(() => { window.__meshXssFired = 0; });
  await page.fill('#meshWsInput', 'ws://x"><img src=x id="mesh-xss-proof" onerror="window.__meshXssFired=1">');
  await page.click('button[onclick="meshApplyWsInput()"]');
  await page.waitForTimeout(100);
  const injected = await page.evaluate(() => !!document.getElementById('mesh-xss-proof'));
  const fired = await page.evaluate(() => window.__meshXssFired);
  record('malicious signaling URL does not inject an element into the DOM',
    injected === false, 'injected=' + injected);
  record('malicious signaling URL\'s onerror never executes',
    fired === 0, 'fired=' + fired);
  const hintAfterInjection = await page.evaluate(() => document.getElementById('meshServerHint').textContent);
  record('the raw payload still appears as literal text (feature not silently dropped, just escaped)',
    hintAfterInjection.includes('ws://x'), hintAfterInjection);

  console.log('\n── Mesh panel: SET HOST validates the URL before accepting it ──');
  const beforeInvalid = await page.evaluate(() => { try { return localStorage.getItem('pf.mesh.ws'); } catch { return null; } });
  await page.fill('#meshWsInput', 'http://not-a-websocket-scheme.test:8770');
  await page.click('button[onclick="meshApplyWsInput()"]');
  await page.waitForTimeout(100);
  const afterInvalid = await page.evaluate(() => { try { return localStorage.getItem('pf.mesh.ws'); } catch { return null; } });
  record('a non ws(s):// URL is rejected — pf.mesh.ws is left unchanged',
    afterInvalid === beforeInvalid, 'before=' + beforeInvalid + ' after=' + afterInvalid);
  const logAfterInvalid = await page.evaluate(() => document.getElementById('meshLog').textContent);
  record('the rejection reason is logged for the user',
    /must start with ws:\/\/ or wss:\/\//i.test(logAfterInvalid), logAfterInvalid);

  await page.fill('#meshWsInput', '');
  await page.click('button[onclick="meshApplyWsInput()"]');
  await page.waitForTimeout(100);
  const afterEmpty = await page.evaluate(() => { try { return localStorage.getItem('pf.mesh.ws'); } catch { return null; } });
  record('an empty URL is a silent no-op — pf.mesh.ws still unchanged',
    afterEmpty === beforeInvalid, 'before=' + beforeInvalid + ' after=' + afterEmpty);

  await page.fill('#meshWsInput', 'wss://secure-relay.test:8770');
  await page.click('button[onclick="meshApplyWsInput()"]');
  await page.waitForTimeout(100);
  const afterWss = await page.evaluate(() => { try { return localStorage.getItem('pf.mesh.ws'); } catch { return null; } });
  record('a wss:// (secure) URL is accepted, not just ws://',
    afterWss === 'wss://secure-relay.test:8770', afterWss);

  console.log('\n── Mesh panel: reopening the panel doesn\'t clobber an unsaved edit ──');
  await page.fill('#meshWsInput', 'ws://not-yet-submitted.test:8770');
  await page.evaluate(() => window.meshTogglePanel()); // close
  await page.evaluate(() => window.meshTogglePanel()); // reopen → meshInitPanel() runs again
  const preservedOnReopen = await page.inputValue('#meshWsInput');
  record('meshInitPanel() only prefills an EMPTY field — it does not overwrite an unsaved typed value',
    preservedOnReopen === 'ws://not-yet-submitted.test:8770', preservedOnReopen);

  console.log('\n── Mesh panel: HTML-special characters other than quotes are also escaped ──');
  await page.fill('#meshWsInput', 'ws://tom&jerry.test:8770');
  await page.click('button[onclick="meshApplyWsInput()"]');
  await page.waitForTimeout(100);
  const hintHtmlWithAmp = await page.evaluate(() => document.getElementById('meshServerHint').innerHTML);
  record('an "&" in a user-supplied host is escaped to "&amp;" in the rendered hint (not left raw)',
    hintHtmlWithAmp.includes('tom&amp;jerry.test'), hintHtmlWithAmp);

  await browser.close();

  console.log('\n══════════════════════════════════════');
  console.log(`RESULT: ${passed} passed · ${failed} failed`);
  if (failed) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log('  ✗ ' + f.name + (f.detail ? ' → ' + f.detail : ''));
    process.exit(1);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
