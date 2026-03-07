/**
 * Obedience Benchmark -- Shared Types
 *
 * All core type definitions used across the plugin's skills,
 * process definitions, judge, and reporting pipeline.
 */

// ---------------------------------------------------------------------------
// Obedience Dimensions
// ---------------------------------------------------------------------------

/** The 7 dimensions of obedience the benchmark measures. */
export type ObedienceDimension =
  | 'completeness'
  | 'ordering'
  | 'conditionality'
  | 'parallelism'
  | 'granularity'
  | 'aggregation'
  | 'errorHandling';

export const ALL_DIMENSIONS: readonly ObedienceDimension[] = [
  'completeness',
  'ordering',
  'conditionality',
  'parallelism',
  'granularity',
  'aggregation',
  'errorHandling',
] as const;

// ---------------------------------------------------------------------------
// Task Definition Types (babysitter-format process files)
// ---------------------------------------------------------------------------

/** A task definition created by `defineTask()` from the babysitter SDK. */
export interface TaskDefinition {
  /** Unique task name (first arg to defineTask). */
  taskName: string;
  /** Factory function that produces the task spec. */
  factory: (args: Record<string, unknown>, taskCtx: { effectId: string }) => TaskSpec;
}

/** The spec returned by a defineTask factory function. */
export interface TaskSpec {
  kind: 'agent' | 'node' | 'shell' | 'skill' | 'breakpoint' | 'sleep';
  title: string;
  agent?: {
    name: string;
    prompt: {
      role: string;
      task: string;
      context?: Record<string, unknown>;
      instructions?: string[];
      outputFormat?: string;
    };
    outputSchema?: Record<string, unknown>;
  };
  io?: {
    inputJsonPath?: string;
    outputJsonPath?: string;
  };
  labels?: string[];
}

/** Error handler metadata exported by a process file. */
export interface ErrorHandlerDef {
  id: string;
  triggerCondition: string;
  action: string;
  maxRetries?: number;
  logAs?: string;
}

// ---------------------------------------------------------------------------
// Process Module Exports (shape of *.process.js files)
// ---------------------------------------------------------------------------

/** Metadata exported by a process.js file. */
export interface ProcessMetadata {
  name: string;
  domain: string;
  complexity: 'low' | 'medium' | 'high';
  estimatedDuration: string;
  dimensions: ObedienceDimension[];
  tags: string[];
}

/** Evaluation criteria exported by a process.js file. */
export interface ProcessEvaluation {
  [dimension: string]: {
    weight: number;
    criteria: string;
    notApplicable?: string;
  };
}

/** The shape of a babysitter-format *.process.js module when imported. */
export interface ProcessModule {
  metadata: ProcessMetadata;
  process: (inputs: unknown, ctx: unknown) => Promise<unknown>;
  evaluation: ProcessEvaluation;
  errorHandlers?: ErrorHandlerDef[];
  [exportName: string]: unknown;
}

// ---------------------------------------------------------------------------
// Catalog Types
// ---------------------------------------------------------------------------

/** A single entry in the task catalog index. */
export interface CatalogEntry {
  /** Task name (unique identifier). */
  name: string;
  /** Problem domain. */
  domain: string;
  /** Process complexity. */
  complexity: 'low' | 'medium' | 'high';
  /** Estimated duration for a compliant agent. */
  estimatedDuration?: string;
  /** Obedience dimensions exercised by this task. */
  dimensions: ObedienceDimension[];
  /** Free-form tags. */
  tags: string[];
  /** Filesystem path to the task directory. */
  taskDir: string;
  /** Path to the task.yaml file. */
  yamlPath: string;
  /** Path to the *.process.js file. */
  processPath: string;
  /** Whether the task has been validated successfully. */
  validated: boolean;
  /** Validation errors (if any). */
  validationErrors?: string[];
}

/** Filter criteria for querying the catalog. */
export interface CatalogFilter {
  domains?: string[];
  complexity?: ('low' | 'medium' | 'high')[];
  dimensions?: ObedienceDimension[];
  tags?: string[];
  namePattern?: string;
  validatedOnly?: boolean;
}

/** The result of a catalog query. */
export interface TaskSelection {
  tasks: CatalogEntry[];
  totalAvailable: number;
  filterApplied: CatalogFilter;
}

// ---------------------------------------------------------------------------
// Prepared Task
// ---------------------------------------------------------------------------

/** A task with all inputs materialized and ready for execution. */
export interface PreparedTask {
  /** Reference to the catalog entry. */
  catalogEntry: CatalogEntry;
  /** Path to the directory containing materialized inputs. */
  inputDir: string;
  /** The task prompt to inject into the agent. */
  taskPrompt: string;
  /** Optional system prompt. */
  systemPrompt?: string;
  /** Paths to evaluation reference artifacts. */
  evaluationArtifacts: string[];
  /** Preparation metadata. */
  preparedAt: string;
  /** Time taken to prepare (ms). */
  preparationDurationMs: number;
}

// ---------------------------------------------------------------------------
// Session Log Events (parsed from agent execution)
// ---------------------------------------------------------------------------

/** Types of events captured from an agent session. */
export type LogEventType =
  | 'session_start'
  | 'session_end'
  | 'message_sent'
  | 'message_received'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'tool_result'
  | 'error'
  | 'timeout'
  | 'resource_warning'
  | 'custom';

/** A single structured event from the agent's session. */
export interface LogEvent {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Event type. */
  type: LogEventType;
  /** Sequence number within the session. */
  sequence: number;
  /** Tool name (for tool_call events). */
  toolName?: string;
  /** Tool call parameters (for tool_call_start). */
  toolParams?: Record<string, unknown>;
  /** Tool result (for tool_call_end / tool_result). */
  toolResult?: unknown;
  /** Message content (for message events). */
  content?: string;
  /** Error details. */
  error?: string;
  /** Duration of the event (for tool calls). */
  durationMs?: number;
  /** Arbitrary additional data. */
  data?: Record<string, unknown>;
}

/** Parsed session log, ready for judge analysis. */
export interface ParsedSessionLog {
  /** Run ID. */
  runId: string;
  /** Agent identifier (model + harness). */
  agentId: string;
  /** All events in chronological order. */
  events: LogEvent[];
  /** Total session duration (ms). */
  totalDurationMs: number;
  /** Count of tool calls. */
  toolCallCount: number;
  /** Count of messages. */
  messageCount: number;
  /** Whether the session completed normally. */
  completedNormally: boolean;
}

// ---------------------------------------------------------------------------
// Observed Steps (judge's interpretation of session logs)
// ---------------------------------------------------------------------------

/** A step the judge observed in the agent's session logs. */
export interface ObservedStep {
  /** Matched prescribed step ID (if identifiable). */
  matchedStepId?: string;
  /** What the agent actually did (summarized from logs). */
  observedAction: string;
  /** Log events that constitute this step. */
  events: LogEvent[];
  /** Start timestamp. */
  startTime: string;
  /** End timestamp. */
  endTime: string;
  /** Duration (ms). */
  durationMs: number;
  /** Whether this step ran concurrently with another step. */
  concurrent: boolean;
  /** IDs of steps that overlapped in time. */
  concurrentWith?: string[];
  /** The granularity the agent operated at. */
  observedGranularity?: string;
  /** How the agent aggregated results (if applicable). */
  observedAggregation?: string;
  /** Judge's confidence in this match (0-1). */
  matchConfidence: number;
}

// ---------------------------------------------------------------------------
// Scorecard (judge output)
// ---------------------------------------------------------------------------

/** A single deduction within a dimension score. */
export interface Deduction {
  /** What went wrong. */
  reason: string;
  /** Points deducted (positive number). */
  points: number;
  /** Log evidence (event indices or excerpts). */
  evidence: string[];
}

/** Per-dimension score detail. */
export interface DimensionScore {
  /** Dimension name. */
  dimension: ObedienceDimension;
  /** Score (0-100). */
  score: number;
  /** Weight from the task's evaluation spec. */
  weight: number;
  /** Maximum possible score (always 100). */
  maxScore: 100;
  /** Whether this dimension is applicable to the task. */
  applicable: boolean;
  /** Evidence the judge found. */
  evidence: string[];
  /** Specific deductions applied. */
  deductions: Deduction[];
}

/** The full scorecard produced by the judge for one task run. */
export interface ObedienceScorecard {
  /** Unique run identifier. */
  runId: string;
  /** Task name. */
  taskName: string;
  /** Agent identifier (e.g., "claude-code:claude-3-opus"). */
  agentId: string;
  /** When the scoring was performed. */
  timestamp: string;
  /** Per-dimension scores. */
  dimensions: Record<ObedienceDimension, DimensionScore>;
  /** Final weighted score (0-100). */
  weightedScore: number;
  /** Unweighted average score (0-100). */
  rawScore: number;
  /** Task definitions from the process file. */
  prescribedTasks: Array<{ name: string; exportName: string }>;
  /** Observed steps from the session logs. */
  observedSteps: ObservedStep[];
  /** Scoring metadata. */
  metadata: {
    /** Time the judge spent scoring (ms). */
    judgeDurationMs: number;
    /** Number of steps in the prescribed process. */
    processStepCount: number;
    /** Number of steps observed in session logs. */
    observedStepCount: number;
    /** Number of log lines analyzed. */
    logLineCount: number;
    /** Number of log events analyzed. */
    logEventCount: number;
    /** Judge version. */
    judgeVersion: string;
  };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/** A single entry on the leaderboard. */
export interface LeaderboardEntry {
  /** Agent identifier. */
  agentId: string;
  /** Agent harness type. */
  harness: string;
  /** Model name/version. */
  model: string;
  /** Aggregate weighted score across all tasks. */
  totalScore: number;
  /** Per-task scores. */
  taskScores: Record<string, number>;
  /** Average score per dimension. */
  dimensionAverages: Record<ObedienceDimension, number>;
  /** Number of benchmark runs completed. */
  runsCompleted: number;
  /** Timestamp of most recent run. */
  lastRunTimestamp: string;
}

/** The full leaderboard. */
export interface Leaderboard {
  /** When the leaderboard was last updated. */
  updatedAt: string;
  /** Benchmark version. */
  benchmarkVersion: string;
  /** Number of tasks in the benchmark suite. */
  taskCount: number;
  /** Ranked entries (highest score first). */
  entries: LeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// Benchmark Run (orchestrator state)
// ---------------------------------------------------------------------------

/** Status of a benchmark run. */
export type BenchmarkRunStatus =
  | 'pending'
  | 'preparing'
  | 'running'
  | 'judging'
  | 'reporting'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** A complete benchmark run managed by the benchmarker skill. */
export interface BenchmarkRun {
  /** Unique run identifier. */
  runId: string;
  /** Current status. */
  status: BenchmarkRunStatus;
  /** Agent being benchmarked. */
  agentId: string;
  /** Tasks selected for this run. */
  taskSelection: TaskSelection;
  /** Per-task preparation state. */
  preparedTasks: Record<string, PreparedTask>;
  /** Per-task runner results. */
  runnerResults: Record<string, import('../../candidate-runner/scripts/runner-interface.js').RunnerResult>;
  /** Per-task scorecards. */
  scorecards: Record<string, ObedienceScorecard>;
  /** Aggregate results (populated after judging). */
  aggregateScore?: number;
  /** Run configuration. */
  config: {
    maxConcurrentTasks: number;
    timeoutPerTaskMs: number;
    retryFailedTasks: boolean;
    maxRetries: number;
  };
  /** Timing. */
  startedAt?: string;
  completedAt?: string;
  /** Error message if failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Report Types
// ---------------------------------------------------------------------------

/** A compiled benchmark report. */
export interface BenchmarkReport {
  /** Report title. */
  title: string;
  /** When the report was generated. */
  generatedAt: string;
  /** The benchmark run this report covers. */
  runId: string;
  /** Agent evaluated. */
  agentId: string;
  /** Summary statistics. */
  summary: {
    overallScore: number;
    tasksCompleted: number;
    tasksFailed: number;
    totalDurationMs: number;
    strongestDimension: ObedienceDimension;
    weakestDimension: ObedienceDimension;
  };
  /** Per-task details. */
  taskDetails: Array<{
    taskName: string;
    domain: string;
    complexity: string;
    scorecard: ObedienceScorecard;
    highlights: string[];
    issues: string[];
  }>;
  /** Dimension-level analysis across all tasks. */
  dimensionAnalysis: Record<ObedienceDimension, {
    averageScore: number;
    taskScores: Record<string, number>;
    commonIssues: string[];
  }>;
}
