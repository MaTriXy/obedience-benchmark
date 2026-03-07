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
2. Set up the execution environment:
   - Mount input artifacts into the working directory
   - Inject the task prompt as the agent's initial message
   - Set system prompt if provided (e.g., write CLAUDE.md for Claude Code)
   - Pre-install any required plugins
3. Start the agent process with timeout enforcement
4. Capture all output in real time:
   - stdout/stderr log lines (stored as `LogLine[]`)
   - Structured session events via `LogCollector` (tool calls, messages)
   - Output artifacts written to the working directory
5. On completion or timeout, collect results and clean up
6. Return a `RunnerResult` with full logs and artifacts

## Output

A `RunnerResult` object (see `shared/runner-interface.ts`) containing:
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
| `shared/runner-interface.ts` | `Runner`, `RunnerConfig`, `RunnerResult` type definitions |
| `shared/log-collector.ts` | `LogCollector` class for structured event capture |
| `shared/types.ts` | Shared types (`PreparedTask`, `LogEvent`, etc.) |

## Supported Harnesses

| Harness | Mode | CLI Command | Description |
|---------|------|-------------|-------------|
| `claude-code` | docker, local | `claude --print` | Claude Code CLI with session logging |
| `codex` | docker, local | `codex --quiet` | OpenAI Codex agent |
| `custom` | docker, local | user-defined | Any agent invoked via `customCommand` + `customArgs` |

## Timeout Handling

1. At `timeoutMs`, send SIGTERM to the agent process
2. Wait `gracePeriodMs` (default 30s) for graceful shutdown
3. If still running, send SIGKILL (local) or `docker rm -f` (docker)
4. Collect partial results up to the point of termination
5. Mark result status as `timeout`

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
