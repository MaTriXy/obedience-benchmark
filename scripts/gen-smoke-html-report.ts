/**
 * Generate an HTML report from the smoke test scorecard data.
 * Run with: npx tsx scripts/gen-smoke-html-report.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// We'll manually construct the BenchmarkReport from the smoke test scores
// since we scored those manually in the scorecard.md.

import type {
  ObedienceDimension,
  ObedienceScorecard,
  DimensionScore,
  BenchmarkReport,
} from '../plugin/skills/obedience-types/scripts/types.js';
import { ALL_DIMENSIONS } from '../plugin/skills/obedience-types/scripts/types.js';
import { renderHtmlReport } from '../plugin/skills/report-generator/scripts/html-report.js';

// ---------------------------------------------------------------------------
// Build mock scorecards from the smoke test results
// ---------------------------------------------------------------------------

function makeDimScore(dim: ObedienceDimension, score: number, weight: number, applicable: boolean): DimensionScore {
  return {
    dimension: dim,
    score,
    weight,
    maxScore: 100,
    applicable,
    evidence: applicable ? [`Score: ${score}/100`] : [],
    deductions: score < 100 && applicable
      ? [{ reason: `Minor deduction in ${dim}`, points: 100 - score, evidence: [] }]
      : [],
  };
}

function buildScorecard(
  taskName: string,
  dimScores: Partial<Record<ObedienceDimension, { score: number; weight: number }>>,
  weightedScore: number,
): ObedienceScorecard {
  const dimensions = {} as Record<ObedienceDimension, DimensionScore>;
  for (const dim of ALL_DIMENSIONS) {
    const ds = dimScores[dim];
    if (ds) {
      dimensions[dim] = makeDimScore(dim, ds.score, ds.weight, true);
    } else {
      dimensions[dim] = makeDimScore(dim, 0, 0, false);
    }
  }

  const applicableScores = Object.values(dimScores).map(d => d!.score);
  const rawScore = Math.round(applicableScores.reduce((a, b) => a + b, 0) / applicableScores.length);

  return {
    runId: 'smoke-run-001',
    taskName,
    agentId: 'claude-opus-4-6',
    timestamp: '2026-03-07T12:00:00Z',
    dimensions,
    weightedScore,
    rawScore,
    prescribedTasks: [],
    observedSteps: [],
    metadata: {
      judgeDurationMs: 2000,
      processStepCount: Object.keys(dimScores).length,
      observedStepCount: Object.keys(dimScores).length,
      logLineCount: 50,
      logEventCount: 20,
      judgeVersion: '1.0.0',
    },
  };
}

// Smoke test 1: hello-world — completeness: 100, ordering: 100 → weighted 100.0
const helloWorld = buildScorecard('hello-world', {
  completeness: { score: 100, weight: 0.5 },
  ordering: { score: 100, weight: 0.5 },
}, 100.0);

// Smoke test 2: parallel-sum — completeness: 100, parallelism: 100, aggregation: 100 → weighted 100.0
const parallelSum = buildScorecard('parallel-sum', {
  completeness: { score: 100, weight: 0.34 },
  parallelism: { score: 100, weight: 0.33 },
  aggregation: { score: 100, weight: 0.33 },
}, 100.0);

// Smoke test 3: conditional-skip — completeness: 100, conditionality: 100, errorHandling: 95 → weighted 98.5
const conditionalSkip = buildScorecard('conditional-skip', {
  completeness: { score: 100, weight: 0.34 },
  conditionality: { score: 100, weight: 0.33 },
  errorHandling: { score: 95, weight: 0.33 },
}, 98.5);

const scorecards = [helloWorld, parallelSum, conditionalSkip];

// ---------------------------------------------------------------------------
// Build the BenchmarkReport
// ---------------------------------------------------------------------------

function buildDimensionAnalysis(scs: ObedienceScorecard[]): BenchmarkReport['dimensionAnalysis'] {
  const analysis = {} as BenchmarkReport['dimensionAnalysis'];
  for (const dim of ALL_DIMENSIONS) {
    const taskScores: Record<string, number> = {};
    const allReasons: string[] = [];
    let total = 0, count = 0;
    for (const sc of scs) {
      const ds = sc.dimensions[dim];
      if (!ds.applicable) continue;
      taskScores[sc.taskName] = ds.score;
      total += ds.score;
      count++;
      for (const ded of ds.deductions) allReasons.push(ded.reason);
    }
    analysis[dim] = {
      averageScore: count > 0 ? Math.round(total / count) : 0,
      taskScores,
      commonIssues: allReasons.slice(0, 3),
    };
  }
  return analysis;
}

const dimensionAnalysis = buildDimensionAnalysis(scorecards);

let strongestDimension: ObedienceDimension = ALL_DIMENSIONS[0];
let weakestDimension: ObedienceDimension = ALL_DIMENSIONS[0];
let highestAvg = -1, lowestAvg = Infinity;
for (const dim of ALL_DIMENSIONS) {
  const avg = dimensionAnalysis[dim].averageScore;
  if (avg > highestAvg) { highestAvg = avg; strongestDimension = dim; }
  if (avg < lowestAvg && avg > 0) { lowestAvg = avg; weakestDimension = dim; }
}
// If lowestAvg is still Infinity (all dims scored 0 or NA), use first dim
if (lowestAvg === Infinity) weakestDimension = strongestDimension;

const overallScore = Math.round(
  scorecards.reduce((s, sc) => s + sc.weightedScore, 0) / scorecards.length,
);

const report: BenchmarkReport = {
  title: 'Obedience Benchmark — Smoke Test Report',
  generatedAt: new Date().toISOString(),
  runId: 'smoke-run-001',
  agentId: 'claude-opus-4-6',
  summary: {
    overallScore,
    tasksCompleted: 3,
    tasksFailed: 0,
    totalDurationMs: 6000,
    strongestDimension,
    weakestDimension,
  },
  taskDetails: scorecards.map(sc => ({
    taskName: sc.taskName,
    domain: sc.taskName === 'hello-world' ? 'text-processing' : sc.taskName === 'parallel-sum' ? 'computation' : 'logic',
    complexity: 'low',
    scorecard: sc,
    highlights: ALL_DIMENSIONS.filter(d => sc.dimensions[d].applicable && sc.dimensions[d].score >= 80)
      .map(d => `${d}: ${sc.dimensions[d].score}/100`),
    issues: ALL_DIMENSIONS.filter(d => sc.dimensions[d].applicable && sc.dimensions[d].score < 50)
      .map(d => `${d}: ${sc.dimensions[d].score}/100`),
  })),
  dimensionAnalysis,
};

// ---------------------------------------------------------------------------
// Render and write HTML
// ---------------------------------------------------------------------------

const html = renderHtmlReport(report);
const outDir = join(process.cwd(), 'results', 'smoke-run');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'report.html');
writeFileSync(outPath, html, 'utf-8');
console.log(`HTML report written to: ${outPath}`);
