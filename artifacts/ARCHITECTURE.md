# Obedience Benchmark -- Architecture Document

## Overview

The Obedience Benchmark is a Claude Code plugin that measures whether AI agents (Claude Code, Codex, custom harnesses) follow **prescribed processes** rather than merely producing correct outputs. It answers the question: "Given a detailed procedural specification, does the agent execute the exact steps in the exact order with the exact granularity and parallelism prescribed?"

Process fidelity is the primary metric. Output correctness is secondary.

---

## Directory Structure

```
obedience-benchmark/
  .claude-plugin/
    plugin.json                          # Claude Code marketplace metadata
    marketplace.json                     # Marketplace manifest (source: plugin/)

  plugin/
    plugin.json                          # Plugin manifest -- registers 8 skills

    skills/
      obedience-types/
        SKILL.md                         # Shared type definitions and schemas
        scripts/
          types.ts                       # All shared TypeScript types
          schemas/
            task-definition.schema.json  # JSON Schema for task metadata + evaluation

      catalog-manager/
        SKILL.md                         # Skill definition for catalog management
        benchmarks/                      # Task catalog (smoke/ and full/)

      task-preparer/
        SKILL.md                         # Skill definition for test case preparation

      candidate-runner/
        SKILL.md                         # Skill definition for agent execution
        scripts/
          runner-interface.ts            # Runner abstraction (Docker/local)
          log-collector.ts               # Structured event capture

      judge/
        SKILL.md                         # Skill definition for obedience evaluation
        judge.ts                         # Judge implementation
        scripts/
          log-parser.ts                  # Execution trace reconstruction

      report-generator/
        SKILL.md                         # Skill definition for report compilation

      task-creator/
        SKILL.md                         # Skill definition for authoring new tasks
        templates/                       # Process file templates

      benchmarker/
        SKILL.md                         # Skill definition for end-to-end orchestration

  package.json                           # Node project config
  results/                               # Run results (gitignored)
```

---

## Core Design Decision: Code-Based Process Definitions

Benchmark task processes are defined as **executable JavaScript modules**, not YAML DAGs. YAML is used only for task metadata, input specifications, and evaluation criteria. The process itself is an importable JS file that uses the babysitter SDK's `defineTask` pattern.

### Rationale

1. **Expressiveness** -- Real processes have loops, conditionals, dynamic fan-out, and error handling expressed naturally with plain JS control flow.
2. **Composability** -- JS modules can import shared utilities, reuse task definitions, and compose processes from sub-processes.
3. **Familiarity** -- Uses the babysitter SDK's `defineTask` / `ctx.task()` pattern directly.
4. **Testability** -- Process files can be unit-tested, linted, and type-checked independently.
5. **Judge readability** -- The judge reads the process JS directly, extracts `defineTask` exports, probes factory functions for metadata, and compares against session logs.

### Process File Anatomy

Every process file (`*.process.js`) exports:

```javascript
import { defineTask } from '@a5c-ai/babysitter-sdk';

// 1. Metadata (mirrors task.yaml metadata, used for validation)
export const metadata = {
  name: 'task-name',
  domain: 'translation',
  complexity: 'high',
  estimatedDuration: '30min',
  dimensions: ['completeness', 'ordering', ...],
  tags: ['map-reduce', 'context-aware']
};

// 2. Error handlers (optional)
export const errorHandlers = [
  { id: 'handle-failure', triggerCondition: 'Validation fails', action: 'skip-and-log' },
];

// 3. Task definitions using defineTask()
export const loadDataTask = defineTask('load-data', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Load input data',
  agent: {
    name: 'data-loader',
    prompt: { role: 'Data loader', task: 'Load data', context: args },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
}));

// 4. The process function using plain JS control flow
export async function process(inputs, ctx) {
  const data = await ctx.task(loadDataTask, { file: inputs.file });
  // Use Promise.all for parallelism, for/while for loops, if/else for conditionals
}

// 5. Evaluation criteria (what the judge scores)
export const evaluation = {
  completeness: { weight: 25, criteria: '...' },
  ordering:     { weight: 15, criteria: '...' },
  // ... all 7 dimensions
};
```

---

## How the Judge Reads Process Files

The judge imports the process module directly and extracts task definitions by scanning exports for objects with a `taskName` property (the signature of `defineTask()` return values). For each task definition found, it probes the factory function with dummy arguments to extract titles and descriptions.

This approach requires no tracing helper or special execution mode — the judge simply reads the module's exports as data.

```
1. Import the *.process.js module
2. Scan exports for defineTask objects (have .taskName property)
3. Probe each factory function for title, description, kind
4. Read errorHandlers export for error handling specs
5. Read evaluation export for scoring criteria
6. Compare extracted task definitions against agent session logs
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

- Maintains an index of all tasks in `plugin/skills/catalog-manager/benchmarks/`
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
- Supports Docker-isolated and local-subprocess modes
- Injects the task prompt, input artifacts, and system prompt
- Captures full session logs (tool calls, messages, timing)
- Enforces timeout and resource limits
- Produces a `RunnerResult` with logs, events, artifacts, and timing

### Stage 4: Judge

- Imports the task's `*.process.js` file and extracts `defineTask` exports
- Probes factory functions to build the prescribed task list
- Reads `errorHandlers` and `evaluation` exports
- Parses the candidate's session logs into an observed step sequence
- Performs structural comparison across all 7 obedience dimensions
- Also checks output correctness and consistency of intermediate results
- Produces an `ObedienceScorecard` with per-dimension scores and evidence

#### Judge Algorithm

```
1. TASKS = extract defineTask exports from process module
2. OBSERVED = parse session logs into step sequence
3. MATCH observed steps to prescribed tasks using names, titles, prompt similarity
4. For each dimension:
   a. completeness:  count(matched observed steps) / count(prescribed tasks)
   b. ordering:      longest common subsequence / total prescribed tasks
   c. conditionality: for each conditional path, did agent evaluate correctly?
   d. parallelism:   for each Promise.all block, were steps concurrent in logs?
   e. granularity:   did agent operate at prescribed granularity (chunk vs chapter)?
   f. aggregation:   did agent aggregate results as prescribed?
   g. errorHandling: did agent follow prescribed error paths?
5. Compute weighted score, attach evidence
6. Return ObedienceScorecard
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

The plugin registers 8 skills:

| Skill | Purpose |
|-------|---------|
| `obedience-types` | Shared type definitions and JSON schemas |
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

The process JS file is the single source of truth for what steps the agent must follow. The judge imports this file directly, extracts `defineTask` exports, and uses them as the reference for scoring.

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
