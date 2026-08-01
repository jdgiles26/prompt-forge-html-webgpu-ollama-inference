#!/usr/bin/env node
/**
 * drift.js — 06-drift-monitor
 * The composite integrity sweep. Runs turn-scoped ownership diffing (see
 * drift-core.js v2), test-integrity, governance-file, and ID-integrity
 * checks, then appends a cumulative record to tests/reports/drift-log.json.
 * This is the ONLY script that writes to that file — see FILE_OWNERSHIP.md.
 *
 * Usage: node drift.js <acting-agent-id> <stage-transition-label>
 * Precondition: scripts/turn-start.js <acting-agent-id> must have been run
 * by the orchestrator BEFORE the agent's turn. If it wasn't, this reports
 * clean:false rather than silently passing — a missing turn-start checkpoint
 * means "we have no idea what changed," which is not the same as "nothing
 * changed."
 */
const fs = require('fs');
const path = require('path');
const core = require('../_lib/drift-core');

const PIPELINE_CONFIG = JSON.parse(
  fs.readFileSync(path.join(core.REPO_ROOT, 'pipeline.config.json'), 'utf8')
);

function governanceSweep() {
  const files = ['GUARDRAILS.md', 'FILE_OWNERSHIP.md', 'ORCHESTRATION.md'];
  const results = {};
  for (const f of files) {
    const p = path.join(core.REPO_ROOT, f);
    if (!fs.existsSync(p)) continue;
    results[f] = core.recordCheckpoint(`gov-${f}`, p, null);
  }
  return results;
}

function idIntegritySweep() {
  const prdPath = path.join(core.REPO_ROOT, 'PRD.md');
  if (!fs.existsSync(prdPath)) return { clean: true, note: 'PRD.md not yet created' };
  const text = fs.readFileSync(prdPath, 'utf8');
  const ids = core.extractAllRequirementIds(text);
  const dupes = {
    FEAT: core.findDuplicateIds(ids.FEAT),
    UI: core.findDuplicateIds(ids.UI),
    STEP: core.findDuplicateIds(ids.STEP),
  };
  const clean = dupes.FEAT.length === 0 && dupes.UI.length === 0 && dupes.STEP.length === 0;
  return { clean, duplicates: dupes };
}

function testIntegritySweep() {
  const testsDir = path.join(core.REPO_ROOT, 'tests');
  return core.recordCheckpoint('tests-red-baseline', testsDir, ['.js', '.ts', '.jsx', '.tsx'], false);
}

function ownershipSweep(actingAgentId) {
  const stageConf = PIPELINE_CONFIG.stages.find((s) => s.id === actingAgentId);
  if (!stageConf) return { clean: true, note: `unknown agent id ${actingAgentId}`, method: 'skipped' };

  const turn = core.changedFilesThisTurn(actingAgentId);
  if (turn.changedFiles === null) {
    return {
      clean: false,
      method: turn.method,
      note: turn.note,
      remediation: `Orchestrator must call: node scripts/turn-start.js ${actingAgentId} before invoking this agent.`,
    };
  }

  const check = core.checkOwnership(actingAgentId, turn.changedFiles, stageConf.writeGlobs || []);
  return { clean: check.ok, method: turn.method, violations: check.violations, filesChangedThisTurn: turn.changedFiles };
}

function main() {
  const actingAgentId = process.argv[2] || 'unknown';
  const transitionLabel = process.argv[3] || 'unspecified-transition';

  const ownership = ownershipSweep(actingAgentId);
  const testIntegrity = testIntegritySweep();
  const governance = governanceSweep();
  const idIntegrity = idIntegritySweep();

  const governanceClean = Object.values(governance).every((r) => r.clean || r.firstRecord);
  const testClean = testIntegrity.clean || testIntegrity.firstRecord;

  const clean = ownership.clean && testClean && governanceClean && idIntegrity.clean;

  const entry = {
    agent: '06-drift-monitor',
    timestamp: new Date().toISOString(),
    stageTransition: transitionLabel,
    actingAgent: actingAgentId,
    checks: {
      ownership,
      testIntegrity: { clean: testClean, changed: testIntegrity.changed, removed: testIntegrity.removed },
      governance: { clean: governanceClean, detail: governance },
      idIntegrity,
    },
    clean,
  };

  // append cumulative log (never overwrite history) — this is the ONLY file
  // in the pipeline that both accumulates across the whole run AND is
  // exclusively owned by this agent.
  const logPath = path.join(core.REPO_ROOT, 'tests', 'reports', 'drift-log.json');
  let log = [];
  if (fs.existsSync(logPath)) {
    try { log = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) { log = []; }
  }
  log.push(entry);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  console.log(JSON.stringify(entry, null, 2));
  process.exit(clean ? 0 : 1);
}

main();
