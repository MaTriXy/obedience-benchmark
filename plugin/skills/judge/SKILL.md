# Skill: Judge

## Purpose

Evaluate a candidate agent's session logs against the prescribed process defined in the task's `*.process.js` file. Score obedience across 7 dimensions: completeness, ordering, conditionality, parallelism, granularity, aggregation, and error handling.

## When to Use

- After a candidate runner has completed execution of a task
- When the benchmarker collects results for scoring
- When a user wants to manually judge a session log against a process

## Inputs

- **processPath**: Path to the `*.process.js` file
- **sessionLogs**: `RunnerResult` or path to session log directory
- **taskYaml**: The `task.yaml` for evaluation criteria and weights

## Process

### Phase 1: Read the Process File Directly

1. Import the `*.process.js` module
2. Extract all `defineTask()` exports — these are the prescribed tasks
3. Read `metadata` for dimensions, `evaluation` for criteria, `errorHandlers` for error handling specs
4. Probe each task definition's factory to extract titles and descriptions

### Phase 2: Parse Observed Behavior

1. Parse the candidate's session logs into `LogEvent[]`
2. Identify tool calls, messages, and actions that correspond to process tasks
3. Build a list of `ObservedStep[]` with timing, ordering, and concurrency data
4. Match observed steps to prescribed task definitions using names, titles, and descriptions

### Phase 3: Score Each Dimension

For each of the 7 dimensions, using the evaluation criteria from `task.yaml` and `process.js`:

| Dimension | Scoring Method |
|-----------|---------------|
| **Completeness** | `count(matched observed steps) / count(prescribed tasks)` — penalize skipped tasks |
| **Ordering** | Longest common subsequence of matched steps vs prescribed order, normalized |
| **Conditionality** | Check if the agent showed evidence of evaluating conditions and branching correctly |
| **Parallelism** | Check if corresponding observed steps overlapped in time (concurrent execution) |
| **Granularity** | Verify the agent operated at the prescribed level (e.g., chunk-by-chunk not chapter-at-a-time) |
| **Aggregation** | Verify the agent combined results as specified (histogram, table, concatenation, etc.) |
| **Error Handling** | Verify the agent followed prescribed error paths (revert, retry, skip-and-log, etc.) |

### Phase 4: Produce Scorecard

1. Compute per-dimension scores (0-100)
2. Apply weights from the task's evaluation criteria
3. Compute weighted average for the overall score
4. Attach evidence (log excerpts, step matches, deductions) to each dimension
5. Return an `ObedienceScorecard`

## Output

An `ObedienceScorecard` object (see `skills/obedience-types/scripts/types.ts`) containing:
- Per-dimension scores with evidence and deductions
- Weighted and raw overall scores
- Task definitions and observed steps for auditability
- Scoring metadata (duration, counts)

## Key Files

- `skills/obedience-types/scripts/types.ts` -- `ObedienceScorecard`, `DimensionScore`, `ObservedStep`, `TaskDefinition`
- `skills/obedience-types/scripts/schemas/task-definition.schema.json` -- evaluation criteria schema

## Scoring Principles

1. **Process fidelity is primary, output correctness is secondary.** A model that follows every step but makes a minor error scores higher than one that skips steps but produces a correct final answer.
2. **N/A dimensions are excluded** from the weighted average (weight 0 or `notApplicable: true`).
3. **Evidence is mandatory.** Every deduction must cite specific log events or their absence.
4. **Confidence matters.** Low-confidence step matches are flagged for human review.
