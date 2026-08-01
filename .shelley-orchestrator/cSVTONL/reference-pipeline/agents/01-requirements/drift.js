#!/usr/bin/env node
/**
 * drift.js — 01-requirements
 * Validates PRD.md structural integrity: unique IDs, no orphan/duplicate
 * FEAT/UI/STEP numbers, and (post-approval) that the file hasn't been edited
 * without a new revision cycle being opened.
 *
 * ID extraction is delegated to drift-core.js's extractAllRequirementIds —
 * NOT reimplemented here. An earlier version had its own copy of this regex,
 * which meant a real bug (template placeholder text like "starting at
 * `FEAT-001`" being misread as a real requirement) had to be fixed in six
 * different places instead of one. See drift-core.js's comment on
 * extractRequirementIds for the full explanation.
 */
const fs = require('fs');
const path = require('path');
const core = require('../_lib/drift-core');

const PRD_PATH = path.join(core.REPO_ROOT, 'PRD.md');

function main() {
  if (!fs.existsSync(PRD_PATH)) {
    console.log(JSON.stringify({ agent: '01-requirements', clean: false, reason: 'PRD.md missing' }));
    process.exit(1);
  }
  const text = fs.readFileSync(PRD_PATH, 'utf8');
  const ids = core.extractAllRequirementIds(text);

  const dupeFeat = core.findDuplicateIds(ids.FEAT);
  const dupeUi = core.findDuplicateIds(ids.UI);
  const dupeStep = core.findDuplicateIds(ids.STEP);

  const isApproved = /- \[x\] Approved by:/.test(text);
  const drift = core.recordCheckpoint('prd-approved-snapshot', PRD_PATH, null, !isApproved);

  const clean = dupeFeat.length === 0 && dupeUi.length === 0 && dupeStep.length === 0 &&
    (!isApproved || drift.clean || drift.firstRecord);

  const report = {
    agent: '01-requirements',
    timestamp: new Date().toISOString(),
    counts: { FEAT: ids.FEAT.length, UI: ids.UI.length, STEP: ids.STEP.length },
    duplicates: { FEAT: dupeFeat, UI: dupeUi, STEP: dupeStep },
    approved: isApproved,
    postApprovalEditDetected: isApproved && !drift.clean && !drift.firstRecord,
    clean,
  };
  core.writeReport('drift-log-01-requirements.json', report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(clean ? 0 : 1);
}

main();
