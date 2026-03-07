/**
 * Report Generator — compiles judge scorecards into markdown reports,
 * JSON reports, and leaderboard updates.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import type {
  ObedienceDimension,
  ObedienceScorecard,
  DimensionScore,
  BenchmarkReport,
  Leaderboard,
  LeaderboardEntry,
} from '../../obedience-types/scripts/types.js';
import { ALL_DIMENSIONS } from '../../obedience-types/scripts/types.js';
import { renderHtmlReport } from './html-report.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ReportParams {
  scorecards: ObedienceScorecard[];
  runId: string;
  agentId: string;
  harness: string;
  model: string;
  taskMetadata?: Record<string, { domain: string; complexity: string }>;
  outputDir: string;
  benchmarkVersion?: string;
  compareWith?: BenchmarkReport;
}

/**
 * Generate markdown report + HTML report + JSON report + update leaderboard.
 */
export async function generateReport(params: ReportParams): Promise<{
  report: BenchmarkReport;
  markdownPath: string;
  htmlPath: string;
  jsonPath: string;
  leaderboardPath: string;
}> {
  const {
    scorecards,
    runId,
    agentId,
    harness,
    model,
    taskMetadata,
    outputDir,
    benchmarkVersion = '1.0.0',
  } = params;

  // Build the BenchmarkReport object
  const report = buildReport(scorecards, runId, agentId, taskMetadata);

  // Write outputs
  await mkdir(outputDir, { recursive: true });

  const markdownPath = join(outputDir, 'report.md');
  const htmlPath = join(outputDir, 'report.html');
  const jsonPath = join(outputDir, 'report.json');

  const markdown = renderMarkdown(report);
  const html = renderHtmlReport(report, { compareWith: params.compareWith });
  await writeFile(markdownPath, markdown, 'utf-8');
  await writeFile(htmlPath, html, 'utf-8');
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  // Update leaderboard
  const leaderboardDir = resolve(outputDir, '..', 'leaderboard');
  await mkdir(leaderboardDir, { recursive: true });
  const leaderboardPath = join(leaderboardDir, 'leaderboard.json');

  const leaderboard = await updateLeaderboard(
    leaderboardPath,
    report,
    scorecards,
    agentId,
    harness,
    model,
    benchmarkVersion,
  );
  await writeFile(leaderboardPath, JSON.stringify(leaderboard, null, 2), 'utf-8');

  return { report, markdownPath, htmlPath, jsonPath, leaderboardPath };
}

// ---------------------------------------------------------------------------
// Report building
// ---------------------------------------------------------------------------

function buildReport(
  scorecards: ObedienceScorecard[],
  runId: string,
  agentId: string,
  taskMetadata?: Record<string, { domain: string; complexity: string }>,
): BenchmarkReport {
  const generatedAt = new Date().toISOString();

  // Dimension analysis across all tasks
  const dimensionAnalysis = buildDimensionAnalysis(scorecards);

  // Identify strongest / weakest dimension by average score
  let strongestDimension: ObedienceDimension = ALL_DIMENSIONS[0];
  let weakestDimension: ObedienceDimension = ALL_DIMENSIONS[0];
  let highestAvg = -1;
  let lowestAvg = Infinity;

  for (const dim of ALL_DIMENSIONS) {
    const avg = dimensionAnalysis[dim].averageScore;
    if (avg > highestAvg) {
      highestAvg = avg;
      strongestDimension = dim;
    }
    if (avg < lowestAvg) {
      lowestAvg = avg;
      weakestDimension = dim;
    }
  }

  // Compute summary
  const overallScore =
    scorecards.length > 0
      ? Math.round(
          scorecards.reduce((sum, sc) => sum + sc.weightedScore, 0) / scorecards.length,
        )
      : 0;

  const tasksFailed = scorecards.filter((sc) => sc.weightedScore < 50).length;
  const tasksCompleted = scorecards.length - tasksFailed;

  const totalDurationMs = scorecards.reduce(
    (sum, sc) => sum + sc.metadata.judgeDurationMs,
    0,
  );

  // Per-task details
  const taskDetails = scorecards.map((sc) => {
    const meta = taskMetadata?.[sc.taskName];
    const highlights: string[] = [];
    const issues: string[] = [];

    for (const dim of ALL_DIMENSIONS) {
      const ds = sc.dimensions[dim];
      if (!ds.applicable) continue;
      if (ds.score >= 80) {
        highlights.push(`${formatDimension(dim)}: scored ${ds.score}/100`);
      }
      if (ds.score < 50) {
        issues.push(`${formatDimension(dim)}: scored ${ds.score}/100`);
      }
    }

    return {
      taskName: sc.taskName,
      domain: meta?.domain ?? 'unknown',
      complexity: meta?.complexity ?? 'unknown',
      scorecard: sc,
      highlights,
      issues,
    };
  });

  return {
    title: 'Obedience Benchmark Report',
    generatedAt,
    runId,
    agentId,
    summary: {
      overallScore,
      tasksCompleted,
      tasksFailed,
      totalDurationMs,
      strongestDimension,
      weakestDimension,
    },
    taskDetails,
    dimensionAnalysis,
  };
}

function buildDimensionAnalysis(
  scorecards: ObedienceScorecard[],
): BenchmarkReport['dimensionAnalysis'] {
  const analysis = {} as BenchmarkReport['dimensionAnalysis'];

  for (const dim of ALL_DIMENSIONS) {
    const taskScores: Record<string, number> = {};
    const allDeductionReasons: string[] = [];
    let total = 0;
    let count = 0;

    for (const sc of scorecards) {
      const ds: DimensionScore = sc.dimensions[dim];
      if (!ds.applicable) continue;
      taskScores[sc.taskName] = ds.score;
      total += ds.score;
      count += 1;
      for (const ded of ds.deductions) {
        allDeductionReasons.push(ded.reason);
      }
    }

    const averageScore = count > 0 ? Math.round(total / count) : 0;

    // Find common issues — deduplicate and take the most frequent
    const freq = new Map<string, number>();
    for (const r of allDeductionReasons) {
      freq.set(r, (freq.get(r) ?? 0) + 1);
    }
    const commonIssues = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason]) => reason);

    analysis[dim] = { averageScore, taskScores, commonIssues };
  }

  return analysis;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function ratingDots(score: number): string {
  if (score >= 90) return '\u2B24\u2B24\u2B24\u2B24\u2B24';
  if (score >= 70) return '\u2B24\u2B24\u2B24\u2B24\u25CB';
  if (score >= 50) return '\u2B24\u2B24\u2B24\u25CB\u25CB';
  if (score >= 30) return '\u2B24\u2B24\u25CB\u25CB\u25CB';
  return '\u2B24\u25CB\u25CB\u25CB\u25CB';
}

function formatDimension(dim: ObedienceDimension): string {
  switch (dim) {
    case 'completeness': return 'Completeness';
    case 'ordering': return 'Ordering';
    case 'conditionality': return 'Conditionality';
    case 'parallelism': return 'Parallelism';
    case 'granularity': return 'Granularity';
    case 'aggregation': return 'Aggregation';
    case 'errorHandling': return 'Error Handling';
  }
}

function renderMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# Obedience Benchmark Report');
  lines.push('');
  lines.push(`**Agent:** ${report.agentId}  `);
  lines.push(`**Run:** ${report.runId}  `);
  lines.push(`**Date:** ${report.generatedAt}  `);
  lines.push(`**Overall Score:** ${report.summary.overallScore}/100`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Tasks Completed | ${report.summary.tasksCompleted} |`);
  lines.push(`| Tasks Failed | ${report.summary.tasksFailed} |`);
  lines.push(`| Overall Score | ${report.summary.overallScore}/100 |`);
  lines.push(
    `| Strongest Dimension | ${formatDimension(report.summary.strongestDimension)} (${
      report.dimensionAnalysis[report.summary.strongestDimension].averageScore
    }) |`,
  );
  lines.push(
    `| Weakest Dimension | ${formatDimension(report.summary.weakestDimension)} (${
      report.dimensionAnalysis[report.summary.weakestDimension].averageScore
    }) |`,
  );
  lines.push('');

  // Dimension Analysis
  lines.push('## Dimension Analysis');
  lines.push('');
  lines.push('| Dimension | Average Score | Rating |');
  lines.push('|-----------|--------------|--------|');
  for (const dim of ALL_DIMENSIONS) {
    const avg = report.dimensionAnalysis[dim].averageScore;
    lines.push(`| ${formatDimension(dim)} | ${avg} | ${ratingDots(avg)} |`);
  }
  lines.push('');

  // Common issues across all dimensions
  const allIssues: string[] = [];
  for (const dim of ALL_DIMENSIONS) {
    for (const issue of report.dimensionAnalysis[dim].commonIssues) {
      allIssues.push(`${formatDimension(dim)}: ${issue}`);
    }
  }
  if (allIssues.length > 0) {
    lines.push('### Common Issues');
    lines.push('');
    for (const issue of allIssues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  // Task Details
  lines.push('## Task Details');
  lines.push('');
  for (const task of report.taskDetails) {
    lines.push(`### Task: ${task.taskName}`);
    lines.push(
      `**Domain:** ${task.domain} | **Complexity:** ${task.complexity} | **Score:** ${task.scorecard.weightedScore}/100`,
    );
    lines.push('');
    lines.push('| Dimension | Score | Weight | Weighted |');
    lines.push('|-----------|-------|--------|----------|');
    for (const dim of ALL_DIMENSIONS) {
      const ds = task.scorecard.dimensions[dim];
      if (!ds.applicable) continue;
      const weighted = Math.round(ds.score * ds.weight);
      lines.push(
        `| ${formatDimension(dim)} | ${ds.score} | ${ds.weight} | ${weighted} |`,
      );
    }
    lines.push('');

    if (task.highlights.length > 0) {
      lines.push(`**Highlights:** ${task.highlights.join('; ')}`);
      lines.push('');
    }
    if (task.issues.length > 0) {
      lines.push(`**Issues:** ${task.issues.join('; ')}`);
      lines.push('');
    }
  }

  // Leaderboard placeholder — the actual leaderboard is written separately,
  // but we include the current agent's standing in the markdown.
  lines.push('## Leaderboard');
  lines.push('');
  lines.push('| Rank | Agent | Score | Best Dim | Worst Dim |');
  lines.push('|------|-------|-------|----------|-----------|');
  lines.push(
    `| 1 | ${report.agentId} | ${report.summary.overallScore} | ${formatDimension(report.summary.strongestDimension)} | ${formatDimension(report.summary.weakestDimension)} |`,
  );
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Leaderboard management
// ---------------------------------------------------------------------------

async function updateLeaderboard(
  leaderboardPath: string,
  report: BenchmarkReport,
  scorecards: ObedienceScorecard[],
  agentId: string,
  harness: string,
  model: string,
  benchmarkVersion: string,
): Promise<Leaderboard> {
  let leaderboard: Leaderboard;

  try {
    const raw = await readFile(leaderboardPath, 'utf-8');
    leaderboard = JSON.parse(raw) as Leaderboard;
  } catch {
    leaderboard = {
      updatedAt: new Date().toISOString(),
      benchmarkVersion,
      taskCount: scorecards.length,
      entries: [],
    };
  }

  // Build task scores
  const taskScores: Record<string, number> = {};
  for (const sc of scorecards) {
    taskScores[sc.taskName] = sc.weightedScore;
  }

  // Build dimension averages
  const dimensionAverages = {} as Record<ObedienceDimension, number>;
  for (const dim of ALL_DIMENSIONS) {
    dimensionAverages[dim] = report.dimensionAnalysis[dim].averageScore;
  }

  const entry: LeaderboardEntry = {
    agentId,
    harness,
    model,
    totalScore: report.summary.overallScore,
    taskScores,
    dimensionAverages,
    runsCompleted: 1,
    lastRunTimestamp: report.generatedAt,
  };

  // Find existing entry for this agent
  const existingIndex = leaderboard.entries.findIndex((e) => e.agentId === agentId);
  if (existingIndex >= 0) {
    const existing = leaderboard.entries[existingIndex];
    entry.runsCompleted = existing.runsCompleted + 1;
    leaderboard.entries[existingIndex] = entry;
  } else {
    leaderboard.entries.push(entry);
  }

  // Sort by totalScore descending
  leaderboard.entries.sort((a, b) => b.totalScore - a.totalScore);

  leaderboard.updatedAt = new Date().toISOString();
  leaderboard.benchmarkVersion = benchmarkVersion;
  leaderboard.taskCount = Math.max(leaderboard.taskCount, scorecards.length);

  return leaderboard;
}
