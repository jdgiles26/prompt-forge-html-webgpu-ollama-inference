#!/usr/bin/env node
/**
 * drift.js — 02-architecture
 * Confirms every FEAT-### in PRD.md has a corresponding mapping in
 * ARCHITECTURE.md's module table, and that ARD.md is append-only.
 * ID extraction delegated to drift-core.js — see its comment for why.
 */
const fs = require('fs');
const path = require('path');
const core = require('../_lib/drift-core');

function main() {
  const prdPath = path.join(core.REPO_ROOT, 'PRD.md');
  const archPath = path.join(core.REPO_ROOT, 'ARCHITECTURE.md');
  const ardPath = path.join(core.REPO_ROOT, 'ARD.md');

  const prdText = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf8') : '';
  const archText = fs.existsSync(archPath) ? fs.readFileSync(archPath, 'utf8') : '';

  const featIds = core.extractRequirementIds(prdText, 'FEAT');
  const mappedFeat = core.extractRequirementIds(archText, 'FEAT');
  const unmapped = featIds.filter((id) => !mappedFeat.includes(id));

  const ardAppendCheck = fs.existsSync(ardPath)
    ? core.recordCheckpoint('ard-history', ardPath, null)
    : { clean: true, firstRecord: true };

  const clean = unmapped.length === 0 && (ardAppendCheck.clean || ardAppendCheck.firstRecord);

  const report = {
    agent: '02-architecture',
    timestamp: new Date().toISOString(),
    unmappedFeatures: unmapped,
    ardHistoryIntact: ardAppendCheck.clean || ardAppendCheck.firstRecord,
    clean,
  };
  core.writeReport('drift-log-02-architecture.json', report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(clean ? 0 : 1);
}

main();
