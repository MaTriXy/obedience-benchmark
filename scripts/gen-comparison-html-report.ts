/**
 * Generate comparison HTML reports from judge-produced scorecards.
 *
 * Reads task definitions from the catalog (task.yaml) for evaluation criteria,
 * descriptions, and prescribed steps. Reads scorecards produced by judge-outputs.ts.
 *
 * Produces:
 *   - results/full-comparison/<taskName>/comparison-report.html
 *   - results/full-comparison/pure-claude/report.html
 *   - results/full-comparison/babysitter/report.html
 *   - results/full-comparison/index.html
 *   - results/full-comparison/comparison-report.html (compat copy)
 *
 * Run with: npx tsx scripts/gen-comparison-html-report.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type {
  ObedienceDimension,
  ObedienceScorecard,
  DimensionScore,
  BenchmarkReport,
} from '../plugin/skills/obedience-types/scripts/types.js';
import { ALL_DIMENSIONS } from '../plugin/skills/obedience-types/scripts/types.js';
import { renderHtmlReport, renderIndexHtml } from '../plugin/skills/report-generator/scripts/html-report.js';
import type { HtmlReportOptions, IndexEntry } from '../plugin/skills/report-generator/scripts/html-report.js';

// ---------------------------------------------------------------------------
// Task registry — maps task names to their catalog paths
// ---------------------------------------------------------------------------

interface TaskRegistry {
  taskName: string;
  yamlPath: string;
  resultsDir: string; // e.g. results/full-comparison
}

const TASKS: TaskRegistry[] = [
  {
    taskName: 'countries-cities-attractions',
    yamlPath: 'plugin/skills/catalog-manager/benchmarks/full/countries-cities-attractions/task.yaml',
    resultsDir: 'results/full-comparison',
  },
];

// ---------------------------------------------------------------------------
// Load task definition from catalog
// ---------------------------------------------------------------------------

interface TaskDef {
  name: string;
  domain: string;
  complexity: string;
  description: string;
  weights: Record<ObedienceDimension, number>;
  prescribedSteps: string[];
  evaluationCriteria: Record<string, { weight: number; criteria: string }>;
  scoringNotes?: string;
}

function loadTaskDef(yamlPath: string): TaskDef {
  const raw = parseYaml(readFileSync(yamlPath, 'utf-8'));

  const dims = raw.evaluation?.dimensions ?? {};
  const weights = {} as Record<ObedienceDimension, number>;
  const evaluationCriteria: Record<string, { weight: number; criteria: string }> = {};

  for (const dim of ALL_DIMENSIONS) {
    const d = dims[dim];
    weights[dim] = d?.weight ?? 0;
    if (d && !d.notApplicable && d.weight > 0) {
      const checksText = Array.isArray(d.checks) ? d.checks.join(' | ') : '';
      evaluationCriteria[dim] = { weight: d.weight, criteria: checksText };
    }
  }

  // Extract prescribed steps from checks + description
  const prescribedSteps: string[] = [];
  // Completeness checks describe what should exist (= what steps produce)
  if (dims.completeness?.checks) {
    for (const check of dims.completeness.checks) {
      prescribedSteps.push(check);
    }
  }

  return {
    name: raw.metadata?.name ?? raw.name,
    domain: raw.metadata?.domain ?? raw.domain ?? 'unknown',
    complexity: raw.metadata?.complexity ?? raw.complexity ?? 'unknown',
    description: raw.description ?? '',
    weights,
    prescribedSteps,
    evaluationCriteria,
    scoringNotes: raw.evaluation?.scoringNotes,
  };
}

// ---------------------------------------------------------------------------
// Convert judge scorecard JSON to ObedienceScorecard type
// ---------------------------------------------------------------------------

function toObedienceScorecard(card: any, weights: Record<ObedienceDimension, number>): ObedienceScorecard {
  const dimensions = {} as Record<ObedienceDimension, DimensionScore>;

  for (const dim of ALL_DIMENSIONS) {
    const cardDim = card.dimensions?.[dim];
    const weight = weights[dim];
    const applicable = weight > 0;

    dimensions[dim] = {
      dimension: dim,
      score: applicable && cardDim ? cardDim.score : 0,
      weight,
      maxScore: 100,
      applicable,
      evidence: applicable && cardDim?.evidence ? [cardDim.evidence] : [],
      deductions: applicable && cardDim?.deductions
        ? cardDim.deductions.map((d: string) => ({
            reason: d,
            points: Math.round(100 / Math.max(1, cardDim.deductions.length)),
            evidence: [],
          }))
        : [],
    };
  }

  const applicableDims = ALL_DIMENSIONS.filter(d => dimensions[d].applicable);
  const rawScore = applicableDims.length > 0
    ? Math.round(applicableDims.reduce((s, d) => s + dimensions[d].score, 0) / applicableDims.length)
    : 0;

  return {
    runId: 'full-comparison',
    taskName: card.taskName,
    agentId: card.agentId,
    timestamp: new Date().toISOString(),
    dimensions,
    weightedScore: card.weightedScore,
    rawScore,
    prescribedTasks: [],
    observedSteps: [],
    metadata: {
      judgeDurationMs: 500,
      processStepCount: Object.keys(card.dimensions ?? {}).length,
      observedStepCount: Object.keys(card.dimensions ?? {}).length,
      logLineCount: 0,
      logEventCount: 0,
      judgeVersion: '2.0.0',
    },
  };
}

// ---------------------------------------------------------------------------
// Build BenchmarkReport
// ---------------------------------------------------------------------------

function buildReport(sc: ObedienceScorecard, title: string, taskDef: TaskDef, durationMs: number = 0): BenchmarkReport {
  const dimensionAnalysis = {} as BenchmarkReport['dimensionAnalysis'];
  for (const dim of ALL_DIMENSIONS) {
    const ds = sc.dimensions[dim];
    dimensionAnalysis[dim] = {
      averageScore: ds.applicable ? ds.score : 0,
      taskScores: { [sc.taskName]: ds.applicable ? ds.score : 0 },
      commonIssues: ds.deductions.map(d => d.reason),
    };
  }

  const applicableDims = ALL_DIMENSIONS.filter(d => sc.dimensions[d].applicable);
  let strongestDimension: ObedienceDimension = applicableDims[0] ?? 'completeness';
  let weakestDimension: ObedienceDimension = applicableDims[0] ?? 'completeness';
  let highestAvg = -1, lowestAvg = Infinity;
  for (const dim of applicableDims) {
    const avg = dimensionAnalysis[dim].averageScore;
    if (avg > highestAvg) { highestAvg = avg; strongestDimension = dim; }
    if (avg < lowestAvg) { lowestAvg = avg; weakestDimension = dim; }
  }
  if (lowestAvg === Infinity) weakestDimension = strongestDimension;

  return {
    title,
    generatedAt: new Date().toISOString(),
    runId: 'full-comparison',
    agentId: sc.agentId,
    summary: {
      overallScore: Math.round(sc.weightedScore),
      tasksCompleted: 1,
      tasksFailed: 0,
      totalDurationMs: durationMs,
      strongestDimension,
      weakestDimension,
    },
    taskDetails: [{
      taskName: sc.taskName,
      domain: taskDef.domain,
      complexity: taskDef.complexity,
      scorecard: sc,
      highlights: ALL_DIMENSIONS
        .filter(d => sc.dimensions[d].applicable && sc.dimensions[d].score >= 80)
        .map(d => `${d}: ${sc.dimensions[d].score}/100`),
      issues: ALL_DIMENSIONS
        .filter(d => sc.dimensions[d].applicable && sc.dimensions[d].score < 80)
        .map(d => `${d}: ${sc.dimensions[d].score}/100`),
    }],
    dimensionAnalysis,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const indexEntries: IndexEntry[] = [];

for (const taskReg of TASKS) {
  console.log(`\nProcessing task: ${taskReg.taskName}`);
  console.log(`  Task definition: ${taskReg.yamlPath}`);

  // Load task definition from catalog
  const taskDef = loadTaskDef(taskReg.yamlPath);
  console.log(`  Domain: ${taskDef.domain}, Complexity: ${taskDef.complexity}`);
  console.log(`  Weights: ${ALL_DIMENSIONS.filter(d => taskDef.weights[d] > 0).map(d => `${d}=${taskDef.weights[d]}`).join(', ')}`);

  // Load scorecards (produced by judge-outputs.ts)
  const pcCardPath = join(taskReg.resultsDir, 'pure-claude', 'scorecard.json');
  const bsCardPath = join(taskReg.resultsDir, 'babysitter', 'scorecard.json');

  if (!existsSync(pcCardPath) || !existsSync(bsCardPath)) {
    console.warn(`  SKIP: scorecard files not found. Run judge-outputs.ts first.`);
    continue;
  }

  const pureClaudeCard = JSON.parse(readFileSync(pcCardPath, 'utf-8'));
  const babysitterCard = JSON.parse(readFileSync(bsCardPath, 'utf-8'));

  // Read timing data from scorecards (populated by judge)
  const babysitterDurationMs: number = babysitterCard.durationMs ?? 0;
  const pureClaudeDurationMs: number = pureClaudeCard.durationMs ?? 0;

  // Load agent outputs for comparison display
  let pureClaudeOutput: unknown = null;
  let babysitterOutput: unknown = null;
  try { pureClaudeOutput = JSON.parse(readFileSync(join(taskReg.resultsDir, 'pure-claude', 'output', 'report.json'), 'utf-8')); } catch {}
  try { babysitterOutput = JSON.parse(readFileSync(join(taskReg.resultsDir, 'babysitter', 'output', 'report.json'), 'utf-8')); } catch {}

  // Convert to typed scorecards
  const pureClaudeSc = toObedienceScorecard(pureClaudeCard, taskDef.weights);
  const babysitterSc = toObedienceScorecard(babysitterCard, taskDef.weights);

  // Build reports
  const pureClaudeReport = buildReport(pureClaudeSc, `Pure Claude Code — ${taskDef.name}`, taskDef, pureClaudeDurationMs);
  const babysitterReport = buildReport(babysitterSc, `Babysitter-Style — ${taskDef.name}`, taskDef, babysitterDurationMs);

  // Build rich HTML options from task definition
  const reportOptions: HtmlReportOptions = {
    compareWith: pureClaudeReport,
    title: `Obedience Benchmark — Babysitter-Style vs Pure Claude (Baseline) — ${taskDef.name}`,
    taskDescriptions: { [taskDef.name]: taskDef.description + (taskDef.scoringNotes ? '\n\nScoring notes: ' + taskDef.scoringNotes : '') },
    prescribedSteps: { [taskDef.name]: taskDef.prescribedSteps },
    evaluationCriteria: { [taskDef.name]: taskDef.evaluationCriteria },
    agentOutputSamples: babysitterOutput ? { [taskDef.name]: babysitterOutput } : undefined,
    baselineOutputSamples: pureClaudeOutput ? { [taskDef.name]: pureClaudeOutput } : undefined,
  };

  const htmlComparison = renderHtmlReport(babysitterReport, reportOptions);

  // Write outputs
  const outDir = taskReg.resultsDir;
  const taskOutDir = join(outDir, taskDef.name);
  mkdirSync(taskOutDir, { recursive: true });
  mkdirSync(join(outDir, 'pure-claude'), { recursive: true });
  mkdirSync(join(outDir, 'babysitter'), { recursive: true });

  writeFileSync(join(taskOutDir, 'comparison-report.html'), htmlComparison, 'utf-8');
  writeFileSync(join(outDir, 'comparison-report.html'), htmlComparison, 'utf-8');

  const individualOpts = (desc: string, output: unknown): HtmlReportOptions => ({
    taskDescriptions: { [taskDef.name]: desc },
    prescribedSteps: { [taskDef.name]: taskDef.prescribedSteps },
    evaluationCriteria: { [taskDef.name]: taskDef.evaluationCriteria },
    agentOutputSamples: output ? { [taskDef.name]: output } : undefined,
  });

  writeFileSync(join(outDir, 'pure-claude', 'report.html'),
    renderHtmlReport(pureClaudeReport, individualOpts(taskDef.description, pureClaudeOutput)), 'utf-8');
  writeFileSync(join(outDir, 'babysitter', 'report.html'),
    renderHtmlReport(babysitterReport, individualOpts(taskDef.description, babysitterOutput)), 'utf-8');

  console.log(`  Reports written to: ${taskOutDir}/`);

  indexEntries.push({
    taskName: taskDef.name,
    domain: taskDef.domain,
    complexity: taskDef.complexity,
    primaryScore: babysitterCard.weightedScore,
    baselineScore: pureClaudeCard.weightedScore,
    delta: Math.round((babysitterCard.weightedScore - pureClaudeCard.weightedScore) * 100) / 100,
    reportUrl: `${taskDef.name}/comparison-report.html`,
  });
}

// ---------------------------------------------------------------------------
// Generate aggregate index
// ---------------------------------------------------------------------------

if (indexEntries.length > 0) {
  const outDir = TASKS[0].resultsDir;
  const overallPrimary = Math.round(indexEntries.reduce((s, e) => s + e.primaryScore, 0) / indexEntries.length);
  const overallBaseline = Math.round(indexEntries.reduce((s, e) => s + (e.baselineScore ?? 0), 0) / indexEntries.length);

  writeFileSync(join(outDir, 'index.html'), renderIndexHtml(indexEntries, {
    title: 'Obedience Benchmark — Full Comparison Index',
    primaryAgentId: 'babysitter-orchestrated',
    baselineAgentId: 'pure-claude-code',
    overallPrimaryScore: overallPrimary,
    overallBaselineScore: overallBaseline,
    generatedAt: new Date().toISOString(),
  }), 'utf-8');

  // Console summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  COMPARISON SUMMARY');
  console.log('='.repeat(60));
  for (const e of indexEntries) {
    console.log(`  ${e.taskName}: Babysitter ${e.primaryScore} | Pure Claude ${e.baselineScore} | Delta ${e.delta! >= 0 ? '+' : ''}${e.delta}`);
  }
  console.log(`  Overall: Babysitter ${overallPrimary} | Pure Claude ${overallBaseline} | Delta ${overallPrimary - overallBaseline >= 0 ? '+' : ''}${overallPrimary - overallBaseline}`);
  console.log('='.repeat(60));
}
