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

### Install the plugin

```bash
claude plugin install obedience-benchmark
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
├── plugin.json              # Plugin manifest
├── package.json             # Node.js project
├── shared/                  # Shared types and utilities
│   ├── types.ts             # All type definitions
│   ├── process-helpers.js   # ProcessContext API for task process files
│   ├── log-collector.ts     # Structured event capture
│   ├── log-parser.ts        # Execution trace reconstruction
│   ├── runner-interface.ts  # Runner abstraction layer
│   └── schemas/             # JSON Schema files
│       └── task-definition.schema.json
├── skills/                  # Plugin skills
│   ├── catalog-manager/     # Browse and filter task catalog
│   ├── task-creator/        # Author new benchmark tasks
│   ├── task-preparer/       # Generate input data and artifacts
│   ├── candidate-runner/    # Execute candidate agents
│   ├── judge/               # Score obedience across 7 dimensions
│   ├── report-generator/    # Compile reports and leaderboards
│   └── benchmarker/         # Top-level orchestrator
├── benchmarks/              # Task catalog
│   ├── smoke/               # Simple smoke tests
│   │   ├── hello-world/
│   │   ├── parallel-sum/
│   │   └── conditional-skip/
│   └── full/                # Full benchmark tasks
│       ├── book-translation/
│       ├── countries-cities-attractions/
│       ├── circular-dependency-refactoring/
│       ├── us-states-scraping/
│       ├── tsp-genetic-algorithm/
│       ├── markdown-readability/
│       └── crossword-puzzle/
├── marketplace/             # Plugin marketplace
│   ├── marketplace.ts
│   └── registry/
└── results/                 # Benchmark run results (gitignored)
```

## Skills

### benchmarker
Top-level orchestrator. Runs the full pipeline: catalog → prepare → run → judge → report.

### catalog-manager
Browse, search, and filter the task catalog by domain, complexity, dimensions, and tags.

### task-creator
Author new benchmark tasks with templates and validation.

### task-preparer
Generate synthetic input data (books, codebases, datasets) for benchmark tasks.

### candidate-runner
Execute agents in Docker containers or local subprocesses with log capture.

### judge
Score agent behavior against prescribed processes across all 7 obedience dimensions.

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

### `*.process.js` — Prescribed process definition

```javascript
export const metadata = {
  name: 'my-task',
  domain: 'coding',
  complexity: 'high',
  dimensions: ['completeness', 'ordering', 'conditionality'],
  tags: ['example'],
};

export async function prescribedProcess(input, ctx) {
  // Sequential step
  const data = await ctx.step('load-data', {
    action: 'Load input data from file',
    expected: { type: 'array', minLength: 1 },
  });

  // Parallel execution
  const results = await ctx.parallel('process-items', [
    { action: 'Process item A' },
    { action: 'Process item B' },
  ]);

  // Loop with iteration
  await ctx.loop('validate-results', results, async (item, i) => {
    await ctx.step(`validate-${i}`, {
      action: `Validate result ${i}`,
    });
  });

  // Conditional branch
  await ctx.conditional('check-quality', {
    condition: 'All results pass validation',
    ifTrue: { action: 'Write final output' },
    ifFalse: { action: 'Retry failed items' },
  });

  // Error handler
  ctx.errorHandler('handle-failure', {
    triggerCondition: 'Validation fails after retry',
    action: 'skip-and-log',
  });
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

## Marketplace

The plugin includes a marketplace for discovering and sharing:
- Benchmark task packs for specific domains
- Judge extensions with custom scoring dimensions
- Runner harnesses for additional AI platforms

See `marketplace/` for the registry and management tools.
