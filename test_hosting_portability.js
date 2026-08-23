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
  record('no hostname (file://) → falls back to loopback',
    withHostname('') === 'ws://127.0.0.1:8770', withHostname(''));
})();

// ── Part 2: live-browser checks ──────────────────────────────────────────────
(async () => {
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
