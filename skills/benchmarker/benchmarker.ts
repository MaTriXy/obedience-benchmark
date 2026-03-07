/**
 * Benchmarker -- Top-Level Orchestrator
 *
 * Runs the full benchmark pipeline: catalog selection -> task preparation ->
 * candidate execution -> judging -> reporting. Maintains persistent run state
 * in run-state.json after each phase for crash recovery.
 */

import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

import type {
  BenchmarkRun,
  BenchmarkRunStatus,
  CatalogEntry,
  CatalogFilter,
  TaskSelection,
  PreparedTask,
  ObedienceScorecard,
  BenchmarkReport,
  ObedienceDimension,
} from '../../shared/types.js';
import { ALL_DIMENSIONS } from '../../shared/types.js';

import type {
  RunnerConfig,
  RunnerMode,
  RunnerResult,
  RunnerStatus,
  AgentHarness,
  Runner,
} from '../../shared/runner-interface.js';

// ---------------------------------------------------------------------------
// Skill imports (resilient -- may not all exist yet)
// ---------------------------------------------------------------------------

import { loadCatalog, filterCatalog } from '../catalog-manager/catalog.js';
import { createRunner, runCandidate } from '../candidate-runner/runner.js';
import type { RunCandidateResult } from '../candidate-runner/runner.js';
import { prepareTask } from '../task-preparer/preparer.js';
import type { PrepareOptions } from '../task-preparer/preparer.js';

// Judge and reporter may not be implemented yet -- import dynamically
// to avoid hard failures if the modules don't exist.

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BenchmarkConfig {
  /** Agent to benchmark. */
  agentId: string;
  /** Agent harness type. */
  harness: 'claude-code' | 'codex' | 'custom';
  /** Model name/version. */
  model: string;
  /** Execution backend. */
  runnerMode: 'docker' | 'local';

  /** Path to benchmarks/ directory containing task definitions. */
  catalogDir: string;
  /** Optional filter to select a subset of tasks. */
  filter?: CatalogFilter;

  /** Maximum number of tasks to run concurrently. @default 1 */
  maxConcurrentTasks?: number;
  /** Per-task wall-clock timeout in milliseconds. @default 600000 */
  timeoutPerTaskMs?: number;
  /** Whether to retry failed tasks. @default true */
  retryFailedTasks?: boolean;
  /** Maximum retry attempts per task. @default 1 */
  maxRetries?: number;

  /** Environment variables to inject (API keys, etc.). */
  env?: Record<string, string>;

  /** Output directory for run artifacts (e.g. results/<run-id>/). */
  outputDir: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a timestamp-based run ID. */
function generateRunId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:\-T]/g, '').replace(/\.\d+Z$/, '');
  const rand = Math.random().toString(36).slice(2, 8);
  return `bench-${ts}-${rand}`;
}

/** Persist the BenchmarkRun state to disk. */
async function persistRunState(run: BenchmarkRun, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const statePath = path.join(outputDir, 'run-state.json');
  await writeFile(statePath, JSON.stringify(run, null, 2) + '\n', 'utf-8');
}

/** Update run status, persist, and return the run. */
async function transition(
  run: BenchmarkRun,
  status: BenchmarkRunStatus,
  outputDir: string,
): Promise<void> {
  run.status = status;
  await persistRunState(run, outputDir);
}

/**
 * Attempt to dynamically import the judge module.
 * Returns the judge function or undefined if not available.
 */
async function tryLoadJudge(): Promise<
  ((params: any) => Promise<ObedienceScorecard>) | undefined
> {
  try {
    const mod = await import('../judge/judge.js');
    return mod.judge ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Attempt to dynamically import the report generator module.
 * Returns the generateReport function or undefined if not available.
 */
async function tryLoadReporter(): Promise<
  ((params: any) => Promise<any>) | undefined
> {
  try {
    const mod = await import('../report-generator/reporter.js');
    return mod.generateReport ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Determine whether a runner result should be retried.
 */
function isRetryableStatus(status: RunnerStatus): boolean {
  return status === 'error' || status === 'timeout';
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

/**
 * Run async tasks with a concurrency limit.
 * Each item is processed by `fn`; at most `concurrency` invocations are
 * in-flight at any time.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full benchmark pipeline.
 *
 * Phases:
 *   1. Catalog -- load and filter tasks
 *   2. Prepare -- materialize inputs for each task
 *   3. Run    -- execute candidate agent on each task
 *   4. Judge  -- score each completed run
 *   5. Report -- compile results into report and leaderboard
 *
 * State is persisted to `run-state.json` after each phase.
 */
export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkRun> {
  const runId = generateRunId();
  const outputDir = config.outputDir;

  const maxConcurrentTasks = config.maxConcurrentTasks ?? 1;
  const timeoutPerTaskMs = config.timeoutPerTaskMs ?? 600_000;
  const retryFailedTasks = config.retryFailedTasks ?? true;
  const maxRetries = config.maxRetries ?? 1;

  // -----------------------------------------------------------------------
  // 1. Initialize run state
  // -----------------------------------------------------------------------

  const run: BenchmarkRun = {
    runId,
    status: 'pending',
    agentId: config.agentId,
    taskSelection: { tasks: [], totalAvailable: 0, filterApplied: config.filter ?? {} },
    preparedTasks: {},
    runnerResults: {},
    scorecards: {},
    config: {
      maxConcurrentTasks,
      timeoutPerTaskMs,
      retryFailedTasks,
      maxRetries,
    },
    startedAt: new Date().toISOString(),
  };

  await persistRunState(run, outputDir);

  try {
    // -------------------------------------------------------------------
    // 2. CATALOG PHASE: Load and filter tasks
    // -------------------------------------------------------------------

    await transition(run, 'preparing', outputDir);

    const allEntries = loadCatalog(config.catalogDir);
    const filter = config.filter ?? {};
    const filtered = filterCatalog(allEntries, filter);

    run.taskSelection = {
      tasks: filtered,
      totalAvailable: allEntries.length,
      filterApplied: filter,
    };

    await persistRunState(run, outputDir);

    if (filtered.length === 0) {
      run.status = 'completed';
      run.completedAt = new Date().toISOString();
      run.error = 'No tasks matched the provided filter criteria.';
      await persistRunState(run, outputDir);
      return run;
    }

    // -------------------------------------------------------------------
    // 3. PREPARE PHASE: For each task, prepare inputs
    // -------------------------------------------------------------------

    const prepareOutputDir = path.join(outputDir, 'prepared');

    await mapWithConcurrency(filtered, maxConcurrentTasks, async (entry) => {
      try {
        const prepared = await prepareTask(entry, {
          outputDir: prepareOutputDir,
          force: true,
        });
        run.preparedTasks[entry.name] = prepared;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[benchmarker] Failed to prepare task "${entry.name}": ${errorMsg}`);
        // Record a minimal prepared task with the error so we can track it
        run.preparedTasks[entry.name] = {
          catalogEntry: entry,
          inputDir: '',
          taskPrompt: '',
          evaluationArtifacts: [],
          preparedAt: new Date().toISOString(),
          preparationDurationMs: 0,
        };
      }
    });

    await persistRunState(run, outputDir);

    // -------------------------------------------------------------------
    // 4. RUN PHASE: Execute candidate agent on each task
    // -------------------------------------------------------------------

    await transition(run, 'running', outputDir);

    // Build a shared runner config template
    const runnerConfigBase: Partial<RunnerConfig> = {
      mode: config.runnerMode as RunnerMode,
      harness: config.harness as AgentHarness,
      timeoutMs: timeoutPerTaskMs,
      env: config.env,
    };

    // Create a runner instance
    const runner: Runner = createRunner({
      mode: config.runnerMode as RunnerMode,
      harness: config.harness as AgentHarness,
      taskPrompt: '', // placeholder -- overridden per-task
      timeoutMs: timeoutPerTaskMs,
    });

    const runnableTasks = Object.entries(run.preparedTasks).filter(
      ([, prepared]) => prepared.inputDir !== '' && prepared.taskPrompt !== '',
    );

    await mapWithConcurrency(runnableTasks, maxConcurrentTasks, async ([taskName, prepared]) => {
      const taskOutputDir = path.join(outputDir, 'runs', taskName);
      await mkdir(taskOutputDir, { recursive: true });

      let lastResult: RunnerResult | undefined;
      const maxAttempts = retryFailedTasks ? 1 + maxRetries : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const taskRunId = `${runId}-${taskName}${attempt > 0 ? `-retry${attempt}` : ''}`;

          const candidateResult: RunCandidateResult = await runCandidate(
            runner,
            prepared,
            prepared.inputDir,
            taskOutputDir,
            {
              ...runnerConfigBase,
              runId: taskRunId,
            },
          );

          lastResult = candidateResult.result;

          // If completed successfully or not retryable, stop
          if (!isRetryableStatus(lastResult.status)) {
            break;
          }

          // If this was the last attempt, keep the result as-is
          if (attempt === maxAttempts - 1) {
            break;
          }

          console.warn(
            `[benchmarker] Task "${taskName}" ended with status "${lastResult.status}" ` +
            `(attempt ${attempt + 1}/${maxAttempts}). Retrying...`,
          );
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `[benchmarker] Runner error for task "${taskName}" (attempt ${attempt + 1}): ${errorMsg}`,
          );

          lastResult = {
            runId: `${runId}-${taskName}`,
            status: 'error',
            exitCode: null,
            durationMs: 0,
            events: [],
            logs: [],
            errorMessage: errorMsg,
          };

          // On infrastructure error, retry if allowed
          if (attempt === maxAttempts - 1) break;
        }
      }

      if (lastResult) {
        run.runnerResults[taskName] = lastResult;
      }
    });

    await persistRunState(run, outputDir);

    // Check if ALL tasks failed -- if so, mark the entire run as failed
    const allFailed = Object.values(run.runnerResults).every(
      (r) => r.status === 'error' || r.status === 'timeout',
    );
    if (runnableTasks.length > 0 && allFailed) {
      run.status = 'failed';
      run.error = 'All tasks failed during execution.';
      run.completedAt = new Date().toISOString();
      await persistRunState(run, outputDir);
      return run;
    }

    // -------------------------------------------------------------------
    // 5. JUDGE PHASE: Score each completed run
    // -------------------------------------------------------------------

    await transition(run, 'judging', outputDir);

    const judgeFn = await tryLoadJudge();
    const scorecardsDir = path.join(outputDir, 'scorecards');
    await mkdir(scorecardsDir, { recursive: true });

    if (judgeFn) {
      await mapWithConcurrency(
        Object.entries(run.runnerResults),
        maxConcurrentTasks,
        async ([taskName, result]) => {
          // Skip tasks that errored at the runner level with no useful output
          if (result.status === 'error' && result.events.length === 0 && result.logs.length === 0) {
            return;
          }

          const prepared = run.preparedTasks[taskName];
          if (!prepared) return;

          try {
            const scorecard = await judgeFn({
              processPath: prepared.catalogEntry.processPath,
              runnerResult: result,
              taskYamlPath: prepared.catalogEntry.yamlPath,
              agentId: config.agentId,
              runId: result.runId,
            });

            run.scorecards[taskName] = scorecard;

            // Persist individual scorecard
            const scorecardPath = path.join(scorecardsDir, `${taskName}.json`);
            await writeFile(
              scorecardPath,
              JSON.stringify(scorecard, null, 2) + '\n',
              'utf-8',
            );
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[benchmarker] Judge error for task "${taskName}": ${errorMsg}`);
          }
        },
      );
    } else {
      console.warn(
        '[benchmarker] Judge module not available. Skipping scoring phase. ' +
        'Implement skills/judge/judge.ts and export a `judge` function.',
      );
    }

    // Compute aggregate score
    const scorecardValues = Object.values(run.scorecards);
    if (scorecardValues.length > 0) {
      const totalWeighted = scorecardValues.reduce((sum, sc) => sum + sc.weightedScore, 0);
      run.aggregateScore = totalWeighted / scorecardValues.length;
    }

    await persistRunState(run, outputDir);

    // -------------------------------------------------------------------
    // 6. REPORT PHASE: Compile results
    // -------------------------------------------------------------------

    await transition(run, 'reporting', outputDir);

    const reportFn = await tryLoadReporter();

    if (reportFn) {
      try {
        const report = await reportFn({
          scorecards: scorecardValues,
          runId,
          agentId: config.agentId,
          outputDir,
        });

        // Persist structured report
        const reportJsonPath = path.join(outputDir, 'report.json');
        await writeFile(
          reportJsonPath,
          JSON.stringify(report, null, 2) + '\n',
          'utf-8',
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[benchmarker] Report generation error: ${errorMsg}`);
      }
    } else {
      console.warn(
        '[benchmarker] Report generator module not available. Skipping report phase. ' +
        'Implement skills/report-generator/reporter.ts and export a `generateReport` function.',
      );

      // Write a minimal summary report as JSON
      await writeMinimalReport(run, outputDir);
    }

    await persistRunState(run, outputDir);

    // -------------------------------------------------------------------
    // 7. Complete
    // -------------------------------------------------------------------

    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    await persistRunState(run, outputDir);

    return run;
  } catch (err) {
    // Top-level failure: mark the entire run as failed
    const errorMsg = err instanceof Error ? err.message : String(err);
    run.status = 'failed';
    run.error = errorMsg;
    run.completedAt = new Date().toISOString();
    await persistRunState(run, outputDir);
    return run;
  }
}

// ---------------------------------------------------------------------------
// Minimal fallback report (when reporter module is unavailable)
// ---------------------------------------------------------------------------

async function writeMinimalReport(run: BenchmarkRun, outputDir: string): Promise<void> {
  const scorecards = Object.values(run.scorecards);
  const totalTasks = run.taskSelection.tasks.length;
  const completedCount = Object.values(run.runnerResults).filter(
    (r) => r.status === 'completed',
  ).length;
  const failedCount = totalTasks - completedCount;

  const lines: string[] = [
    `# Benchmark Report`,
    '',
    `**Run ID:** ${run.runId}`,
    `**Agent:** ${run.agentId}`,
    `**Started:** ${run.startedAt ?? 'N/A'}`,
    `**Status:** ${run.status}`,
    '',
    `## Summary`,
    '',
    `- Tasks selected: ${totalTasks}`,
    `- Tasks completed: ${completedCount}`,
    `- Tasks failed: ${failedCount}`,
    `- Tasks scored: ${scorecards.length}`,
  ];

  if (run.aggregateScore !== undefined) {
    lines.push(`- **Aggregate score: ${run.aggregateScore.toFixed(2)} / 100**`);
  }

  lines.push('');

  if (scorecards.length > 0) {
    lines.push(`## Per-Task Scores`);
    lines.push('');
    lines.push('| Task | Weighted Score | Raw Score |');
    lines.push('|------|---------------|-----------|');
    for (const sc of scorecards) {
      lines.push(
        `| ${sc.taskName} | ${sc.weightedScore.toFixed(1)} | ${sc.rawScore.toFixed(1)} |`,
      );
    }
    lines.push('');
  }

  const reportMdPath = path.join(outputDir, 'report.md');
  await writeFile(reportMdPath, lines.join('\n') + '\n', 'utf-8');
}
