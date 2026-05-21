// Verifies the produced .zip is a *real* working TDD project:
//   1. Unzip it
//   2. Install deps (pytest)
//   3. Run pytest — MUST be RED (NotImplementedError)
//   4. Patch src/after/main.py with a correct implementation
//   5. Run pytest — MUST be GREEN
//
// This is the deepest possible test: the artifact prompt-forge produces
// must function as a TDD scaffold a real developer can finish.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const ZIP = path.resolve(__dirname, 'test_output', 'complete_project.zip');
const SANDBOX = path.resolve(__dirname, 'test_output', 'sandbox');

let passed = 0, failed = 0;
const rec = (n, ok, d) => { if (ok) { passed++; console.log(' ✓ ' + n); } else { failed++; console.log(' ✗ ' + n + (d ? ' → ' + d : '')); } };

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', cwd: SANDBOX, ...opts }).toString();
}

function shAllowFail(cmd) {
  try { return { ok: true, out: sh(cmd) }; }
  catch (e) { return { ok: false, out: (e.stdout?.toString() || '') + (e.stderr?.toString() || ''), code: e.status }; }
}

console.log('\n── ZIP-runs-TDD ──');

// 0. Prereqs
if (!fs.existsSync(ZIP)) {
  console.error('Run test_e2e_project.js first to produce the zip.');
  process.exit(2);
}
fs.rmSync(SANDBOX, { recursive: true, force: true });
fs.mkdirSync(SANDBOX, { recursive: true });

// 1. Extract
new AdmZip(ZIP).extractAllTo(SANDBOX, true);
rec('extracted to sandbox', fs.existsSync(path.join(SANDBOX, 'tests/test_main.py')));

// 2. Install pytest (uses any available pip)
const pipResult = shAllowFail('python3 -m pip install --quiet --user pytest');
rec('pytest installed', pipResult.ok, pipResult.ok ? '' : pipResult.out.slice(-200));

// 3. RED: tests must FAIL before implementation
const redRun = shAllowFail('python3 -m pytest tests/ -q --tb=no 2>&1');
rec('pytest exits non-zero on RED', !redRun.ok, 'code=' + redRun.code);
rec('RED output mentions NotImplementedError', /NotImplementedError|errors|failed/i.test(redRun.out), redRun.out.slice(-300));

// 4. Implement count_tokens correctly under src/after/main.py
const IMPL = `"""Token counter — correct impl."""

def count_tokens(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    out = {}
    for tok in text.split():
        out[tok] = out.get(tok, 0) + 1
    return out

def main(argv=None):
    import sys
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print("usage: token-counter FILE")
        return 1
    counts = count_tokens(argv[0])
    for tok, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"{tok}\\t{n}")
    return 0

if __name__ == "__main__":
    import sys
    sys.exit(main(sys.argv[1:]))
`;
fs.writeFileSync(path.join(SANDBOX, 'src/after/main.py'), IMPL);
rec('implementation written', true);

// 5. GREEN: tests must PASS after implementation
const greenRun = shAllowFail('python3 -m pytest tests/ -q --tb=short 2>&1');
rec('pytest exits zero on GREEN', greenRun.ok, 'code=' + greenRun.code + '\n' + greenRun.out.slice(-400));
rec('all tests passed', /passed/.test(greenRun.out) && !/failed/.test(greenRun.out),
    greenRun.out.split('\n').filter(l => /passed|failed|error/.test(l)).join(' | '));

// 6. Lint sanity — Makefile run targets must be syntactically valid
const makeResult = shAllowFail('make -n test 2>&1');
rec('Makefile `make -n test` parses', makeResult.ok, makeResult.out.slice(-200));

console.log('\n══════════════════════════════════════');
console.log(`ZIP-TDD: ${passed} passed · ${failed} failed`);

// Save run output as artifact
fs.writeFileSync(path.join(__dirname, 'test_output', 'pytest_red_output.txt'), redRun.out);
fs.writeFileSync(path.join(__dirname, 'test_output', 'pytest_green_output.txt'), greenRun.out);

process.exit(failed ? 1 : 0);
