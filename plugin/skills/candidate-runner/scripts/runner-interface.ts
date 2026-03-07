/**
 * Runner Interface for Obedience Benchmark
 *
 * Defines the abstraction layer for executing candidate agents (Claude Code, Codex,
 * custom harnesses) in both Docker-isolated and local-subprocess modes. Both runner
 * implementations conform to the same Runner interface, enabling the benchmarker
 * orchestrator to be fully agnostic about the execution backend.
 *
 * Key design decisions:
 * - RunnerConfig captures ALL inputs needed for a run (no ambient state).
 * - RunnerResult captures ALL outputs including partial results on timeout/error.
 * - Runner interface supports real-time log streaming via getLogs/getEvents.
 * - Factory function selects the backend based on RunnerMode.
 */

// ---------------------------------------------------------------------------
// Enums & Literal Types
// ---------------------------------------------------------------------------

/** Execution backend selection. */
export type RunnerMode = "docker" | "local";

/** Terminal status of a run. */
export type RunnerStatus =
  | "pending"    // Queued but not yet started
  | "running"    // Agent process is active
  | "completed"  // Agent exited normally
  | "timeout"    // Killed due to wall-clock timeout
  | "error"      // Runner infrastructure error (not an agent error)
  | "cancelled"; // Externally cancelled via stop()

/** Supported agent harnesses. */
export type AgentHarness = "claude-code" | "codex" | "custom";

// ---------------------------------------------------------------------------
// Resource Limits
// ---------------------------------------------------------------------------

/**
 * Resource constraints applied to the candidate execution environment.
 *
 * Docker mode: enforced via cgroups flags (--memory, --cpus, --pids-limit).
 * Local mode: best-effort via ulimit on Unix; not enforced on Windows.
 */
export interface ResourceLimits {
  /** Maximum memory in megabytes. Docker: --memory flag. */
  memoryMb: number;

  /** Maximum CPU cores (fractional allowed, e.g. 2.5). Docker: --cpus flag. */
  cpuCores: number;

  /** Maximum disk usage in megabytes for the working directory. */
  diskMb?: number;

  /** Maximum number of spawned processes/threads. Docker: --pids-limit. */
  maxProcesses?: number;
}

// ---------------------------------------------------------------------------
// Network Policy
// ---------------------------------------------------------------------------

/** Network isolation policy for the runner. */
export interface NetworkPolicy {
  /**
   * If true, the container/process has no network access at all.
   * Docker: --network=none. Local: not enforced (recorded only).
   */
  disabled: boolean;

  /**
   * Optional allowlist of hostnames or CIDRs the runner may contact.
   * Only effective in Docker mode with a custom bridge network.
   * Ignored when disabled is true.
   */
  allowedHosts?: string[];
}

// ---------------------------------------------------------------------------
// Volume Mounts
// ---------------------------------------------------------------------------

/** Filesystem mount specification for injecting inputs and extracting outputs. */
export interface VolumeMount {
  /** Absolute path on the host machine. */
  hostPath: string;

  /**
   * Path inside the container (Docker mode) or symlink target
   * relative to the working directory (local mode).
   */
  containerPath: string;

  /** If true, the mount is read-only inside the container. */
  readOnly: boolean;
}

// ---------------------------------------------------------------------------
// Plugin Specification
// ---------------------------------------------------------------------------

/** Plugin to pre-install in the execution environment before the agent starts. */
export interface PluginSpec {
  /** Plugin name (npm package name or local path). */
  name: string;

  /** Optional version constraint (semver range or exact version). */
  version?: string;

  /** Optional configuration object passed during plugin initialization. */
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Runner Configuration
// ---------------------------------------------------------------------------

/** Complete configuration for a single candidate agent run. */
export interface RunnerConfig {
  /** Execution mode: Docker container or local subprocess. */
  mode: RunnerMode;

  /** Which agent harness to invoke. */
  harness: AgentHarness;

  /**
   * Docker image to use. Only relevant when mode is "docker".
   * If omitted, derived from harness (e.g., "obedience-bench/claude-code:latest").
   */
  image?: string;

  /** Path to a custom Dockerfile template. Only relevant when mode is "docker". */
  dockerfilePath?: string;

  /**
   * For custom harnesses: the command to invoke.
   * Ignored for built-in harness types.
   */
  customCommand?: string;

  /**
   * For custom harnesses: arguments to pass to the command.
   * Ignored for built-in harness types.
   */
  customArgs?: string[];

  /** The task prompt injected into the agent session. */
  taskPrompt: string;

  /**
   * Optional system prompt content. For Claude Code, this is written
   * as CLAUDE.md in the workspace root and read automatically.
   */
  systemPrompt?: string;

  /** Plugins to pre-install before the agent starts. */
  plugins?: PluginSpec[];

  /**
   * Maximum wall-clock time for the entire run, in milliseconds.
   * After this duration, the graceful shutdown sequence begins.
   */
  timeoutMs: number;

  /**
   * Grace period between SIGTERM and SIGKILL, in milliseconds.
   * @default 30000
   */
  gracePeriodMs?: number;

  /** Resource constraints for the execution environment. */
  resources?: ResourceLimits;

  /** Network isolation policy. */
  network?: NetworkPolicy;

  /**
   * Filesystem mounts for input data injection and output collection.
   * Docker mode: translated to -v flags.
   * Local mode: translated to symlinks or directory copies.
   */
  volumes?: VolumeMount[];

  /**
   * Working directory inside the runner.
   * Docker mode: passed to docker run -w.
   * Local mode: used as cwd for the spawned process.
   * @default "/workspace"
   */
  workingDir?: string;

  /**
   * Environment variables to inject into the agent process.
   * Must include API keys required by the harness (ANTHROPIC_API_KEY, etc.).
   * Docker mode: passed via --env-file for security (not CLI args).
   */
  env?: Record<string, string>;

  /**
   * Unique run identifier. If not provided, the runner generates one
   * using a ULID or UUID.
   */
  runId?: string;
}

// ---------------------------------------------------------------------------
// Structured Events
// ---------------------------------------------------------------------------

/**
 * A structured event emitted during agent execution.
 * Events are written as JSONL to /logs/events.jsonl inside the container
 * and parsed into this type after extraction.
 */
export interface RunnerEvent {
  /** ISO-8601 timestamp of the event. */
  timestamp: string;

  /** Event category. */
  type:
    | "agent_start"      // Agent process launched
    | "agent_end"        // Agent process exited (includes exit code)
    | "tool_call"        // Agent invoked a tool
    | "tool_result"      // Tool returned a result
    | "message"          // Agent produced a message/output
    | "error"            // An error occurred
    | "timeout_warning"  // SIGTERM received, shutting down
    | "custom";          // Harness-specific or plugin-specific event

  /** Freeform payload (tool name, message content, error details, etc.). */
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Raw Log Lines
// ---------------------------------------------------------------------------

/** A single line from the container/process stdout, stderr, or runner system messages. */
export interface LogLine {
  /** ISO-8601 timestamp (if available from the stream). */
  timestamp?: string;

  /** Which stream produced this line. */
  stream: "stdout" | "stderr" | "system";

  /** Raw text content of the line. */
  text: string;
}

// ---------------------------------------------------------------------------
// Resource Usage
// ---------------------------------------------------------------------------

/** Observed resource consumption during a run (best-effort measurement). */
export interface ResourceUsage {
  /** Peak memory usage in megabytes (from cgroups or OS stats). */
  peakMemoryMb?: number;

  /** Total CPU time consumed in seconds. */
  cpuSeconds?: number;

  /** Disk space used in megabytes at peak. */
  diskUsedMb?: number;
}

// ---------------------------------------------------------------------------
// Runner Result
// ---------------------------------------------------------------------------

/** Complete result of a single candidate agent run. */
export interface RunnerResult {
  /** The run identifier (matches RunnerConfig.runId or auto-generated). */
  runId: string;

  /** Terminal status of the run. */
  status: RunnerStatus;

  /**
   * Process exit code.
   * 0 = success, non-zero = failure.
   * 143 = SIGTERM (graceful timeout), 137 = SIGKILL (forced timeout).
   * null if the process could not be started.
   */
  exitCode: number | null;

  /** Wall-clock duration in milliseconds. */
  durationMs: number;

  /** Structured events captured during the run (parsed from events.jsonl). */
  events: RunnerEvent[];

  /** Raw log lines from stdout, stderr, and runner system messages. */
  logs: LogLine[];

  /**
   * Absolute path to the session log directory on the host (post-extraction).
   * Contains harness-specific session data (e.g., Claude Code session files).
   */
  sessionLogDir?: string;

  /**
   * Absolute paths to output artifacts produced by the agent on the host.
   * These are files and directories found in the output volume mount.
   */
  outputArtifacts?: string[];

  /**
   * Error message when status is "error".
   * Describes the runner infrastructure failure, not agent-level errors
   * (those are captured in events and logs).
   */
  errorMessage?: string;

  /** Observed resource consumption (best-effort). */
  resourceUsage?: ResourceUsage;
}

// ---------------------------------------------------------------------------
// Runner Interface
// ---------------------------------------------------------------------------

/**
 * The Runner interface that both DockerRunner and LocalRunner implement.
 *
 * Lifecycle:
 *   1. Create runner via factory: createRunner("docker") or createRunner("local")
 *   2. Call run(config) to execute an agent -- returns Promise<RunnerResult>
 *   3. During execution, call getLogs/getEvents for real-time monitoring
 *   4. Call stop(runId) to cancel a run early (optional)
 *   5. Call cleanup(runId) to free resources after processing results
 *
 * Contract guarantees (both implementations):
 *   - Timeout enforcement: SIGTERM at timeoutMs, SIGKILL at timeoutMs + gracePeriodMs
 *   - Log capture: both raw LogLine[] and structured RunnerEvent[]
 *   - Partial results: always returned on timeout/error (never silently discarded)
 *   - Resource cleanup: containers removed, temp dirs deleted on cleanup()
 */
export interface Runner {
  /**
   * Execute the agent with the given configuration.
   * Resolves when the agent exits, times out, or encounters a runner error.
   * Never rejects for agent-level failures; those are captured in RunnerResult.
   * Only rejects if the runner infrastructure fails unrecoverably.
   */
  run(config: RunnerConfig): Promise<RunnerResult>;

  /**
   * Forcefully stop a running execution.
   * Sends SIGTERM, waits gracePeriodMs, then SIGKILL.
   * Docker mode: issues docker stop then docker rm -f.
   * Local mode: process.kill with SIGTERM then SIGKILL.
   * Returns the partial result collected up to the point of cancellation.
   * No-op if the runId is not currently active (returns last known result).
   */
  stop(runId: string): Promise<RunnerResult>;

  /**
   * Retrieve raw log lines for a run.
   * May be called during execution (returns data collected so far)
   * or after completion (returns the full log).
   */
  getLogs(runId: string): Promise<LogLine[]>;

  /**
   * Retrieve structured events for a run.
   * May be called during execution (returns events emitted so far)
   * or after completion (returns all events).
   */
  getEvents(runId: string): Promise<RunnerEvent[]>;

  /** Check whether a specific run is currently active. */
  isRunning(runId: string): boolean;

  /**
   * Clean up all resources associated with a completed run.
   * Docker mode: removes stopped containers matching the run ID.
   * Local mode: removes temp directories created for the run.
   * Safe to call multiple times. No-op for unknown run IDs.
   */
  cleanup(runId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Factory function type for creating Runner instances.
 *
 * Usage:
 *   const runner = createRunner("docker");
 *   const result = await runner.run(config);
 *   // ... pass result to judge ...
 *   await runner.cleanup(result.runId);
 */
export type RunnerFactory = (mode: RunnerMode) => Runner;
