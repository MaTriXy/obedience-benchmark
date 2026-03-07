/**
 * Log Parser for Obedience Benchmark Judge
 *
 * Reads structured log files produced by the LogCollector and reconstructs
 * the candidate agent's execution trace. The judge uses this to compare
 * observed behaviour against the prescribed process.
 */

import { readFile } from 'node:fs/promises';
import type { LogEvent, ParsedSessionLog, ObservedStep } from './types.js';
import type { StructuredLog } from './log-collector.js';

// ---------------------------------------------------------------------------
// Parallel & Loop analysis types
// ---------------------------------------------------------------------------

/** A group of steps that executed concurrently (overlapping time windows). */
export interface ParallelGroup {
  /** Identifier for the group (from explicit parallel bracketing or inferred). */
  groupId: string;
  /** Step names that ran in parallel. */
  stepNames: string[];
  /** Earliest start time in the group. */
  startTime: string;
  /** Latest end time in the group. */
  endTime: string;
}

/** A detected loop — a step pattern that repeats with varying data. */
export interface LoopExecution {
  /** The repeating step name. */
  stepName: string;
  /** Number of iterations detected. */
  iterationCount: number;
  /** Individual iteration durations (ms). */
  iterationDurations: number[];
  /** Whether all iterations produced results (vs. some errored). */
  allSucceeded: boolean;
}

// ---------------------------------------------------------------------------
// ExecutionTrace — full reconstruction
// ---------------------------------------------------------------------------

/** Complete reconstruction of the candidate's execution for judge consumption. */
export interface ExecutionTrace {
  /** Parsed session-level metadata. */
  session: ParsedSessionLog;
  /** Ordered list of observed steps. */
  steps: ObservedStep[];
  /** Detected parallel groups. */
  parallelGroups: ParallelGroup[];
  /** Detected loop executions. */
  loops: LoopExecution[];
  /** Total wall-clock duration (ms). */
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface StepWindow {
  name: string;
  startTime: string;
  endTime: string;
  startSeq: number;
  endSeq: number;
  durationMs: number;
  events: LogEvent[];
  result?: unknown;
  metadata?: Record<string, unknown>;
}

function isStepStart(e: LogEvent): boolean {
  return e.type === 'custom' && e.data?.['subtype'] === 'step_start';
}

function isStepEnd(e: LogEvent): boolean {
  return e.type === 'custom' && e.data?.['subtype'] === 'step_end';
}

function isParallelStart(e: LogEvent): boolean {
  return e.type === 'custom' && e.data?.['subtype'] === 'parallel_start';
}

function isParallelEnd(e: LogEvent): boolean {
  return e.type === 'custom' && e.data?.['subtype'] === 'parallel_end';
}

/**
 * Build step windows from the event stream by pairing step_start / step_end
 * custom events. Events between the pair are associated with the step.
 */
function buildStepWindows(events: LogEvent[]): StepWindow[] {
  const windows: StepWindow[] = [];
  const openSteps = new Map<string, { startEvent: LogEvent; events: LogEvent[] }>();

  for (const e of events) {
    if (isStepStart(e)) {
      const name = e.data!['stepName'] as string;
      openSteps.set(name, { startEvent: e, events: [] });
      continue;
    }

    if (isStepEnd(e)) {
      const name = e.data!['stepName'] as string;
      const open = openSteps.get(name);
      if (open) {
        const startMs = new Date(open.startEvent.timestamp).getTime();
        const endMs = new Date(e.timestamp).getTime();
        windows.push({
          name,
          startTime: open.startEvent.timestamp,
          endTime: e.timestamp,
          startSeq: open.startEvent.sequence,
          endSeq: e.sequence,
          durationMs: endMs - startMs,
          events: open.events,
          result: e.data?.['result'],
          metadata: open.startEvent.data as Record<string, unknown> | undefined,
        });
        openSteps.delete(name);
      }
      continue;
    }

    // Associate intermediate events with all currently-open steps.
    for (const open of openSteps.values()) {
      open.events.push(e);
    }
  }

  // Sort by start sequence.
  windows.sort((a, b) => a.startSeq - b.startSeq);
  return windows;
}

/**
 * Determine overlap between two time windows.
 */
function windowsOverlap(a: StepWindow, b: StepWindow): boolean {
  const aStart = new Date(a.startTime).getTime();
  const aEnd = new Date(a.endTime).getTime();
  const bStart = new Date(b.startTime).getTime();
  const bEnd = new Date(b.endTime).getTime();
  return aStart < bEnd && bStart < aEnd;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read and parse a structured log file produced by LogCollector.save().
 */
export async function parseSessionLog(logPath: string): Promise<ParsedSessionLog> {
  const raw = await readFile(logPath, 'utf-8');
  const structured: StructuredLog = JSON.parse(raw);
  return structuredLogToSession(structured);
}

/**
 * Convert a StructuredLog object (already in memory) to a ParsedSessionLog.
 */
export function structuredLogToSession(log: StructuredLog): ParsedSessionLog {
  const hasError = log.events.some(
    (e) => e.type === 'error' || e.type === 'timeout',
  );
  const lastEvent = log.events[log.events.length - 1];
  const completedNormally =
    !hasError &&
    (lastEvent?.type === 'session_end' || log.endedAt !== undefined);

  return {
    runId: log.runId,
    agentId: log.agentId,
    events: log.events,
    totalDurationMs: log.summary.totalDurationMs,
    toolCallCount: log.summary.toolCallCount,
    messageCount: log.summary.messageCount,
    completedNormally,
  };
}

/**
 * Extract the sequence of discrete steps the candidate executed.
 * Steps are identified by step_start / step_end bracket events.
 */
export function extractObservedSteps(log: StructuredLog): ObservedStep[] {
  const windows = buildStepWindows(log.events);
  const steps: ObservedStep[] = [];

  for (const w of windows) {
    // Determine concurrency by checking overlap with other windows.
    const concurrentWith: string[] = [];
    for (const other of windows) {
      if (other.name !== w.name && windowsOverlap(w, other)) {
        concurrentWith.push(other.name);
      }
    }

    steps.push({
      matchedStepId: w.name,
      observedAction: w.name,
      events: w.events,
      startTime: w.startTime,
      endTime: w.endTime,
      durationMs: w.durationMs,
      concurrent: concurrentWith.length > 0,
      concurrentWith: concurrentWith.length > 0 ? concurrentWith : undefined,
      matchConfidence: 1.0,
    });
  }

  return steps;
}

/**
 * Identify groups of steps that ran in parallel.
 *
 * Uses two strategies:
 *   1. Explicit: parallel_start / parallel_end bracket events emitted by the
 *      collector's startParallel / endParallel helpers.
 *   2. Inferred: steps with overlapping time windows that were not explicitly
 *      bracketed.
 */
export function detectParallelism(steps: ObservedStep[]): ParallelGroup[] {
  const groups: ParallelGroup[] = [];
  const assigned = new Set<string>();

  // Build overlap graph.
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (assigned.has(s.matchedStepId ?? s.observedAction)) continue;
    if (!s.concurrent) continue;

    const groupSteps = [s];
    const groupNames = new Set<string>([s.matchedStepId ?? s.observedAction]);

    for (const otherId of s.concurrentWith ?? []) {
      const other = steps.find(
        (o) => (o.matchedStepId ?? o.observedAction) === otherId,
      );
      if (other && !assigned.has(otherId)) {
        groupSteps.push(other);
        groupNames.add(otherId);
      }
    }

    if (groupSteps.length > 1) {
      for (const name of groupNames) assigned.add(name);

      const starts = groupSteps.map((g) => g.startTime);
      const ends = groupSteps.map((g) => g.endTime);
      starts.sort();
      ends.sort();

      groups.push({
        groupId: `parallel-${groups.length}`,
        stepNames: [...groupNames],
        startTime: starts[0],
        endTime: ends[ends.length - 1],
      });
    }
  }

  return groups;
}

/**
 * Detect repeated step patterns that indicate loop execution.
 *
 * A loop is identified when the same step name appears multiple times
 * in the observed steps (the collector emits separate start/end pairs
 * per iteration with the same base name suffixed with the index, or
 * identical names for simple sequential repetition).
 */
export function detectLoops(steps: ObservedStep[]): LoopExecution[] {
  // Group steps by base name. We strip a trailing numeric suffix
  // (e.g., "process-item-0", "process-item-1" -> "process-item") to
  // identify iterations of the same logical step.
  const baseNamePattern = /^(.+?)(?:-(\d+))?$/;
  const groups = new Map<string, ObservedStep[]>();

  for (const step of steps) {
    const id = step.matchedStepId ?? step.observedAction;
    const match = baseNamePattern.exec(id);
    const baseName = match ? match[1] : id;

    if (!groups.has(baseName)) {
      groups.set(baseName, []);
    }
    groups.get(baseName)!.push(step);
  }

  const loops: LoopExecution[] = [];

  for (const [baseName, group] of groups) {
    if (group.length < 2) continue;

    const hasErrors = group.some((s) =>
      s.events.some((e) => e.type === 'error'),
    );

    loops.push({
      stepName: baseName,
      iterationCount: group.length,
      iterationDurations: group.map((s) => s.durationMs),
      allSucceeded: !hasErrors,
    });
  }

  return loops;
}

/**
 * Build a complete execution trace from a structured log.
 *
 * This is the main entry point the judge calls to reconstruct what the
 * candidate agent did during a session.
 */
export function buildExecutionTrace(log: StructuredLog): ExecutionTrace {
  const session = structuredLogToSession(log);
  const steps = extractObservedSteps(log);
  const parallelGroups = detectParallelism(steps);
  const loops = detectLoops(steps);

  return {
    session,
    steps,
    parallelGroups,
    loops,
    totalDurationMs: log.summary.totalDurationMs,
  };
}
