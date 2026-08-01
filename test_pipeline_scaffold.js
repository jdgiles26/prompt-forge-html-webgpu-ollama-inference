// test_pipeline_scaffold.js
// Verifies that the exported Complete Project Pkg ZIP contains the full
// 8-agent spec-driven TDD pipeline scaffold (reference pipeline integration).
// Checks: agents/ directory with all 8 agents, _lib/drift-core.js, root-level
// pipeline files, .github/ CODEOWNERS + workflow, playwright.config.js,
// src/example/ RED→GREEN demo, and content integrity of key files.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const FILE = 'file://' + path.resolve(__dirname, 'prompt-forge.html');
const OUT  = path.resolve(__dirname, 'test_output');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// A minimal valid project payload — just enough FILE blocks for buildProjectZip
// to succeed. The scaffold files are injected by buildProjectZip regardless of
// model output, so we only need a few model-generated files.
const MINIMAL_PAYLOAD = `=== FILE: README.md ===
# Test Project
Minimal project for pipeline scaffold verification.
=== END FILE ===

=== FILE: prd.md ===
# PRD
Test PRD.
=== END FILE ===

=== FILE: spec.md ===
# Spec
Test spec.
=== END FILE ===

=== FILE: tdd.md ===
# TDD
Test TDD.
=== END FILE ===

=== FILE: agent.md ===
# Agent
Test agent.
=== END FILE ===

=== FILE: drift.md ===
# Drift
Test drift.
=== END FILE ===

=== FILE: capabilities.md ===
# Capabilities
Test capabilities.
=== END FILE ===

=== FILE: architectural.md ===
# Architecture
Test architecture.
=== END FILE ===

=== FILE: prompt-sequence.md ===
# Prompt Sequence
Test sequence.
=== END FILE ===

=== FILE: CLAUDE.md ===
# Claude
Test Claude.
=== END FILE ===

=== FILE: AGENTS.md ===
# Agents
Test agents.
=== END FILE ===

=== FILE: DONE.md ===
# Done
Test done.
=== END FILE ===

=== FILE: Makefile ===
test:
\tpytest
=== END FILE ===

=== FILE: .gitignore ===
__pycache__/
=== END FILE ===

=== FILE: src/before/README.md ===
# before
=== END FILE ===

=== FILE: src/before/main.py ===
# broken
=== END FILE ===

=== FILE: src/after/README.md ===
# after
=== END FILE ===

=== FILE: src/after/main.py ===
raise NotImplementedError("not yet")
=== END FILE ===

=== FILE: src/after/__init__.py ===
=== END FILE ===

=== FILE: tests/README.md ===
# tests
=== END FILE ===

=== FILE: tests/test_main.py ===
from src.after.main import count_tokens
def test_placeholder():
    assert True
=== END FILE ===

=== FILE: tests/conftest.py ===
# fixtures
=== END FILE ===

=== FILE: requirements.txt ===
pytest
=== END FILE ===
`;

const AGENT_DIRS = [
  '00-orchestrator', '01-requirements', '02-architecture',
  '03-spec-test', '04-implementation', '05-qa-verification',
  '06-drift-monitor', '07-release-docs',
];

const ROOT_PIPELINE_FILES = [
  'GUARDRAILS.md', 'FILE_OWNERSHIP.md', 'ESCALATION.md', 'PRD.md',
  'pipeline.config.json', 'playwright.config.js',
];

const EXPECTED_AGENT_FILES = ['agent.md', 'instructions.md', 'guardrails.md', 'drift.js'];

let passed = 0, failed = 0;
function rec(name, ok) {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(FILE);
  await page.waitForTimeout(1500);

  rec('no JS errors on page load', pageErrors.length === 0);

  // 1. Verify PIPELINE_SCAFFOLD constant is accessible and has 45 files
  const scaffoldCount = await page.evaluate(() => Object.keys(window.__pf.PIPELINE_SCAFFOLD()).length);
  rec('PIPELINE_SCAFFOLD has 45 files', scaffoldCount === 45);

  // 2. Switch to project mode, inject payload, and trigger zip download
  await page.click('#modeProject');
  await page.waitForTimeout(300);

  // Inject the payload into the output area
  await page.evaluate((payload) => {
    const el = document.getElementById('outputContent');
    el.dataset.raw = payload;
    el.textContent = payload;
    document.getElementById('outputPlaceholder')?.classList.remove('visible');
    document.getElementById('outputPlaceholder')?.style.setProperty('display', 'none');
    window.switchTab('forge');
  }, MINIMAL_PAYLOAD);

  // Trigger the zip download
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#zipBtn'),
  ]);
  const zipPath = path.join(OUT, 'pipeline_scaffold_test.zip');
  await download.saveAs(zipPath);
  rec('zip downloaded', fs.existsSync(zipPath));

  // 3. Open the zip and verify scaffold contents
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const names = entries.map(e => e.entryName);
  const fileSet = new Set(names.filter(n => !zip.getEntry(n).header.isDirectory));

  // 3a. Root-level pipeline files
  rec('root pipeline files count = 6', ROOT_PIPELINE_FILES.every(f => fileSet.has(f)));

  // 3b. All 8 agent directories with all 4 files each
  let allAgentFilesPresent = true;
  for (const agent of AGENT_DIRS) {
    for (const f of EXPECTED_AGENT_FILES) {
      const p = `agents/${agent}/${f}`;
      if (!fileSet.has(p)) {
        allAgentFilesPresent = false;
        rec(`MISSING: ${p}`, false);
      }
    }
  }
  rec('all 8 agents have agent.md + instructions.md + guardrails.md + drift.js', allAgentFilesPresent);

  // 3c. 03-spec-test also has PLAYWRIGHT_SETUP.md
  rec('agents/03-spec-test/PLAYWRIGHT_SETUP.md present', fileSet.has('agents/03-spec-test/PLAYWRIGHT_SETUP.md'));

  // 3d. drift-core.js
  rec('agents/_lib/drift-core.js present', fileSet.has('agents/_lib/drift-core.js'));

  // 3e. .github/CODEOWNERS
  rec('.github/CODEOWNERS present', fileSet.has('.github/CODEOWNERS'));

  // 3f. .github/workflows/pipeline-gate.yml
  rec('.github/workflows/pipeline-gate.yml present', fileSet.has('.github/workflows/pipeline-gate.yml'));

  // 3g. src/example/ files
  rec('src/example/server.js present', fileSet.has('src/example/server.js'));
  rec('src/example/login.js present', fileSet.has('src/example/login.js'));
  rec('src/example/README.md present', fileSet.has('src/example/README.md'));

  // 3h. Total agents/ file count (8×4 + PLAYWRIGHT_SETUP + drift-core = 34)
  const agentFileCount = names.filter(n => n.startsWith('agents/') && !n.endsWith('/')).length;
  rec(`agents/ file count = 34 (got ${agentFileCount})`, agentFileCount === 34);

  // 4. Content integrity — verify key files have real content (not placeholders)
  const driftCore = zip.getEntry('agents/_lib/drift-core.js')?.getData().toString('utf8');
  rec('drift-core.js has hashFile function', driftCore && driftCore.includes('function hashFile'));
  rec('drift-core.js has checkOwnership function', driftCore && driftCore.includes('function checkOwnership'));
  rec('drift-core.js has recordTurnStart function', driftCore && driftCore.includes('function recordTurnStart'));
  rec('drift-core.js has extractRequirementIds function', driftCore && driftCore.includes('function extractRequirementIds'));

  const guardrails = zip.getEntry('GUARDRAILS.md')?.getData().toString('utf8');
  rec('GUARDRAILS.md has "tests are the spec" content', guardrails && guardrails.includes('Tests are the spec'));
  rec('GUARDRAILS.md has "two human gates" content', guardrails && guardrails.includes('Two points where a human'));
  rec('GUARDRAILS.md has "fresh instance" content', guardrails && guardrails.includes('fresh instance'));

  const fileOwnership = zip.getEntry('FILE_OWNERSHIP.md')?.getData().toString('utf8');
  rec('FILE_OWNERSHIP.md has all 8 agents', fileOwnership &&
    AGENT_DIRS.every(d => fileOwnership.includes(d)));

  const pipelineConfig = zip.getEntry('pipeline.config.json')?.getData().toString('utf8');
  rec('pipeline.config.json is valid JSON', (() => {
    try { JSON.parse(pipelineConfig); return true; } catch { return false; }
  })());
  rec('pipeline.config.json has 8 stages', (() => {
    try { const c = JSON.parse(pipelineConfig); return c.stages && c.stages.length === 8; }
    catch { return false; }
  })());
  rec('pipeline.config.json has humanGates', (() => {
    try { const c = JSON.parse(pipelineConfig); return c.humanGates && c.humanGates.includes('post-PRD') && c.humanGates.includes('pre-release'); }
    catch { return false; }
  })());

  const prdTemplate = zip.getEntry('PRD.md')?.getData().toString('utf8');
  rec('PRD.md has FEAT-EXAMPLE placeholder', prdTemplate && prdTemplate.includes('FEAT-EXAMPLE'));
  rec('PRD.md has UI-EXAMPLE placeholder', prdTemplate && prdTemplate.includes('UI-EXAMPLE'));
  rec('PRD.md has Given/When/Then template', prdTemplate && prdTemplate.includes('Given/When/Then'));

  const playwrightConfig = zip.getEntry('playwright.config.js')?.getData().toString('utf8');
  rec('playwright.config.js has defineConfig', playwrightConfig && playwrightConfig.includes('defineConfig'));

  const serverJs = zip.getEntry('src/example/server.js')?.getData().toString('utf8');
  rec('src/example/server.js has login require', serverJs && serverJs.includes("require('./login.js')"));

  // 5. Verify model-generated files still coexist (no clobbering)
  rec('model-generated prd.md still present', fileSet.has('prd.md'));
  rec('model-generated spec.md still present', fileSet.has('spec.md'));
  rec('model-generated README.md still present', fileSet.has('README.md'));
  rec('model-generated Makefile still present', fileSet.has('Makefile'));
  rec('model-generated tests/test_main.py still present', fileSet.has('tests/test_main.py'));

  // 6. Verify PRD.md (template) and prd.md (generated) coexist
  rec('both PRD.md and prd.md coexist', fileSet.has('PRD.md') && fileSet.has('prd.md'));

  // 7. Manifest has pipeline_scaffold info
  const manifest = JSON.parse(zip.getEntry('prompt-forge.json')?.getData().toString('utf8') || '{}');
  rec('manifest has pipeline_scaffold field', !!manifest.pipeline_scaffold);
  rec('manifest pipeline_scaffold has 8 agents', manifest.pipeline_scaffold &&
    manifest.pipeline_scaffold.agents && manifest.pipeline_scaffold.agents.length === 8);
  rec('manifest pipeline_scaffold has scaffold_files count', manifest.pipeline_scaffold &&
    typeof manifest.pipeline_scaffold.scaffold_files === 'number');

  // 8. Verify the 06-drift-monitor drift.js has the composite sweep
  const driftMonitor = zip.getEntry('agents/06-drift-monitor/drift.js')?.getData().toString('utf8');
  rec('06-drift-monitor drift.js has ownershipSweep', driftMonitor && driftMonitor.includes('function ownershipSweep'));
  rec('06-drift-monitor drift.js has governanceSweep', driftMonitor && driftMonitor.includes('function governanceSweep'));
  rec('06-drift-monitor drift.js appends to drift-log.json', driftMonitor && driftMonitor.includes('drift-log.json'));

  // 9. Verify CODEOWNERS has all paths
  const codeowners = zip.getEntry('.github/CODEOWNERS')?.getData().toString('utf8');
  rec('CODEOWNERS has /PRD.md', codeowners && codeowners.includes('/PRD.md'));
  rec('CODEOWNERS has /agents/_lib/', codeowners && codeowners.includes('/agents/_lib/'));

  await browser.close();

  console.log('\n══════════════════════════════════════');
  console.log(`PIPELINE-SCAFFOLD: ${passed} passed · ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
