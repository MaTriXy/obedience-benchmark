/**
 * Obedience Benchmark -- Judge
 *
 * Evaluates a candidate agent's session logs against a prescribed process,
 * scoring obedience across 7 dimensions: completeness, ordering, conditionality,
 * parallelism, granularity, aggregation, and errorHandling.
 *
 * The judge reads the process file directly — importing its task definitions,
 * metadata, and evaluation criteria — rather than running it through a
 * recording context.
 */

import type {
  ObedienceDimension,
  ProcessEvaluation,
  ProcessModule,
  ObservedStep,
  ObedienceScorecard,
  DimensionScore,
  Deduction,
} from '../../obedience-types/scripts/types.js';
import { buildExecutionTrace } from './scripts/log-parser.js';
import type { ExecutionTrace, ParallelGroup, LoopExecution } from './scripts/log-parser.js';
import type { StructuredLog } from '../../candidate-runner/scripts/log-collector.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JUDGE_VERSION = '2.0.0';

const ALL_DIMENSIONS: ObedienceDimension[] = [
  'completeness',
  'ordering',
  'conditionality',
  'parallelism',
  'granularity',
  'aggregation',
  'errorHandling',
];

// ---------------------------------------------------------------------------
// Extract task definitions directly from process module exports
// ---------------------------------------------------------------------------

function extractTaskDefinitions(mod: Record<string, unknown>): Array<{ name: string; exportName: string; definition: unknown }> {
  const tasks: Array<{ name: string; exportName: string; definition: unknown }> = [];
  for (const [exportName, value] of Object.entries(mod)) {
    if (value && typeof value === 'object' && 'taskName' in value && typeof (value as any).taskName === 'string') {
      tasks.push({ name: (value as any).taskName, exportName, definition: value });
    }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// PrescribedTask — extracted from process file
// ---------------------------------------------------------------------------

interface PrescribedTask {
  name: string;
  exportName: string;
  title?: string;
  agentName?: string;
  promptTask?: string;
}

// ---------------------------------------------------------------------------
// JudgeParams
// ---------------------------------------------------------------------------

export interface JudgeParams {
  /** The imported *.process.js module. */
  processModule: ProcessModule;
  /** Structured log from the log-collector. */
  structuredLog: StructuredLog;
  /** Evaluation criteria from the process module. */
  evaluation: ProcessEvaluation;
  /** Unique run identifier. */
  runId: string;
  /** Task name. */
  taskName: string;
  /** Agent identifier. */
  agentId: string;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Judge a candidate agent's session against the prescribed process.
 *
 * 1. Reads the process module's exported task definitions directly.
 * 2. Parses observed behaviour from the structured log.
 * 3. Matches observed steps to prescribed tasks.
 * 4. Scores each dimension.
 * 5. Produces an ObedienceScorecard.
 */
export async function judge(params: JudgeParams): Promise<ObedienceScorecard> {
  const startMs = Date.now();

  // Phase 1: Extract prescribed tasks directly from process module exports
  const rawTasks = extractTaskDefinitions(params.processModule as unknown as Record<string, unknown>);
  const prescribedTasks: PrescribedTask[] = rawTasks.map((t) => {
    const def = t.definition as Record<string, unknown>;
    let title: string | undefined;
    let agentName: string | undefined;
    let promptTask: string | undefined;

    // Try to invoke the factory with a dummy to extract title/agent info
    if (typeof def === 'object' && 'factory' in def && typeof (def as any).factory === 'function') {
      try {
        const spec = (def as any).factory({}, { effectId: 'judge-probe' });
        title = spec?.title;
        agentName = spec?.agent?.name;
        promptTask = spec?.agent?.prompt?.task;
      } catch {
        // Factory may require specific args; skip extraction
      }
    }

    return {
      name: t.name,
      exportName: t.exportName,
      title,
      agentName,
      promptTask,
    };
  });

  // Extract error handlers
  const errorHandlers = Array.isArray((params.processModule as any).errorHandlers)
    ? (params.processModule as any).errorHandlers
    : [];

  // Phase 2: Parse observed behaviour
  const executionTrace = buildExecutionTrace(params.structuredLog);
  const observedSteps = executionTrace.steps;

  // Phase 3: Match observed steps to prescribed tasks
  const matchedObserved = matchSteps(prescribedTasks, observedSteps);

  // Phase 4: Score each dimension
  const dimensions = scoreDimensions(
    prescribedTasks,
    matchedObserved,
    executionTrace,
    params.evaluation,
    errorHandlers,
    params.processModule.metadata.dimensions,
  );

  // Phase 5: Compute aggregate scores
  const { weightedScore, rawScore } = computeAggregateScores(dimensions);

  const judgeDurationMs = Date.now() - startMs;

  return {
    runId: params.runId,
    taskName: params.taskName,
    agentId: params.agentId,
    timestamp: new Date().toISOString(),
    dimensions,
    weightedScore,
    rawScore,
    prescribedTasks: rawTasks.map((t) => ({ name: t.name, exportName: t.exportName })),
    observedSteps: matchedObserved,
    metadata: {
      judgeDurationMs,
      processStepCount: prescribedTasks.length,
      observedStepCount: observedSteps.length,
      logLineCount: params.structuredLog.events.length,
      logEventCount: params.structuredLog.summary.totalEvents,
      judgeVersion: JUDGE_VERSION,
    },
  };
}

// ---------------------------------------------------------------------------
// Step matching
// ---------------------------------------------------------------------------

function matchSteps(
  prescribed: PrescribedTask[],
  observed: ObservedStep[],
): ObservedStep[] {
  const matched: ObservedStep[] = [];
  const usedPrescribed = new Set<string>();

  for (const obs of observed) {
    let bestMatch: PrescribedTask | undefined;
    let bestConfidence = 0;

    // Strategy 1: Direct ID match via matchedStepId
    if (obs.matchedStepId) {
      const direct = prescribed.find(
        (p) => p.name === obs.matchedStepId && !usedPrescribed.has(p.name),
      );
      if (direct) {
        bestMatch = direct;
        bestConfidence = 1.0;
      }
    }

    // Strategy 2: Exact name match via observedAction
    if (!bestMatch) {
      const exact = prescribed.find(
        (p) => p.name === obs.observedAction && !usedPrescribed.has(p.name),
      );
      if (exact) {
        bestMatch = exact;
        bestConfidence = 0.95;
      }
    }

    // Strategy 3: String similarity (action text vs task name/title/prompt)
    if (!bestMatch) {
      for (const p of prescribed) {
        if (usedPrescribed.has(p.name)) continue;
        const confidence = computeSimilarity(obs.observedAction, p);
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = p;
        }
      }
    }

    if (bestMatch && bestConfidence >= 0.3) {
      usedPrescribed.add(bestMatch.name);
      matched.push({
        ...obs,
        matchedStepId: bestMatch.name,
        matchConfidence: bestConfidence,
      });
    } else {
      matched.push({
        ...obs,
        matchedStepId: undefined,
        matchConfidence: 0,
      });
    }
  }

  return matched;
}

function computeSimilarity(observed: string, task: PrescribedTask): number {
  const obsLower = observed.toLowerCase();
  const nameLower = task.name.toLowerCase();

  if (obsLower === nameLower) return 0.95;
  if (obsLower.includes(nameLower) || nameLower.includes(obsLower)) return 0.8;

  const candidates = [nameLower];
  if (task.title) candidates.push(task.title.toLowerCase());
  if (task.promptTask) candidates.push(task.promptTask.toLowerCase());

  for (const candidate of candidates) {
    if (obsLower.includes(candidate) || candidate.includes(obsLower)) return 0.7;
  }

  const obsWords = new Set(obsLower.split(/[\s\-_:]+/).filter(Boolean));
  let maxScore = 0;
  for (const candidate of candidates) {
    const candWords = new Set(candidate.split(/[\s\-_:]+/).filter(Boolean));
    const overlap = setIntersectionSize(obsWords, candWords);
    const maxPossible = Math.min(obsWords.size, candWords.size) || 1;
    const score = (overlap / maxPossible) * 0.6;
    if (score > maxScore) maxScore = score;
  }

  return maxScore;
}

function setIntersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Dimension scoring
// ---------------------------------------------------------------------------

function scoreDimensions(
  prescribedTasks: PrescribedTask[],
  observedSteps: ObservedStep[],
  executionTrace: ExecutionTrace,
  evaluation: ProcessEvaluation,
  errorHandlers: Array<{ id: string; triggerCondition: string; action: string }>,
  activeDimensions: ObedienceDimension[],
): Record<ObedienceDimension, DimensionScore> {
  const result = {} as Record<ObedienceDimension, DimensionScore>;

  for (const dim of ALL_DIMENSIONS) {
    const evalSpec = evaluation[dim];
    const weight = evalSpec?.weight ?? 0;
    const isActive = activeDimensions.includes(dim);

    let score: DimensionScore;

    switch (dim) {
      case 'completeness':
        score = scoreCompleteness(prescribedTasks, observedSteps, weight);
        break;
      case 'ordering':
        score = scoreOrdering(prescribedTasks, observedSteps, weight);
        break;
      case 'conditionality':
        score = scoreConditionality(observedSteps, executionTrace, weight);
        break;
      case 'parallelism':
        score = scoreParallelism(executionTrace, weight);
        break;
      case 'granularity':
        score = scoreGranularity(executionTrace, weight);
        break;
      case 'aggregation':
        score = scoreAggregation(prescribedTasks, observedSteps, weight);
        break;
      case 'errorHandling':
        score = scoreErrorHandling(errorHandlers, observedSteps, executionTrace, weight);
        break;
    }

    if (evalSpec?.notApplicable || !isActive) {
      score.applicable = false;
      score.score = 100;
      score.weight = 0;
      if (evalSpec?.notApplicable) {
        score.evidence.push(`Not applicable: ${evalSpec.notApplicable}`);
      }
    }

    result[dim] = score;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 1. Completeness
// ---------------------------------------------------------------------------

function scoreCompleteness(
  prescribed: PrescribedTask[],
  observed: ObservedStep[],
  weight: number,
): DimensionScore {
  const evidence: string[] = [];
  const deductions: Deduction[] = [];
  const prescribedCount = prescribed.length;

  const matchedNames = new Set(
    observed
      .filter((o) => o.matchedStepId && o.matchConfidence > 0)
      .map((o) => o.matchedStepId!),
  );

  const matchedCount = prescribed.filter((p) => matchedNames.has(p.name)).length;
  const missingTasks = prescribed.filter((p) => !matchedNames.has(p.name));

  for (const missing of missingTasks) {
    deductions.push({
      reason: `Missing prescribed task: "${missing.name}" (${missing.title ?? missing.promptTask ?? 'no description'})`,
      points: prescribedCount > 0 ? 100 / prescribedCount : 0,
      evidence: [`Prescribed task "${missing.name}" was not observed in agent logs`],
    });
  }

  const score = prescribedCount > 0 ? (matchedCount / prescribedCount) * 100 : 100;
  evidence.push(`Matched ${matchedCount} of ${prescribedCount} prescribed tasks`);

  return {
    dimension: 'completeness',
    score: Math.round(score * 100) / 100,
    weight,
    maxScore: 100,
    applicable: prescribedCount > 0,
    evidence,
    deductions,
  };
}

// ---------------------------------------------------------------------------
// 2. Ordering
// ---------------------------------------------------------------------------

function scoreOrdering(
  prescribed: PrescribedTask[],
  observed: ObservedStep[],
  weight: number,
): DimensionScore {
  const evidence: string[] = [];
  const deductions: Deduction[] = [];
  const prescribedNames = prescribed.map((p) => p.name);
  const observedMatchedNames = observed
    .filter((o) => o.matchedStepId && o.matchConfidence > 0)
    .map((o) => o.matchedStepId!);

  if (prescribedNames.length === 0) {
    return { dimension: 'ordering', score: 100, weight, maxScore: 100, applicable: false, evidence: ['No prescribed tasks'], deductions: [] };
  }
  if (observedMatchedNames.length === 0) {
    return { dimension: 'ordering', score: 0, weight, maxScore: 100, applicable: true, evidence: ['No matched steps found'], deductions: [{ reason: 'No observed steps matched', points: 100, evidence: [] }] };
  }

  const lcsLen = longestCommonSubsequenceLength(prescribedNames, observedMatchedNames);
  const score = (lcsLen / prescribedNames.length) * 100;

  evidence.push(`LCS length: ${lcsLen} out of ${prescribedNames.length} prescribed tasks`);
  if (lcsLen < observedMatchedNames.length) {
    deductions.push({ reason: `${observedMatchedNames.length - lcsLen} task(s) out of order`, points: 100 - score, evidence: ['Order not followed'] });
  }

  return { dimension: 'ordering', score: Math.round(score * 100) / 100, weight, maxScore: 100, applicable: true, evidence, deductions };
}

function longestCommonSubsequenceLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1).fill(0);
  const curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    for (let j = 0; j <= n; j++) { prev[j] = curr[j]; curr[j] = 0; }
  }
  return prev[n];
}

// ---------------------------------------------------------------------------
// 3. Conditionality
// ---------------------------------------------------------------------------

function scoreConditionality(
  observed: ObservedStep[],
  executionTrace: ExecutionTrace,
  weight: number,
): DimensionScore {
  const evidence: string[] = [];
  const deductions: Deduction[] = [];

  const conditionKeywords = ['if', 'condition', 'check', 'evaluate', 'branch', 'skip', 'threshold'];
  const conditionEvidence = observed.filter((o) => {
    const actionLower = o.observedAction.toLowerCase();
    return conditionKeywords.some((kw) => actionLower.includes(kw));
  });

  if (conditionEvidence.length === 0) {
    return {
      dimension: 'conditionality', score: 50, weight, maxScore: 100, applicable: true,
      evidence: ['No clear conditional evaluation evidence found'],
      deductions: [{ reason: 'Could not verify condition evaluation', points: 50, evidence: ['Ambiguous'] }],
    };
  }

  evidence.push(`Found ${conditionEvidence.length} conditional evaluation(s)`);
  return { dimension: 'conditionality', score: 100, weight, maxScore: 100, applicable: true, evidence, deductions };
}

// ---------------------------------------------------------------------------
// 4. Parallelism
// ---------------------------------------------------------------------------

function scoreParallelism(executionTrace: ExecutionTrace, weight: number): DimensionScore {
  const evidence: string[] = [];
  const deductions: Deduction[] = [];
  const groups = executionTrace.parallelGroups;

  if (groups.length === 0) {
    return {
      dimension: 'parallelism', score: 0, weight, maxScore: 100, applicable: true,
      evidence: ['No parallel execution detected'],
      deductions: [{ reason: 'Expected parallel execution but none observed', points: 100, evidence: [] }],
    };
  }

  evidence.push(`Detected ${groups.length} parallel group(s)`);
  for (const g of groups) evidence.push(`Parallel: [${g.stepNames.join(', ')}]`);
  return { dimension: 'parallelism', score: 100, weight, maxScore: 100, applicable: true, evidence, deductions };
}

// ---------------------------------------------------------------------------
// 5. Granularity
// ---------------------------------------------------------------------------

function scoreGranularity(executionTrace: ExecutionTrace, weight: number): DimensionScore {
  const evidence: string[] = [];
  const deductions: Deduction[] = [];
  const loops = executionTrace.loops;

  if (loops.length === 0) {
    return {
      dimension: 'granularity', score: 0, weight, maxScore: 100, applicable: true,
      evidence: ['No iterative execution detected'],
      deductions: [{ reason: 'Expected per-item iteration but none observed', points: 100, evidence: [] }],
    };
  }

  for (const l of loops) evidence.push(`Loop "${l.stepName}": ${l.iterationCount} iterations`);
  return { dimension: 'granularity', score: 100, weight, maxScore: 100, applicable: true, evidence, deductions };
}

// ---------------------------------------------------------------------------
// 6. Aggregation
// ---------------------------------------------------------------------------

function scoreAggregation(
  prescribed: PrescribedTask[],
  observed: ObservedStep[],
  weight: number,
): DimensionScore {
  const evidence: string[] = [];
  const deductions: Deduction[] = [];

  const aggregationKeywords = [
    'aggregate', 'combine', 'merge', 'summarize', 'compile', 'consolidate',
    'collect', 'join', 'concatenate', 'histogram', 'table', 'report', 'tally', 'total', 'accumulate',
  ];

  const aggregationTasks = prescribed.filter((t) => {
    const text = `${t.name} ${t.title ?? ''} ${t.promptTask ?? ''}`.toLowerCase();
    return aggregationKeywords.some((kw) => text.includes(kw));
  });

  if (aggregationTasks.length === 0) {
    return { dimension: 'aggregation', score: 100, weight: 0, maxScore: 100, applicable: false, evidence: ['No aggregation tasks'], deductions: [] };
  }

  let matched = 0;
  for (const agg of aggregationTasks) {
    const obs = observed.find((o) => o.matchedStepId === agg.name && o.matchConfidence > 0);
    if (obs) { matched++; evidence.push(`"${agg.name}": matched`); }
    else {
      const fuzzy = observed.find((o) => aggregationKeywords.some((kw) => o.observedAction.toLowerCase().includes(kw)));
      if (fuzzy) { matched += 0.5; evidence.push(`"${agg.name}": fuzzy match`); }
      else { deductions.push({ reason: `"${agg.name}" not observed`, points: 100 / aggregationTasks.length, evidence: [] }); }
    }
  }

  const score = (matched / aggregationTasks.length) * 100;
  return { dimension: 'aggregation', score: Math.min(Math.round(score * 100) / 100, 100), weight, maxScore: 100, applicable: true, evidence, deductions };
}

// ---------------------------------------------------------------------------
// 7. Error Handling
// ---------------------------------------------------------------------------

function scoreErrorHandling(
  errorHandlers: Array<{ id: string; triggerCondition: string; action: string }>,
  observed: ObservedStep[],
  executionTrace: ExecutionTrace,
  weight: number,
): DimensionScore {
  const evidence: string[] = [];
  const deductions: Deduction[] = [];

  if (errorHandlers.length === 0) {
    return { dimension: 'errorHandling', score: 100, weight: 0, maxScore: 100, applicable: false, evidence: ['No error handlers defined'], deductions: [] };
  }

  let correct = 0;
  for (const handler of errorHandlers) {
    const keywords = handler.action.toLowerCase().split(/[\s\-_]+/);
    const matched = observed.find((o) => keywords.some((kw) => kw.length > 3 && o.observedAction.toLowerCase().includes(kw)));

    if (matched) {
      correct++;
      evidence.push(`"${handler.id}": observed`);
    } else {
      const hadErrors = executionTrace.session.events.some((e) => e.type === 'error');
      if (!hadErrors) { correct++; evidence.push(`"${handler.id}": no errors occurred`); }
      else { deductions.push({ reason: `"${handler.id}" not followed`, points: 100 / errorHandlers.length, evidence: ['Errors occurred but handler not observed'] }); }
    }
  }

  const score = (correct / errorHandlers.length) * 100;
  return { dimension: 'errorHandling', score: Math.round(score * 100) / 100, weight, maxScore: 100, applicable: true, evidence, deductions };
}

// ---------------------------------------------------------------------------
// Aggregate score computation
// ---------------------------------------------------------------------------

function computeAggregateScores(
  dimensions: Record<ObedienceDimension, DimensionScore>,
): { weightedScore: number; rawScore: number } {
  let weightedSum = 0;
  let weightSum = 0;
  let rawSum = 0;
  let applicableCount = 0;

  for (const dim of ALL_DIMENSIONS) {
    const ds = dimensions[dim];
    if (!ds.applicable) continue;
    applicableCount++;
    rawSum += ds.score;
    if (ds.weight > 0) {
      weightedSum += ds.score * ds.weight;
      weightSum += ds.weight;
    }
  }

  return {
    weightedScore: weightSum > 0 ? Math.round((weightedSum / weightSum) * 100) / 100 : 0,
    rawScore: applicableCount > 0 ? Math.round((rawSum / applicableCount) * 100) / 100 : 0,
  };
}
