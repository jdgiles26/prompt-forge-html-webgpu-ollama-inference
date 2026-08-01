#!/usr/bin/env node
/**
 * drift.js — 03-spec-test
 * Validates: (1) red-report.json shows every test failing, (2) every
 * FEAT/UI/STEP id in PRD.md appears in traceability-matrix.json, (3) no test
 * file contains .skip/xit/test.todo (works for both node:test and Jest-style
 * skip syntax, since both use the same method names), (4) records the
 * baseline hash of all test files for later stages to compare against.
 * ID extraction delegated to drift-core.js — see its comment for why.
 */
const fs = require('fs');
const path = require('path');
const core = require('../_lib/drift-core');

function scanForbiddenPatterns(dir) {
  const forbidden = [/\.skip\(/, /\bxit\(/, /\bxdescribe\(/, /test\.todo\(/];
  const hits = [];
  for (const f of core.walk(dir, ['.js', '.ts', '.jsx', '.tsx'])) {
    const text = fs.readFileSync(f, 'utf8');
    for (const pat of forbidden) {
      if (pat.test(text)) hits.push({ file: path.relative(core.REPO_ROOT, f), pattern: pat.toString() });
    }
  }
  return hits;
}

function main() {
  const prdPath = path.join(core.REPO_ROOT, 'PRD.md');
  const redPath = path.join(core.REPO_ROOT, 'tests', 'reports', 'red-report.json');
  const matrixPath = path.join(core.REPO_ROOT, 'tests', 'reports', 'traceability-matrix.json');
  const testsDir = path.join(core.REPO_ROOT, 'tests');

  const prdText = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf8') : '';
  const ids = core.extractAllRequirementIds(prdText);
  const allIds = [...ids.FEAT, ...ids.UI, ...ids.STEP];

  const redReport = fs.existsSync(redPath) ? JSON.parse(fs.readFileSync(redPath, 'utf8')) : null;
  const matrix = fs.existsSync(matrixPath) ? JSON.parse(fs.readFileSync(matrixPath, 'utf8')) : [];
  const matrixIds = matrix.map((m) => m.id);
  const missingFromMatrix = allIds.filter((id) => !matrixIds.includes(id));

  const allFailed = redReport ? (redReport.results || []).every((r) => r.status === 'fail') : false;
  const forbiddenHits = scanForbiddenPatterns(path.join(testsDir, 'unit'))
    .concat(scanForbiddenPatterns(path.join(testsDir, 'integration')))
    .concat(scanForbiddenPatterns(path.join(testsDir, 'e2e')));

  // baseline the test files now — 06-drift-monitor compares against this
  core.recordCheckpoint('tests-red-baseline', testsDir, ['.js', '.ts', '.jsx', '.tsx'], true);

  const clean = missingFromMatrix.length === 0 && allFailed && forbiddenHits.length === 0;

  const report = {
    agent: '03-spec-test',
    timestamp: new Date().toISOString(),
    totalRequirementIds: allIds.length,
    missingFromTraceabilityMatrix: missingFromMatrix,
    allTestsCurrentlyFail: allFailed,
    forbiddenSkipPatternsFound: forbiddenHits,
    clean,
  };
  core.writeReport('drift-log-03-spec-test.json', report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(clean ? 0 : 1);
}

main();
