// Hallucination / output-corruption guard tests for prompt-forge.html.
// Loads the real file:// page and exercises the guard surface exposed on
// window.__pf directly (no mocks of the guard logic itself — real code).
//
// Covers: repetition-loop detector (line / n-gram / token-streak / negative),
// FILE-block integrity scanner, dynamic ctx-fill scaling, MoA capability
// guardrail, context-compaction preservation + JSON validity, and the
// output-compromised state flag.

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
  await page.waitForFunction(() => !!window.__pf && !!window.__pf.detectRepetitionLoop, null, { timeout: 8000 });

  const ev = (fn) => page.evaluate(fn);
  let r;

  // ── Repetition-loop detector ────────────────────────────────────────────
  console.log('\n── Repetition-loop detector ──');
  r = await ev(() => window.__pf.detectRepetitionLoop('x'.repeat(60) + '\nsome text\nfoo\nfoo\nfoo\nfoo'));
  record('line repeat flagged', r);

  r = await ev(() => {
    const phrase = 'the quick brown fox jumps over lazy dog';
    const ng = 'x'.repeat(60) + '\nheader one\n' + phrase + '\nheader two\n' + phrase + '\nheader three\n' + phrase + '\nheader four\n' + phrase;
    return window.__pf.detectRepetitionLoop(ng);
  });
  record('n-gram (recycled phrase) flagged', r);

  r = await ev(() => window.__pf.detectRepetitionLoop('def foo():\n    return ' + 'aaaa '.repeat(20)));
  record('token streak flagged', r);

  r = await ev(() => window.__pf.detectRepetitionLoop('x'.repeat(60) + '\ndef foo():\n    return 1\ndef bar():\n    return 2\n# comment\nimport os\nimport sys\nimport json\nfrom pathlib import Path'));
  record('normal varied code NOT flagged', !r);

  r = await ev(() => window.__pf.detectRepetitionLoop(`"""Module docstring."""
import os
import sys
import json
from pathlib import Path

class Counter:
    def __init__(self, path):
        self.path = Path(path)
    def count_tokens(self, text):
        tokens = text.split()
        return len(tokens)
    def count_lines(self, text):
        lines = text.splitlines()
        return len(lines)
    def count_words(self, text):
        words = text.split()
        return len(words)
    def count_chars(self, text):
        chars = list(text)
        return len(chars)
    def read(self):
        with open(self.path) as f:
            return f.read()

def main():
    c = Counter("input.txt")
    print(c.count_tokens(c.read()))
    return 0
`));
  record('realistic code with similar boilerplate NOT flagged', !r);

  r = await ev(() => window.__pf.detectRepetitionLoop('hi'));
  record('short text NOT flagged', !r);

  // opts override does not throw
  r = await ev(() => { try { window.__pf.detectRepetitionLoop('a\na\na\na', { window: 8, lineMinRepeats: 3 }); return true; } catch { return false; } });
  record('opts override does not throw', r);

  // ── FILE-block integrity scanner ────────────────────────────────────────
  console.log('\n── FILE-block integrity ──');
  r = await ev(() => window.__pf.scanFileBlocks('=== FILE: a.py ===\nx\n=== END FILE ===\n=== FILE: b.py ===\ny\n=== END FILE ===').ok);
  record('well-formed blocks ok', r);

  r = await ev(() => { const s = window.__pf.scanFileBlocks('=== FILE: a.py ===\nimport os\n# no end'); return !s.ok && !!s.openBlock && s.openBlock.path === 'a.py'; });
  record('open/truncated block detected', r);

  r = await ev(() => { const s = window.__pf.scanFileBlocks('=== FILE: a.py ===\nx\n=== END FILE ===\n=== FILE: a.py ===\ny\n=== END FILE ==='); return !s.ok && s.errors.some(e => e.kind === 'duplicate'); });
  record('duplicate path detected', r);

  r = await ev(() => { const s = window.__pf.scanFileBlocks('=== END FILE ==='); return !s.ok && s.errors.some(e => e.kind === 'orphan-end'); });
  record('orphan END FILE detected', r);

  r = await ev(() => { const s = window.__pf.scanFileBlocks('=== FILE: a.py ===\n=== FILE: b.py ===\nx\n=== END FILE ==='); return !s.ok && s.errors.some(e => e.kind === 'nested'); });
  record('nested FILE block detected', r);

  // ── Dynamic ctx-fill scaling ─────────────────────────────────────────────
  console.log('\n── Dynamic ctx-fill scaling ──');
  r = await ev(() => { const p = { numCtx: 8192, repeatPenalty: 1.1, topP: 0.9, topK: 40, minP: 0.05 }; const o = window.__pf.scaleParamsForCtxFill(p, 1000); return o.repeatPenalty === 1.1 && o.topP === 0.9; });
  record('no scaling below 70% fill', r);

  r = await ev(() => { const p = { numCtx: 8192, repeatPenalty: 1.1, topP: 0.9, topK: 40, minP: 0.05 }; const o = window.__pf.scaleParamsForCtxFill(p, 8000); return o.repeatPenalty > 1.1 && o.repeatPenalty <= 1.3; });
  record('scales repeat_penalty up at high fill', r);

  r = await ev(() => { const p = { numCtx: 8192, repeatPenalty: 1.1, topP: 0.6, topK: 40, minP: 0.05 }; const o = window.__pf.scaleParamsForCtxFill(p, 8192); return o.topP >= 0.5; });
  record('top_p floored at 0.5', r);

  r = await ev(() => { const p = { numCtx: 8192, repeatPenalty: 1.1, topP: 0.9, topK: 5, minP: 0.05 }; const o = window.__pf.scaleParamsForCtxFill(p, 8192); return o.topK >= 10; });
  record('top_k floored at 10 (never greedy-collapse)', r);

  r = await ev(() => { const p = { numCtx: 8192, repeatPenalty: 1.1, topP: 0.9, topK: 40, minP: 0.01 }; const o = window.__pf.scaleParamsForCtxFill(p, 8192); return o.minP >= 0.05; });
  record('min_p floored at 0.05', r);

  r = await ev(() => { const p = { numCtx: 8192, repeatPenalty: 1.25, topP: 0.9, topK: 40, minP: 0.05 }; const o = window.__pf.scaleParamsForCtxFill(p, 8192); return o.repeatPenalty <= 1.3001; });
  record('repeat_penalty capped at 1.3', r);

  // ── MoA capability guardrail ─────────────────────────────────────────────
  console.log('\n── MoA capability guardrail ──');
  await page.click('#tabbar .tab[data-view="assembly"]');
  await page.waitForFunction(() => !!window.asEnsureInit, null, { timeout: 5000 });
  await page.waitForTimeout(300);

  r = await ev(() => {
    window.__pf.setAsStages([{ role: 'plan', modelKey: 'ollama:mock-tiny:1b', label: 'Planner', system: 'plan' }]);
    const c = window.__pf.asCheckCapability();
    return !c.ok && /LIGHT/.test(c.reason);
  });
  record('capability check refuses all-light + heavy role', r);

  r = await ev(() => {
    window.asSetHeavyOverride(true);
    const validate = window.__pf.asValidateStages();
    window.asSetHeavyOverride(false);
    return validate === null;
  });
  record('override disables the guardrail refusal', r);

  r = await ev(() => ['plan','review_plan','taskout','codereview'].every(rl => window.__pf.HEAVY_ROLES.has(rl)));
  record('heavy roles set includes plan/review_plan/taskout/codereview', r);

  // ── Context compaction ──────────────────────────────────────────────────
  console.log('\n── Context compaction ──');
  r = await ev(() => {
    window.__pf.setAsStages([
      { role: 'plan', modelKey: 'ollama:mock:7b', label: 'Planner', system: 'plan' },
      { role: 'execute', modelKey: 'ollama:mock:7b', label: 'Executor', system: 'exec' },
    ]);
    window.__pf.setAsStepOutput(0, { role: 'plan', label: 'Planner', model: 'ollama:mock:7b', output: '=== FILE: prd.md ===\n# PRD\nimportant requirements\n=== END FILE ===\n=== FILE: throwaway.txt ===\njunk\n=== END FILE ===' });
    const compact = window.__pf.asCompactContext(1, 'build a thing');
    const obj = JSON.parse(compact);
    const s0 = obj.stages[0];
    return !!(s0 && s0.keep_bodies && s0.keep_bodies['prd.md'] && /important requirements/.test(s0.keep_bodies['prd.md']));
  });
  record('compaction preserves PRD/spec file bodies', r);

  r = await ev(() => { try { JSON.parse(window.__pf.asCompactContext(1, 'task')); return true; } catch { return false; } });
  record('compaction produces valid JSON', r);

  r = await ev(() => {
    window.__pf.setAsStepOutput(0, { role: 'plan', label: 'Planner', model: 'x', output: '=== FILE: prd.md ===\n' + 'x'.repeat(20000) + '\n=== END FILE ===' });
    const compact = window.__pf.asCompactContext(1, 'task');
    return compact.length < 50000;
  });
  record('compaction token cap keeps payload bounded', r);

  r = await ev(() => {
    window.__pf.setAsStages([
      { role: 'plan', modelKey: 'ollama:mock:7b', label: 'Planner', system: 'plan' },
      { role: 'execute', modelKey: 'ollama:mock:7b', label: 'Executor', system: 'exec' },
    ]);
    window.__pf.setAsStepOutput(0, { role: 'plan', label: 'Planner', model: 'x', output: 'plan text' });
    const cb = document.getElementById('asCompaction');
    const wasChecked = cb.checked;
    cb.checked = true;
    const onPrompt = window.__pf.asBuildPrompt(1, 'task');
    cb.checked = wasChecked;
    return /COMPACTED CONTEXT/.test(onPrompt);
  });
  record('asBuildPrompt emits compacted context when enabled', r);

  r = await ev(() => {
    window.__pf.setAsStages([
      { role: 'plan', modelKey: 'ollama:mock:7b', label: 'Planner', system: 'plan' },
      { role: 'execute', modelKey: 'ollama:mock:7b', label: 'Executor', system: 'exec' },
    ]);
    window.__pf.setAsStepOutput(0, { role: 'plan', label: 'Planner', model: 'x', output: 'plan text' });
    const cb = document.getElementById('asCompaction');
    const wasChecked = cb.checked;
    cb.checked = false;
    const offPrompt = window.__pf.asBuildPrompt(1, 'task');
    cb.checked = wasChecked;
    return /PRIOR STAGE 1/.test(offPrompt);
  });
  record('asBuildPrompt uses raw concatenation when compaction off', r);

  // ── Output-compromised state ─────────────────────────────────────────────
  console.log('\n── Output-compromised state ──');
  r = await ev(() => { window.__pf.pfClearCompromised(); window.__pf.pfMarkCompromised('test reason'); return window.__pf.pfOutputCompromised() && window.__pf.pfCompromiseReason() === 'test reason'; });
  record('pfMarkCompromised sets flag + reason', r);

  r = await ev(() => { window.__pf.pfMarkCompromised('x'); window.__pf.pfClearCompromised(); return !window.__pf.pfOutputCompromised(); });
  record('pfClearCompromised resets flag', r);

  // ── No unexpected JS errors ──────────────────────────────────────────────
  console.log('\n── Regression ──');
  const realErrs = errs.filter(s => !/file:|ollama\/api\/tags|Fetch API cannot load|ERR_FAILED|CORS|localhost:11434|Access to fetch/i.test(s));
  record('no unexpected JS errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n════════════════════════════════════════');
  console.log(`GUARDS: ${passed} passed · ${failed} failed`);
  if (failed) { console.log('\nFAILURES:'); failures.forEach(f => console.log(' ✗ ' + f.name + (f.detail ? ' → ' + f.detail : ''))); }
  process.exit(failed ? 1 : 0);
})();
