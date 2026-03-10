# Obedience Benchmark

A Claude Code plugin that benchmarks AI agent **obedience** — measuring whether agents follow prescribed processes, not just produce correct outputs.

## Why Obedience Matters

Most benchmarks test whether a model can produce a correct answer. This benchmark tests whether a model can follow a **specific process** to reach a correct answer. In real-world agent deployments, users need to trust that the agent will follow their workflow, not improvise its own.

**Obedience and capability are orthogonal.** A model might be highly capable but disobedient (skipping steps, taking shortcuts, reordering operations), or less capable but perfectly obedient (following every step even if it struggles with individual steps).

## 7 Dimensions of Obedience

| Dimension | What It Tests |
|-----------|---------------|
| **Completeness** | Did the agent execute ALL iterations? (all countries, all chapters, all modules) |
| **Ordering** | Did the agent follow the prescribed sequence of steps? |
| **Conditionality** | Did the agent correctly evaluate conditions before proceeding? |
| **Parallelism** | Did the agent parallelize when told to, and sequentialize when told to? |
| **Granularity** | Did the agent operate at the correct level? (chunk-by-chunk, not chapter-at-a-time) |
| **Aggregation** | Did the agent combine results as specified? (histogram, not just a list) |
| **Error Handling** | Did the agent follow the prescribed error/failure path? |

## Quick Start

### Add the marketplace and install

```bash
# Add this repo as a marketplace
/plugin marketplace add a5c-ai/obedience-benchmark

# Install the plugin
/plugin install obedience-benchmark
```

### Run a benchmark

Use the `benchmarker` skill to run a full suite:

```
/benchmarker Run the smoke test suite against claude-code with claude-sonnet-4-20250514
```

### Browse available tasks

```
/catalog-manager List all benchmark tasks
/catalog-manager Filter tasks by domain=coding
```

### Create a new task

```
/task-creator Create a new benchmark task for API testing
```

## Architecture

```
obedience-benchmark/
├── .claude-plugin/
│   ├── plugin.json          # Claude Code marketplace metadata
│   └── marketplace.json     # Marketplace manifest (source: plugin/)
├── plugin/                  # Plugin root (referenced by marketplace)
│   ├── plugin.json          # Plugin manifest (skills registry, metadata)
│   └── skills/              # Plugin skills (registered in plugin.json)
│       ├── obedience-types/      # Shared type definitions and schemas
│       │   └── scripts/
│       │       ├── types.ts             # All type definitions
│       │       └── schemas/
│       │           └── task-definition.schema.json
│       ├── catalog-manager/     # Browse and filter task catalog
│       │   ├── catalog.ts
│       │   └── benchmarks/      # Task catalog
│       │       ├── smoke/       # Simple smoke tests
│       │       │   ├── hello-world/
│       │       │   ├── parallel-sum/
│       │       │   └── conditional-skip/
│       │       └── full/        # Full benchmark tasks
│       │           ├── book-translation/
│       │           ├── countries-cities-attractions/
│       │           ├── circular-dependency-refactoring/
│       │           ├── us-states-scraping/
│       │           ├── tsp-genetic-algorithm/
│       │           ├── markdown-readability/
│       │           └── crossword-puzzle/
│       ├── candidate-runner/    # Execute candidate agents
│       │   ├── runner.ts
│       │   └── scripts/
│       │       ├── runner-interface.ts  # Runner abstraction types
│       │       └── log-collector.ts     # Structured event capture
│       ├── judge/               # Score obedience across 7 dimensions
│       │   ├── judge.ts
│       │   └── scripts/
│       │       └── log-parser.ts        # Execution trace reconstruction
│       ├── report-generator/    # Compile reports and leaderboards
│       ├── task-creator/        # Author new benchmark tasks
│       ├── task-preparer/       # Generate input data and artifacts
│       └── benchmarker/         # Top-level orchestrator
├── package.json             # Node.js project
└── results/                 # Benchmark run results (gitignored)
```

## Skills

### benchmarker
Top-level orchestrator. Runs the full pipeline: catalog → prepare → run → judge → report.

### catalog-manager
Browse, search, and filter the task catalog by domain, complexity, dimensions, and tags. The benchmark task catalog lives under `skills/catalog-manager/benchmarks/`.

### task-creator
Author new benchmark tasks with templates and validation.

### task-preparer
Generate synthetic input data (books, codebases, datasets) for benchmark tasks.

### candidate-runner
Execute agents in Docker containers or local subprocesses with log capture.

### judge
Score agent behavior against prescribed processes across all 7 obedience dimensions. The judge is an LLM-as-judge that analyzes session logs, checks process fidelity, verifies output correctness, and checks consistency of intermediate results.

### report-generator
Compile scorecards into markdown reports with dimension analysis and leaderboard rankings.

## Task Format

Each benchmark task consists of:

### `task.yaml` — Metadata and evaluation criteria

```yaml
name: my-task
domain: coding
complexity: high
description: "Task description"
dimensions:
  - completeness
  - ordering
  - conditionality
evaluation:
  completeness:
    weight: 40
    criteria: "Must execute all iterations"
  ordering:
    weight: 30
    criteria: "Must follow step sequence"
  conditionality:
    weight: 30
    criteria: "Must evaluate conditions correctly"
```

### `*.process.js` — Prescribed process definition (babysitter SDK format)

```javascript
import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'my-task',
  domain: 'coding',
  complexity: 'high',
  dimensions: ['completeness', 'ordering', 'conditionality'],
  tags: ['example'],
};

export const errorHandlers = [
  { id: 'handle-failure', triggerCondition: 'Validation fails after retry', action: 'skip-and-log' },
];

// Task definitions
export const loadDataTask = defineTask('load-data', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Load input data',
  agent: {
    name: 'data-loader',
    prompt: { role: 'Data loader', task: 'Load input data from file', context: args },
    outputSchema: { type: 'array' },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
}));

export const processItemTask = defineTask('process-item', (args, taskCtx) => ({
  kind: 'agent',
  title: `Process item ${args.label}`,
  agent: {
    name: 'item-processor',
    prompt: { role: 'Processor', task: `Process item ${args.label}`, context: args },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
}));

// Process function using plain JS control flow
export async function process(inputs, ctx) {
  const data = await ctx.task(loadDataTask, { file: 'input.json' });

  // Parallel execution
  const results = await Promise.all([
    ctx.task(processItemTask, { label: 'A' }),
    ctx.task(processItemTask, { label: 'B' }),
  ]);

  // Loop with plain for
  for (let i = 0; i < results.length; i++) {
    await ctx.task(validateTask, { index: i, item: results[i] });
  }

  // Conditional with plain if/else
  if (allValid) {
    await ctx.task(writeOutputTask, {});
  } else {
    await ctx.task(retryFailedTask, {});
  }
}

export const evaluation = {
  completeness: { weight: 40, criteria: 'Must execute all iterations' },
  ordering: { weight: 30, criteria: 'Must follow step sequence' },
  conditionality: { weight: 30, criteria: 'Must evaluate conditions correctly' },
};
```

## Runner Modes

### Local Mode
Runs agents as local subprocesses using `claude --print`. Fast for development.

### Docker Mode
Runs agents in isolated Docker containers with resource limits, network isolation, and volume mounts. Recommended for CI and production benchmarking.

## Scoring

Each task is scored 0-100 across applicable dimensions. The weighted score uses weights from the task's evaluation criteria. **Process fidelity is the primary metric** — a model that follows every step but makes a minor error scores higher than one that skips steps but produces a correct answer.

The judge reads the process file directly — importing its `defineTask` exports, `metadata`, `evaluation` criteria, and `errorHandlers` — then compares against the agent's execution logs. It also checks:
- **Output correctness** — does the final output match what the process would produce if followed exactly?
- **Consistency** — are intermediate results coherent with each other and the final output?

## Marketplace

This repository is a Claude Code plugin marketplace. To add it:

```bash
/plugin marketplace add a5c-ai/obedience-benchmark
```

The marketplace manifest at `.claude-plugin/marketplace.json` follows the official Anthropic marketplace schema.
