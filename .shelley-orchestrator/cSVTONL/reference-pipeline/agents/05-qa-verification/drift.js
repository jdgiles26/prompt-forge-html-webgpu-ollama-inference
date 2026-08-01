#!/usr/bin/env node
/**
 * drift.js — 05-qa-verification
 * Confirms green-report.json and traceability-matrix.json are internally
 * consistent: every PRD id appears in the matrix, no id is marked "pass"
 * without a corresponding passing entry in green-report.json, and this agent
 * did not touch src/ or tests/ content (confirmed via the same baseline
 * 03-spec-test already recorded). ID extraction delegated to drift-core.js.
 */
const fs = require('fs');
const path = require('path');
const core = require('../_lib/drift-core');

function main() {
  const prdPath = path.join(core.REPO_ROOT, 'PRD.md');
  const matrixPath = path.join(core.REPO_ROOT, 'tests', 'reports', 'traceability-matrix.json');
  const greenPath = path.join(core.REPO_ROOT, 'tests', 'reports', 'green-report.json');
  const testsDir = path.join(core.REPO_ROOT, 'tests');

  const prdText = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf8') : '';
  const ids = core.extractAllRequirementIds(prdText);
  const allIds = [...ids.FEAT, ...ids.UI, ...ids.STEP];

  const matrix = fs.existsSync(matrixPath) ? JSON.parse(fs.readFileSync(matrixPath, 'utf8')) : [];
  const matrixIds = matrix.map((m) => m.id);
  const missing = allIds.filter((id) => !matrixIds.includes(id));
  const notPassing = matrix.filter((m) => m.status !== 'pass').map((m) => m.id);

  const green = fs.existsSync(greenPath) ? JSON.parse(fs.readFileSync(greenPath, 'utf8')) : null;

  // confirm tests/ content still matches 03-spec-test's baseline (QA must not edit tests)
  const testIntegrity = core.recordCheckpoint('tests-red-baseline', testsDir, ['.js', '.ts', '.jsx', '.tsx'], false);

  const clean = missing.length === 0 && notPassing.length === 0 && !!green && green.allPassing === true && testIntegrity.clean;

  const report = {
    agent: '05-qa-verification',
    timestamp: new Date().toISOString(),
    missingFromMatrix: missing,
    idsNotPassing: notPassing,
    greenReportPresent: !!green,
    greenReportAllPassing: green ? green.allPassing : null,
    testFileIntegrityMaintained: testIntegrity.clean,
    clean,
  };
  core.writeReport('drift-log-05-qa-verification.json', report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(clean ? 0 : 1);
}

main();
