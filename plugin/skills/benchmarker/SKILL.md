# Skill: Benchmarker

## Purpose

Orchestrate end-to-end benchmark runs. This is the top-level coordinator that uses all other skills in sequence: select tasks from the catalog, prepare inputs, dispatch candidate agents, collect judge scores, and compile final reports with leaderboard updates.

## When to Use

- User wants to run a complete benchmark suite against an agent
- User wants to run a subset of tasks (by filter) against an agent
- User wants to compare multiple agents on the same task set

## Inputs

- **agentConfig**: Which agent to benchmark (harness, model, mode)
- **filter** (optional): Catalog filter to select a subset of tasks
- **config** (optional): Concurrency limits, timeouts, retry policy

## Process

### Pipeline

```
1. CATALOG  -->  Select tasks matching filter
2. PREPARE  -->  For each task, materialize inputs
3. RUN      -->  For each prepared task, execute the candidate agent
4. JUDGE    -->  For each completed run, score obedience
5. REPORT   -->  Compile all scorecards into report + leaderboard
```

### Detailed Flow

1. **Catalog phase**: Call the catalog-manager skill to get a `TaskSelection`
2. **Prepare phase**: For each task in the selection, call the task-preparer skill
   - Tasks can be prepared in parallel (up to `config.maxConcurrentTasks`)
3. **Run phase**: For each prepared task, call the candidate-runner skill
   - Runs execute one at a time by default (or in parallel if configured)
   - Failed runs are retried up to `config.maxRetries` if `config.retryFailedTasks` is true
4. **Judge phase**: For each completed run, call the judge skill
   - Judging can happen in parallel with subsequent runs (pipelining)
5. **Report phase**: Call the report-generator skill with all scorecards
   - Produces per-task reports, aggregate analysis, and leaderboard update

### State Management

The benchmarker maintains a `BenchmarkRun` state object that tracks:
- Current phase (preparing, running, judging, reporting)
- Per-task status and results
- Timing and error information

State is persisted to `results/<run-id>/run-state.json` after each phase for crash recovery.

## Output

- `results/<run-id>/run-state.json` -- Full run state
- `results/<run-id>/report.md` -- Human-readable report
- `results/<run-id>/report.json` -- Structured report data
- `results/<run-id>/scorecards/<task-name>.json` -- Individual scorecards
- `leaderboard/leaderboard.json` -- Updated leaderboard

## Key Files

- `skills/obedience-types/scripts/types.ts` -- `BenchmarkRun`, `BenchmarkRunStatus` types
- All other skill SKILL.md files (this skill orchestrates them all)

## Configuration Defaults

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxConcurrentTasks` | 1 | How many tasks to run in parallel |
| `timeoutPerTaskMs` | 600000 (10 min) | Per-task timeout |
| `retryFailedTasks` | true | Whether to retry failed tasks |
| `maxRetries` | 1 | Maximum retry attempts per task |
