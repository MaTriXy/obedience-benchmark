# Obedience Benchmark -- Architecture Document

## Overview

The Obedience Benchmark is a Claude Code plugin that measures whether AI agents (Claude Code, Codex, custom harnesses) follow **prescribed processes** rather than merely producing correct outputs. It answers the question: "Given a detailed procedural specification, does the agent execute the exact steps in the exact order with the exact granularity and parallelism prescribed?"

Process fidelity is the primary metric. Output correctness is secondary.

---

## Directory Structure

```
obedience-benchmark/
  plugin.json                          # Plugin manifest -- registers 7 skills
  package.json                         # Node project config
  tsconfig.json                        # TypeScript configuration

  shared/
    types.ts                           # All shared TypeScript types
    process-helpers.js                  # ProcessContext API (step/parallel/loop)
    runner-interface.ts                 # Runner abstraction (Docker/local)
    schemas/
      task-definition.schema.json      # JSON Schema for task metadata + evaluation

  skills/
    catalog-manager/
      SKILL.md                         # Skill definition for catalog management
    task-preparer/
      SKILL.md                         # Skill definition for test case preparation
    candidate-runner/
      SKILL.md                         # Skill definition for agent execution
    judge/
      SKILL.md                         # Skill definition for obedience evaluation
    report-generator/
      SKILL.md                         # Skill definition for report compilation
    task-creator/
      SKILL.md                         # Skill definition for authoring new tasks
    benchmarker/
      SKILL.md                         # Skill definition for end-to-end orchestration

  benchmark-tasks/                     # Task catalog, organized by domain
    translation/
      book-translation/
        task.yaml                      # Metadata, input spec, evaluation criteria
        book-translation.process.js    # Prescribed process as executable JS
        input/                         # Input artifacts (generated or static)
        evaluation/                    # Reference artifacts for the judge
    code-refactoring/
      circular-deps/
        task.yaml
        circular-deps.process.js
        input/
        evaluation/
    data-analysis/
      ...
    content-generation/
      ...

  results/                             # Run results (gitignored)
    <run-id>/
      config.json
      session-logs/
      scorecard.json
      report.md

  leaderboard/
    leaderboard.json                   # Aggregate leaderboard data
```

---

## Core Design Decision: Code-Based Process Definitions

Benchmark task processes are defined as **executable JavaScript modules**, not YAML DAGs. YAML is used only for task metadata, input specifications, and evaluation criteria. The process itself is an importable JS file that uses the `ProcessContext` API from `shared/process-helpers.js`.

### Rationale

1. **Expressiveness** -- Real processes have loops, conditionals, dynamic fan-out, and error handling that are awkward to express in declarative YAML.
2. **Composability** -- JS modules can import shared utilities, reuse step patterns, and compose processes from sub-processes.
3. **Familiarity** -- Modeled after the babysitter SDK's process definition pattern (`defineTask`, `context.step`, etc.), which is already proven.
4. **Testability** -- Process files can be unit-tested, linted, and type-checked independently.
5. **Judge readability** -- The judge reads the process JS to understand the prescribed steps, then compares against session logs. Code is unambiguous about ordering, parallelism, and control flow.

### Process File Anatomy

Every process file (`*.process.js`) exports three things:

```javascript
// 1. Metadata (mirrors task.yaml metadata, used for validation)
export const metadata = {
  name: 'task-name',
  domain: 'translation',
  complexity: 'high',
  estimatedDuration: '30min',
  dimensions: ['completeness', 'ordering', ...],
  tags: ['map-reduce', 'context-aware']
};

// 2. The prescribed process function
export async function prescribedProcess(input, ctx) {
  // Uses ctx.step(), ctx.parallel(), ctx.loop(), ctx.conditional()
  // Returns the expected final result shape
}

// 3. Evaluation criteria (what the judge scores)
export const evaluation = {
  completeness: { weight: 25, criteria: '...' },
  ordering:     { weight: 15, criteria: '...' },
  // ... all 7 dimensions
};
```

---

## shared/process-helpers.js -- The ProcessContext API

The `ProcessContext` class provides the API that process files use to declare steps. When a process file is **executed by the judge**, each method call records the step into an ordered trace. When a process file is **read for documentation**, the same trace serves as the canonical step list.

### API Surface

| Method | Signature | Purpose |
|--------|-----------|---------|
| `ctx.step(id, spec)` | `step(id: string, spec: StepSpec): Promise<any>` | Declare a single sequential step |
| `ctx.parallel(id, specs)` | `parallel(id: string, specs: StepSpec[]): Promise<any[]>` | Declare steps that must run concurrently |
| `ctx.loop(id, collection, bodyFn)` | `loop(id: string, collection: any[], bodyFn: (item, i) => Promise<any>): Promise<any[]>` | Declare an iteration over a collection |
| `ctx.conditional(id, spec)` | `conditional(id: string, spec: ConditionalSpec): Promise<any>` | Declare a conditional branch |
| `ctx.errorHandler(id, spec)` | `errorHandler(id: string, spec: ErrorSpec): void` | Register an error handling strategy for a scope |

Each method also accepts an `expected` field describing the expected shape of the step's output, which the judge uses for structural validation.

### Step Recording

When executed, `ProcessContext` builds an ordered list of `ProcessStep` records:

```typescript
interface ProcessStep {
  id: string;
  type: 'step' | 'parallel' | 'loop' | 'conditional' | 'errorHandler';
  action: string;
  parent?: string;          // For nested steps (loop body, parallel branch)
  iteration?: { over: string; index: number };
  expected?: ExpectedShape;
  children?: ProcessStep[]; // For parallel branches, loop iterations
  timestamp: number;        // Sequence number for ordering
}
```

---

## Data Flow

The benchmark follows a five-stage pipeline:

```
  [1] Catalog    [2] Preparer    [3] Runner    [4] Judge    [5] Report
  ---------->  ------------>  ---------->  --------->  ---------->
   Select         Generate       Execute     Score       Compile
   tasks          inputs         agent       obedience   results
```

### Stage 1: Catalog Manager

- Maintains an index of all tasks in `benchmark-tasks/`
- Supports filtering by domain, complexity, tags, dimensions
- Validates task files (YAML metadata + process JS) against schemas
- Produces a `TaskSelection` -- the list of tasks for a benchmark run

### Stage 2: Task Preparer

- For each selected task, generates or retrieves input data
- Runs generator scripts if `input.type === 'generated'`
- Downloads external resources if `input.type === 'url'`
- Produces a `PreparedTask` with all inputs materialized on disk
- Also prepares evaluation reference artifacts for the judge

### Stage 3: Candidate Runner

- Dispatches the agent (Claude Code, Codex, or custom harness)
- Supports Docker-isolated and local-subprocess modes (see `shared/runner-interface.ts`)
- Injects the task prompt, input artifacts, and system prompt
- Captures full session logs (tool calls, messages, timing)
- Enforces timeout and resource limits
- Produces a `RunnerResult` with logs, events, artifacts, and timing

### Stage 4: Judge

- Loads the task's `*.process.js` file and executes it in trace mode to build the prescribed step sequence
- Parses the candidate's session logs into an observed step sequence
- Performs structural comparison across all 7 obedience dimensions
- Produces an `ObedienceScorecard` with per-dimension scores and evidence

#### Judge Algorithm

```
1. TRACE = execute prescribedProcess() in recording mode
2. OBSERVED = parse session logs into step sequence
3. For each dimension:
   a. completeness:  count(observed steps) / count(prescribed steps)
   b. ordering:      longest common subsequence / total prescribed steps
   c. conditionality: for each conditional, did agent evaluate the condition correctly?
   d. parallelism:   for each parallel block, were steps concurrent in logs?
   e. granularity:   did agent operate at prescribed granularity (chunk vs chapter)?
   f. aggregation:   did agent aggregate results as prescribed?
   g. errorHandling: did agent follow prescribed error paths?
4. Compute weighted score, attach evidence
5. Return ObedienceScorecard
```

### Stage 5: Report Generator

- Compiles scorecards from one or more runs
- Generates per-task detail reports with evidence
- Generates aggregate leaderboard with rankings
- Outputs markdown reports and JSON data

---

## The 7 Obedience Dimensions

| # | Dimension | Question | Score Range |
|---|-----------|----------|-------------|
| 1 | **Completeness** | Did the agent execute ALL prescribed iterations/steps? | 0-100 |
| 2 | **Ordering** | Did the agent follow the prescribed sequence? | 0-100 |
| 3 | **Conditionality** | Did the agent correctly evaluate and branch on conditions? | 0-100 |
| 4 | **Parallelism** | Did the agent parallelize (or serialize) as prescribed? | 0-100 |
| 5 | **Granularity** | Did the agent operate at the correct level of detail? | 0-100 |
| 6 | **Aggregation** | Did the agent combine results as specified? | 0-100 |
| 7 | **Error Handling** | Did the agent follow prescribed error/failure paths? | 0-100 |

Each task assigns weights to dimensions (some may be N/A with weight 0). The final task score is a weighted average. The benchmark score across tasks is weighted by task complexity.

---

## Scorecard Model

```typescript
interface ObedienceScorecard {
  runId: string;
  taskName: string;
  agentId: string;
  timestamp: string;
  dimensions: {
    [dim: string]: {
      score: number;          // 0-100
      weight: number;         // From task evaluation spec
      maxScore: number;       // Always 100
      evidence: string[];     // What the judge observed
      deductions: Deduction[];
    };
  };
  weightedScore: number;      // Final weighted average
  rawScore: number;           // Unweighted average
  metadata: {
    judgeDurationMs: number;
    processStepCount: number;
    observedStepCount: number;
    logLineCount: number;
  };
}
```

---

## Leaderboard Model

```typescript
interface LeaderboardEntry {
  agentId: string;
  harness: string;
  model: string;
  totalScore: number;            // Weighted across all tasks
  taskScores: {
    [taskName: string]: number;
  };
  dimensionAverages: {
    [dim: string]: number;
  };
  runsCompleted: number;
  lastRunTimestamp: string;
}
```

---

## Plugin Registration (plugin.json)

The plugin registers 7 skills:

| Skill | Purpose |
|-------|---------|
| `catalog-manager` | Browse, filter, validate benchmark tasks |
| `task-preparer` | Generate/retrieve input data for tasks |
| `candidate-runner` | Execute an agent against a prepared task |
| `judge` | Score a candidate's session against the prescribed process |
| `report-generator` | Compile scorecards into reports and leaderboards |
| `task-creator` | Author new benchmark tasks with templates and validation |
| `benchmarker` | Orchestrate end-to-end benchmark runs |

---

## Task YAML vs Process JS Split

### task.yaml (metadata + evaluation only)

```yaml
version: "1.0"
metadata:
  name: book-translation-chunked
  domain: translation
  complexity: high
  estimatedDuration: PT30M
  tags: [map-reduce, context-aware, style-preservation]

input:
  type: generated
  generatorRef: ./generate-book.js
  description: "A French novel with 8-12 chapters"

expectedOutput:
  artifacts:
    - name: translated-book
      format: markdown
      validationRules:
        - "Must contain all chapters from the original"
        - "Word count within 15% of original"

processRef: ./book-translation.process.js

evaluation:
  scoringNotes: "Focus on chunk-level translation, not chapter-level"
```

### book-translation.process.js (the actual process)

The process JS file is the single source of truth for what steps the agent must follow. The judge imports this file, executes it in trace mode, and uses the resulting step trace as the reference.

---

## Error Model

The system distinguishes between:

1. **Infrastructure errors** -- Runner failures, timeout, OOM (not scored, task is retried or marked invalid)
2. **Agent errors** -- The agent crashes or produces no output (scored as 0 across all dimensions)
3. **Obedience errors** -- The agent produces output but deviates from the process (scored per-dimension)
4. **Quality errors** -- The agent follows the process but individual step outputs are low quality (tracked but weighted lower)

---

## Security and Isolation

- Docker mode provides full isolation (network, filesystem, resource limits)
- Local mode is best-effort (timeout enforcement, working directory isolation)
- No secrets are passed to candidate agents
- The judge runs in the plugin's own context, not in the candidate's sandbox
- Input generation scripts are vetted and run locally before benchmark execution
