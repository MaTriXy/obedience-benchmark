# Docker-Based Candidate Runner Design

## Overview

The candidate runner executes AI agents (Claude Code, Codex, or custom harnesses) against benchmark tasks in isolation. It supports two execution modes -- Docker container and local subprocess -- behind a unified `Runner` interface defined in `shared/runner-interface.ts`. Both modes capture the same log artifacts and enforce the same timeout/resource contracts, enabling the benchmarker orchestrator to be fully backend-agnostic.

---

## 1. Dockerfile Template

### Design Principles

The Dockerfile uses multi-stage builds keyed by a `HARNESS` build arg. This allows a single template to produce images for any supported agent while maximizing Docker layer caching. The harness-specific installation happens in a named stage; the final stage selects the correct one via `FROM harness-${HARNESS}`.

### Template

```dockerfile
# Dockerfile.candidate
# Build: docker build --build-arg HARNESS=claude-code -t obedience-bench/claude-code:latest .

ARG HARNESS=claude-code
ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-slim AS base

# System dependencies shared by all harnesses
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates python3 jq \
    && rm -rf /var/lib/apt/lists/*

# ---- Harness-specific installation stages ----

FROM base AS harness-claude-code
RUN npm install -g @anthropic-ai/claude-code

FROM base AS harness-codex
RUN npm install -g @openai/codex

FROM base AS harness-custom
# Custom harness: expects the binary/script to be mounted at /opt/harness/

# ---- Final stage: select harness via build arg ----
FROM harness-${HARNESS} AS runner

# Create standard directories
RUN mkdir -p /workspace /logs /session /plugins \
    && chown -R node:node /workspace /logs /session /plugins

WORKDIR /workspace

# Plugin pre-installation layer
# plugins.json is generated per-run from RunnerConfig.plugins
COPY plugins.json /tmp/plugins.json
RUN node -e "\
  const plugins = require('/tmp/plugins.json'); \
  const { execSync } = require('child_process'); \
  plugins.forEach(p => { \
    const spec = p.version ? p.name + '@' + p.version : p.name; \
    execSync('npm install -g ' + spec, { stdio: 'inherit' }); \
  });"

# Entrypoint handles log capture, structured events, and SIGTERM trapping
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment defaults
ENV LOG_DIR=/logs
ENV SESSION_DIR=/session
ENV TASK_PROMPT_FILE=/workspace/.task-prompt.md

# Security: run as non-root
USER node

ENTRYPOINT ["/entrypoint.sh"]
```

### Entrypoint Script (`entrypoint.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

# ---- Structured event helper ----
emit_event() {
  local type="$1"
  local data="${2:-{}}"
  local ts
  ts=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  echo "{\"timestamp\":\"$ts\",\"type\":\"$type\",\"data\":$data}" >> "$LOG_DIR/events.jsonl"
}

# ---- Graceful shutdown trap ----
AGENT_PID=""
cleanup() {
  emit_event "timeout_warning" '{"reason":"SIGTERM received"}'
  if [ -n "$AGENT_PID" ]; then
    kill -TERM "$AGENT_PID" 2>/dev/null || true
    # Give agent a few seconds to flush its own logs
    sleep 5
  fi
  exit 143
}
trap cleanup SIGTERM

# ---- Emit start event ----
emit_event "agent_start" "{\"harness\":\"${HARNESS:-claude-code}\",\"taskPromptFile\":\"$TASK_PROMPT_FILE\"}"

# ---- Read task prompt ----
PROMPT=$(cat "$TASK_PROMPT_FILE")

# ---- Launch agent based on harness type ----
case "${HARNESS:-claude-code}" in
  claude-code)
    claude --print --output-format json \
      --session-dir "$SESSION_DIR" \
      "$PROMPT" \
      2>&1 | tee "$LOG_DIR/agent-output.log" &
    ;;
  codex)
    codex --quiet --approval-mode full-auto \
      "$PROMPT" \
      2>&1 | tee "$LOG_DIR/agent-output.log" &
    ;;
  custom)
    /opt/harness/run.sh "$PROMPT" \
      2>&1 | tee "$LOG_DIR/agent-output.log" &
    ;;
esac

AGENT_PID=$!
wait $AGENT_PID
EXIT_CODE=$?

# ---- Emit end event ----
emit_event "agent_end" "{\"exitCode\":$EXIT_CODE}"

exit $EXIT_CODE
```

### Image Caching Strategy

The runner maintains a local image cache keyed by `(harness, plugins_hash)`:

```
obedience-bench/{harness}:{plugins_sha256_short}
```

Before each run, it checks whether a matching image exists. If so, the build step is skipped entirely. If not, `plugins.json` is generated from `RunnerConfig.plugins`, placed alongside the Dockerfile template, and `docker build` is invoked.

### Agent Configuration Injection

| Config Item | Injection Mechanism |
|-------------|---------------------|
| Task prompt | Written to `/workspace/.task-prompt.md` via volume mount |
| System prompt | Written to `/workspace/CLAUDE.md` (Claude Code reads this automatically) |
| Environment vars | Passed via `docker run --env-file` (temp file, deleted after start) |
| API keys | Passed via `--env-file` (never baked into the image) |
| Plugin configs | Written to `/workspace/.plugins-config.json` via mount |
| Working directory | Set via `WORKDIR` in Dockerfile or `docker run -w` |

---

## 2. Log Extraction

### Three-Layer Log Capture

**Layer 1: Raw stdout/stderr streams**
- Captured in real-time via `docker logs --follow` running in a parallel async task.
- Each line is tagged with `stream: "stdout" | "stderr"` and a timestamp.
- Stored as `LogLine[]` in memory and flushed to `{hostOutputDir}/raw-logs.jsonl`.

**Layer 2: Structured event log (events.jsonl)**
- The entrypoint writes JSONL events to `/logs/events.jsonl`.
- Event types include: `agent_start`, `agent_end`, `tool_call`, `tool_result`, `message`, `error`, `timeout_warning`, `custom`.
- After the container exits, the runner copies this file out via `docker cp` (or reads it directly from the bind-mounted `/logs` directory).

**Layer 3: Session logs (harness-specific)**
- Claude Code writes session data to `--session-dir`.
- The `/session` directory is bind-mounted to `{hostOutputDir}/session/` so session logs are available on the host immediately, without `docker cp`.

### Extraction Flow

```
Container exits (or is killed)
  |
  +-> events.jsonl already on host via bind mount at {runDir}/logs/
  +-> Session logs already on host via bind mount at {runDir}/session/
  +-> Raw logs captured via docker logs --follow during execution
  |
  +-> Parse events.jsonl into RunnerEvent[]
  +-> Parse raw logs into LogLine[]
  +-> Scan {runDir}/output/ for artifact paths
  +-> docker inspect for resource usage (memory high-water mark)
  +-> docker rm {containerId}
  +-> Assemble RunnerResult
```

### Real-Time Streaming

During execution, the runner exposes `getLogs(runId)` and `getEvents(runId)` that return data collected so far. This enables the benchmarker to monitor progress, detect hangs before the timeout fires, and provide live progress feedback.

---

## 3. Timeout Handling and Graceful Shutdown

### Multi-Layer Timeout Strategy

```
T=0                    T=timeoutMs          T=timeoutMs+gracePeriodMs    T+5s
 |--- agent running ---|--- grace period ---|--- forced kill ------------|
                       |                    |                            |
                  SIGTERM sent         SIGKILL sent                docker rm -f
                  + timeout_warning    (Docker handles              (failsafe)
                    event emitted       this internally)
```

### Docker Mode

1. `docker run` is started in detached mode.
2. The runner sets a wall-clock timer for `timeoutMs` milliseconds.
3. On timeout: issue `docker stop --time={gracePeriodMs/1000} {containerId}`.
   - Docker sends SIGTERM to PID 1 (the entrypoint).
   - The entrypoint traps SIGTERM, emits a `timeout_warning` event, forwards SIGTERM to the agent child process, waits 5 seconds for log flushing, then exits 143.
   - If the container does not exit within `gracePeriodMs`, Docker sends SIGKILL.
4. Failsafe: if `docker stop` itself hangs (rare), a second timer at `timeoutMs + gracePeriodMs + 5000` runs `docker rm -f {containerId}`.
5. `RunnerResult.status` is set to `"timeout"`.

### Local Mode

1. The runner spawns the process and sets a timer for `timeoutMs`.
2. On timeout: send `SIGTERM` to the process group (`process.kill(-pid, 'SIGTERM')`).
3. After `gracePeriodMs`: send `SIGKILL` to the process group.
4. Clean up temp directories.
5. `RunnerResult.status` is set to `"timeout"`.

### Timeout Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `timeoutMs` | 300000 (5 min) | Maximum wall-clock time for the entire run |
| `gracePeriodMs` | 30000 (30s) | Time between SIGTERM and SIGKILL |

---

## 4. Local-Subprocess Fallback Mode

### Rationale

Docker adds overhead and requires Docker to be installed. For development, quick iteration, and environments without Docker (some CI runners, Windows without WSL), the local-subprocess mode provides identical semantics using `child_process.spawn`.

### Implementation Sketch

```typescript
class LocalRunner implements Runner {
  async run(config: RunnerConfig): Promise<RunnerResult> {
    // 1. Create temp working directory
    const runDir = mkdtemp('obedience-run-');
    const logDir = join(runDir, 'logs');
    const outputDir = join(runDir, 'output');
    const sessionDir = join(runDir, 'session');

    // 2. Write task prompt and system prompt
    writeFile(join(runDir, '.task-prompt.md'), config.taskPrompt);
    if (config.systemPrompt) {
      writeFile(join(runDir, 'CLAUDE.md'), config.systemPrompt);
    }

    // 3. Install plugins if specified
    for (const plugin of config.plugins ?? []) {
      execSync(`npm install -g ${plugin.name}@${plugin.version ?? 'latest'}`);
    }

    // 4. Spawn agent process
    const proc = spawn(harnessCommand(config.harness), harnessArgs(config), {
      cwd: runDir,
      env: { ...process.env, ...config.env },
    });

    // 5. Capture stdout/stderr in real-time
    proc.stdout.on('data', chunk => this.appendLog(runId, 'stdout', chunk));
    proc.stderr.on('data', chunk => this.appendLog(runId, 'stderr', chunk));

    // 6. Set timeout
    const timer = setTimeout(() => this.killProcess(proc, config), config.timeoutMs);

    // 7. Wait for exit
    const exitCode = await waitForExit(proc);
    clearTimeout(timer);

    // 8. Parse session logs and build result
    const events = parseEventsFromSessionDir(sessionDir);
    return buildResult(runId, exitCode, events, this.logs[runId]);
  }
}
```

### Agent Spawn Commands

| Harness | Command | Key Arguments |
|---------|---------|---------------|
| claude-code | `claude` | `--print --output-format json --session-dir {sessionDir}` |
| codex | `codex` | `--quiet --approval-mode full-auto` |
| custom | User-provided binary | User-provided args |

### Differences from Docker Mode

| Feature | Docker | Local |
|---------|--------|-------|
| Network isolation | Full (`--network=none`) | Not enforced |
| Memory limits | cgroups enforced | Best-effort (`ulimit`) |
| CPU limits | cgroups enforced | Not enforced |
| Filesystem isolation | Read-only rootfs + explicit mounts | Temp directory only |
| Reproducibility | High (deterministic image) | Depends on host state |
| Setup overhead | Image build (cached) | None |
| Credential isolation | `--env-file`, not in inspect | Process env vars |

### Security Note

Local mode does NOT provide security isolation. It is suitable only for development and trusted agents. Production benchmarking and untrusted agents must use Docker mode.

---

## 5. Runner Abstraction Interface

The full TypeScript interface is defined in `shared/runner-interface.ts`. Both `DockerRunner` and `LocalRunner` implement the same `Runner` interface.

### Core Contract

```typescript
interface Runner {
  run(config: RunnerConfig): Promise<RunnerResult>;
  stop(runId: string): Promise<RunnerResult>;
  getLogs(runId: string): Promise<LogLine[]>;
  getEvents(runId: string): Promise<RunnerEvent[]>;
  isRunning(runId: string): boolean;
  cleanup(runId: string): Promise<void>;
}
```

### Key Guarantees

Both implementations must:

1. Accept the same `RunnerConfig` and return the same `RunnerResult` structure.
2. Enforce timeouts identically (SIGTERM then SIGKILL after grace period).
3. Capture both raw log lines and structured JSONL events.
4. Provide real-time access to logs and events during execution via `getLogs()` / `getEvents()`.
5. Copy output artifacts to the designated host directory.
6. Clean up all resources on completion (containers, temp dirs, child processes).
7. Report partial results on timeout or error -- never silently discard logs.
8. Track resource usage (best-effort in local mode, cgroups-backed in Docker mode).

### Factory

```typescript
type RunnerFactory = (mode: RunnerMode) => Runner;

function createRunner(mode: "docker" | "local"): Runner {
  switch (mode) {
    case "docker": return new DockerRunner();
    case "local":  return new LocalRunner();
  }
}
```

The benchmarker orchestrator calls `createRunner()` based on configuration and uses the `Runner` interface uniformly.

---

## 6. Resource Limits, Network Isolation, and Filesystem Mounting

### Resource Limits (Docker Mode)

Applied via `docker run` flags:

```bash
docker run \
  --memory=${resources.memoryMb}m \
  --memory-swap=${resources.memoryMb}m \
  --cpus=${resources.cpuCores} \
  --pids-limit=${resources.maxProcesses ?? 256} \
  --read-only \
  --tmpfs /tmp:size=512m \
  ...
```

| Resource | Default | Configurable | Docker Flag |
|----------|---------|-------------|-------------|
| Memory | 4096 MB | Yes | `--memory` |
| Memory swap | Same as memory | No | `--memory-swap` |
| CPU cores | 2.0 | Yes | `--cpus` |
| Process IDs | 256 | Yes | `--pids-limit` |
| Temp disk | 512 MB | Yes | `--tmpfs /tmp:size=` |
| Read-only rootfs | Yes | No | `--read-only` |

### Resource Limits (Local Mode)

Best-effort using OS facilities:

- **Unix/macOS**: `ulimit` applied to spawned process where available.
- **Windows**: No reliable process-level memory/CPU limiting; rely on timeout enforcement only.
- `RunnerResult.resourceUsage` reports observed usage but limits may not be enforced.

### Network Isolation

Three levels, configurable per run via `RunnerConfig.network`:

| Level | Docker Flags | Use Case |
|-------|-------------|----------|
| `disabled: true` | `--network=none` | Full isolation (default for benchmarks) |
| `allowedHosts` set | Custom bridge + iptables | Tasks requiring specific API access |
| `disabled: false`, no allowlist | Default Docker networking | Development only |

Local mode always has full network access. The `network` config is recorded in results for transparency but cannot be enforced.

### Filesystem Mounting

Standard mount layout for Docker mode:

```
Host                                    Container          Mode
----                                    ---------          ----
{runDir}/input/                   -->   /workspace/input/  ro
{runDir}/output/                  -->   /workspace/output/ rw
{runDir}/session/                 -->   /session/          rw
{runDir}/logs/                    -->   /logs/             rw
```

- **Input** is always read-only to prevent the agent from modifying test fixtures.
- **Output** is writable; the agent's produced artifacts land here for judge evaluation.
- **Session** captures harness-specific session logs (Claude Code session data).
- **Logs** captures the entrypoint's structured event log and raw agent output.

The rootfs is read-only (`--read-only`) to prevent agents from modifying the container image or installed tools. All writable paths are explicit mounts or tmpfs.

### Security Hardening (Docker Mode)

```bash
docker run \
  --user 1000:1000 \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --read-only \
  --network=none \
  --env-file /tmp/obench-env-{runId} \
  ...
```

- API keys passed via `--env-file` with a temp file deleted after `docker run` starts.
- Non-root user (`node`, UID 1000 from the Node.js base image).
- All Linux capabilities dropped.
- Privilege escalation prevention via `no-new-privileges`.

---

## 7. End-to-End Execution Flow

```
Benchmarker Orchestrator
  |
  +-> createRunner(config.mode)  // "docker" or "local"
  |
  +-> runner.run({
  |     mode: "docker",
  |     harness: "claude-code",
  |     taskPrompt: "Translate this book following these steps...",
  |     systemPrompt: "You are a benchmark candidate...",
  |     plugins: [{ name: "obedience-benchmark", version: "1.0.0" }],
  |     timeoutMs: 600_000,
  |     gracePeriodMs: 30_000,
  |     resources: { memoryMb: 4096, cpuCores: 2 },
  |     network: { disabled: true },
  |     volumes: [
  |       { hostPath: "/data/task-01/input", containerPath: "/workspace/input", readOnly: true },
  |       { hostPath: "/data/task-01/output", containerPath: "/workspace/output", readOnly: false },
  |     ],
  |     env: { ANTHROPIC_API_KEY: "sk-..." },
  |   })
  |
  |   [Docker: check image cache -> build if needed -> docker run]
  |   [Local: create temp dirs -> spawn child process]
  |
  +-> [Agent executes task, writes to /workspace, /logs, /output]
  +-> [Runner monitors: real-time log capture, timeout timers]
  |
  +-> [Timeout fires: SIGTERM -> grace period -> SIGKILL]
  |   [OR: Agent exits normally]
  |
  +-> [Extract/collect logs, events, artifacts]
  +-> [docker rm / temp dir cleanup]
  |
  +-> RunnerResult {
  |     runId, status, exitCode, durationMs,
  |     events: RunnerEvent[],
  |     logs: LogLine[],
  |     sessionLogDir, outputArtifacts,
  |     resourceUsage: { peakMemoryMb, cpuSeconds }
  |   }
  |
  +-> Judge receives RunnerResult for obedience scoring
```
