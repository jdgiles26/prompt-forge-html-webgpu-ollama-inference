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

  // ── No unexpected JS errors ──────────────────────────────────────────────
  console.log('\n── Regression ──');
  const realErrs = errs.filter(s => !/file:|ollama\/api\/tags|Fetch API cannot load|ERR_FAILED|CORS|localhost:11434|Access to fetch|ERR_CONNECTION_RESET/i.test(s));
  record('no unexpected JS errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(`AGENTIC FEATURES: ${passed} passed · ${failed} failed`);
  if (failed) { console.log('\nFAILURES:'); failures.forEach(f => console.log(' ✗ ' + f.name + (f.detail ? ' → ' + f.detail : ''))); }
  process.exit(failed ? 1 : 0);
})();
