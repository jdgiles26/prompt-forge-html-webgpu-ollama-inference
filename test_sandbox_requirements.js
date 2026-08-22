// Regression test for the Pyodide TDD-sandbox `requirements.txt` installer.
//
// Real Pyodide execution can't be exercised here: the sandbox worker lazy-loads
// Pyodide from cdn.jsdelivr.net at runtime, and that CDN is unreachable from
// this test environment (network policy blocks it, same as it blocks the
// WebLLM/JSZip CDNs used elsewhere in this app). So instead of re-implementing
// the parsing logic (which could silently drift from the real code), this test
// extracts the ACTUAL `sandboxWorkerSrc()` function straight out of
// prompt-forge.html, evaluates it for real, and checks the resulting worker
// source: (1) that it still contains the requirements.txt install step, and
// (2) that the exact parsing expression it contains produces the right
// package list for realistic requirements.txt content.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'prompt-forge.html'), 'utf8');

const startMarker = 'function sandboxWorkerSrc() {';
const startIdx = html.indexOf(startMarker);
assert.ok(startIdx !== -1, 'sandboxWorkerSrc() not found in prompt-forge.html');

const endMarker = 'function sandboxEnsureWorker()';
const endIdx = html.indexOf(endMarker, startIdx);
assert.ok(endIdx !== -1, 'sandboxEnsureWorker() not found after sandboxWorkerSrc()');

// The function body ends right before sandboxEnsureWorker's declaration.
const fnSrc = html.slice(startIdx, endIdx).replace(/\}\s*$/, '}');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fnSrc + '\nthis.__result = sandboxWorkerSrc();', sandbox);
const workerSrc = sandbox.__result;

assert.strictEqual(typeof workerSrc, 'string', 'sandboxWorkerSrc() must return a string');
console.log('PASS: extracted real sandboxWorkerSrc() from prompt-forge.html (' + workerSrc.split('\n').length + ' lines)');

// The generated worker source must itself be valid JS (it's Blob-URL'd and
// run as a Worker — a syntax error here would fail silently in the browser).
new vm.Script(workerSrc, { filename: 'generated-sandbox-worker.js' });
console.log('PASS: generated worker source is syntactically valid JS');

// 1. The requirements.txt install step must exist and run before pytest.
assert.ok(/requirements\.txt/.test(workerSrc), 'generated worker must reference requirements.txt');
assert.ok(/micropip/.test(workerSrc), 'generated worker must fall back to micropip for pure-Python wheels');
const reqIdx = workerSrc.indexOf('requirements.txt');
const pytestRunIdx = workerSrc.indexOf('pytest.main');
assert.ok(reqIdx > -1 && pytestRunIdx > -1 && reqIdx < pytestRunIdx,
  'requirements.txt install must happen before pytest.main runs');

// 2. Pull the exact requirements-parsing expression out of the generated
//    source (not a re-implementation) and run it against realistic input.
const parseMatch = workerSrc.match(
  /const reqs = (String\(reqFile\.body[\s\S]*?\.filter\(Boolean\);)/
);
assert.ok(parseMatch, 'could not locate the requirements.txt parsing expression in generated worker source');

function parseRequirements(body) {
  const fn = new Function('reqFile', 'return ' + parseMatch[1].replace(/;$/, ''));
  return fn({ body });
}

const sample = [
  'jsonschema==4.21.1',
  'requests>=2.31,<3',
  '# a comment line',
  '',
  '-e ./local-pkg',
  '--index-url https://example.invalid/simple',
  'flask~=3.0',
  'numpy[extras]',
  'pytest', // parsed as a normal entry — the install *loop* is what skips it (test 3 below)
].join('\n');

const parsed = parseRequirements(sample);
assert.deepStrictEqual(
  parsed,
  ['jsonschema', 'requests', 'flask', 'numpy', 'pytest'],
  'requirements.txt parsing must strip comments, blank lines, -flag lines, version specifiers and extras'
);
console.log('PASS: requirements.txt parsing extracts the correct package names:', parsed.join(', '));

// 3. pytest itself must be explicitly skipped during the requirements.txt
//    install loop (it's already installed by the earlier step).
assert.ok(/pkg\.toLowerCase\(\) === 'pytest'/.test(workerSrc),
  'generated worker must skip re-installing pytest via the requirements loop');
console.log('PASS: pytest is skipped in the requirements.txt install loop');

// 4. A package that fails both loadPackage and micropip must produce a
//    warning, not abort the whole run.
assert.ok(/installNotes\.push/.test(workerSrc), 'a failed package install must be recorded, not thrown');
const hasGracefulDegradation = /installNotes\.length[\s\S]*?stdout = /.test(workerSrc);
assert.ok(hasGracefulDegradation, 'install failures must be prepended to stdout, not abort the run');
console.log('PASS: a failed package install degrades gracefully instead of aborting the run');

console.log('\nAll sandbox requirements.txt tests passed.');
console.log(
  'NOTE: this validates the generated worker source and its parsing logic only.\n' +
  '      Real Pyodide execution (py.loadPackage/micropip.install network calls)\n' +
  '      is NOT exercised here because cdn.jsdelivr.net is unreachable from this\n' +
  '      environment — verify manually in a browser with network access if in doubt.'
);
