/**
 * Crossword Puzzle Judge — evaluates agent output against task.yaml criteria.
 *
 * Dimensions: completeness (25), ordering (25), conditionality (25), errorHandling (25)
 *
 * Run with: npx tsx scripts/judge-crossword.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

interface DimensionResult {
  dimension: string;
  score: number;
  weight: number;
  applicable: boolean;
  checks: CheckResult[];
  evidence: string;
  deductions: string[];
}

interface JudgeScorecardOutput {
  taskName: string;
  agentId: string;
  weightedScore: number;
  durationMs?: number;
  dimensions: Record<string, {
    score: number;
    evidence: string;
    deductions: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIZE = 15;
const MIN_WORDS = 40;
const MIN_WORD_LEN = 3;
const MAX_BIGRAM_REPEAT = 2;

const TASK_NAME = 'crossword-puzzle';

interface AgentConfig {
  id: string;
  label: string;
  outputPath: string;
  timingPath: string;
}

const agents: AgentConfig[] = [
  {
    id: 'babysitter-orchestrated',
    label: 'Babysitter',
    outputPath: 'results/full-comparison/crossword-puzzle/babysitter/output/report.json',
    timingPath: 'results/full-comparison/crossword-puzzle/babysitter/timing.json',
  },
  {
    id: 'pure-claude-code',
    label: 'Pure Claude',
    outputPath: 'results/full-comparison/crossword-puzzle/pure-claude/output/report.json',
    timingPath: 'results/full-comparison/crossword-puzzle/pure-claude/timing.json',
  },
];

// ---------------------------------------------------------------------------
// Dimension evaluators
// ---------------------------------------------------------------------------

function evaluateCompleteness(output: any): DimensionResult {
  const results: CheckResult[] = [];

  // Check 1: 15x15 grid present and fully filled
  const grid = output?.output?.grid;
  const hasGrid = Array.isArray(grid) && grid.length === SIZE;
  const allRowsCorrectSize = hasGrid && grid.every((row: any) => Array.isArray(row) && row.length === SIZE);
  const filledCells = hasGrid ? grid.flat().filter((c: string) => c !== '#' && c && c !== '' && c !== '.').length : 0;
  const totalWhiteCells = hasGrid ? grid.flat().filter((c: string) => c !== '#').length : 0;
  const fillPercent = totalWhiteCells > 0 ? (filledCells / totalWhiteCells * 100) : 0;
  results.push({
    check: 'Fully filled 15x15 grid',
    passed: allRowsCorrectSize && fillPercent >= 90,
    detail: hasGrid
      ? `Grid: ${SIZE}x${grid[0]?.length ?? 0}, ${filledCells}/${totalWhiteCells} white cells filled (${fillPercent.toFixed(0)}%)`
      : 'No grid found in output',
  });

  // Check 2: Numbered clue list (across)
  const acrossClues = output?.output?.acrossClues;
  const hasAcross = Array.isArray(acrossClues) && acrossClues.length > 0;
  results.push({
    check: 'Across clue list present',
    passed: hasAcross,
    detail: hasAcross ? `${acrossClues.length} across clues` : 'No across clues found',
  });

  // Check 3: Numbered clue list (down)
  const downClues = output?.output?.downClues;
  const hasDown = Array.isArray(downClues) && downClues.length > 0;
  results.push({
    check: 'Down clue list present',
    passed: hasDown,
    detail: hasDown ? `${downClues.length} down clues` : 'No down clues found',
  });

  // Check 4: Constraint verification report present
  const constraintReport = output?.constraintReport;
  const hasReport = constraintReport && Array.isArray(constraintReport.checks);
  results.push({
    check: 'Constraint verification report present',
    passed: hasReport && constraintReport.checks.length === 5,
    detail: hasReport
      ? `${constraintReport.checks.length} constraints verified`
      : 'No constraint verification report',
  });

  // Check 5: All 5 specific constraints checked
  const constraintIds = new Set((constraintReport?.checks ?? []).map((c: any) => c.id));
  const requiredConstraints = ['dictionary-words', 'min-length', 'rotational-symmetry', 'min-word-count', 'bigram-limit'];
  const allChecked = requiredConstraints.every(id => constraintIds.has(id));
  results.push({
    check: 'All 5 constraints checked',
    passed: allChecked,
    detail: allChecked
      ? 'All 5 required constraints verified'
      : `Missing: ${requiredConstraints.filter(id => !constraintIds.has(id)).join(', ')}`,
  });

  // Check 6: Total word count >= 40
  const totalWords = output?.output?.totalWords ?? 0;
  results.push({
    check: `At least ${MIN_WORDS} words in grid`,
    passed: totalWords >= MIN_WORDS,
    detail: `${totalWords} words in grid (minimum: ${MIN_WORDS})`,
  });

  // Check 7: Grid display present
  const gridDisplay = output?.output?.gridDisplay;
  results.push({
    check: 'Formatted grid display present',
    passed: typeof gridDisplay === 'string' && gridDisplay.length > 100,
    detail: gridDisplay ? `Grid display: ${gridDisplay.split('\n').length} lines` : 'No grid display',
  });

  // Check 8: Dictionary metadata present
  const dictMeta = output?.dictionary;
  results.push({
    check: 'Dictionary metadata included',
    passed: dictMeta && dictMeta.totalWords > 0,
    detail: dictMeta ? `Dictionary: ${dictMeta.totalWords} words` : 'No dictionary metadata',
  });

  return buildDimensionResult('completeness', 25, results);
}

function evaluateOrdering(output: any): DimensionResult {
  const results: CheckResult[] = [];
  const steps = output?.metadata?.processSteps ?? [];

  // Check 1: load-dictionary is first
  results.push({
    check: 'Load dictionary is first step',
    passed: steps[0] === 'load-dictionary',
    detail: steps.length > 0 ? `First step: ${steps[0]}` : 'No process steps recorded',
  });

  // Check 2: generate-skeleton before identify-slots
  const skelIdx = steps.indexOf('generate-skeleton');
  const slotsIdx = steps.indexOf('identify-slots');
  results.push({
    check: 'Generate skeleton before identify slots',
    passed: skelIdx >= 0 && slotsIdx >= 0 && skelIdx < slotsIdx,
    detail: skelIdx >= 0 && slotsIdx >= 0 ? `skeleton@${skelIdx}, slots@${slotsIdx}` : 'Missing steps',
  });

  // Check 3: identify-slots before fill-words
  const fillIdx = steps.indexOf('fill-words');
  results.push({
    check: 'Identify slots before fill words',
    passed: slotsIdx >= 0 && fillIdx >= 0 && slotsIdx < fillIdx,
    detail: slotsIdx >= 0 && fillIdx >= 0 ? `slots@${slotsIdx}, fill@${fillIdx}` : 'Missing steps',
  });

  // Check 4: fill-words before verify-constraints
  const verifyIdx = steps.indexOf('verify-constraints');
  results.push({
    check: 'Fill words before verify constraints',
    passed: fillIdx >= 0 && verifyIdx >= 0 && fillIdx < verifyIdx,
    detail: verifyIdx >= 0 ? `fill@${fillIdx}, verify@${verifyIdx}` : 'Verify step missing — constraints not verified',
  });

  // Check 5: verify-constraints before fix-violations (if fix exists)
  const fixIdx = steps.indexOf('fix-violations');
  const fixAfterVerify = fixIdx >= 0 ? verifyIdx >= 0 && verifyIdx < fixIdx : true; // no fix needed = pass
  results.push({
    check: 'Verify before fix (or no fix needed)',
    passed: fixAfterVerify,
    detail: fixIdx >= 0
      ? `verify@${verifyIdx}, fix@${fixIdx}`
      : 'No fix step (acceptable if constraints pass or skipped)',
  });

  // Check 6: generate-output is last
  const outIdx = steps.indexOf('generate-output');
  results.push({
    check: 'Generate output is last step',
    passed: outIdx === steps.length - 1,
    detail: outIdx >= 0 ? `output@${outIdx} (last: ${steps.length - 1})` : 'No output step',
  });

  // Check 7: Longest-first filling strategy
  const slotDetails = output?.slots?.slotDetails ?? [];
  const lengths = slotDetails.map((s: any) => s.length);
  const isSorted = lengths.every((v: number, i: number) => i === 0 || v <= lengths[i - 1]);
  results.push({
    check: 'Slots processed longest first',
    passed: isSorted && lengths.length > 0,
    detail: isSorted ? `${lengths.length} slots sorted by length descending` : 'Slots not in longest-first order',
  });

  return buildDimensionResult('ordering', 25, results);
}

function evaluateConditionality(output: any): DimensionResult {
  const results: CheckResult[] = [];
  const steps = output?.metadata?.processSteps ?? [];
  const constraintReport = output?.constraintReport;

  // Check 1: Constraint violations detected when present
  const hasViolations = constraintReport?.violations?.length > 0;
  const allPassed = constraintReport?.allPassed === true;
  results.push({
    check: 'Constraint violations correctly detected',
    passed: constraintReport != null && (hasViolations || allPassed),
    detail: constraintReport
      ? (allPassed ? 'All constraints pass' : `${constraintReport.violations.length} violations detected`)
      : 'No constraint evaluation performed',
  });

  // Check 2: Fix path triggered only when violations exist
  const hasFixStep = steps.includes('fix-violations');
  results.push({
    check: 'Fix path triggered correctly',
    passed: (hasViolations && hasFixStep) || (allPassed && !hasFixStep) || (!constraintReport),
    detail: hasFixStep
      ? 'Fix step executed (violations existed)'
      : allPassed
        ? 'No fix needed (all constraints pass)'
        : 'Fix step missing despite violations',
  });

  // Check 3: Backtracking triggered when no valid word fits
  const backtrackCount = output?.filling?.backtrackCount ?? 0;
  results.push({
    check: 'Backtracking triggered when needed',
    passed: backtrackCount > 0,
    detail: `${backtrackCount} backtracks performed during filling`,
  });

  // Check 4: Each constraint individually evaluated (not just pass/fail)
  const checks = constraintReport?.checks ?? [];
  const hasIndividualResults = checks.every((c: any) => c.id && typeof c.passed === 'boolean' && c.detail);
  results.push({
    check: 'Individual constraint evaluation',
    passed: hasIndividualResults && checks.length >= 5,
    detail: hasIndividualResults
      ? `${checks.length} constraints individually evaluated with pass/fail and detail`
      : 'Constraints not individually evaluated',
  });

  return buildDimensionResult('conditionality', 25, results);
}

function evaluateErrorHandling(output: any): DimensionResult {
  const results: CheckResult[] = [];

  // Check 1: Region clearing attempted on backtracking exhaustion
  const regionClearCount = output?.filling?.regionClearCount ?? 0;
  results.push({
    check: 'Region clearing on exhaustion',
    passed: regionClearCount > 0,
    detail: `${regionClearCount} region clear(s) performed`,
  });

  // Check 2: Grid filling succeeded despite backtracking
  const success = output?.filling?.success === true;
  const totalWords = output?.filling?.totalWordsPlaced ?? 0;
  results.push({
    check: 'Grid filling completed successfully',
    passed: success && totalWords >= MIN_WORDS,
    detail: success
      ? `Successfully placed ${totalWords} words`
      : `Filling failed (${totalWords} words placed)`,
  });

  // Check 3: Constraint verification included repair attempt
  const steps = output?.metadata?.processSteps ?? [];
  const hasVerifyAndFix = steps.includes('verify-constraints') && steps.includes('fix-violations');
  results.push({
    check: 'Verification + repair cycle executed',
    passed: hasVerifyAndFix,
    detail: hasVerifyAndFix
      ? 'Full verify → repair → re-verify cycle performed'
      : 'Incomplete verification/repair cycle',
  });

  // Check 4: Output produced despite constraint failures
  const hasOutput = output?.output?.grid != null && output?.output?.acrossClues != null;
  results.push({
    check: 'Output produced despite any failures',
    passed: hasOutput,
    detail: hasOutput
      ? 'Complete output generated regardless of constraint failures'
      : 'Output missing or incomplete',
  });

  return buildDimensionResult('errorHandling', 25, results);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function buildDimensionResult(dimension: string, weight: number, results: CheckResult[]): DimensionResult {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  const evidence = results
    .map(r => `[${r.passed ? 'PASS' : 'FAIL'}] ${r.check}: ${r.detail}`)
    .join('\n');

  const deductions = results
    .filter(r => !r.passed)
    .map(r => `${r.check}: ${r.detail}`);

  return { dimension, score, weight, applicable: true, checks: results, evidence, deductions };
}

function computeWeightedScore(dimensions: DimensionResult[]): number {
  const applicable = dimensions.filter(d => d.applicable);
  if (applicable.length === 0) return 0;
  const totalWeight = applicable.reduce((s, d) => s + d.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(applicable.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight * 100) / 100;
}

// ---------------------------------------------------------------------------
// Run the judge
// ---------------------------------------------------------------------------

console.log('='.repeat(70));
console.log('  OBEDIENCE BENCHMARK JUDGE — Crossword Puzzle');
console.log('='.repeat(70));

for (const agent of agents) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Judging: ${agent.label} (${agent.id})`);
  console.log(`${'─'.repeat(60)}`);

  let raw: any;
  try {
    raw = JSON.parse(readFileSync(agent.outputPath, 'utf-8'));
  } catch (e) {
    console.error(`  ERROR: Could not read ${agent.outputPath}`);
    continue;
  }

  const completeness = evaluateCompleteness(raw);
  const ordering = evaluateOrdering(raw);
  const conditionality = evaluateConditionality(raw);
  const errorHandling = evaluateErrorHandling(raw);

  const allDims = [completeness, ordering, conditionality, errorHandling];
  const weightedScore = computeWeightedScore(allDims);

  for (const dim of allDims) {
    console.log(`\n  ${dim.dimension.toUpperCase()} (${dim.score}/100, weight ${dim.weight}):`);
    for (const check of dim.checks) {
      console.log(`    ${check.passed ? 'PASS' : 'FAIL'} ${check.check}`);
      console.log(`         ${check.detail}`);
    }
  }

  console.log(`\n  WEIGHTED SCORE: ${weightedScore}/100`);

  // Read timing
  let durationMs: number | undefined;
  try {
    const timing = JSON.parse(readFileSync(agent.timingPath, 'utf-8'));
    durationMs = timing.durationMs;
    console.log(`  Duration: ${(durationMs! / 1000).toFixed(1)}s (${(durationMs! / 60000).toFixed(1)}m)`);
  } catch {}

  // Write scorecard
  const scorecard: JudgeScorecardOutput = {
    taskName: TASK_NAME,
    agentId: agent.id,
    weightedScore,
    durationMs,
    dimensions: {},
  };

  for (const dim of allDims) {
    scorecard.dimensions[dim.dimension] = {
      score: dim.score,
      evidence: dim.evidence,
      deductions: dim.deductions,
    };
  }

  const scorecardDir = agent.outputPath.includes('babysitter')
    ? 'results/full-comparison/crossword-puzzle/babysitter'
    : 'results/full-comparison/crossword-puzzle/pure-claude';
  mkdirSync(scorecardDir, { recursive: true });

  const scorecardPath = join(scorecardDir, 'scorecard.json');
  writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2), 'utf-8');
  console.log(`  Scorecard written to: ${scorecardPath}`);
}

console.log(`\n${'='.repeat(70)}`);
console.log('  Judge complete.');
console.log('='.repeat(70));
