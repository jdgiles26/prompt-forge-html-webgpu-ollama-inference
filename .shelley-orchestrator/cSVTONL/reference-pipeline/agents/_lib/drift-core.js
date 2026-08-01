/**
 * drift-core.js
 * Shared hashing / ownership / diff engine used by every agent's drift.js.
 * No agent may fork or reimplement this logic independently — that would
 * itself be a form of drift. Edits to this file are owned by 06-drift-monitor
 * only (see FILE_OWNERSHIP.md).
 *
 * v2 — fixes two defects found by actually executing this code against the
 * scaffold:
 *   1. recordCheckpoint crashed when given a file path (governanceSweep,
 *      PRD/ARD checkpoints) because it unconditionally treated its target as
 *      a directory. Fixed via hashAny() dispatch.
 *   2. The ownership sweep compared against whatever the LAST checkpoint for
 *      an agentId happened to be — which, on a first pipeline run, doesn't
 *      exist yet, so the check trivially reported clean without checking
 *      anything. Fixed by scoping ownership checks to a specific agent TURN:
 *      the orchestrator calls recordTurnStart(agentId) immediately before
 *      invoking an agent, and the post-turn check diffs against exactly that
 *      reference point (via git when available, via a hash snapshot
 *      otherwise) — so there is always a real "before" state to compare to.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'tests', 'reports', '.driftbaseline.json');

// Paths whose churn is expected/self-referential to the drift tooling itself
// and is already governed precisely elsewhere (pipeline.config.json's exact
// per-file writeGlobs for red-report.json, green-report.json, etc). Excluded
// from the generic ownership sweep to avoid false positives.
const SWEEP_EXCLUDED_PREFIXES = ['tests/reports/'];

function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function walk(dir, exts = null) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      out.push(...walk(full, exts));
    } else if (!exts || exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function hashDir(dir, exts = null) {
  const files = walk(dir, exts).sort();
  const hashes = {};
  for (const f of files) {
    hashes[path.relative(REPO_ROOT, f)] = hashFile(f);
  }
  return hashes;
}

/**
 * Dispatches to hashFile or hashDir depending on what targetPath actually is.
 * This is the fix for the crash: callers no longer need to know in advance
 * whether they're checkpointing a single file (PRD.md, ARD.md, GUARDRAILS.md)
 * or a directory (tests/, src/).
 */
function hashAny(targetPath, exts = null, excludePrefixes = []) {
  if (!fs.existsSync(targetPath)) return {};
  const stat = fs.statSync(targetPath);
  let hashes;
  if (stat.isDirectory()) {
    hashes = hashDir(targetPath, exts);
  } else {
    hashes = { [path.relative(REPO_ROOT, targetPath)]: hashFile(targetPath) };
  }
  if (excludePrefixes.length) {
    for (const key of Object.keys(hashes)) {
      if (excludePrefixes.some((p) => key.startsWith(p))) delete hashes[key];
    }
  }
  return hashes;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function saveBaseline(baseline) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
}

/**
 * Records the current hash of a set of files under a named checkpoint
 * (e.g. "tests-red", "src-green"). Subsequent calls with the same
 * checkpoint name will be compared, not overwritten, unless `force` is set.
 * Works for both file and directory targets (see hashAny).
 */
function recordCheckpoint(name, targetPath, exts, force = false) {
  const baseline = loadBaseline();
  const current = hashAny(targetPath, exts, SWEEP_EXCLUDED_PREFIXES);
  if (baseline[name] && !force) {
    return diffHashes(baseline[name], current);
  }
  baseline[name] = current;
  saveBaseline(baseline);
  return { changed: [], added: Object.keys(current), removed: [], clean: true, firstRecord: true };
}

function diffHashes(oldHashes, newHashes) {
  const changed = [];
  const removed = [];
  const added = [];
  const oldKeys = new Set(Object.keys(oldHashes));
  const newKeys = new Set(Object.keys(newHashes));
  for (const k of oldKeys) {
    if (!newKeys.has(k)) removed.push(k);
    else if (oldHashes[k] !== newHashes[k]) changed.push(k);
  }
  for (const k of newKeys) {
    if (!oldKeys.has(k)) added.push(k);
  }
  return { changed, added, removed, clean: changed.length === 0 && removed.length === 0 };
}

// ---------------------------------------------------------------------------
// Turn-scoped diffing: the actual fix for the "vacuously clean on first run"
// ownership bug. Prefers git (precise, standard, cheap) and falls back to a
// full hash snapshot when git isn't available.
// ---------------------------------------------------------------------------

function hasGit() {
  return fs.existsSync(path.join(REPO_ROOT, '.git'));
}

function runGit(args) {
  try {
    return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

function currentGitRef() {
  if (!hasGit()) return null;
  const ref = runGit('rev-parse HEAD');
  return ref || null; // null if repo has zero commits yet
}

/**
 * Returns repo-relative paths changed (modified, added, or deleted) in the
 * working tree since `ref`, including untracked new files. Returns null if
 * git isn't usable, so callers know to fall back to the hash method.
 */
function changedFilesSinceRef(ref) {
  if (!hasGit() || !ref) return null;
  const trackedDiff = runGit(`diff --name-only ${ref} -- .`);
  const untracked = runGit('ls-files --others --exclude-standard');
  const set = new Set();
  if (trackedDiff) trackedDiff.split('\n').filter(Boolean).forEach((f) => set.add(f));
  if (untracked) untracked.split('\n').filter(Boolean).forEach((f) => set.add(f));
  return [...set];
}

/**
 * Called by the orchestrator immediately BEFORE invoking an agent. Records
 * exactly what "before this agent's turn" means, so the post-turn ownership
 * check has something real to diff against — even on a pipeline's very first
 * run.
 */
function recordTurnStart(agentId) {
  const baseline = loadBaseline();
  const ref = currentGitRef();
  if (ref) {
    baseline[`turn-start-${agentId}`] = { method: 'git', ref, timestamp: new Date().toISOString() };
  } else {
    const snapshot = hashAny(REPO_ROOT, null, SWEEP_EXCLUDED_PREFIXES);
    baseline[`turn-start-${agentId}`] = { method: 'hash', snapshot, timestamp: new Date().toISOString() };
  }
  saveBaseline(baseline);
  return baseline[`turn-start-${agentId}`];
}

function getTurnStartRecord(agentId) {
  const baseline = loadBaseline();
  return baseline[`turn-start-${agentId}`] || null;
}

/**
 * The actual "what changed during this agent's turn" computation, used by
 * 06-drift-monitor's ownership sweep. Returns { method, changedFiles } or
 * { method: 'none', changedFiles: null, note } if no turn-start exists yet
 * (meaning the orchestrator skipped calling recordTurnStart — itself a
 * process violation worth surfacing, not silently treating as "clean").
 */
function changedFilesThisTurn(agentId) {
  const record = getTurnStartRecord(agentId);
  if (!record) {
    return { method: 'none', changedFiles: null, note: 'no turn-start checkpoint recorded for this agent' };
  }
  if (record.method === 'git') {
    const files = changedFilesSinceRef(record.ref);
    if (files !== null) {
      const filtered = files.filter((f) => !SWEEP_EXCLUDED_PREFIXES.some((p) => f.startsWith(p)));
      return { method: 'git', changedFiles: filtered };
    }
    // git became unavailable between recording and checking — fall through
  }
  if (record.snapshot) {
    const current = hashAny(REPO_ROOT, null, SWEEP_EXCLUDED_PREFIXES);
    const diff = diffHashes(record.snapshot, current);
    return { method: 'hash', changedFiles: [...diff.changed, ...diff.added, ...diff.removed] };
  }
  return { method: 'none', changedFiles: null, note: 'turn-start record present but unusable' };
}

/**
 * Enforces FILE_OWNERSHIP.md at runtime. `allowedGlobs` is a simple prefix/glob
 * list (e.g. ["src/"]). `changedFiles` are repo-relative paths. Globs may end
 * in "/**" (directory prefix), "*" (bare prefix), or be an exact filename.
 */
function checkOwnership(agentId, changedFiles, allowedGlobs) {
  const normalizedGlobs = allowedGlobs.map((g) => g.split('#')[0]); // defensive: strip any accidental anchor fragment
  const violations = changedFiles.filter((f) => {
    return !normalizedGlobs.some((glob) => {
      const prefix = glob.replace(/\*\*?$/, '');
      return f === prefix || f.startsWith(prefix);
    });
  });
  return {
    agentId,
    ok: violations.length === 0,
    violations,
  };
}

/**
 * Checks that a file's edits are confined between two named HTML-comment
 * markers (e.g. "<!-- RELEASE-NOTES:START -->" ... "<!-- RELEASE-NOTES:END -->").
 * Used where an agent is only allowed to touch part of a shared file (e.g.
 * 07-release-docs may only touch README.md's release-notes section).
 * Returns { ok, reason }.
 */
function checkOnlyMarkerSectionChanged(filePath, startMarker, endMarker, checkpointName) {
  if (!fs.existsSync(filePath)) return { ok: true, reason: 'file does not exist' };
  const text = fs.readFileSync(filePath, 'utf8');
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    return { ok: false, reason: `markers not found in ${path.relative(REPO_ROOT, filePath)}` };
  }
  const outsideSection = text.slice(0, startIdx) + text.slice(endIdx + endMarker.length);
  const baseline = loadBaseline();
  const key = `marker-outside-${checkpointName}`;
  const currentHash = crypto.createHash('sha256').update(outsideSection).digest('hex');
  if (!baseline[key]) {
    baseline[key] = currentHash;
    saveBaseline(baseline);
    return { ok: true, reason: 'baseline recorded' };
  }
  const ok = baseline[key] === currentHash;
  baseline[key] = currentHash;
  saveBaseline(baseline);
  return { ok, reason: ok ? 'clean' : 'content outside the marker section changed' };
}

/**
 * Extracts real requirement IDs (FEAT-###, UI-###, STEP-###) from a document,
 * deliberately excluding template/prose mentions. Every legitimate use of an
 * ID in this scaffold's own files is followed by ":" (a heading, e.g.
 * "### FEAT-001: name"), "|" (a table cell), or "," (a comma-separated list
 * in a table cell or changelog line). Every place this scaffold's own
 * templates *talk about* an ID as an example wraps it in backtick-quoted
 * inline code for markdown styling (e.g. "starting at `FEAT-001`") — so the
 * character immediately after the digits is a backtick. Excluding that case
 * lets template instructions reference the real numbering convention in
 * prose without polluting the extraction that every drift.js relies on.
 *
 * This was found by actually running extraction against the shipped
 * templates and seeing FEAT-001/UI-001/STEP-001 turn up before any real
 * project content existed — see PRD.md §4 for the user-facing explanation.
 *
 * Centralized here (rather than reimplemented per drift.js) specifically so
 * the six agents that need it can't drift out of sync with each other.
 */
function extractRequirementIds(text, prefix) {
  const source = prefix + '-(\\d+)(?=[^\\d`]|$)';
  const re = new RegExp(source, 'g');
  const ids = [];
  let m;
  while ((m = re.exec(text)) !== null) ids.push(`${prefix}-${m[1]}`);
  return ids;
}

function findDuplicateIds(ids) {
  const seen = new Set();
  const dupes = new Set();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

function extractAllRequirementIds(text) {
  return {
    FEAT: extractRequirementIds(text, 'FEAT'),
    UI: extractRequirementIds(text, 'UI'),
    STEP: extractRequirementIds(text, 'STEP'),
  };
}

function writeReport(reportName, data) {
  const reportsDir = path.join(REPO_ROOT, 'tests', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, reportName), JSON.stringify(data, null, 2));
}

module.exports = {
  REPO_ROOT,
  SWEEP_EXCLUDED_PREFIXES,
  hashFile,
  hashDir,
  hashAny,
  walk,
  loadBaseline,
  saveBaseline,
  recordCheckpoint,
  diffHashes,
  hasGit,
  currentGitRef,
  changedFilesSinceRef,
  recordTurnStart,
  getTurnStartRecord,
  changedFilesThisTurn,
  checkOwnership,
  checkOnlyMarkerSectionChanged,
  extractRequirementIds,
  findDuplicateIds,
  extractAllRequirementIds,
  writeReport,
};
