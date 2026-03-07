/**
 * Docker Container Runner
 *
 * Implements the Runner interface by building/running Docker containers for
 * candidate agent execution. Provides full isolation, resource limits via
 * cgroups, and deterministic log extraction.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
  ResourceLimits,
  NetworkPolicy,
} from './scripts/runner-interface.js';
import { LogCollector } from './scripts/log-collector.js';
import { collectArtifacts } from './runner.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_GRACE_PERIOD_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_IMAGE_PREFIX = 'obedience-bench';
const CONTAINER_WORKSPACE = '/workspace';
const CONTAINER_LOGS_DIR = '/workspace/logs';
const EVENTS_JSONL_FILENAME = 'events.jsonl';

// ---------------------------------------------------------------------------
// Active run tracking
// ---------------------------------------------------------------------------

interface ActiveDockerRun {
  runId: string;
  containerId: string;
  config: RunnerConfig;
  collector: LogCollector;
  logs: LogLine[];
  events: RunnerEvent[];
  startTime: number;
  completed: boolean;
  resolve?: (result: RunnerResult) => void;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// DockerRunner
// ---------------------------------------------------------------------------

export class DockerRunner implements Runner {
  private activeRuns = new Map<string, ActiveDockerRun>();
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

    const collector = new LogCollector(runId, agentId);
    const logs: LogLine[] = [];
    const events: RunnerEvent[] = [];
    const startTime = Date.now();

    try {
      // Resolve or build Docker image
      const image = await this.resolveImage(config, runId, logs);

      // Create temp directory for env file and logs extraction
      const tmpDir = await this.createTempDir(runId);

      // Write env file (avoids leaking secrets via CLI args)
      const envFilePath = await this.writeEnvFile(config, tmpDir);

      // Write task prompt to a file for injection
      const promptFilePath = path.join(tmpDir, 'task-prompt.md');
      await fs.writeFile(promptFilePath, config.taskPrompt, 'utf-8');

      // Write system prompt if provided
      if (config.systemPrompt) {
        const sysPromptPath = path.join(tmpDir, 'CLAUDE.md');
        await fs.writeFile(sysPromptPath, config.systemPrompt, 'utf-8');
      }

      // Prepare host-side logs directory for extraction
      const hostLogsDir = path.join(tmpDir, 'extracted-logs');
      await fs.mkdir(hostLogsDir, { recursive: true });

      // Build docker run arguments
      const containerName = `obench-${runId}`;
      const dockerArgs = this.buildDockerRunArgs({
        config,
        containerName,
        image,
        envFilePath,
        promptFilePath,
        tmpDir,
        timeoutMs,
        gracePeriodMs,
      });

      collector.addEvent({
        timestamp: new Date().toISOString(),
        type: 'session_start',
        sequence: 0,
        data: { harness: config.harness, mode: 'docker', image, containerName },
      });
      events.push({
        timestamp: new Date().toISOString(),
        type: 'agent_start',
        data: { image, containerName, dockerArgs },
      });

      logs.push({
        timestamp: new Date().toISOString(),
        stream: 'system',
        text: `Starting Docker container: ${containerName} (image: ${image})`,
      });

      // Start the container
      const containerId = await this.startContainer(dockerArgs, logs);

      const activeRun: ActiveDockerRun = {
        runId,
        containerId,
        config,
        collector,
        logs,
        events,
        startTime,
        completed: false,
      };
      this.activeRuns.set(runId, activeRun);

      // Set up timeout enforcement
      activeRun.timeoutHandle = setTimeout(async () => {
        if (activeRun.completed) return;

        logs.push({
          timestamp: new Date().toISOString(),
          stream: 'system',
          text: `Timeout reached (${timeoutMs}ms). Stopping container.`,
        });
        events.push({
          timestamp: new Date().toISOString(),
          type: 'timeout_warning',
          data: { timeoutMs, action: 'docker stop' },
        });

        try {
          // docker stop sends SIGTERM, waits gracePeriod, then SIGKILL
          const stopTimeout = Math.ceil(gracePeriodMs / 1000);
          await execFileAsync('docker', ['stop', '-t', String(stopTimeout), containerId]);
        } catch {
          // Container may have already exited
          try {
            await execFileAsync('docker', ['rm', '-f', containerId]);
          } catch {
            // Ignore
          }
        }
      }, timeoutMs);

      // Wait for container to exit
      const { exitCode, timedOut } = await this.waitForContainer(containerId, timeoutMs + gracePeriodMs + 5000);

      activeRun.completed = true;
      if (activeRun.timeoutHandle) clearTimeout(activeRun.timeoutHandle);

      const durationMs = Date.now() - startTime;
      collector.end();

      // Determine status
      let status: RunnerStatus = 'completed';
      if (timedOut || exitCode === 143 || exitCode === 137) {
        status = 'timeout';
      }

      // Extract logs from container
      await this.extractContainerLogs(containerId, logs, events, collector);

      // Extract structured events from events.jsonl
      await this.extractStructuredEvents(containerId, hostLogsDir, events);

      // Copy output artifacts from container
      const outputDir = this.resolveHostOutputDir(config);
      if (outputDir) {
        await this.extractOutputArtifacts(containerId, outputDir);
      }

      // Extract session log directory
      const sessionLogDir = await this.extractSessionLogs(containerId, hostLogsDir);

      // Collect artifact paths
      const outputArtifacts = outputDir ? await collectArtifacts(outputDir) : [];

      events.push({
        timestamp: new Date().toISOString(),
        type: 'agent_end',
        data: { exitCode, durationMs },
      });

      // Save structured log
      await collector.save(path.join(hostLogsDir, 'session.json'));

      const result: RunnerResult = {
        runId,
        status,
        exitCode,
        durationMs,
        events,
        logs,
        sessionLogDir: sessionLogDir ?? hostLogsDir,
        outputArtifacts,
      };

      this.completedResults.set(runId, result);
      this.activeRuns.delete(runId);
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      collector.recordError(errorMessage);
      collector.end();

      events.push({
        timestamp: new Date().toISOString(),
        type: 'error',
        data: { message: errorMessage },
      });

      const result: RunnerResult = {
        runId,
        status: 'error',
        exitCode: null,
        durationMs,
        events,
        logs,
        errorMessage: `Docker runner error: ${errorMessage}`,
      };

      this.completedResults.set(runId, result);
      this.activeRuns.delete(runId);
      return result;
    }
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
      text: 'Run cancelled externally. Stopping container.',
    });

    try {
      const stopTimeout = Math.ceil(gracePeriodMs / 1000);
      await execFileAsync('docker', ['stop', '-t', String(stopTimeout), active.containerId]);
    } catch {
      try {
        await execFileAsync('docker', ['rm', '-f', active.containerId]);
      } catch {
        // Ignore
      }
    }

    // Wait briefly for the run to complete via the main flow
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const result = this.completedResults.get(runId);
    if (result) {
      result.status = 'cancelled';
      return result;
    }

    // Force-build a result if the main flow hasn't resolved yet
    const durationMs = Date.now() - active.startTime;
    active.collector.end();

    const forcedResult: RunnerResult = {
      runId,
      status: 'cancelled',
      exitCode: null,
      durationMs,
      events: active.events,
      logs: active.logs,
      errorMessage: 'Run cancelled externally',
    };

    this.completedResults.set(runId, forcedResult);
    this.activeRuns.delete(runId);
    return forcedResult;
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
    // Remove the container if it still exists
    const active = this.activeRuns.get(runId);
    const containerId = active?.containerId;

    this.activeRuns.delete(runId);
    this.completedResults.delete(runId);

    if (containerId) {
      try {
        await execFileAsync('docker', ['rm', '-f', containerId]);
      } catch {
        // Already removed
      }
    }

    // Clean up temp directory
    const tempDir = this.tempDirs.get(runId);
    if (tempDir) {
      this.tempDirs.delete(runId);
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private: Image resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve the Docker image to use.
   * - If `config.image` is set, use it directly (pull if needed).
   * - If `config.dockerfilePath` is set, build from that Dockerfile.
   * - Otherwise, build from the default Dockerfile.template.
   */
  private async resolveImage(
    config: RunnerConfig,
    runId: string,
    logs: LogLine[],
  ): Promise<string> {
    if (config.image) {
      logs.push({
        timestamp: new Date().toISOString(),
        stream: 'system',
        text: `Using pre-specified image: ${config.image}`,
      });
      return config.image;
    }

    const tag = `${DEFAULT_IMAGE_PREFIX}/${config.harness}:${runId}`;
    const dockerfilePath = config.dockerfilePath
      ?? path.join(__dirname, 'Dockerfile.template');

    logs.push({
      timestamp: new Date().toISOString(),
      stream: 'system',
      text: `Building image from ${dockerfilePath} as ${tag}`,
    });

    try {
      const { stdout, stderr } = await execFileAsync('docker', [
        'build',
        '-f', dockerfilePath,
        '-t', tag,
        '--build-arg', `HARNESS=${config.harness}`,
        path.dirname(dockerfilePath),
      ], { maxBuffer: 10 * 1024 * 1024 });

      if (stdout) {
        logs.push({ timestamp: new Date().toISOString(), stream: 'stdout', text: stdout.trim() });
      }
      if (stderr) {
        logs.push({ timestamp: new Date().toISOString(), stream: 'stderr', text: stderr.trim() });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Docker build failed: ${msg}`);
    }

    return tag;
  }

  // -------------------------------------------------------------------------
  // Private: Docker run arguments
  // -------------------------------------------------------------------------

  private buildDockerRunArgs(opts: {
    config: RunnerConfig;
    containerName: string;
    image: string;
    envFilePath: string;
    promptFilePath: string;
    tmpDir: string;
    timeoutMs: number;
    gracePeriodMs: number;
  }): string[] {
    const { config, containerName, image, envFilePath, promptFilePath, tmpDir } = opts;

    const args: string[] = [
      'run',
      '--name', containerName,
      '--env-file', envFilePath,
      '-w', config.workingDir ?? CONTAINER_WORKSPACE,
    ];

    // Resource limits
    if (config.resources) {
      const res = config.resources;
      if (res.memoryMb) {
        args.push('--memory', `${res.memoryMb}m`);
      }
      if (res.cpuCores) {
        args.push('--cpus', String(res.cpuCores));
      }
      if (res.maxProcesses) {
        args.push('--pids-limit', String(res.maxProcesses));
      }
    }

    // Network policy
    if (config.network?.disabled) {
      args.push('--network', 'none');
    }

    // Mount task prompt
    args.push('-v', `${promptFilePath}:${CONTAINER_WORKSPACE}/task-prompt.md:ro`);

    // Mount system prompt as CLAUDE.md if present
    if (config.systemPrompt) {
      const sysPromptPath = path.join(tmpDir, 'CLAUDE.md');
      args.push('-v', `${sysPromptPath}:${CONTAINER_WORKSPACE}/CLAUDE.md:ro`);
    }

    // Mount configured volumes
    if (config.volumes) {
      for (const vol of config.volumes) {
        const ro = vol.readOnly ? ':ro' : '';
        args.push('-v', `${vol.hostPath}:${vol.containerPath}${ro}`);
      }
    }

    // Create and mount a logs directory for structured event capture
    const hostLogsDir = path.join(tmpDir, 'container-logs');
    // We'll create this synchronously before starting
    args.push('-v', `${hostLogsDir}:${CONTAINER_LOGS_DIR}`);

    // Detach mode -- we'll wait with `docker wait`
    args.push('-d');

    // The image
    args.push(image);

    return args;
  }

  // -------------------------------------------------------------------------
  // Private: Container lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the Docker container and return its container ID.
   */
  private async startContainer(dockerArgs: string[], logs: LogLine[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('docker', dockerArgs, {
        maxBuffer: 1024 * 1024,
      });
      const containerId = stdout.trim();

      logs.push({
        timestamp: new Date().toISOString(),
        stream: 'system',
        text: `Container started: ${containerId}`,
      });

      return containerId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to start Docker container: ${msg}`);
    }
  }

  /**
   * Wait for a container to exit. Returns exit code and whether it timed out.
   */
  private async waitForContainer(
    containerId: string,
    maxWaitMs: number,
  ): Promise<{ exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
      const child = spawn('docker', ['wait', containerId], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ exitCode: 137, timedOut: true });
      }, maxWaitMs);

      child.on('close', () => {
        clearTimeout(timeout);
        const exitCode = parseInt(stdout.trim(), 10);
        resolve({
          exitCode: isNaN(exitCode) ? 1 : exitCode,
          timedOut: false,
        });
      });

      child.on('error', () => {
        clearTimeout(timeout);
        resolve({ exitCode: 1, timedOut: false });
      });
    });
  }

  // -------------------------------------------------------------------------
  // Private: Log extraction
  // -------------------------------------------------------------------------

  /**
   * Extract container logs via `docker logs` and append to our log/event arrays.
   */
  private async extractContainerLogs(
    containerId: string,
    logs: LogLine[],
    events: RunnerEvent[],
    collector: LogCollector,
  ): Promise<void> {
    try {
      const { stdout, stderr } = await execFileAsync(
        'docker',
        ['logs', '--timestamps', containerId],
        { maxBuffer: 50 * 1024 * 1024 },
      );

      if (stdout) {
        for (const line of stdout.split('\n')) {
          if (!line.trim()) continue;
          logs.push({
            timestamp: new Date().toISOString(),
            stream: 'stdout',
            text: line,
          });
          this.tryParseJsonEvent(line, events, collector);
        }
      }

      if (stderr) {
        for (const line of stderr.split('\n')) {
          if (!line.trim()) continue;
          logs.push({
            timestamp: new Date().toISOString(),
            stream: 'stderr',
            text: line,
          });
        }
      }
    } catch {
      logs.push({
        timestamp: new Date().toISOString(),
        stream: 'system',
        text: 'Warning: failed to extract container logs via docker logs',
      });
    }
  }

  /**
   * Extract structured events from the events.jsonl file written inside the container.
   */
  private async extractStructuredEvents(
    containerId: string,
    hostLogsDir: string,
    events: RunnerEvent[],
  ): Promise<void> {
    const localEventsPath = path.join(hostLogsDir, EVENTS_JSONL_FILENAME);

    try {
      // Copy the events file from container to host
      await execFileAsync('docker', [
        'cp',
        `${containerId}:${CONTAINER_LOGS_DIR}/${EVENTS_JSONL_FILENAME}`,
        localEventsPath,
      ]);

      const content = await fs.readFile(localEventsPath, 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as RunnerEvent;
          events.push(event);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // events.jsonl may not exist if the agent didn't produce structured events
    }
  }

  /**
   * Extract output artifacts from the container's output directory to the host.
   */
  private async extractOutputArtifacts(
    containerId: string,
    hostOutputDir: string,
  ): Promise<void> {
    try {
      await fs.mkdir(hostOutputDir, { recursive: true });
      await execFileAsync('docker', [
        'cp',
        `${containerId}:${CONTAINER_WORKSPACE}/output/.`,
        hostOutputDir,
      ]);
    } catch {
      // Output directory may not exist in the container
    }
  }

  /**
   * Extract session logs (Claude Code sessions directory) from the container.
   */
  private async extractSessionLogs(
    containerId: string,
    hostLogsDir: string,
  ): Promise<string | undefined> {
    const destDir = path.join(hostLogsDir, 'claude-sessions');
    try {
      await fs.mkdir(destDir, { recursive: true });
      await execFileAsync('docker', [
        'cp',
        `${containerId}:/root/.claude/sessions/.`,
        destDir,
      ]);
      return destDir;
    } catch {
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Private: Helpers
  // -------------------------------------------------------------------------

  /**
   * Create a temporary directory for this run.
   */
  private async createTempDir(runId: string): Promise<string> {
    const tmpBase = path.join(os.tmpdir(), 'obench-docker');
    await fs.mkdir(tmpBase, { recursive: true });
    const dir = await fs.mkdtemp(path.join(tmpBase, `run-${runId}-`));
    this.tempDirs.set(runId, dir);

    // Pre-create the container-logs directory for volume mount
    await fs.mkdir(path.join(dir, 'container-logs'), { recursive: true });

    return dir;
  }

  /**
   * Write an env file for `docker run --env-file`.
   * This avoids exposing API keys via command-line arguments visible in `ps`.
   */
  private async writeEnvFile(
    config: RunnerConfig,
    tmpDir: string,
  ): Promise<string> {
    const envFilePath = path.join(tmpDir, '.env');
    const lines: string[] = [];

    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        // Escape newlines and quotes in values
        const escaped = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
        lines.push(`${key}=${escaped}`);
      }
    }

    await fs.writeFile(envFilePath, lines.join('\n'), 'utf-8');
    return envFilePath;
  }

  /**
   * Resolve the host-side output directory from the config volumes.
   */
  private resolveHostOutputDir(config: RunnerConfig): string | undefined {
    if (!config.volumes) return undefined;
    const outputVol = config.volumes.find(
      (v) => !v.readOnly && v.containerPath.includes('output'),
    );
    return outputVol?.hostPath;
  }

  /**
   * Try to parse a log line as a JSON event.
   */
  private tryParseJsonEvent(
    line: string,
    events: RunnerEvent[],
    collector: LogCollector,
  ): void {
    // Strip Docker timestamp prefix if present (e.g., "2024-01-01T00:00:00.000Z ")
    const stripped = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '').trim();
    if (!stripped.startsWith('{')) return;

    try {
      const parsed = JSON.parse(stripped) as Record<string, unknown>;

      if (parsed['type'] === 'tool_use' || parsed['tool'] || parsed['toolName']) {
        const toolName = (parsed['tool'] ?? parsed['toolName'] ?? 'unknown') as string;
        events.push({
          timestamp: (parsed['timestamp'] as string) ?? new Date().toISOString(),
          type: 'tool_call',
          data: parsed,
        });
        collector.recordToolCall(toolName, parsed as Record<string, unknown>);
      }

      if (parsed['type'] === 'tool_result') {
        const toolName = (parsed['tool'] ?? parsed['toolName'] ?? 'unknown') as string;
        events.push({
          timestamp: (parsed['timestamp'] as string) ?? new Date().toISOString(),
          type: 'tool_result',
          data: parsed,
        });
        collector.recordToolResult(toolName, parsed['result']);
      }

      if (parsed['type'] === 'message' || parsed['content']) {
        const content = (parsed['content'] ?? '') as string;
        if (content) {
          events.push({
            timestamp: (parsed['timestamp'] as string) ?? new Date().toISOString(),
            type: 'message',
            data: parsed,
          });
          collector.recordTextOutput(content);
        }
      }
    } catch {
      // Not valid JSON
    }
  }
}
