#!/usr/bin/env node
/**
 * drift.js — 04-implementation
 * The single most important integrity check in the pipeline: confirms this
 * agent did NOT touch any file under tests/**, by comparing the current hash
 * of every test file against the 'tests-red-baseline' checkpoint recorded by
 * 03-spec-test. Any diff here is a hard block — implementation agents editing
 * tests to fake a pass is the #1 known failure mode in agentic TDD.
 */
const path = require('path');
const core = require('../_lib/drift-core');

function main() {
  const testsDir = path.join(core.REPO_ROOT, 'tests');
  const diff = core.recordCheckpoint(
    'tests-red-baseline',
    testsDir,
    ['.js', '.ts', '.jsx', '.tsx'],
    false // never force — we WANT the comparison against 03-spec-test's baseline
  );

  const srcDir = path.join(core.REPO_ROOT, 'src');
  const srcDiff = core.recordCheckpoint('src-implementation-snapshot', srcDir, null, false);

  const ownership = core.checkOwnership(
    '04-implementation',
    [...diff.changed, ...diff.removed, ...diff.added],
    [] // implementation has ZERO allowed globs inside tests/ — any hit is a violation
  );

  const clean = diff.clean;

  const report = {
    agent: '04-implementation',
    timestamp: new Date().toISOString(),
    testFileIntegrity: diff,
    srcFilesTouched: srcDiff.added ? srcDiff.added.length : 'n/a (first record)',
    violation: !clean
      ? 'Test files were modified/added/removed by or during the implementation stage. This is a hard block.'
      : null,
    clean,
  };
  core.writeReport('drift-log-04-implementation.json', report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(clean ? 0 : 1);
}

main();
