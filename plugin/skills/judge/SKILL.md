# Skill: Judge

## Purpose

Evaluate a candidate agent's obedience to the prescribed process. Supports two complementary judging modes:

1. **Log-based judging** — Analyze session logs against the `*.process.js` file to score how faithfully the agent followed the prescribed steps at runtime.
2. **Output-based judging** — Evaluate the agent's output artifacts against concrete checks defined in the task's `task.yaml` to verify structural and content compliance.

Score obedience across 7 dimensions: completeness, ordering, conditionality, parallelism, granularity, aggregation, and error handling.

## When to Use

- After a candidate runner has completed execution of a task
- When the benchmarker collects results for scoring
- When a user wants to manually judge a session log against a process
- When comparing output artifacts from multiple agents against task-defined criteria

## Evaluation Criteria Source

All evaluation criteria and dimension weights are defined in the task's `task.yaml` under `evaluation.dimensions`. Each applicable dimension specifies:

- `weight` (0-1): Relative importance in the weighted score
- `checks` (string[]): Concrete, verifiable assertions to evaluate
- `notApplicable` (boolean): Set to true for dimensions that don't apply

Example from a task definition:
```yaml
evaluation:
  dimensions:
    completeness:
      weight: 0.30
      checks:
        - "Exactly 3 countries present in output (Japan, Italy, Brazil)"
        - "Each country has exactly 3 cities"
    ordering:
      weight: 0.20
      checks:
        - "Countries appear in the input order (Japan, Italy, Brazil)"
    conditionality:
      weight: 0
      notApplicable: true
  scoringNotes: >
    Process fidelity is the primary metric...
```

## Inputs

### Log-Based Judge
- **processPath**: Path to the `*.process.js` file
- **sessionLogs**: `RunnerResult` or path to session log directory
- **taskYaml**: The `task.yaml` for evaluation criteria and weights

### Output-Based Judge
- **taskYaml**: The `task.yaml` with evaluation criteria and expected output schema
- **outputPath**: Path to the agent's output artifact (e.g., `report.json`)
- **agentId**: Identifier for the agent being judged

## Process

### Mode 1: Log-Based Judging

#### Phase 1: Read the Process File Directly

1. Import the `*.process.js` module
2. Extract all `defineTask()` exports — these are the prescribed tasks
3. Read `metadata` for dimensions, `evaluation` for criteria, `errorHandlers` for error handling specs
4. Probe each task definition's factory to extract titles and descriptions

#### Phase 2: Parse Observed Behavior

1. Parse the candidate's session logs into `LogEvent[]`
2. Identify tool calls, messages, and actions that correspond to process tasks
3. Build a list of `ObservedStep[]` with timing, ordering, and concurrency data
4. Match observed steps to prescribed task definitions using names, titles, and descriptions

#### Phase 3: Score Each Dimension

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

### Mode 2: Output-Based Judging

#### Phase 1: Load Task Definition

1. Parse `task.yaml` to extract dimension weights, checks, and expected output schema
2. Load the agent's output artifact (e.g., `report.json`)
3. Normalize the output structure (handle different naming conventions like `camelCase` vs `snake_case`)

#### Phase 2: Evaluate Each Dimension's Checks

For each applicable dimension, run every check from `task.yaml`:

| Dimension | Evaluation Method |
|-----------|-------------------|
| **Completeness** | Verify entity counts, required fields, structural completeness of output |
| **Ordering** | Check sequence of elements matches prescribed order |
| **Conditionality** | Verify conditional logic was applied correctly in output |
| **Parallelism** | Check parallel processing evidence in output structure |
| **Granularity** | Verify nesting levels and per-entity processing granularity |
| **Aggregation** | Verify histograms, summaries, and cross-entity aggregations |
| **Error Handling** | Check error recovery evidence in output |

Each check produces a `CheckResult`:
```typescript
interface CheckResult {
  check: string;    // The check text from task.yaml
  passed: boolean;  // Whether the check passed
  detail: string;   // Evidence or explanation
}
```

#### Phase 3: Compute Scores

1. Per-dimension score = `(passed checks / total checks) * 100`
2. Weighted score = sum of `(dimension score * weight)` for applicable dimensions
3. N/A dimensions (weight 0 or `notApplicable: true`) are excluded

### Phase 4: Produce Scorecard

1. Compute per-dimension scores (0-100)
2. Apply weights from the task's evaluation criteria
3. Compute weighted average for the overall score
4. Attach evidence (log excerpts, check results, deductions) to each dimension
5. Return an `ObedienceScorecard`

## Output

An `ObedienceScorecard` object (see `skills/obedience-types/scripts/types.ts`) containing:
- Per-dimension scores with evidence and deductions
- Per-check pass/fail results with detail explanations
- Weighted and raw overall scores
- Task definitions and observed steps for auditability
- Scoring metadata (duration, counts)

## Key Files

| File | Purpose |
|------|---------|
| `skills/judge/scripts/judge.ts` | Log-based judge implementation |
| `scripts/judge-outputs.ts` | Output-based judge implementation |
| `scripts/gen-comparison-html-report.ts` | Report generator using judge scorecards |
| `skills/obedience-types/scripts/types.ts` | `ObedienceScorecard`, `DimensionScore`, `ObservedStep`, `TaskDefinition` |
| `skills/obedience-types/scripts/schemas/task-definition.schema.json` | Evaluation criteria schema |
| `skills/catalog-manager/benchmarks/full/*/task.yaml` | Task definitions with evaluation criteria |

## Running the Output-Based Judge

```bash
# 1. Run the judge to produce scorecards from agent outputs
npx tsx scripts/judge-outputs.ts

# 2. Generate comparison HTML reports from the scorecards
npx tsx scripts/gen-comparison-html-report.ts
```

The judge reads:
- Task definition from `plugin/skills/catalog-manager/benchmarks/full/<task>/task.yaml`
- Agent outputs from `results/full-comparison/<agent>/output/report.json`

And writes:
- Scorecards to `results/full-comparison/<agent>/scorecard.json`

## Scoring Principles

1. **Process fidelity is primary, output correctness is secondary.** A model that follows every step but makes a minor error scores higher than one that skips steps but produces a correct final answer.
2. **Criteria are task-defined, not hardcoded.** All checks and weights come from `task.yaml`, making the judge reusable across different tasks.
3. **N/A dimensions are excluded** from the weighted average (weight 0 or `notApplicable: true`).
4. **Evidence is mandatory.** Every pass/fail must cite specific output data or its absence.
5. **Output normalization.** The judge handles different naming conventions (camelCase, snake_case) and structural variations between agents.
6. **Confidence matters.** Low-confidence step matches are flagged for human review.
