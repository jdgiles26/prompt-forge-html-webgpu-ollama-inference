#!/usr/bin/env node
/**
 * drift.js — 07-release-docs
 * Two checks:
 *   1. Every FEAT/UI id claimed in CHANGELOG.md corresponds to an id marked
 *      "pass" in traceability-matrix.json — no unverified release claims.
 *   2. README.md was only edited inside the RELEASE-NOTES marker section —
 *      enforced by hashing everything OUTSIDE the markers and failing if that
 *      changes. This replaces the old "README.md#release-notes" glob, which
 *      doesn't mean anything to a file-ownership prefix check (a glob is a
 *      path pattern, not a way to address part of a file's content) and was
 *      confirmed to falsely reject legitimate writes when actually run.
 */
const fs = require('fs');
const path = require('path');
const core = require('../_lib/drift-core');

function main() {
  const changelogPath = path.join(core.REPO_ROOT, 'CHANGELOG.md');
  const matrixPath = path.join(core.REPO_ROOT, 'tests', 'reports', 'traceability-matrix.json');
  const readmePath = path.join(core.REPO_ROOT, 'README.md');

  const changelogText = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
  const matrix = fs.existsSync(matrixPath) ? JSON.parse(fs.readFileSync(matrixPath, 'utf8')) : [];
  const passingIds = new Set(matrix.filter((m) => m.status === 'pass').map((m) => m.id));

  const changelogIds = core.extractAllRequirementIds(changelogText);
  const claimedIds = [...changelogIds.FEAT, ...changelogIds.UI];
  const unverifiedClaims = claimedIds.filter((id) => !passingIds.has(id));

  const markerCheck = core.checkOnlyMarkerSectionChanged(
    readmePath,
    '<!-- RELEASE-NOTES:START -->',
    '<!-- RELEASE-NOTES:END -->',
    'readme-release-notes'
  );

  const clean = unverifiedClaims.length === 0 && markerCheck.ok;

  const report = {
    agent: '07-release-docs',
    timestamp: new Date().toISOString(),
    claimedIds,
    unverifiedClaims,
    readmeMarkerCheck: markerCheck,
    clean,
  };
  core.writeReport('drift-log-07-release-docs.json', report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(clean ? 0 : 1);
}

main();
