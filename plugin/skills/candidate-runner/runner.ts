/**
 * Candidate Runner -- Core Orchestration
 *
 * Provides the factory function `createRunner()` that returns the appropriate
 * Runner backend (LocalRunner or DockerRunner) based on configuration, and the
 * high-level `runCandidate()` helper that executes a prepared task end-to-end.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { ulid } from 'ulid';

import type {
  Runner,
  RunnerConfig,
  RunnerMode,
  RunnerResult,
} from './scripts/runner-interface.js';
import type { PreparedTask } from '../obedience-types/scripts/types.js';
import { LocalRunner } from './local-runner.js';
import { DockerRunner } from './docker-runner.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Runner instance for the given configuration.
 *
 * The mode is read from `config.mode`. If omitted, defaults to `"local"`.
 * Both returned implementations conform to the `Runner` interface and can be
 * used interchangeably by the benchmarker orchestrator.
 */
export function createRunner(config: RunnerConfig): Runner {
  const mode: RunnerMode = config.mode ?? 'local';

  switch (mode) {
    case 'local':
      return new LocalRunner();
    case 'docker':
      return new DockerRunner();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown runner mode: ${String(_exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run Result (extended with convenience metadata)
// ---------------------------------------------------------------------------

/** Extended result returned by `runCandidate`, adding task context. */
export interface RunCandidateResult {
  /** The underlying RunnerResult from the backend. */
  result: RunnerResult;
  /** Task name for correlation. */
  taskName: string;
  /** Agent identifier. */
  agentId: string;
  /** Directory containing the runner's output artifacts on the host. */
  outputDir: string;
}

// ---------------------------------------------------------------------------
// Credential Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve harness-specific credentials from the current process environment.
 * Only returns variables relevant to the specified harness to prevent leakage.
 */
export function resolveHarnessCredentials(
  harness: import('./scripts/runner-interface.js').AgentHarness,
): Record<string, string> {
  const env: Record<string, string> = {};

  const pick = (key: string) => {
    const val = process.env[key];
    if (val !== undefined && val !== '') env[key] = val;
  };

  switch (harness) {
    case 'claude-code':
      pick('ANTHROPIC_API_KEY');
      pick('CLAUDE_MODEL');
      pick('CLAUDE_MAX_TOKENS');
      pick('CLAUDE_CODE_MAX_TURNS');
      // Bedrock support
      pick('CLAUDE_CODE_USE_BEDROCK');
      pick('AWS_ACCESS_KEY_ID');
      pick('AWS_SECRET_ACCESS_KEY');
      pick('AWS_SESSION_TOKEN');
      pick('AWS_REGION');
      pick('AWS_DEFAULT_REGION');
      // Vertex support
      pick('CLAUDE_CODE_USE_VERTEX');
      pick('GOOGLE_APPLICATION_CREDENTIALS');
      pick('CLOUD_ML_REGION');
      break;

    case 'codex':
      pick('OPENAI_API_KEY');
      pick('OPENAI_MODEL');
      break;

    case 'custom':
      // Custom harnesses receive no auto-inherited credentials.
      // The caller must specify everything explicitly via config.env.
      break;
  }

  return env;
}

// ---------------------------------------------------------------------------
// High-level orchestration
// ---------------------------------------------------------------------------

/**
 * Execute a candidate agent against a prepared task and return the full result.
 *
 * This is the primary entry point used by the benchmarker skill. It:
 *   1. Ensures input/output directories exist
 *   2. Builds the RunnerConfig from the PreparedTask + overrides
 *   3. Delegates to the Runner backend
 *   4. Returns a RunCandidateResult with task context attached
 *
 * @param runner    - A Runner instance (from `createRunner`)
 * @param task      - The prepared task containing prompt, inputs, etc.
 * @param inputDir  - Host directory with materialized input artifacts
 * @param outputDir - Host directory where the agent should write outputs
 * @param overrides - Optional partial RunnerConfig to merge (e.g., timeout, env)
 */
export async function runCandidate(
  runner: Runner,
  task: PreparedTask,
  inputDir: string,
  outputDir: string,
  overrides?: Partial<RunnerConfig>,
): Promise<RunCandidateResult> {
  // Ensure directories exist
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  // Build the run ID
  const runId = overrides?.runId ?? ulid();

  // Derive agent identifier from harness + model info
  const harness = overrides?.harness ?? 'claude-code';
  const agentId = `${harness}:${runId}`;

  // Construct the full RunnerConfig
  const config: RunnerConfig = {
    mode: overrides?.mode ?? 'local',
    harness,
    taskPrompt: task.taskPrompt,
    systemPrompt: task.systemPrompt,
    timeoutMs: overrides?.timeoutMs ?? 300_000, // 5 min default
    gracePeriodMs: overrides?.gracePeriodMs ?? 30_000,
    runId,
    workingDir: overrides?.workingDir ?? outputDir,
    volumes: [
      {
        hostPath: inputDir,
        containerPath: '/workspace/input',
        readOnly: true,
      },
      {
        hostPath: outputDir,
        containerPath: '/workspace/output',
        readOnly: false,
      },
      ...(overrides?.volumes ?? []),
    ],
    env: {
      ...resolveHarnessCredentials(harness),
      ...overrides?.env,
    },
    resources: overrides?.resources,
    network: overrides?.network,
    plugins: overrides?.plugins,
    image: overrides?.image,
    dockerfilePath: overrides?.dockerfilePath,
    customCommand: overrides?.customCommand,
    customArgs: overrides?.customArgs,
  };

  // Write the task prompt to the input directory for Docker-mode injection
  const promptPath = path.join(inputDir, 'task-prompt.md');
  await fs.writeFile(promptPath, task.taskPrompt, 'utf-8');

  // Execute
  const result = await runner.run(config);

  return {
    result,
    taskName: task.catalogEntry.name,
    agentId,
    outputDir,
  };
}

// ---------------------------------------------------------------------------
// Utility: collect output artifacts
// ---------------------------------------------------------------------------

/**
 * Recursively list all files in a directory, returning absolute paths.
 * Used to populate `RunnerResult.outputArtifacts` after a run completes.
 */
export async function collectArtifacts(dir: string): Promise<string[]> {
  const artifacts: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return; // directory may not exist or be inaccessible
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        artifacts.push(fullPath);
      }
    }
  }

  await walk(dir);
  return artifacts;
}
