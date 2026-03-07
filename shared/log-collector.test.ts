/**
 * Unit tests for LogCollector and LogParser
 *
 * Run with: npx tsx --test shared/log-collector.test.ts
 * (or node --loader tsx --test shared/log-collector.test.ts)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LogCollector } from './log-collector.js';
import type { StructuredLog } from './log-collector.js';
import {
  extractObservedSteps,
  detectParallelism,
  detectLoops,
  buildExecutionTrace,
  structuredLogToSession,
} from './log-parser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCollector(): LogCollector {
  return new LogCollector('run-001', 'claude-code:opus');
}

/** Advance the clock slightly to ensure distinct timestamps. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

// ---------------------------------------------------------------------------
// LogCollector — recording events
// ---------------------------------------------------------------------------

describe('LogCollector', () => {
  describe('addEvent', () => {
    it('should record events and assign sequence numbers', () => {
      const c = makeCollector();
      c.addEvent({
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'session_start',
        sequence: 0,
      });
      c.addEvent({
        timestamp: '2026-01-01T00:00:01.000Z',
        type: 'message_sent',
        sequence: 1,
        content: 'hello',
      });

      const events = c.getEvents();
      assert.equal(events.length, 2);
      assert.equal(events[0].type, 'session_start');
      assert.equal(events[1].type, 'message_sent');
      assert.equal(events[1].content, 'hello');
    });

    it('should auto-assign sequence when omitted', () => {
      const c = makeCollector();
      // Cast to bypass strict type — sequence is filled in by addEvent.
      c.addEvent({ type: 'session_start' } as any);
      c.addEvent({ type: 'message_sent', content: 'hi' } as any);

      const events = c.getEvents();
      assert.equal(events.length, 2);
      // Sequences are assigned incrementally.
      assert.equal(typeof events[0].sequence, 'number');
      assert.equal(typeof events[1].sequence, 'number');
      assert.ok(events[1].sequence > events[0].sequence);
    });

    it('should auto-assign timestamp when omitted', () => {
      const c = makeCollector();
      c.addEvent({ type: 'session_start', sequence: 0 } as any);
      const events = c.getEvents();
      assert.ok(events[0].timestamp, 'timestamp should be present');
      // Should be a valid ISO string.
      assert.ok(!isNaN(new Date(events[0].timestamp).getTime()));
    });
  });

  describe('convenience recorders', () => {
    it('should record tool calls and results', () => {
      const c = makeCollector();
      c.recordToolCall('read_file', { path: '/tmp/a.txt' });
      c.recordToolResult('read_file', 'contents here', 42);

      const events = c.getEvents();
      assert.equal(events.length, 2);
      assert.equal(events[0].type, 'tool_call_start');
      assert.equal(events[0].toolName, 'read_file');
      assert.deepEqual(events[0].toolParams, { path: '/tmp/a.txt' });
      assert.equal(events[1].type, 'tool_call_end');
      assert.equal(events[1].toolResult, 'contents here');
      assert.equal(events[1].durationMs, 42);
    });

    it('should record text output', () => {
      const c = makeCollector();
      c.recordTextOutput('The answer is 42.');

      const events = c.getEvents();
      assert.equal(events[0].type, 'message_received');
      assert.equal(events[0].content, 'The answer is 42.');
    });

    it('should record errors', () => {
      const c = makeCollector();
      c.recordError('File not found', { path: '/missing' });

      const events = c.getEvents();
      assert.equal(events[0].type, 'error');
      assert.equal(events[0].error, 'File not found');
      assert.deepEqual(events[0].data, { path: '/missing' });
    });
  });

  describe('step bracketing', () => {
    it('should emit step_start and step_end custom events', async () => {
      const c = makeCollector();
      c.startStep('fetch-data', { url: 'https://example.com' });
      await tick();
      c.endStep('fetch-data', { rows: 10 });

      const events = c.getEvents();
      assert.equal(events.length, 2);

      // Start event
      assert.equal(events[0].type, 'custom');
      assert.equal(events[0].data?.['subtype'], 'step_start');
      assert.equal(events[0].data?.['stepName'], 'fetch-data');
      assert.equal(events[0].data?.['url'], 'https://example.com');

      // End event
      assert.equal(events[1].type, 'custom');
      assert.equal(events[1].data?.['subtype'], 'step_end');
      assert.equal(events[1].data?.['stepName'], 'fetch-data');
      assert.deepEqual(events[1].data?.['result'], { rows: 10 });
      assert.ok(
        (events[1].durationMs ?? 0) >= 0,
        'durationMs should be non-negative',
      );
    });

    it('should handle nested steps', async () => {
      const c = makeCollector();
      c.startStep('outer');
      await tick();
      c.startStep('inner');
      await tick();
      c.endStep('inner');
      c.endStep('outer');

      const events = c.getEvents();
      assert.equal(events.length, 4);
      assert.equal(events[0].data?.['stepName'], 'outer');
      assert.equal(events[0].data?.['subtype'], 'step_start');
      assert.equal(events[1].data?.['stepName'], 'inner');
      assert.equal(events[1].data?.['subtype'], 'step_start');
      assert.equal(events[2].data?.['stepName'], 'inner');
      assert.equal(events[2].data?.['subtype'], 'step_end');
      assert.equal(events[3].data?.['stepName'], 'outer');
      assert.equal(events[3].data?.['subtype'], 'step_end');
    });
  });

  describe('parallel bracketing', () => {
    it('should emit parallel_start and parallel_end events', () => {
      const c = makeCollector();
      c.startParallel('group-1', ['step-a', 'step-b']);
      c.endParallel('group-1');

      const events = c.getEvents();
      assert.equal(events.length, 2);
      assert.equal(events[0].data?.['subtype'], 'parallel_start');
      assert.equal(events[0].data?.['groupId'], 'group-1');
      assert.deepEqual(events[0].data?.['stepNames'], ['step-a', 'step-b']);
      assert.equal(events[1].data?.['subtype'], 'parallel_end');
      assert.equal(events[1].data?.['groupId'], 'group-1');
    });
  });

  describe('toStructuredLog', () => {
    it('should produce a valid StructuredLog with summary', () => {
      const c = makeCollector();
      c.recordToolCall('bash', { cmd: 'ls' });
      c.recordToolResult('bash', 'file.txt', 10);
      c.recordTextOutput('Done.');
      c.recordError('oops');
      c.startStep('step-a');
      c.endStep('step-a');
      c.end();

      const log = c.toStructuredLog();
      assert.equal(log.version, '1.0');
      assert.equal(log.runId, 'run-001');
      assert.equal(log.agentId, 'claude-code:opus');
      assert.ok(log.startedAt);
      assert.ok(log.endedAt);
      assert.equal(log.events.length, 6);

      // Summary counts
      assert.equal(log.summary.totalEvents, 6);
      assert.equal(log.summary.toolCallCount, 2); // start + end
      assert.equal(log.summary.messageCount, 1);
      assert.equal(log.summary.errorCount, 1);
      assert.equal(log.summary.stepCount, 1);
      assert.ok(log.summary.totalDurationMs >= 0);
    });

    it('should return a copy of events (not a reference)', () => {
      const c = makeCollector();
      c.recordTextOutput('hello');
      const log1 = c.toStructuredLog();
      c.recordTextOutput('world');
      const log2 = c.toStructuredLog();
      assert.equal(log1.events.length, 1);
      assert.equal(log2.events.length, 2);
    });
  });

  describe('eventCount', () => {
    it('should track the number of recorded events', () => {
      const c = makeCollector();
      assert.equal(c.eventCount, 0);
      c.recordTextOutput('a');
      assert.equal(c.eventCount, 1);
      c.recordTextOutput('b');
      assert.equal(c.eventCount, 2);
    });
  });
});

// ---------------------------------------------------------------------------
// LogParser — parsing structured logs
// ---------------------------------------------------------------------------

describe('LogParser', () => {
  /**
   * Build a StructuredLog fixture with controlled timestamps for
   * deterministic testing.
   */
  function makeLog(events: Partial<import('./types.js').LogEvent>[]): StructuredLog {
    const fullEvents = events.map((e, i) => ({
      timestamp: e.timestamp ?? `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
      type: e.type ?? ('custom' as const),
      sequence: e.sequence ?? i,
      ...e,
    })) as import('./types.js').LogEvent[];

    const toolCallCount = fullEvents.filter(
      (e) => e.type === 'tool_call_start' || e.type === 'tool_call_end',
    ).length;
    const messageCount = fullEvents.filter(
      (e) => e.type === 'message_sent' || e.type === 'message_received',
    ).length;
    const errorCount = fullEvents.filter((e) => e.type === 'error').length;
    const stepCount = fullEvents.filter(
      (e) => e.type === 'custom' && e.data?.['subtype'] === 'step_start',
    ).length;

    return {
      version: '1.0',
      runId: 'run-test',
      agentId: 'test-agent',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:01:00.000Z',
      events: fullEvents,
      summary: {
        totalEvents: fullEvents.length,
        totalDurationMs: 60000,
        toolCallCount,
        messageCount,
        errorCount,
        stepCount,
      },
    };
  }

  describe('structuredLogToSession', () => {
    it('should convert a StructuredLog to ParsedSessionLog', () => {
      const log = makeLog([
        { type: 'session_start' },
        { type: 'message_sent', content: 'hi' },
        { type: 'session_end' },
      ]);
      const session = structuredLogToSession(log);
      assert.equal(session.runId, 'run-test');
      assert.equal(session.agentId, 'test-agent');
      assert.equal(session.events.length, 3);
      assert.equal(session.totalDurationMs, 60000);
      assert.equal(session.completedNormally, true);
    });

    it('should mark session as not completed normally on error', () => {
      const log = makeLog([
        { type: 'session_start' },
        { type: 'error', error: 'boom' },
      ]);
      const session = structuredLogToSession(log);
      assert.equal(session.completedNormally, false);
    });
  });

  describe('extractObservedSteps', () => {
    it('should extract steps from step_start/step_end pairs', () => {
      const log = makeLog([
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:00.000Z',
          data: { subtype: 'step_start', stepName: 'read-input' },
        },
        {
          type: 'tool_call_start',
          timestamp: '2026-01-01T00:00:01.000Z',
          toolName: 'read_file',
        },
        {
          type: 'tool_call_end',
          timestamp: '2026-01-01T00:00:02.000Z',
          toolName: 'read_file',
          toolResult: 'data',
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:03.000Z',
          data: { subtype: 'step_end', stepName: 'read-input', result: 'ok' },
        },
      ]);

      const steps = extractObservedSteps(log);
      assert.equal(steps.length, 1);
      assert.equal(steps[0].matchedStepId, 'read-input');
      assert.equal(steps[0].durationMs, 3000);
      assert.equal(steps[0].concurrent, false);
      // The intermediate tool_call events should be captured.
      assert.equal(steps[0].events.length, 2);
    });

    it('should detect concurrent steps with overlapping timestamps', () => {
      const log = makeLog([
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:00.000Z',
          sequence: 0,
          data: { subtype: 'step_start', stepName: 'step-a' },
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:01.000Z',
          sequence: 1,
          data: { subtype: 'step_start', stepName: 'step-b' },
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:03.000Z',
          sequence: 2,
          data: { subtype: 'step_end', stepName: 'step-a' },
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:04.000Z',
          sequence: 3,
          data: { subtype: 'step_end', stepName: 'step-b' },
        },
      ]);

      const steps = extractObservedSteps(log);
      assert.equal(steps.length, 2);
      // Both should be concurrent.
      assert.equal(steps[0].concurrent, true);
      assert.equal(steps[1].concurrent, true);
      assert.ok(steps[0].concurrentWith?.includes('step-b'));
      assert.ok(steps[1].concurrentWith?.includes('step-a'));
    });

    it('should not mark sequential steps as concurrent', () => {
      const log = makeLog([
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:00.000Z',
          sequence: 0,
          data: { subtype: 'step_start', stepName: 'first' },
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:01.000Z',
          sequence: 1,
          data: { subtype: 'step_end', stepName: 'first' },
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:02.000Z',
          sequence: 2,
          data: { subtype: 'step_start', stepName: 'second' },
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:03.000Z',
          sequence: 3,
          data: { subtype: 'step_end', stepName: 'second' },
        },
      ]);

      const steps = extractObservedSteps(log);
      assert.equal(steps[0].concurrent, false);
      assert.equal(steps[1].concurrent, false);
    });
  });

  describe('detectParallelism', () => {
    it('should group overlapping steps into parallel groups', () => {
      const steps = [
        {
          matchedStepId: 'a',
          observedAction: 'a',
          events: [],
          startTime: '2026-01-01T00:00:00.000Z',
          endTime: '2026-01-01T00:00:05.000Z',
          durationMs: 5000,
          concurrent: true,
          concurrentWith: ['b'],
          matchConfidence: 1,
        },
        {
          matchedStepId: 'b',
          observedAction: 'b',
          events: [],
          startTime: '2026-01-01T00:00:01.000Z',
          endTime: '2026-01-01T00:00:04.000Z',
          durationMs: 3000,
          concurrent: true,
          concurrentWith: ['a'],
          matchConfidence: 1,
        },
        {
          matchedStepId: 'c',
          observedAction: 'c',
          events: [],
          startTime: '2026-01-01T00:00:10.000Z',
          endTime: '2026-01-01T00:00:11.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
      ] satisfies import('./types.js').ObservedStep[];

      const groups = detectParallelism(steps);
      assert.equal(groups.length, 1);
      assert.ok(groups[0].stepNames.includes('a'));
      assert.ok(groups[0].stepNames.includes('b'));
      assert.equal(groups[0].startTime, '2026-01-01T00:00:00.000Z');
      assert.equal(groups[0].endTime, '2026-01-01T00:00:05.000Z');
    });

    it('should return empty array when no parallel steps exist', () => {
      const steps = [
        {
          matchedStepId: 'x',
          observedAction: 'x',
          events: [],
          startTime: '2026-01-01T00:00:00.000Z',
          endTime: '2026-01-01T00:00:01.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
      ] satisfies import('./types.js').ObservedStep[];

      const groups = detectParallelism(steps);
      assert.equal(groups.length, 0);
    });
  });

  describe('detectLoops', () => {
    it('should detect repeated step patterns by base name', () => {
      const steps = [
        {
          matchedStepId: 'process-item-0',
          observedAction: 'process-item-0',
          events: [],
          startTime: '2026-01-01T00:00:00.000Z',
          endTime: '2026-01-01T00:00:01.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
        {
          matchedStepId: 'process-item-1',
          observedAction: 'process-item-1',
          events: [],
          startTime: '2026-01-01T00:00:01.000Z',
          endTime: '2026-01-01T00:00:02.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
        {
          matchedStepId: 'process-item-2',
          observedAction: 'process-item-2',
          events: [],
          startTime: '2026-01-01T00:00:02.000Z',
          endTime: '2026-01-01T00:00:03.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
      ] satisfies import('./types.js').ObservedStep[];

      const loops = detectLoops(steps);
      assert.equal(loops.length, 1);
      assert.equal(loops[0].stepName, 'process-item');
      assert.equal(loops[0].iterationCount, 3);
      assert.deepEqual(loops[0].iterationDurations, [1000, 1000, 1000]);
      assert.equal(loops[0].allSucceeded, true);
    });

    it('should detect errors within loop iterations', () => {
      const steps = [
        {
          matchedStepId: 'fetch-0',
          observedAction: 'fetch-0',
          events: [
            {
              timestamp: '2026-01-01T00:00:00.500Z',
              type: 'error' as const,
              sequence: 1,
              error: 'timeout',
            },
          ],
          startTime: '2026-01-01T00:00:00.000Z',
          endTime: '2026-01-01T00:00:01.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
        {
          matchedStepId: 'fetch-1',
          observedAction: 'fetch-1',
          events: [],
          startTime: '2026-01-01T00:00:01.000Z',
          endTime: '2026-01-01T00:00:02.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
      ] satisfies import('./types.js').ObservedStep[];

      const loops = detectLoops(steps);
      assert.equal(loops.length, 1);
      assert.equal(loops[0].allSucceeded, false);
    });

    it('should not detect loops for unique step names', () => {
      const steps = [
        {
          matchedStepId: 'alpha',
          observedAction: 'alpha',
          events: [],
          startTime: '2026-01-01T00:00:00.000Z',
          endTime: '2026-01-01T00:00:01.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
        {
          matchedStepId: 'beta',
          observedAction: 'beta',
          events: [],
          startTime: '2026-01-01T00:00:01.000Z',
          endTime: '2026-01-01T00:00:02.000Z',
          durationMs: 1000,
          concurrent: false,
          matchConfidence: 1,
        },
      ] satisfies import('./types.js').ObservedStep[];

      const loops = detectLoops(steps);
      assert.equal(loops.length, 0);
    });
  });

  describe('buildExecutionTrace', () => {
    it('should produce a complete ExecutionTrace', () => {
      const log = makeLog([
        {
          type: 'session_start',
          timestamp: '2026-01-01T00:00:00.000Z',
          sequence: 0,
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:01.000Z',
          sequence: 1,
          data: { subtype: 'step_start', stepName: 'init' },
        },
        {
          type: 'tool_call_start',
          timestamp: '2026-01-01T00:00:02.000Z',
          sequence: 2,
          toolName: 'bash',
        },
        {
          type: 'tool_call_end',
          timestamp: '2026-01-01T00:00:03.000Z',
          sequence: 3,
          toolName: 'bash',
          toolResult: 'ok',
        },
        {
          type: 'custom',
          timestamp: '2026-01-01T00:00:04.000Z',
          sequence: 4,
          data: { subtype: 'step_end', stepName: 'init' },
        },
        {
          type: 'session_end',
          timestamp: '2026-01-01T00:00:05.000Z',
          sequence: 5,
        },
      ]);

      const trace = buildExecutionTrace(log);

      // Session
      assert.equal(trace.session.runId, 'run-test');
      assert.equal(trace.session.completedNormally, true);

      // Steps
      assert.equal(trace.steps.length, 1);
      assert.equal(trace.steps[0].matchedStepId, 'init');
      assert.equal(trace.steps[0].durationMs, 3000);

      // No parallel groups or loops in this trace.
      assert.equal(trace.parallelGroups.length, 0);
      assert.equal(trace.loops.length, 0);

      assert.equal(trace.totalDurationMs, 60000);
    });
  });
});
