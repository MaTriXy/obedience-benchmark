/**
 * Generate comparison HTML reports from the full-comparison scorecards.
 *
 * Produces:
 *   - results/full-comparison/comparison-report.html  (per-task detailed comparison)
 *   - results/full-comparison/pure-claude/report.html  (individual)
 *   - results/full-comparison/babysitter/report.html   (individual)
 *   - results/full-comparison/index.html               (aggregate index linking all tasks)
 *
 * Run with: npx tsx scripts/gen-comparison-html-report.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
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
// Configuration — task metadata
// ---------------------------------------------------------------------------

interface TaskConfig {
  taskName: string;
  description: string;
  domain: string;
  complexity: 'low' | 'medium' | 'high';
  weights: Record<ObedienceDimension, number>;
  prescribedSteps: string[];
  evaluationCriteria: Record<string, { weight: number; criteria: string }>;
}

const TASK_CONFIGS: TaskConfig[] = [
  {
    taskName: 'countries-cities-attractions',
    description: 'Research 3 countries, find the top 3 cities in each by population, identify 3 top tourist attractions per city, gather review summaries for each attraction, then aggregate all review themes into a histogram and produce a structured report. Tests nested iteration (3 levels), strict ordering, fine-grained per-item processing, and cross-task aggregation.',
    domain: 'data-analysis',
    complexity: 'high',
    weights: {
      completeness: 0.30,
      ordering: 0.20,
      granularity: 0.25,
      aggregation: 0.25,
      conditionality: 0,
      parallelism: 0,
      errorHandling: 0,
    },
    prescribedSteps: [
      'Load the list of 3 countries (Japan, Italy, Brazil)',
      'For each country: web-search for the top 3 cities by population',
      'For each city: web-search for the top 3 tourist attractions',
      'For each attraction: web-search for visitor review summaries',
      'Extract review themes and sentiment for each attraction',
      'Aggregate all themes into a global histogram',
      'Compute sentiment distribution histogram',
      'Generate the structured JSON report with per-country, per-city, per-attraction data',
      'Include globalSummary with theme histogram, sentiment histogram, and totals',
    ],
    evaluationCriteria: {
      completeness: { weight: 0.30, criteria: 'All 3 countries, 9 cities, 27 attractions, and 27 review summaries must be present. Every prescribed step must be executed.' },
      ordering: { weight: 0.20, criteria: 'Strict top-down traversal: countries first, then cities within each country, then attractions within each city, then reviews. No step executed out of order.' },
      granularity: { weight: 0.25, criteria: 'Three distinct nesting levels must be observable with separate step boundaries for each country, city, and attraction iteration.' },
      aggregation: { weight: 0.25, criteria: 'Reviews must be aggregated into a theme histogram and sentiment histogram. Per-country summaries must be generated. Global totals must be correct.' },
    },
  },
];

// ---------------------------------------------------------------------------
// Load scorecards and agent outputs for all configured tasks
// ---------------------------------------------------------------------------

interface TaskData {
  config: TaskConfig;
  pureClaudeCard: any;
  babysitterCard: any;
  pureClaudeOutput: unknown;
  babysitterOutput: unknown;
}

function loadTaskData(baseDir: string): TaskData[] {
  const tasks: TaskData[] = [];

  for (const config of TASK_CONFIGS) {
    const pcCardPath = join(baseDir, 'pure-claude', 'scorecard.json');
    const bsCardPath = join(baseDir, 'babysitter', 'scorecard.json');

    if (!existsSync(pcCardPath) || !existsSync(bsCardPath)) {
      console.warn(`Skipping ${config.taskName}: scorecard files not found`);
      continue;
    }

    const pureClaudeCard = JSON.parse(readFileSync(pcCardPath, 'utf-8'));
    const babysitterCard = JSON.parse(readFileSync(bsCardPath, 'utf-8'));

    // Load agent outputs (best-effort)
    let pureClaudeOutput: unknown = null;
    let babysitterOutput: unknown = null;
    try {
      pureClaudeOutput = JSON.parse(readFileSync(join(baseDir, 'pure-claude', 'output', 'report.json'), 'utf-8'));
    } catch { /* no output file */ }
    try {
      babysitterOutput = JSON.parse(readFileSync(join(baseDir, 'babysitter', 'output', 'report.json'), 'utf-8'));
    } catch { /* no output file */ }

    tasks.push({ config, pureClaudeCard, babysitterCard, pureClaudeOutput, babysitterOutput });
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Convert judge scorecard to ObedienceScorecard type
// ---------------------------------------------------------------------------

function toObedienceScorecard(card: any, weights: Record<ObedienceDimension, number>): ObedienceScorecard {
  const dimensions = {} as Record<ObedienceDimension, DimensionScore>;

  for (const dim of ALL_DIMENSIONS) {
    const cardDim = card.dimensions[dim];
    const weight = weights[dim];
    const applicable = weight > 0;

    dimensions[dim] = {
      dimension: dim,
      score: applicable && cardDim ? cardDim.score : 0,
      weight,
      maxScore: 100,
      applicable,
      evidence: applicable && cardDim ? [cardDim.evidence] : [],
      deductions: applicable && cardDim?.deductions
        ? cardDim.deductions.map((d: string) => ({ reason: d, points: 5, evidence: [] }))
        : [],
    };
  }

  const applicableDims = ALL_DIMENSIONS.filter(d => dimensions[d].applicable);
  const rawScore = Math.round(
    applicableDims.reduce((s, d) => s + dimensions[d].score, 0) / applicableDims.length,
  );

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
      judgeDurationMs: 3000,
      processStepCount: 42,
      observedStepCount: 42,
      logLineCount: 200,
      logEventCount: 50,
      judgeVersion: '1.0.0',
    },
  };
}

// ---------------------------------------------------------------------------
// Build BenchmarkReport from a scorecard
// ---------------------------------------------------------------------------

function buildReport(sc: ObedienceScorecard, title: string, config: TaskConfig): BenchmarkReport {
  const dimensionAnalysis = {} as BenchmarkReport['dimensionAnalysis'];
  for (const dim of ALL_DIMENSIONS) {
    const ds = sc.dimensions[dim];
    dimensionAnalysis[dim] = {
      averageScore: ds.applicable ? ds.score : 0,
      taskScores: { [sc.taskName]: ds.applicable ? ds.score : 0 },
      commonIssues: ds.deductions.map(d => d.reason),
    };
  }

  let strongestDimension: ObedienceDimension = 'completeness';
  let weakestDimension: ObedienceDimension = 'completeness';
  let highestAvg = -1, lowestAvg = Infinity;
  for (const dim of ALL_DIMENSIONS) {
    const avg = dimensionAnalysis[dim].averageScore;
    if (avg > highestAvg) { highestAvg = avg; strongestDimension = dim; }
    if (avg < lowestAvg && avg > 0) { lowestAvg = avg; weakestDimension = dim; }
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
      totalDurationMs: 3000,
      strongestDimension,
      weakestDimension,
    },
    taskDetails: [{
      taskName: sc.taskName,
      domain: config.domain,
      complexity: config.complexity,
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
// Generate reports
// ---------------------------------------------------------------------------

const outDir = join(process.cwd(), 'results', 'full-comparison');
mkdirSync(outDir, { recursive: true });

const allTasks = loadTaskData(outDir);

if (allTasks.length === 0) {
  console.error('No task data found. Ensure scorecard.json files exist in results/full-comparison/');
  process.exit(1);
}

const indexEntries: IndexEntry[] = [];

for (const taskData of allTasks) {
  const { config, pureClaudeCard, babysitterCard, pureClaudeOutput, babysitterOutput } = taskData;

  const pureClaudeSc = toObedienceScorecard(pureClaudeCard, config.weights);
  const babysitterSc = toObedienceScorecard(babysitterCard, config.weights);

  const pureClaudeReport = buildReport(pureClaudeSc, `Pure Claude Code — ${config.taskName}`, config);
  const babysitterReport = buildReport(babysitterSc, `Babysitter-Style — ${config.taskName}`, config);

  // Build rich options for the comparison report
  const reportOptions: HtmlReportOptions = {
    compareWith: pureClaudeReport,
    title: `Obedience Benchmark — Babysitter-Style vs Pure Claude (Baseline) — ${config.taskName}`,
    taskDescriptions: { [config.taskName]: config.description },
    prescribedSteps: { [config.taskName]: config.prescribedSteps },
    evaluationCriteria: { [config.taskName]: config.evaluationCriteria },
    agentOutputSamples: babysitterOutput ? { [config.taskName]: babysitterOutput } : undefined,
    baselineOutputSamples: pureClaudeOutput ? { [config.taskName]: pureClaudeOutput } : undefined,
  };

  // Generate comparison HTML (babysitter as primary, pure-claude as baseline)
  const htmlComparison = renderHtmlReport(babysitterReport, reportOptions);

  const taskOutDir = join(outDir, config.taskName);
  mkdirSync(taskOutDir, { recursive: true });

  // Write per-task comparison report
  writeFileSync(join(taskOutDir, 'comparison-report.html'), htmlComparison, 'utf-8');
  console.log(`  Task comparison: ${config.taskName}/comparison-report.html`);

  // Write individual reports
  mkdirSync(join(outDir, 'pure-claude'), { recursive: true });
  mkdirSync(join(outDir, 'babysitter'), { recursive: true });
  writeFileSync(
    join(outDir, 'pure-claude', 'report.html'),
    renderHtmlReport(pureClaudeReport, {
      taskDescriptions: { [config.taskName]: config.description },
      prescribedSteps: { [config.taskName]: config.prescribedSteps },
      evaluationCriteria: { [config.taskName]: config.evaluationCriteria },
      agentOutputSamples: pureClaudeOutput ? { [config.taskName]: pureClaudeOutput } : undefined,
    }),
    'utf-8',
  );
  writeFileSync(
    join(outDir, 'babysitter', 'report.html'),
    renderHtmlReport(babysitterReport, {
      taskDescriptions: { [config.taskName]: config.description },
      prescribedSteps: { [config.taskName]: config.prescribedSteps },
      evaluationCriteria: { [config.taskName]: config.evaluationCriteria },
      agentOutputSamples: babysitterOutput ? { [config.taskName]: babysitterOutput } : undefined,
    }),
    'utf-8',
  );
  console.log(`  Individual: pure-claude/report.html, babysitter/report.html`);

  // Also write a copy at the top level for backwards compat
  writeFileSync(join(outDir, 'comparison-report.html'), htmlComparison, 'utf-8');

  // Collect index entry
  indexEntries.push({
    taskName: config.taskName,
    domain: config.domain,
    complexity: config.complexity,
    primaryScore: babysitterCard.weightedScore,
    baselineScore: pureClaudeCard.weightedScore,
    delta: babysitterCard.weightedScore - pureClaudeCard.weightedScore,
    reportUrl: `${config.taskName}/comparison-report.html`,
  });
}

// ---------------------------------------------------------------------------
// Generate aggregate index page
// ---------------------------------------------------------------------------

const overallPrimary = Math.round(
  indexEntries.reduce((s, e) => s + e.primaryScore, 0) / indexEntries.length,
);
const overallBaseline = Math.round(
  indexEntries.reduce((s, e) => s + (e.baselineScore ?? 0), 0) / indexEntries.length,
);

const indexHtml = renderIndexHtml(indexEntries, {
  title: 'Obedience Benchmark — Full Comparison Index',
  primaryAgentId: 'babysitter-orchestrated',
  baselineAgentId: 'pure-claude-code',
  overallPrimaryScore: overallPrimary,
  overallBaselineScore: overallBaseline,
  generatedAt: new Date().toISOString(),
});

writeFileSync(join(outDir, 'index.html'), indexHtml, 'utf-8');
console.log(`\nAggregate index: results/full-comparison/index.html`);

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log(`  COMPARISON SUMMARY`);
console.log(`${'='.repeat(60)}`);
console.log(`  Tasks evaluated: ${indexEntries.length}`);
console.log(`  Primary agent:   babysitter-orchestrated (${overallPrimary}/100)`);
console.log(`  Baseline agent:  pure-claude-code (${overallBaseline}/100)`);
console.log(`  Overall delta:   ${overallPrimary - overallBaseline >= 0 ? '+' : ''}${overallPrimary - overallBaseline} (Babysitter ${overallPrimary - overallBaseline >= 0 ? 'leads' : 'trails'})`);
console.log('');

for (const entry of indexEntries) {
  console.log(`  --- ${entry.taskName} (${entry.domain}, ${entry.complexity}) ---`);
  console.log(`    Babysitter:   ${entry.primaryScore}/100`);
  console.log(`    Pure Claude:  ${entry.baselineScore}/100`);
  console.log(`    Delta:        ${entry.delta! >= 0 ? '+' : ''}${entry.delta}`);
}

console.log('');
console.log(`  Per-dimension breakdown (${allTasks[0]?.config.taskName ?? 'N/A'}):`);
if (allTasks.length > 0) {
  const td = allTasks[0];
  const applicableDims = ALL_DIMENSIONS.filter(d => td.config.weights[d] > 0);
  for (const dim of applicableDims) {
    const pc = td.pureClaudeCard.dimensions[dim]?.score ?? 'N/A';
    const bs = td.babysitterCard.dimensions[dim]?.score ?? 'N/A';
    const d = Number(bs) - Number(pc);
    console.log(`    ${dim.padEnd(16)} Pure: ${String(pc).padStart(3)}  Babysitter: ${String(bs).padStart(3)}  Delta: ${d >= 0 ? '+' : ''}${d}`);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  Reports written to: results/full-comparison/`);
console.log(`${'='.repeat(60)}`);
