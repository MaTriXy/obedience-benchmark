# Skill: Candidate Runner

## Purpose

Execute a candidate AI agent (Claude Code, Codex, or custom harness) against a prepared benchmark task. Capture full session logs, tool calls, timing data, and output artifacts for later evaluation by the judge.

Supports two execution backends:

- **Local subprocess** (`local`): Spawns the agent CLI (e.g., `claude --print`) as a child process, pipes the task prompt via stdin/args, and captures stdout/stderr in real time.
- **Docker container** (`docker`): Builds or pulls an image, runs the agent inside an isolated container with volume-mounted inputs/outputs, enforces resource limits via cgroups, and extracts logs after completion.

Both backends implement the shared `Runner` interface and produce identical `RunnerResult` structures, making the benchmarker orchestrator fully agnostic about the execution backend.

## When to Use

- After a task has been prepared by the task-preparer skill
- When the benchmarker dispatches a task for execution
- When a user wants to manually run a single agent against a single task

## Inputs

- **preparedTask**: A `PreparedTask` from the task-preparer
- **runnerConfig**: A `RunnerConfig` specifying agent harness, mode, timeout, resources

## Process

1. Select runner backend via `createRunner(config)` factory
2. **Resolve credentials and model configuration** (see section below)
3. Set up the execution environment:
   - Mount input artifacts into the working directory
   - Inject the task prompt as the agent's initial message
   - Set system prompt if provided (e.g., write CLAUDE.md for Claude Code)
   - Pre-install any required plugins
4. Start the agent process with timeout enforcement
5. Capture all output in real time:
   - stdout/stderr log lines (stored as `LogLine[]`)
   - Structured session events via `LogCollector` (tool calls, messages)
   - Output artifacts written to the working directory
6. On completion or timeout, collect results and clean up
7. Return a `RunnerResult` with full logs and artifacts

## Output

A `RunnerResult` object (see `scripts/runner-interface.ts`) containing:
- Exit code and terminal status (`completed`, `timeout`, `error`, `cancelled`)
- Wall-clock duration in milliseconds
- Structured `RunnerEvent[]` and raw `LogLine[]`
- Paths to output artifacts on the host filesystem
- Session log directory path
- Resource usage statistics (best-effort)

## Key Files

| File | Description |
|------|-------------|
| `runner.ts` | Factory function `createRunner()` and orchestration helper `runCandidate()` |
| `local-runner.ts` | `LocalRunner` -- subprocess-based execution backend |
| `docker-runner.ts` | `DockerRunner` -- container-based execution backend |
| `Dockerfile.template` | Base Dockerfile used to build candidate agent images |
| `scripts/runner-interface.ts` | `Runner`, `RunnerConfig`, `RunnerResult` type definitions |
| `scripts/log-collector.ts` | `LogCollector` class for structured event capture |
| `../common/scripts/types.ts` | Shared types (`PreparedTask`, `LogEvent`, etc.) |

## Supported Harnesses

| Harness | Mode | CLI Command | Description |
|---------|------|-------------|-------------|
| `claude-code` | docker, local | `claude --print` | Claude Code CLI in non-interactive mode |
| `claude-code-babysitter` | docker, local | `claude` (interactive with `/babysitter:yolo`) | Claude Code with babysitter orchestration |
| `codex` | docker, local | `codex --quiet` | OpenAI Codex agent |
| `custom` | docker, local | user-defined | Any agent invoked via `customCommand` + `customArgs` |

### Claude Code (`claude-code`)

Standard non-interactive mode. Runs `claude --print --output-format json --verbose`, piping the task prompt to stdin. Best for simple, single-turn benchmark tasks.

### Claude Code with Babysitter (`claude-code-babysitter`)

Runs Claude Code in interactive mode with the babysitter plugin orchestrating the task via `/babysitter:yolo`. This mode is used when you want to test the agent's obedience under a more realistic orchestration scenario where the agent receives the task as a babysitter-managed process.

**How it works:**

1. The runner launches `claude` (interactive, not `--print`) in the prepared workspace
2. The task prompt is prefixed with `/babysitter:yolo` so babysitter takes over orchestration
3. Babysitter creates a process from the task prompt and runs it non-interactively (yolo mode skips all breakpoints)
4. The full session — including babysitter's orchestration events, agent tool calls, and intermediate outputs — is captured in the session logs
5. On completion, babysitter emits a completion proof and the session ends

**Prerequisites:**
- The babysitter plugin must be installed in the Claude Code environment (`/plugin install babysitter`)
- The babysitter SDK must be available globally or in the workspace `.a5c/` directory

**Configuration:**
```typescript
const config: RunnerConfig = {
  mode: 'local',
  harness: 'claude-code',  // still claude-code harness, babysitter is a plugin
  taskPrompt: `/babysitter:yolo ${originalTaskPrompt}`,
  systemPrompt: 'Follow the prescribed process exactly as described.',
  plugins: [{ name: 'babysitter' }],
  timeoutMs: 600_000,  // babysitter runs take longer; 10min default
  env: {
    // credentials inherited (see Credentials section)
  },
};
```

**When to use babysitter mode:**
- When the benchmark task has a multi-step process that benefits from orchestration
- When testing how the agent handles structured process execution under babysitter
- When you want richer session logs with orchestration events for the judge to evaluate

## Credentials and Model Configuration

The runner must ensure the candidate agent has the right API credentials and model configuration. These are resolved from the current environment and passed to the agent process via `env` in `RunnerConfig`.

### Resolution Order

Credentials and model settings are resolved in this priority order (highest wins):

1. **Explicit `RunnerConfig.env`** — values passed directly in the config override everything
2. **Current process environment** — inherited from the Claude Code session running this skill
3. **Defaults** — harness-specific fallbacks

### Environment Variables by Harness

#### Claude Code (`claude-code` / `claude-code-babysitter`)

| Variable | Description | Resolution |
|----------|-------------|------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models | Required. Inherit from current `process.env.ANTHROPIC_API_KEY` |
| `CLAUDE_MODEL` | Model to use (e.g., `claude-sonnet-4-20250514`) | Optional. If set in current env, pass through. Otherwise claude uses its default |
| `CLAUDE_MAX_TOKENS` | Max output tokens per turn | Optional. Pass through if set |
| `CLAUDE_CODE_MAX_TURNS` | Max conversation turns before stopping | Optional. Useful for bounding long tasks |
| `CLAUDE_CODE_USE_BEDROCK` | Set to `1` to use AWS Bedrock | Pass through if set. Also requires AWS credentials |
| `CLAUDE_CODE_USE_VERTEX` | Set to `1` to use Google Vertex AI | Pass through if set. Also requires GCP credentials |
| `AWS_ACCESS_KEY_ID` | AWS access key (for Bedrock) | Pass through if set |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (for Bedrock) | Pass through if set |
| `AWS_REGION` | AWS region (for Bedrock) | Pass through if set |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP service account JSON path (for Vertex) | Pass through if set |
| `CLOUD_ML_REGION` | GCP region (for Vertex) | Pass through if set |

#### Codex (`codex`)

| Variable | Description | Resolution |
|----------|-------------|------------|
| `OPENAI_API_KEY` | OpenAI API key | Required. Inherit from current `process.env.OPENAI_API_KEY` |
| `OPENAI_MODEL` | Model to use | Optional. Pass through if set |

#### Custom (`custom`)

Custom harnesses receive all explicitly configured `env` variables plus any variables listed in the task configuration. No automatic inheritance — the caller must specify exactly what to pass.

### How Credentials Are Applied

The `runCandidate()` function in `runner.ts` builds the environment by merging:

```typescript
const env: Record<string, string> = {
  // Start with inherited env from the current Claude Code process
  ...resolveHarnessCredentials(config.harness),
  // Layer on any explicit overrides from the RunnerConfig
  ...config.env,
};
```

The `resolveHarnessCredentials(harness)` function reads from `process.env` and returns only the variables relevant to the specified harness. This ensures:

- **No credential leakage**: Only harness-relevant keys are forwarded (e.g., `OPENAI_API_KEY` is not passed to `claude-code`)
- **Docker security**: In Docker mode, credentials are written to a temp `.env` file and mounted via `--env-file`, never passed as CLI args (which would be visible in `docker inspect`)
- **Babysitter compatibility**: When using `claude-code-babysitter`, the same Anthropic credentials are passed — babysitter itself doesn't need separate API keys

### Model Override

To run a benchmark against a specific model:

```typescript
// Run against claude-sonnet-4-20250514 specifically
const config: Partial<RunnerConfig> = {
  env: {
    CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  },
};
```

The benchmarker orchestrator passes the model from its own configuration (e.g., from the user prompt "run against claude-sonnet-4-20250514") down to the runner via `env.CLAUDE_MODEL`.

### Self-Referencing Configuration

When the runner is invoked from within a Claude Code session (i.e., this skill is being used), it can read its own credentials directly:

```typescript
// These are available because this skill runs inside Claude Code
const apiKey = process.env.ANTHROPIC_API_KEY;     // always set
const model = process.env.CLAUDE_MODEL;            // set if user specified a model
const bedrock = process.env.CLAUDE_CODE_USE_BEDROCK;  // set if using Bedrock
```

This means **no manual API key configuration is needed** when running benchmarks from within Claude Code — the runner inherits the same credentials that the current session is using.

## Timeout Handling

1. At `timeoutMs`, send SIGTERM to the agent process
2. Wait `gracePeriodMs` (default 30s) for graceful shutdown
3. If still running, send SIGKILL (local) or `docker rm -f` (docker)
4. Collect partial results up to the point of termination
5. Mark result status as `timeout`

**Note:** Babysitter-mode runs should use a longer timeout (10-15 minutes) since babysitter's orchestration loop adds overhead.

## Docker Mode Details

- Image is built from `Dockerfile.template` if no `image` is specified in config
- Input directory mounted read-only at `/workspace/input`
- Output directory mounted read-write at `/workspace/output`
- Structured event log written to `/workspace/logs/events.jsonl`
- Environment variables injected via `--env-file` (not CLI args, for security)
- Resource limits enforced via `--memory`, `--cpus`, `--pids-limit`
- Network isolation via `--network=none` when `NetworkPolicy.disabled` is true
- Container auto-removed after log/artifact extraction

## Local Mode Details

- Agent CLI spawned as a child process with `child_process.spawn()`
- Working directory set to a temporary directory (or configured `workingDir`)
- Input files symlinked or copied into the working directory
- System prompt written as `CLAUDE.md` (for Claude Code) in the working directory
- stdout/stderr captured line-by-line via stream event handlers
- Session logs extracted from `~/.claude/sessions/` (Claude Code) after completion
- Temp directories cleaned up on `cleanup()` call
