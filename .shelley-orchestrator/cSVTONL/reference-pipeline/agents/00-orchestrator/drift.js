#!/usr/bin/env node
/**
 * drift.js — 00-orchestrator
 * Checks that ORCHESTRATION.md's run-log is strictly append-only (no
 * historical line altered). Broad governance-file integrity (GUARDRAILS.md,
 * FILE_OWNERSHIP.md, etc.) is 06-drift-monitor's job, not duplicated here —
 * avoids two agents disagreeing about the same file's state.
 *
 * Writes to drift-log-00-orchestrator.json, NOT drift-log.json — that file
 * is 06-drift-monitor's exclusively owned cumulative log (FILE_OWNERSHIP.md).
 * An earlier version of this script wrote to drift-log.json directly, which
 * silently clobbered 06's cumulative array with this agent's single object.
 * Found by actually running both scripts back to back and diffing the file.
 */
const fs = require('fs');
const path = require('path');
const core = require('../_lib/drift-core');

function checkAppendOnly(filePath, baselineKey) {
  const baseline = core.loadBaseline();
  if (!fs.existsSync(filePath)) return { ok: true, reason: 'file not yet created' };
  const current = fs.readFileSync(filePath, 'utf8').split('\n');
  const prior = baseline[baselineKey];
  if (!prior) {
    const b = core.loadBaseline();
    b[baselineKey] = current;
    core.saveBaseline(b);
    return { ok: true, reason: 'baseline recorded' };
  }
  // every prior line must still appear, in order, as a prefix of current
  const stillPresent = prior.every((line, i) => current[i] === line);
  if (stillPresent) {
    // advance the baseline so new legitimate appends don't get re-flagged
    const b = core.loadBaseline();
    b[baselineKey] = current;
    core.saveBaseline(b);
  }
  return { ok: stillPresent, reason: stillPresent ? 'clean' : 'historical run-log line changed' };
}

function main() {
  const runLogCheck = checkAppendOnly(
    path.join(core.REPO_ROOT, 'ORCHESTRATION.md'),
    'orchestration-run-log'
  );

  const report = {
    agent: '00-orchestrator',
    timestamp: new Date().toISOString(),
    runLogAppendOnly: runLogCheck,
    clean: runLogCheck.ok,
  };
  core.writeReport('drift-log-00-orchestrator.json', report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.clean ? 0 : 1);
}

main();
