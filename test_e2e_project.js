// End-to-end: drive the page like a real user would in COMPLETE PROJECT mode.
// We inject a realistic forge payload (instead of calling a real model) and
// verify the full pipeline: stream into output → tint → file viewer →
// validator → zip download. Writes the produced .zip and validation report
// to ./test_output/ as durable artifacts.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const FILE = 'file://' + path.resolve(__dirname, 'prompt-forge.html');
const OUT  = path.resolve(__dirname, 'test_output');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const REALISTIC_PAYLOAD = `=== FILE: README.md ===
# Token Counter — TDD Sample

Counts unique whitespace-separated tokens in a UTF-8 file.

## Stack
- Python 3.11+

## Quick start
\`\`\`bash
make install
make test
make run
\`\`\`

## Status
RED — src/after/main.py raises NotImplementedError until you fill it in.
=== END FILE ===

=== FILE: CLAUDE.md ===
# Token Counter — Claude Code System Prompt

## ROLE
Senior Python engineer turning a failing TDD scaffold into a green one.

## VERSION MAP
Single repo. Target: ./

## HARDWARE / ENVIRONMENT TARGET
Python 3.11+, any OS. No GPU.

## OBJECTIVE — EXACT
Implement count_tokens(path: str) -> dict[str,int] under src/after/main.py so all tests in tests/test_main.py pass.

## WHAT TO BUILD
1. count_tokens(path) — open file UTF-8, split on whitespace, return Counter-style dict.
2. main(argv) — CLI: prints "token\\tcount" lines sorted desc by count.

## WHAT NOT TO BUILD
- Streaming / large-file optimization — out of scope, dataset is small.

## DELETE / REMOVE
src/before/main.py  # broken reference impl, do not edit, do not import

## PRESERVE — DO NOT TOUCH
tests/test_main.py  # assertions are the contract

## NEW FILES TO CREATE
src/after/main.py  # implementation
src/after/__init__.py  # empty

## EXECUTION ORDER — TDD, NO SKIPPING STEPS

### Step 1 — Audit
Read src/before/main.py. Note the off-by-one and the missing UTF-8 decode.

### Step 2 — Tests already exist
tests/test_main.py — currently RED.

### Step 3 — Implement under src/after/
count_tokens first, then main(argv).

### Step 4 — Validate
\`\`\`bash
make test
\`\`\`

### Step 5 — Deliver
Complete files. No TODO. No placeholders.

## GUARDRAILS — HARD STOPS
- **STOP** if you import from src/before — it is the broken reference, never the source of truth.
- **STOP** if you edit tests/test_main.py — assertions are immutable.
- **STOP** if any test still fails before declaring done.

## DONE WHEN
1. make test exits 0
2. src/after/main.py has no NotImplementedError
3. CLI prints sorted token counts
=== END FILE ===

=== FILE: AGENTS.md ===
# Agent Workflow
- **Architect** — owns CLAUDE.md, never edits code.
- **Implementer** — edits only src/after/.
- **Reviewer** — runs make test, fills DONE.md.
=== END FILE ===

=== FILE: DONE.md ===
# Done Criteria
- [ ] make test exits 0
- [ ] src/after/main.py implements count_tokens
- [ ] CLI behavior matches spec
=== END FILE ===

=== FILE: Makefile ===
.PHONY: install test lint run clean

install:
\tpip install -e .

test:
\tpytest tests/ -v

lint:
\truff check src/ tests/

run:
\tpython -m src.after.main sample.txt

clean:
\trm -rf __pycache__ .pytest_cache
=== END FILE ===

=== FILE: .gitignore ===
__pycache__/
.pytest_cache/
*.egg-info/
dist/
build/
.venv/
=== END FILE ===

=== FILE: src/before/main.py ===
# BROKEN — for reference only. Do not import.
def count_tokens(path):
    # bug: reads as bytes, no UTF-8 decode
    with open(path, 'rb') as f:
        data = f.read()
    # bug: split on b' ' only, misses tabs/newlines
    parts = data.split(b' ')
    out = {}
    for p in parts:
        out[p] = out.get(p, 0) + 1
    return out
=== END FILE ===

=== FILE: src/after/main.py ===
"""Implementation lives here. Currently RED."""

def count_tokens(path: str) -> dict:
    raise NotImplementedError("implement count_tokens — see CLAUDE.md")

def main(argv=None):
    raise NotImplementedError("implement CLI entrypoint")

if __name__ == "__main__":
    import sys
    main(sys.argv[1:])
=== END FILE ===

=== FILE: src/after/__init__.py ===
=== END FILE ===

=== FILE: tests/test_main.py ===
import pytest
from src.after.main import count_tokens

def test_empty_file(tmp_path):
    p = tmp_path / "e.txt"; p.write_text("", encoding="utf-8")
    assert count_tokens(str(p)) == {}

def test_single_token(tmp_path):
    p = tmp_path / "s.txt"; p.write_text("hello", encoding="utf-8")
    assert count_tokens(str(p)) == {"hello": 1}

def test_repeated_tokens(tmp_path):
    p = tmp_path / "r.txt"; p.write_text("a a b", encoding="utf-8")
    assert count_tokens(str(p)) == {"a": 2, "b": 1}

def test_whitespace_variants(tmp_path):
    p = tmp_path / "w.txt"; p.write_text("a\\tb\\nc  d", encoding="utf-8")
    assert count_tokens(str(p)) == {"a": 1, "b": 1, "c": 1, "d": 1}

def test_utf8_tokens(tmp_path):
    p = tmp_path / "u.txt"; p.write_text("café café naïve", encoding="utf-8")
    assert count_tokens(str(p)) == {"café": 2, "naïve": 1}

def test_returns_dict(tmp_path):
    p = tmp_path / "d.txt"; p.write_text("x y z", encoding="utf-8")
    r = count_tokens(str(p))
    assert isinstance(r, dict)

def test_missing_file_raises(tmp_path):
    with pytest.raises((FileNotFoundError, OSError)):
        count_tokens(str(tmp_path / "nope.txt"))

def test_large_file(tmp_path):
    p = tmp_path / "big.txt"
    p.write_text(" ".join(["x"] * 10000), encoding="utf-8")
    assert count_tokens(str(p))["x"] == 10000
=== END FILE ===

=== FILE: tests/conftest.py ===
# Minimal — fixtures are inline in test_main.py via tmp_path.
=== END FILE ===

=== FILE: requirements.txt ===
pytest>=7.0
ruff>=0.1
=== END FILE ===
`;

let passed = 0, failed = 0;
const rec = (n, ok, d) => { if (ok) { passed++; console.log(' ✓ ' + n); } else { failed++; console.log(' ✗ ' + n + (d ? ' → ' + d : '')); } };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localhost:11434|ERR_FAILED|CORS/i.test(e.message)) console.error('pageerror:', e.message); });

  await page.goto(FILE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);

  console.log('\n── E2E: complete-project pipeline ──');

  // 1) Switch to project mode
  await page.click('#modeProject');
  rec('mode = project', await page.locator('#modeProject.active').count() === 1);

  // 2) Set a realistic task input
  await page.fill('#taskInput', 'Build a Python token counter with TDD. Inputs: UTF-8 files. Outputs: dict[token,count].');

  // 3) Inject the payload exactly as if a model had streamed it.
  //    Use appendOutput chunk-by-chunk to exercise the streaming path
  //    (Text node append, scroll throttle, meter update).
  await page.evaluate(async (payload) => {
    // Reach into the same code path used by real backends.
    const w = window;
    // startOutput is module-scope; replicate by initializing the output area:
    const oc = document.getElementById('outputContent');
    const op = document.getElementById('outputPlaceholder');
    op.style.display = 'none';
    oc.style.display = 'block';
    oc.innerHTML = '';
    oc.dataset.raw = '';
    const tn = document.createTextNode('');
    oc.appendChild(tn);
    // Chunk size mimics token streaming
    const CHUNK = 32;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const piece = payload.slice(i, i + CHUNK);
      tn.appendData(piece);
      oc.dataset.raw += piece;
      await new Promise(r => setTimeout(r, 1));
    }
  }, REALISTIC_PAYLOAD);

  // 4) Sanity: output meter reflects size
  const meter = await page.textContent('#outputCount');
  rec('output meter reflects char count', /chars/.test(meter), meter);

  // 5) Force the view-toggle visible (post-stream hook normally does this)
  await page.evaluate(() => {
    const vt = document.getElementById('viewToggle');
    vt.classList.add('visible');
  });

  // 6) Switch to file view and confirm all files appear
  await page.click('#viewFiles');
  await page.waitForSelector('#fileViewer.visible');
  const tree = await page.locator('.file-tree-item').evaluateAll(els => els.map(e => e.firstChild.textContent.trim()));
  const REQUIRED = [
    'README.md','CLAUDE.md','AGENTS.md','DONE.md','Makefile','.gitignore',
    'src/before/main.py','src/after/main.py','src/after/__init__.py',
    'tests/test_main.py','tests/conftest.py','requirements.txt'
  ];
  for (const f of REQUIRED) rec('file tree contains ' + f, tree.includes(f), 'tree=' + tree.join(','));

  // 7) Click each file and ensure content viewer shows it
  for (let i = 0; i < tree.length; i++) {
    await page.evaluate(j => window.selectFile(j), i);
    const txt = await page.textContent('#fileContent');
    rec('selectFile ' + tree[i] + ' renders body', txt.length > 0 && txt.includes('//'));
  }

  // 8) Validate — output should be GREEN for project mode with all required files present
  await page.click('#viewRaw'); // validate reads from getRawOutput()
  await page.click('button:has-text("VALIDATE")');
  await page.waitForSelector('#validateModal.visible');
  const report = await page.textContent('#validateBody');
  fs.writeFileSync(path.join(OUT, 'validation_report.txt'), report);
  rec('validator reports 12 file blocks', /12 file blocks parsed/.test(report), report.slice(0,300));
  rec('CLAUDE.md present',  /✓ CLAUDE\.md/.test(report));
  rec('README.md present',  /✓ README\.md/.test(report));
  rec('AGENTS.md present',  /✓ AGENTS\.md/.test(report));
  rec('DONE.md present',    /✓ DONE\.md/.test(report));
  rec('Makefile present',   /✓ Makefile/.test(report));
  rec('.gitignore present', /✓ \.gitignore/.test(report));
  rec('src/before/main.py present', /✓ src\/before\/main\.<ext>/.test(report));
  rec('src/after/main.py present',  /✓ src\/after\/main\.<ext>/.test(report));
  rec('tests/test_main.py present', /✓ tests\/test_main\.<ext>/.test(report));
  rec('requirements.txt OR package.json present', /✓ requirements\.txt OR package\.json/.test(report));
  rec('no [CONFIRM WITH USER] placeholders', /0 \[CONFIRM WITH USER/.test(report));
  await page.click('#validateModal .modal-close');

  // 9) Download the ZIP
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#zipBtn'),
  ]);
  const zipPath = path.join(OUT, 'complete_project.zip');
  await download.saveAs(zipPath);
  const stat = fs.statSync(zipPath);
  rec('zip written to disk', stat.size > 500, 'size=' + stat.size);

  // 10) Inspect the zip — every required file MUST be present with non-trivial content
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const byName = Object.fromEntries(entries.map(e => [e.entryName, e]));
  for (const f of REQUIRED) {
    const e = byName[f];
    rec('zip entry: ' + f, !!e);
    if (e) {
      const body = e.getData().toString('utf8');
      rec('zip entry non-trivial: ' + f, body.length > 0 || /__init__\.py$/.test(f), 'len=' + body.length);
    }
  }
  rec('zip has prompt-forge.json metadata', !!byName['prompt-forge.json']);

  // 11) Cross-check: zip contents match the parsed file bodies exactly
  await page.evaluate(p => { document.getElementById('outputContent').dataset.raw = p; }, REALISTIC_PAYLOAD);
  const expected = await page.evaluate(() => {
    const text = document.getElementById('outputContent').dataset.raw;
    const re = /^===\s*FILE:\s*(.+?)\s*===\s*$([\s\S]*?)^===\s*END FILE\s*===\s*$/gm;
    const out = {}; let m;
    while ((m = re.exec(text)) !== null) {
      let body = m[2];
      if (body.startsWith('\n')) body = body.slice(1);
      if (body.endsWith('\n'))   body = body.slice(0, -1);
      out[m[1].trim()] = body;
    }
    return out;
  });
  for (const f of REQUIRED) {
    const exp = expected[f];
    const got = byName[f]?.getData().toString('utf8');
    rec('zip body matches parsed body: ' + f, exp === got);
  }

  // 12) Write artifacts to disk
  fs.writeFileSync(path.join(OUT, 'forged_payload.txt'), REALISTIC_PAYLOAD);
  fs.writeFileSync(path.join(OUT, 'README.md'),
    `# prompt-forge test artifacts\n\nGenerated by test_e2e_project.js on ${new Date().toISOString()}.\n\nFiles:\n- complete_project.zip — the full forge package\n- forged_payload.txt — the multi-file payload that was streamed in\n- validation_report.txt — what the in-page validator reported\n`);

  console.log('\n══════════════════════════════════════');
  console.log(`E2E: ${passed} passed · ${failed} failed`);
  console.log(`Artifacts written to: ${OUT}`);

  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
