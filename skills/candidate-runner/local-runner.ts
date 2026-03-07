/**
 * Local Subprocess Runner
 *
 * Implements the Runner interface by spawning the candidate agent CLI as a
 * child process. Captures stdout/stderr in real time, enforces wall-clock
 * timeouts with SIGTERM/SIGKILL, and extracts session logs after completion.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { ulid } from 'ulid';

import type {
  Runner,
  RunnerConfig,
  RunnerResult,
  RunnerStatus,
  RunnerEvent,
  LogLine,
  AgentHarness,
} from '../../shared/runner-interface.js';
import { LogCollector } from '../../shared/log-collector.js';
import { collectArtifacts } from './runner.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_GRACE_PERIOD_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_WORKING_DIR = '/workspace';

// ---------------------------------------------------------------------------
// Harness CLI resolution
// ---------------------------------------------------------------------------

interface HarnessCommand {
  command: string;
  args: string[];
}

/**
 * Resolve the CLI command and arguments for a given agent harness.
 *
 * - `claude-code`: uses `claude --print` which accepts prompt on stdin
 * - `codex`: uses `codex --quiet` which accepts prompt on stdin
 * - `custom`: uses the user-provided `customCommand` and `customArgs`
 */
function resolveHarnessCommand(config: RunnerConfig): HarnessCommand {
  switch (config.harness) {
    case 'claude-code':
      return {
        command: 'claude',
        args: ['--print', '--output-format', 'json', '--verbose'],
      };
    case 'codex':
      return {
        command: 'codex',
        args: ['--quiet'],
      };
    case 'custom':
      if (!config.customCommand) {
        throw new Error(
          'Custom harness requires "customCommand" in RunnerConfig',
        );
      }
      return {
        command: config.customCommand,
        args: config.customArgs ?? [],
      };
    default: {
      const _exhaustive: never = config.harness;
      throw new Error(`Unknown harness: ${String(_exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Active run tracking
// ---------------------------------------------------------------------------

interface ActiveRun {
  runId: string;
  config: RunnerConfig;
  process: ChildProcess;
  collector: LogCollector;
  logs: LogLine[];
  events: RunnerEvent[];
  startTime: number;
  resolve: (result: RunnerResult) => void;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  killHandle?: ReturnType<typeof setTimeout>;
  completed: boolean;
}

// ---------------------------------------------------------------------------
// LocalRunner
// ---------------------------------------------------------------------------

export class LocalRunner implements Runner {
  private activeRuns = new Map<string, ActiveRun>();
  private completedResults = new Map<string, RunnerResult>();
  private tempDirs = new Map<string, string>();

  // -------------------------------------------------------------------------
  // Runner.run()
  // -------------------------------------------------------------------------

  async run(config: RunnerConfig): Promise<RunnerResult> {
    const runId = config.runId ?? ulid();
    const gracePeriodMs = config.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const agentId = `${config.harness}:${runId}`;

    // Set up working directory
    const workDir = await this.prepareWorkingDir(config, runId);

    // Write system prompt as CLAUDE.md if applicable
    if (config.systemPrompt && config.harness === 'claude-code') {
      await fs.writeFile(
        path.join(workDir, 'CLAUDE.md'),
        config.systemPrompt,
        'utf-8',
      );
    }

    // Symlink or copy input volumes into working dir
    await this.mountVolumes(config, workDir);

    // Resolve CLI command
    const { command, args } = resolveHarnessCommand(config);

    // Build environment
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...config.env,
    };

    // Initialize log collector
    const collector = new LogCollector(runId, agentId);
    collector.addEvent({
      timestamp: new Date().toISOString(),
      type: 'session_start',
      sequence: 0,
      data: { harness: config.harness, mode: 'local', workDir },
    });

    const logs: LogLine[] = [];
    const events: RunnerEvent[] = [];
    const startTime = Date.now();

    // Record agent_start event
    events.push({
      timestamp: new Date().toISOString(),
      type: 'agent_start',
      data: { command, args, workDir, harness: config.harness },
    });

    return new Promise<RunnerResult>((resolve) => {
      // Spawn the agent process
      const child = spawn(command, args, {
        cwd: workDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        // On Windows, shell is needed for .cmd executables
        shell: process.platform === 'win32',
      });

      const activeRun: ActiveRun = {
        runId,
        config,
        process: child,
        collector,
        logs,
        events,
        startTime,
        resolve,
        completed: false,
      };
      this.activeRuns.set(runId, activeRun);

      // Pipe task prompt to stdin
      if (child.stdin) {
        child.stdin.write(config.taskPrompt);
        child.stdin.end();
      }

      // Capture stdout line-by-line
      if (child.stdout) {
        let stdoutBuffer = '';
        child.stdout.on('data', (chunk: Buffer) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split('\n');
          // Keep the last incomplete line in the buffer
          stdoutBuffer = lines.pop() ?? '';
          for (const line of lines) {
            const logLine: LogLine = {
              timestamp: new Date().toISOString(),
              stream: 'stdout',
              text: line,
            };
            logs.push(logLine);
            this.tryParseEvent(line, events, collector);
          }
        });
        child.stdout.on('end', () => {
          if (stdoutBuffer.length > 0) {
            logs.push({
              timestamp: new Date().toISOString(),
              stream: 'stdout',
              text: stdoutBuffer,
            });
            this.tryParseEvent(stdoutBuffer, events, collector);
          }
        });
      }

      // Capture stderr line-by-line
      if (child.stderr) {
        let stderrBuffer = '';
        child.stderr.on('data', (chunk: Buffer) => {
          stderrBuffer += chunk.toString();
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() ?? '';
          for (const line of lines) {
            logs.push({
              timestamp: new Date().toISOString(),
              stream: 'stderr',
              text: line,
            });
          }
        });
        child.stderr.on('end', () => {
          if (stderrBuffer.length > 0) {
            logs.push({
              timestamp: new Date().toISOString(),
              stream: 'stderr',
              text: stderrBuffer,
            });
          }
        });
      }

      // Wall-clock timeout enforcement
      activeRun.timeoutHandle = setTimeout(() => {
        if (activeRun.completed) return;

        logs.push({
          timestamp: new Date().toISOString(),
          stream: 'system',
          text: `Timeout reached (${timeoutMs}ms). Sending SIGTERM.`,
        });
        events.push({
          timestamp: new Date().toISOString(),
          type: 'timeout_warning',
          data: { timeoutMs, action: 'SIGTERM' },
        });
        collector.addEvent({
          timestamp: new Date().toISOString(),
          type: 'timeout',
          sequence: -1, // auto-assigned
          content: `Timeout after ${timeoutMs}ms`,
        });

        child.kill('SIGTERM');

        // SIGKILL after grace period
        activeRun.killHandle = setTimeout(() => {
          if (activeRun.completed) return;
          logs.push({
            timestamp: new Date().toISOString(),
            stream: 'system',
            text: `Grace period expired (${gracePeriodMs}ms). Sending SIGKILL.`,
          });
          child.kill('SIGKILL');
        }, gracePeriodMs);
      }, timeoutMs);

      // Handle process exit
      child.on('close', async (exitCode, signal) => {
        if (activeRun.completed) return;
        activeRun.completed = true;

        // Clear timeout handles
        if (activeRun.timeoutHandle) clearTimeout(activeRun.timeoutHandle);
        if (activeRun.killHandle) clearTimeout(activeRun.killHandle);

        const durationMs = Date.now() - startTime;
        collector.end();

        // Determine terminal status
        let status: RunnerStatus = 'completed';
        if (signal === 'SIGTERM' || signal === 'SIGKILL' || exitCode === 143 || exitCode === 137) {
          status = 'timeout';
        } else if (exitCode !== 0 && exitCode !== null) {
          // Non-zero exit is still "completed" per the interface --
          // agent-level failures are captured in logs, not runner status.
          // Only set "error" if the process could not be started at all.
          status = 'completed';
        }

        // Record agent_end event
        events.push({
          timestamp: new Date().toISOString(),
          type: 'agent_end',
          data: { exitCode, signal, durationMs },
        });

        // Extract session logs if available
        const sessionLogDir = await this.extractSessionLogs(config, runId, workDir);

        // Collect output artifacts
        const outputDir = this.resolveOutputDir(config, workDir);
        const outputArtifacts = await collectArtifacts(outputDir);

        // Save structured log
        const logsDir = path.join(workDir, 'logs');
        await fs.mkdir(logsDir, { recursive: true });
        await collector.save(path.join(logsDir, 'session.json'));

        const result: RunnerResult = {
          runId,
          status,
          exitCode: exitCode ?? (signal === 'SIGKILL' ? 137 : signal === 'SIGTERM' ? 143 : null),
          durationMs,
          events,
          logs,
          sessionLogDir,
          outputArtifacts,
        };

        this.completedResults.set(runId, result);
        this.activeRuns.delete(runId);
        resolve(result);
      });

      // Handle spawn errors
      child.on('error', (err: Error) => {
        if (activeRun.completed) return;
        activeRun.completed = true;

        if (activeRun.timeoutHandle) clearTimeout(activeRun.timeoutHandle);
        if (activeRun.killHandle) clearTimeout(activeRun.killHandle);

        const durationMs = Date.now() - startTime;
        collector.recordError(err.message);
        collector.end();

        events.push({
          timestamp: new Date().toISOString(),
          type: 'error',
          data: { message: err.message, code: (err as NodeJS.ErrnoException).code },
        });

        const result: RunnerResult = {
          runId,
          status: 'error',
          exitCode: null,
          durationMs,
          events,
          logs,
          errorMessage: `Failed to spawn process: ${err.message}`,
        };

        this.completedResults.set(runId, result);
        this.activeRuns.delete(runId);
        resolve(result);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Runner.stop()
  // -------------------------------------------------------------------------

  async stop(runId: string): Promise<RunnerResult> {
    const active = this.activeRuns.get(runId);
    if (!active) {
      const completed = this.completedResults.get(runId);
      if (completed) return completed;
      throw new Error(`No active or completed run found for runId: ${runId}`);
    }

    const gracePeriodMs = active.config.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;

    active.logs.push({
      timestamp: new Date().toISOString(),
      stream: 'system',
      text: 'Run cancelled externally. Sending SIGTERM.',
    });

    active.process.kill('SIGTERM');

    // Wait for graceful exit or force-kill
    return new Promise<RunnerResult>((resolve) => {
      const killTimeout = setTimeout(() => {
        if (!active.completed) {
          active.process.kill('SIGKILL');
        }
      }, gracePeriodMs);

      // The 'close' handler on the process will resolve the original promise.
      // We intercept the result by polling.
      const poll = setInterval(() => {
        if (active.completed) {
          clearInterval(poll);
          clearTimeout(killTimeout);
          const result = this.completedResults.get(runId);
          if (result) {
            result.status = 'cancelled';
            resolve(result);
          }
        }
      }, 100);
    });
  }

  // -------------------------------------------------------------------------
  // Runner.getLogs() / getEvents()
  // -------------------------------------------------------------------------

  async getLogs(runId: string): Promise<LogLine[]> {
    const active = this.activeRuns.get(runId);
    if (active) return [...active.logs];

    const completed = this.completedResults.get(runId);
    if (completed) return [...completed.logs];

    return [];
  }

  async getEvents(runId: string): Promise<RunnerEvent[]> {
    const active = this.activeRuns.get(runId);
    if (active) return [...active.events];

    const completed = this.completedResults.get(runId);
    if (completed) return [...completed.events];

    return [];
  }

  // -------------------------------------------------------------------------
  // Runner.isRunning()
  // -------------------------------------------------------------------------

  isRunning(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  // -------------------------------------------------------------------------
  // Runner.cleanup()
  // -------------------------------------------------------------------------

  async cleanup(runId: string): Promise<void> {
    this.activeRuns.delete(runId);
    this.completedResults.delete(runId);

    const tempDir = this.tempDirs.get(runId);
    if (tempDir) {
      this.tempDirs.delete(runId);
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Best effort -- directory may already be gone
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Prepare the working directory for the run.
   * If `config.workingDir` is set and exists, use it directly.
   * Otherwise, create a temp directory.
   */
  private async prepareWorkingDir(config: RunnerConfig, runId: string): Promise<string> {
    if (config.workingDir) {
      await fs.mkdir(config.workingDir, { recursive: true });
      return config.workingDir;
    }

    const tmpBase = path.join(os.tmpdir(), 'obench-local');
    await fs.mkdir(tmpBase, { recursive: true });
    const dir = await fs.mkdtemp(path.join(tmpBase, `run-${runId}-`));
    this.tempDirs.set(runId, dir);
    return dir;
  }

  /**
   * Mount input volumes into the working directory by symlinking.
   * Falls back to copying if symlink fails (e.g., on Windows without privileges).
   */
  private async mountVolumes(config: RunnerConfig, workDir: string): Promise<void> {
    if (!config.volumes) return;

    for (const vol of config.volumes) {
      // Map container path to a subdirectory inside workDir
      const relativePath = vol.containerPath.replace(/^\/workspace\/?/, '');
      const targetPath = path.join(workDir, relativePath || 'mounted');

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      try {
        await fs.symlink(vol.hostPath, targetPath, 'junction');
      } catch {
        // Symlink failed; copy instead
        try {
          await fs.cp(vol.hostPath, targetPath, { recursive: true });
        } catch {
          // Source may not exist yet -- ignore
        }
      }
    }
  }

  /**
   * Try to parse a stdout line as a JSON RunnerEvent.
   * Claude Code in verbose/JSON mode may emit structured events on stdout.
   */
  private tryParseEvent(
    line: string,
    events: RunnerEvent[],
    collector: LogCollector,
  ): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;

      // Detect tool call events
      if (parsed['type'] === 'tool_use' || parsed['tool'] || parsed['toolName']) {
        const toolName = (parsed['tool'] ?? parsed['toolName'] ?? 'unknown') as string;
        const event: RunnerEvent = {
          timestamp: (parsed['timestamp'] as string) ?? new Date().toISOString(),
          type: 'tool_call',
          data: parsed,
        };
        events.push(event);
        collector.recordToolCall(toolName, parsed as Record<string, unknown>);
      }

      // Detect tool result events
      if (parsed['type'] === 'tool_result') {
        const toolName = (parsed['tool'] ?? parsed['toolName'] ?? 'unknown') as string;
        const event: RunnerEvent = {
          timestamp: (parsed['timestamp'] as string) ?? new Date().toISOString(),
          type: 'tool_result',
          data: parsed,
        };
        events.push(event);
        collector.recordToolResult(toolName, parsed['result']);
      }

      // Detect message events
      if (parsed['type'] === 'message' || parsed['type'] === 'text' || parsed['content']) {
        const content = (parsed['content'] ?? parsed['text'] ?? '') as string;
        if (content) {
          const event: RunnerEvent = {
            timestamp: (parsed['timestamp'] as string) ?? new Date().toISOString(),
            type: 'message',
            data: parsed,
          };
          events.push(event);
          collector.recordTextOutput(content);
        }
      }
    } catch {
      // Not valid JSON -- ignore
    }
  }

  /**
   * Extract session logs from the Claude Code session directory.
   * Claude Code stores session data in ~/.claude/sessions/.
   */
  private async extractSessionLogs(
    config: RunnerConfig,
    runId: string,
    workDir: string,
  ): Promise<string | undefined> {
    if (config.harness !== 'claude-code') return undefined;

    // Claude Code writes session logs to ~/.claude/sessions/ by default
    const claudeSessionDir = path.join(os.homedir(), '.claude', 'sessions');
    try {
      await fs.access(claudeSessionDir);
    } catch {
      return undefined;
    }

    // Copy session logs to the run's log directory for persistence
    const destDir = path.join(workDir, 'logs', 'claude-sessions');
    try {
      await fs.mkdir(destDir, { recursive: true });
      await fs.cp(claudeSessionDir, destDir, { recursive: true });
      return destDir;
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve the output directory from config volumes or fall back to workDir.
   */
  private resolveOutputDir(config: RunnerConfig, workDir: string): string {
    if (config.volumes) {
      const outputVol = config.volumes.find(
        (v) => !v.readOnly && v.containerPath.includes('output'),
      );
      if (outputVol) return outputVol.hostPath;
    }
    return workDir;
  }
}
