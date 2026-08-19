// Tests for the "5 additional features" batch layered on top of the
// hallucination-guard hardening work: the Agentic Dev Tips reference panel
// + optional guardrail injection is the first of the five. Loads the real
// file:// page and exercises window.__pf / DOM directly — no mocked logic.

const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'prompt-forge.html');

let passed = 0, failed = 0;
const failures = [];
function record(name, ok, detail) {
  if (ok) { passed++; console.log('  ✓ ' + name); }
  else    { failed++; failures.push({ name, detail }); console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__pf && !!window.__pf.AGENTIC_DEV_TIPS, null, { timeout: 8000 });

  const ev = (fn) => page.evaluate(fn);
  let r;

  // ── Feature 1: Agentic Dev Tips reference panel ─────────────────────────
  console.log('\n── Agentic Dev Tips panel ──');
  r = await ev(() => Array.isArray(window.__pf.AGENTIC_DEV_TIPS) && window.__pf.AGENTIC_DEV_TIPS.length >= 20);
  record('AGENTIC_DEV_TIPS has at least 20 curated entries', r);

  r = await ev(() => window.__pf.AGENTIC_DEV_TIPS.every(t => t.cat && t.tip && t.why && typeof t.inject === 'boolean'));
  record('every tip has cat/tip/why + boolean inject flag', r);

  r = await ev(() => new Set(window.__pf.AGENTIC_DEV_TIPS.map(t => t.tip)).size === window.__pf.AGENTIC_DEV_TIPS.length);
  record('no duplicate tips', r);

  r = await ev(() => {
    const cats = new Set(window.__pf.AGENTIC_DEV_TIPS.map(t => t.cat));
    return cats.size >= 6;
  });
  record('tips span at least 6 categories', r);

  r = await ev(() => {
    const block = window.__pf.AGENTIC_GUARDRAILS_BLOCK;
    return typeof block === 'string' && /BEST-PRACTICE GUARDRAILS/.test(block) && block.length > 50 && block.length < 4000;
  });
  record('AGENTIC_GUARDRAILS_BLOCK is a bounded, non-trivial string', r);

  r = await ev(() => {
    const injected = window.__pf.AGENTIC_DEV_TIPS.filter(t => t.inject).map(t => t.tip);
    return injected.length > 0 && injected.every(tip => window.__pf.AGENTIC_GUARDRAILS_BLOCK.includes(tip));
  });
  record('every inject:true tip appears verbatim in the guardrails block', r);

  r = await ev(() => {
    const notInjected = window.__pf.AGENTIC_DEV_TIPS.filter(t => !t.inject).map(t => t.tip);
    // At least one non-injected tip should exist and be absent (sanity that inject filtering actually filters).
    return notInjected.length > 0 && notInjected.some(tip => !window.__pf.AGENTIC_GUARDRAILS_BLOCK.includes(tip));
  });
  record('at least one non-injected tip is correctly excluded', r);

  // Modal opens, renders content, and closes.
  const before = await page.evaluate(() => document.getElementById('tipsModal').classList.contains('visible'));
  record('tips modal starts hidden', before === false);

  await page.click('#tipsBtn');
  await page.waitForTimeout(100);
  r = await ev(() => document.getElementById('tipsModal').classList.contains('visible'));
  record('tips modal opens on button click', r);

  r = await ev(() => {
    const body = document.getElementById('tipsBody');
    return !!body && body.textContent.length > 200 && /Planning/i.test(body.textContent);
  });
  record('tips modal body renders categorized content', r);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  r = await ev(() => !document.getElementById('tipsModal').classList.contains('visible'));
  record('Escape closes the tips modal (shared modal-close handler)', r);

  // ── Guardrail injection toggle (opt-in, default OFF) ────────────────────
  console.log('\n── Guardrail injection toggle ──');
  await page.click('#tabbar .tab[data-view="assembly"]');
  await page.waitForFunction(() => !!window.asEnsureInit, null, { timeout: 5000 });
  await page.waitForTimeout(200);

  r = await ev(() => window.__pf.asInjectGuardrailsEnabled() === false);
  record('guardrail injection is OFF by default', r);

  r = await ev(() => {
    window.__pf.setAsStages([
      { role: 'plan', modelKey: 'ollama:mock:7b', label: 'Planner', system: 'plan' },
    ]);
    const off = window.__pf.asBuildPrompt(0, 'build a thing');
    return !/BEST-PRACTICE GUARDRAILS/.test(off);
  });
  record('asBuildPrompt omits the guardrail block when the toggle is off', r);

  r = await ev(() => {
    const cb = document.getElementById('asInjectGuardrails');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    const on = window.__pf.asBuildPrompt(0, 'build a thing');
    const ok = /BEST-PRACTICE GUARDRAILS/.test(on) && on.indexOf('BEST-PRACTICE') < on.indexOf('build a thing');
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    return ok;
  });
  record('asBuildPrompt prepends the guardrail block when the toggle is on', r);

  r = await ev(() => {
    // asBuildPromptCore (unwrapped) must be identical to asBuildPrompt with the toggle off.
    window.__pf.setAsStages([{ role: 'plan', modelKey: 'ollama:mock:7b', label: 'Planner', system: 'plan' }]);
    return window.__pf.asBuildPrompt(0, 'x') === window.__pf.asBuildPromptCore(0, 'x');
  });
  record('toggle OFF: asBuildPrompt === asBuildPromptCore (no wrapper drift)', r);

  r = await ev(() => localStorage.getItem('pf.as.injectGuardrails') === '0' || localStorage.getItem('pf.as.injectGuardrails') === null);
  record('toggle state persisted back to OFF after the test toggle+untoggle', r);

  // ── Feature 2: Secret & unsafe-code scanner (pre-export gate) ───────────
  console.log('\n── Secret & unsafe-code scanner ──');
  r = await ev(() => {
    const clean = [{ path: 'main.py', body: 'def add(a, b):\n    return a + b\n' }];
    return window.__pf.scanSecretsAndUnsafe(clean).ok === true;
  });
  record('clean file: ok, no secrets', r);

  // Fixtures below build the fake-key strings by concatenation (never as a
  // contiguous literal) so GitHub push protection doesn't flag this test
  // file itself — same runtime string, same repo lesson as commit 5aad045.
  r = await ev(() => {
    const fakeLiveKey = ['sk', 'live', 'abcdefghijklmnopqrstuvwx'].join('_');
    const s = window.__pf.scanSecretsAndUnsafe([{ path: 'app.py', body: 'STRIPE_KEY = "' + fakeLiveKey + '"\n' }]);
    return !s.ok && s.secrets.length === 1 && s.secrets[0].kind === 'stripe-live-key' && s.secrets[0].path === 'app.py';
  });
  record('detects a Stripe live key', r);

  r = await ev(() => {
    // This repo's own convention (see git history): sk_test_ must NEVER be flagged.
    const fakeTestKey = ['sk', 'test', 'abcdefghijklmnopqrstuvwx'].join('_');
    const s = window.__pf.scanSecretsAndUnsafe([{ path: 'test_app.py', body: 'STRIPE_KEY = "' + fakeTestKey + '"\n' }]);
    return s.ok === true && s.secrets.length === 0;
  });
  record('does NOT flag sk_test_ fixture keys (false-positive guard)', r);

  r = await ev(() => {
    const s = window.__pf.scanSecretsAndUnsafe([{ path: 'infra.tf', body: 'access_key = "AKIAABCDEFGHIJKLMNOP"\n' }]);
    return !s.ok && s.secrets.some(x => x.kind === 'aws-access-key-id');
  });
  record('detects an AWS access key ID', r);

  r = await ev(() => {
    const s = window.__pf.scanSecretsAndUnsafe([{ path: 'id_rsa', body: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\n' }]);
    return !s.ok && s.secrets.some(x => x.kind === 'private-key');
  });
  record('detects an embedded private key block', r);

  r = await ev(() => {
    const s = window.__pf.scanSecretsAndUnsafe([{ path: 'bot.py', body: 'TOKEN = "ghp_' + 'a'.repeat(36) + '"\n' }]);
    return !s.ok && s.secrets.some(x => x.kind === 'github-token');
  });
  record('detects a GitHub personal access token', r);

  r = await ev(() => {
    const s = window.__pf.scanSecretsAndUnsafe([{ path: 'notes.md', body: 'Remember to rotate keys quarterly. Contact api-support@example.com.' }]);
    return s.ok === true;
  });
  record('ordinary prose about keys/tokens is not flagged (low false-positive rate)', r);

  r = await ev(() => {
    const s = window.__pf.scanSecretsAndUnsafe([{ path: 'run.py', body: 'os.system("rm -rf " + eval(user_input))\n' }]);
    return s.ok === true && s.warnings.some(w => w.kind === 'eval-call');
  });
  record('eval() is a non-blocking WARNING, not a hard block', r);

  r = await ev(() => {
    const s = window.__pf.scanSecretsAndUnsafe([{ path: 'run.py', body: 'subprocess.run(cmd, shell=True)\n' }]);
    return s.ok === true && s.warnings.some(w => w.kind === 'shell-true');
  });
  record('shell=True is flagged as a warning', r);

  // End-to-end: buildProjectZip must hard-refuse a payload containing a secret.
  r = await ev(async () => {
    try {
      await window.__pf.buildProjectZip({ files: [
        { path: 'README.md', body: '# demo' },
        { path: 'config.py', body: 'AWS_KEY = "AKIAABCDEFGHIJKLMNOP"\n' },
      ] }, {});
      return false; // should have thrown
    } catch (e) {
      return /secret/i.test(e.message);
    }
  });
  record('buildProjectZip throws and refuses to produce a zip when a secret is present', r);

  r = await ev(async () => {
    // Regression: a clean payload must reach the zip step (not be blocked by
    // the scanner). Real JSZip needs CDN network the sandbox may not have,
    // so this proves the integration boundary deterministically: inject a
    // jszipLoader that throws a distinct marker the instant it's called —
    // reaching it (rather than a "secret detected" error) proves the scan
    // passed clean content through untouched.
    try {
      await window.__pf.buildProjectZip({ files: [
        { path: 'README.md', body: '# demo' },
        { path: 'main.py', body: 'print("hello")\n' },
      ] }, { jszipLoader: () => { throw new Error('MOCK_LOADER_REACHED'); } });
      return false; // jszipLoader always throws in this test — should never return normally
    } catch (e) { return e.message === 'MOCK_LOADER_REACHED'; }
  });
  record('buildProjectZip reaches the zip step for a clean payload (no false-positive block)', r);

  // ── Feature 3: Definition-of-Done auto-validator ─────────────────────────
  console.log('\n── Definition-of-Done auto-validator ──');
  r = await ev(() => {
    const d = window.__pf.auditDoneWhen('');
    return d.hasContent === false && d.bulletCount === 0 && d.vague.length === 0;
  });
  record('empty DoD text: no content, nothing to flag', r);

  r = await ev(() => {
    const d = window.__pf.auditDoneWhen('- The feature works well and is stable\n- Should work as expected\n- No bugs\n');
    return d.hasContent && d.bulletCount === 3 && d.vague.length === 3;
  });
  record('flags vague/unfalsifiable bullets (works well, should work, no bugs)', r);

  r = await ev(() => {
    const d = window.__pf.auditDoneWhen('- `pytest tests/` exits 0\n- All tests passing\n- README.md documents the CLI\n');
    return d.hasContent && d.bulletCount === 3 && d.vague.length === 0;
  });
  record('does NOT flag falsifiable bullets (command / exit code / concrete deliverable)', r);

  r = await ev(() => {
    // A bullet with vague language AND a concrete anchor is NOT flagged —
    // the anchor is what actually makes it checkable, the adjective is noise.
    const d = window.__pf.auditDoneWhen('- Works correctly: `npm test` exits 0\n');
    return d.hasContent && d.vague.length === 0;
  });
  record('a falsifiable anchor rescues an otherwise-vague bullet', r);

  r = await ev(() => {
    const d = window.__pf.auditDoneWhen('Not a checklist, just a paragraph of prose with no bullets at all.');
    return d.hasContent === true && d.bulletCount === 0 && d.vague.length === 0;
  });
  record('non-bulleted DoD text: has content but nothing to audit (no bullets to check)', r);

  // Forge-tab VALIDATE modal surfaces the DoD audit for Single Prompt mode.
  r = await ev(() => {
    // Switch to the FORGE tab first — outputContent lives in that view and
    // validateOutput() reads module-scope state (`mode`) set by setMode().
    document.querySelector('#tabbar .tab[data-view="forge"]')?.click();
    window.setMode('single');
    const out = document.getElementById('outputContent');
    if (!out) return false;
    out.dataset.raw = '## ROLE\nx\n## DONE WHEN\n- Works well\n- `pytest` exits 0\n';
    window.validateOutput();
    const body = document.getElementById('validateBody');
    const ok = !!body && /Definition of Done/i.test(body.textContent) && /Works well/.test(body.textContent);
    window.closeValidate();
    return ok;
  });
  record('VALIDATE modal renders the Definition-of-Done audit with the flagged bullet', r);

  // ── Feature 4: token budget guardrail ────────────────────────────────────
  console.log('\n── Token budget guardrail ──');
  await page.click('#tabbar .tab[data-view="assembly"]');
  await page.waitForFunction(() => !!window.asEnsureInit, null, { timeout: 5000 });
  await page.waitForTimeout(200);

  r = await ev(() => {
    const cb = document.getElementById('asTokenBudget');
    cb.value = '';
    return window.__pf.asTokenBudgetVal() === 0;
  });
  record('empty budget field means no cap (0)', r);

  r = await ev(() => {
    const cb = document.getElementById('asTokenBudget');
    cb.value = '5000';
    return window.__pf.asTokenBudgetVal() === 5000;
  });
  record('budget field parses to an int', r);

  r = await ev(() => {
    window.__pf.setAsStageTelemetry(0, { tokens: 100, startTs: performance.now() });
    window.__pf.setAsStageTelemetry(1, { tokens: 250, startTs: performance.now() });
    return window.__pf.asCumulativeTokens() === 350;
  });
  record('asCumulativeTokens sums across all stage telemetry entries', r);

  // Drive the REAL asAppendChunk code path (not a reimplementation) to prove
  // the trip logic actually fires when cumulative usage crosses the cap.
  r = await ev(() => {
    const cb = document.getElementById('asTokenBudget');
    cb.value = '10'; // tiny cap so a couple of chunks trip it
    window.__pf.resetAsBudgetState();
    window.__pf.setAsStages([{ role: 'plan', modelKey: 'ollama:mock:7b', label: 'Planner', system: 'plan' }]);
    window.__pf.setAsStageTelemetry(0, undefined);
    window.__pf.setAsRunCursor(0);
    const stepEl = document.createElement('div');
    stepEl.innerHTML = '<div class="as-step-body"></div>';
    document.body.appendChild(stepEl);
    window.__pf.asAppendChunk(stepEl, 'this is a chunk of several tokens of text');
    const tripped = window.__pf.asBudgetTripped() === true && window.__pf.asBudgetStopReq() === true;
    stepEl.remove();
    window.__pf.setAsRunCursor(-1);
    return tripped;
  });
  record('asAppendChunk trips the budget flag once cumulative tokens cross the cap', r);

  r = await ev(() => {
    // One-shot: a second chunk after tripping must NOT re-toast/re-trip in a
    // way that breaks state (asBudgetTripped stays true, no exception).
    const cb = document.getElementById('asTokenBudget');
    cb.value = '10';
    window.__pf.resetAsBudgetState();
    window.__pf.setAsStageTelemetry(0, undefined);
    window.__pf.setAsRunCursor(0);
    const stepEl = document.createElement('div');
    stepEl.innerHTML = '<div class="as-step-body"></div>';
    document.body.appendChild(stepEl);
    window.__pf.asAppendChunk(stepEl, 'first chunk over the cap already');
    window.__pf.asAppendChunk(stepEl, 'second chunk after tripping');
    const stillTripped = window.__pf.asBudgetTripped() === true;
    stepEl.remove();
    window.__pf.setAsRunCursor(-1);
    return stillTripped;
  });
  record('budget trip is a stable one-shot (no exception on subsequent chunks)', r);

  r = await ev(() => {
    // No cap set: trip flags must never fire regardless of usage.
    const cb = document.getElementById('asTokenBudget');
    cb.value = '';
    window.__pf.resetAsBudgetState();
    window.__pf.setAsStageTelemetry(0, { tokens: 999999, startTs: performance.now() });
    window.__pf.setAsRunCursor(0);
    const stepEl = document.createElement('div');
    stepEl.innerHTML = '<div class="as-step-body"></div>';
    document.body.appendChild(stepEl);
    window.__pf.asAppendChunk(stepEl, 'more text');
    const untripped = window.__pf.asBudgetTripped() === false && window.__pf.asBudgetStopReq() === false;
    stepEl.remove();
    window.__pf.setAsRunCursor(-1);
    window.__pf.setAsStageTelemetry(0, undefined);
    window.__pf.resetAsBudgetState();
    return untripped;
  });
  record('no budget set (empty field): guardrail never trips', r);

  r = await ev(() => {
    // Telemetry badge reflects "current / budget" once a budget is set —
    // exercised through the same asAppendChunk path used above.
    const cb = document.getElementById('asTokenBudget');
    cb.value = '5000';
    window.__pf.resetAsBudgetState();
    window.__pf.setAsStageTelemetry(0, undefined);
    window.__pf.setAsRunCursor(0);
    const stepEl = document.createElement('div');
    stepEl.innerHTML = '<div class="as-step-body"></div>';
    document.body.appendChild(stepEl);
    window.__pf.asAppendChunk(stepEl, 'a chunk');
    const badge = document.getElementById('asTelBudget');
    const ok = !!badge && /\/\s*5,?000/.test(badge.textContent);
    stepEl.remove();
    window.__pf.setAsRunCursor(-1);
    window.__pf.setAsStageTelemetry(0, undefined);
    window.__pf.resetAsBudgetState();
    document.getElementById('asTokenBudget').value = '';
    return ok;
  });
  record('telemetry badge shows "current / budget" once a budget is set', r);

  // ── No unexpected JS errors ──────────────────────────────────────────────
  console.log('\n── Regression ──');
  const realErrs = errs.filter(s => !/file:|ollama\/api\/tags|Fetch API cannot load|ERR_FAILED|CORS|localhost:11434|Access to fetch|ERR_CONNECTION_RESET|ERR_TUNNEL_CONNECTION_FAILED|jsdelivr/i.test(s));
  record('no unexpected JS errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(`AGENTIC FEATURES: ${passed} passed · ${failed} failed`);
  if (failed) { console.log('\nFAILURES:'); failures.forEach(f => console.log(' ✗ ' + f.name + (f.detail ? ' → ' + f.detail : ''))); }
  process.exit(failed ? 1 : 0);
})();
