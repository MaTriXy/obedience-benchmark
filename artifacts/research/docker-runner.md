# Docker-Based Candidate Runner Design

## Overview
This document outlines the design for running candidate agents (e.g., Claude Code, Codex) in isolated environments during benchmarking.

## Runner Abstraction Interface
Both Docker and local subprocess modes implement a common `IRunner` interface.
- `start(task: TaskConfig): Promise<RunResult>`
- `stop(): Promise<void>`
- `getLogs(): Promise<string[]>`
- `getEvents(): Promise<AgentEvent[]>`

## Docker Runner Design
- **Dockerfile Template**: Base image with necessary runtime (Node.js/Python), isolated network (optional), and non-root user.
- **Pre-installation**: Plugins and agents pre-installed in the image build step.
- **Task Injection**: Mount task input/output directories. Inject prompt via environment variables or a specific config file.
- **Resource Limits**: CPU, memory, and pids limits via Docker flags.
- **Log Extraction**: Map a log directory from the container to the host or use `docker logs`.
- **Timeouts**: Enforce timeout on the host using a promise race or Docker's native mechanisms if available. Graceful shutdown using `SIGTERM` followed by `SIGKILL`.

## Local Subprocess Fallback
- **Execution**: Spawn agent process directly on the host using `child_process`.
- **Isolation**: Minimal. Relies on isolated working directories per run.
- **Lifecycle**: Same interface for start, stop, and log extraction (via stdout/stderr pipes).
