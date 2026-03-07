/**
 * Structured Log Collector for Obedience Benchmark
 *
 * Wraps candidate agent sessions to capture tool calls, responses, and timing
 * in a standardized JSON format. The judge uses the output to reconstruct
 * what steps the candidate actually executed.
 */

import { writeFile } from 'node:fs/promises';
import type { LogEvent, LogEventType } from './types.js';

// ---------------------------------------------------------------------------
// Extended Event Types (superset of LogEventType for collector use)
// ---------------------------------------------------------------------------

/**
 * Event types supported by the collector. Includes the base LogEventType
 * values plus step/parallel bracketing events.
 */
export type CollectorEventType =
  | LogEventType
  | 'tool_call'
  | 'text_output'
  | 'step_start'
  | 'step_end'
  | 'parallel_start'
  | 'parallel_end';

// ---------------------------------------------------------------------------
// StructuredLog — the on-disk format
// ---------------------------------------------------------------------------

/** The complete structured log written to disk and consumed by the parser. */
export interface StructuredLog {
  /** Schema version for forward compatibility. */
  version: '1.0';
  /** Run identifier. */
  runId: string;
  /** Agent identifier (model + harness). */
  agentId: string;
  /** ISO-8601 timestamp when collection started. */
  startedAt: string;
  /** ISO-8601 timestamp when collection ended (may be absent if still running). */
  endedAt?: string;
  /** All recorded events in chronological order. */
  events: LogEvent[];
  /** Summary statistics computed at export time. */
  summary: {
    totalEvents: number;
    totalDurationMs: number;
    toolCallCount: number;
    messageCount: number;
    errorCount: number;
    stepCount: number;
  };
}

// ---------------------------------------------------------------------------
// Step tracking (internal)
// ---------------------------------------------------------------------------

interface ActiveStep {
  name: string;
  startTime: string;
  startSequence: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// LogCollector
// ---------------------------------------------------------------------------

/**
 * Records events as they happen during a candidate agent session.
 *
 * Usage:
 *   const collector = new LogCollector(runId, agentId);
 *   collector.addEvent({ ... });
 *   collector.startStep('fetch-data', { url: '...' });
 *   collector.endStep('fetch-data', { rows: 42 });
 *   const log = collector.toStructuredLog();
 *   await collector.save('/path/to/session.json');
 */
export class LogCollector {
  private readonly runId: string;
  private readonly agentId: string;
  private readonly startedAt: string;
  private endedAt?: string;
  private events: LogEvent[] = [];
  private sequenceCounter = 0;
  private activeSteps: Map<string, ActiveStep> = new Map();

  constructor(runId: string, agentId: string) {
    this.runId = runId;
    this.agentId = agentId;
    this.startedAt = new Date().toISOString();
  }

  // -----------------------------------------------------------------------
  // Core event recording
  // -----------------------------------------------------------------------

  /**
   * Record a timestamped event.
   *
   * If the event already has a sequence number it is preserved; otherwise one
   * is assigned automatically. A timestamp is added if missing.
   */
  addEvent(event: LogEvent): void {
    const recorded: LogEvent = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      sequence: event.sequence ?? this.nextSequence(),
    };
    this.events.push(recorded);
  }

  // -----------------------------------------------------------------------
  // Convenience helpers for common event types
  // -----------------------------------------------------------------------

  /** Record a tool invocation. */
  recordToolCall(toolName: string, params?: Record<string, unknown>): void {
    this.addEvent({
      timestamp: new Date().toISOString(),
      type: 'tool_call_start',
      sequence: this.nextSequence(),
      toolName,
      toolParams: params,
    });
  }

  /** Record a tool result. */
  recordToolResult(toolName: string, result: unknown, durationMs?: number): void {
    this.addEvent({
      timestamp: new Date().toISOString(),
      type: 'tool_call_end',
      sequence: this.nextSequence(),
      toolName,
      toolResult: result,
      durationMs,
    });
  }

  /** Record a text output from the agent. */
  recordTextOutput(content: string): void {
    this.addEvent({
      timestamp: new Date().toISOString(),
      type: 'message_received',
      sequence: this.nextSequence(),
      content,
    });
  }

  /** Record an error. */
  recordError(error: string, data?: Record<string, unknown>): void {
    this.addEvent({
      timestamp: new Date().toISOString(),
      type: 'error',
      sequence: this.nextSequence(),
      error,
      data,
    });
  }

  // -----------------------------------------------------------------------
  // Step bracketing
  // -----------------------------------------------------------------------

  /**
   * Mark the beginning of a named step.
   *
   * Emits a `custom` event with `data.subtype = 'step_start'` so the parser
   * can identify step boundaries within the standard LogEvent schema.
   */
  startStep(name: string, metadata?: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const seq = this.nextSequence();

    this.activeSteps.set(name, {
      name,
      startTime: now,
      startSequence: seq,
      metadata,
    });

    this.addEvent({
      timestamp: now,
      type: 'custom',
      sequence: seq,
      data: { subtype: 'step_start', stepName: name, ...metadata },
    });
  }

  /**
   * Mark the end of a named step.
   *
   * Emits a `custom` event with `data.subtype = 'step_end'` and includes the
   * step duration computed from the matching `startStep` call.
   */
  endStep(name: string, result?: unknown): void {
    const now = new Date().toISOString();
    const seq = this.nextSequence();
    const active = this.activeSteps.get(name);
    let durationMs: number | undefined;

    if (active) {
      durationMs = new Date(now).getTime() - new Date(active.startTime).getTime();
      this.activeSteps.delete(name);
    }

    this.addEvent({
      timestamp: now,
      type: 'custom',
      sequence: seq,
      durationMs,
      data: {
        subtype: 'step_end',
        stepName: name,
        result: result !== undefined ? result : undefined,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Parallel bracketing
  // -----------------------------------------------------------------------

  /** Mark the start of a parallel execution group. */
  startParallel(groupId: string, stepNames: string[]): void {
    this.addEvent({
      timestamp: new Date().toISOString(),
      type: 'custom',
      sequence: this.nextSequence(),
      data: { subtype: 'parallel_start', groupId, stepNames },
    });
  }

  /** Mark the end of a parallel execution group. */
  endParallel(groupId: string): void {
    this.addEvent({
      timestamp: new Date().toISOString(),
      type: 'custom',
      sequence: this.nextSequence(),
      data: { subtype: 'parallel_end', groupId },
    });
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  /** Mark the session as ended (sets endedAt if not already set). */
  end(): void {
    if (!this.endedAt) {
      this.endedAt = new Date().toISOString();
    }
  }

  /** Export all recorded events as a StructuredLog object. */
  toStructuredLog(): StructuredLog {
    const endedAt = this.endedAt ?? new Date().toISOString();
    const totalDurationMs =
      new Date(endedAt).getTime() - new Date(this.startedAt).getTime();

    let toolCallCount = 0;
    let messageCount = 0;
    let errorCount = 0;
    let stepCount = 0;

    for (const e of this.events) {
      if (e.type === 'tool_call_start' || e.type === 'tool_call_end') {
        toolCallCount++;
      }
      if (
        e.type === 'message_sent' ||
        e.type === 'message_received'
      ) {
        messageCount++;
      }
      if (e.type === 'error') {
        errorCount++;
      }
      if (
        e.type === 'custom' &&
        e.data?.['subtype'] === 'step_start'
      ) {
        stepCount++;
      }
    }

    return {
      version: '1.0',
      runId: this.runId,
      agentId: this.agentId,
      startedAt: this.startedAt,
      endedAt,
      events: [...this.events],
      summary: {
        totalEvents: this.events.length,
        totalDurationMs,
        toolCallCount,
        messageCount,
        errorCount,
        stepCount,
      },
    };
  }

  /** Write the structured log to disk as pretty-printed JSON. */
  async save(filepath: string): Promise<void> {
    const log = this.toStructuredLog();
    await writeFile(filepath, JSON.stringify(log, null, 2), 'utf-8');
  }

  /** Return a readonly snapshot of all events recorded so far. */
  getEvents(): readonly LogEvent[] {
    return [...this.events];
  }

  /** Return the current event count. */
  get eventCount(): number {
    return this.events.length;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private nextSequence(): number {
    return this.sequenceCounter++;
  }
}
