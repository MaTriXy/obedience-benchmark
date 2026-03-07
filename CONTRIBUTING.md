# Contributing to Obedience Benchmark

## Adding Benchmark Tasks

### 1. Create the task directory

```bash
mkdir plugin/skills/catalog-manager/benchmarks/full/my-task-name
```

### 2. Create `task.yaml`

```yaml
name: my-task-name
domain: coding          # coding, translation, data-analysis, text-processing, algorithms, general
complexity: medium      # low, medium, high
estimatedDuration: "5m"
description: >
  Clear description of the task and what process the agent must follow.

tags:
  - relevant-tag

dimensions:             # Which obedience dimensions this task exercises
  - completeness
  - ordering

evaluation:
  completeness:
    weight: 50
    criteria: "Specific criteria for scoring this dimension"
  ordering:
    weight: 50
    criteria: "Specific criteria for scoring this dimension"
  # Set weight: 0 and notApplicable for unused dimensions
  conditionality:
    weight: 0
    notApplicable: "Reason this dimension doesn't apply"
```

### 3. Create the process file

Create `my-task-name.process.js` using the babysitter SDK format:

```javascript
import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'my-task-name',
  domain: 'coding',
  complexity: 'medium',
  estimatedDuration: '5m',
  dimensions: ['completeness', 'ordering'],
  tags: ['relevant-tag'],
};

export const errorHandlers = [
  { id: 'handle-failure', triggerCondition: 'Step fails after retry', action: 'skip-and-log' },
];

// Define tasks using defineTask()
export const loadDataTask = defineTask('load-data', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Load input data',
  agent: {
    name: 'data-loader',
    prompt: { role: 'Data loader', task: 'Load input data', context: args },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
}));

export const processItemTask = defineTask('process-item', (args, taskCtx) => ({
  kind: 'agent',
  title: `Process item ${args.label}`,
  agent: {
    name: 'processor',
    prompt: { role: 'Processor', task: `Process ${args.label}`, context: args },
  },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
}));

// Process function using plain JS control flow
export async function process(inputs, ctx) {
  const data = await ctx.task(loadDataTask, { file: 'input.json' });

  // Parallel execution with Promise.all
  const results = await Promise.all([
    ctx.task(processItemTask, { label: 'A' }),
    ctx.task(processItemTask, { label: 'B' }),
  ]);

  // Loops with plain for
  for (const result of results) {
    await ctx.task(validateTask, { item: result });
  }

  // Conditionals with plain if/else
  if (allValid) {
    await ctx.task(writeOutputTask, {});
  } else {
    await ctx.task(retryFailedTask, {});
  }
}

export const evaluation = {
  completeness: {
    weight: 50,
    criteria: 'Specific criteria',
  },
  ordering: {
    weight: 50,
    criteria: 'Specific criteria',
  },
};
```

### 4. Validate the task

Use the catalog-manager skill to validate:

```
/catalog-manager Validate task at plugin/skills/catalog-manager/benchmarks/full/my-task-name
```

## Babysitter SDK Process API Reference

| Pattern | How to Express | Tests Dimensions |
|---------|---------------|-----------------|
| Sequential steps | `await ctx.task(taskDef, args)` | completeness, ordering |
| Parallel execution | `await Promise.all([ctx.task(...), ctx.task(...)])` | parallelism, completeness |
| Iteration | `for (const item of collection) { await ctx.task(...) }` | completeness, granularity |
| Conditional branching | `if (condition) { await ctx.task(...) } else { ... }` | conditionality |
| Error handling | `export const errorHandlers = [{ id, triggerCondition, action }]` | errorHandling |

## Quality Checklist

Before submitting a new task:

- [ ] `task.yaml` passes schema validation
- [ ] Process file exports `metadata`, `process`, and `evaluation`
- [ ] Process file uses `defineTask()` for all task definitions
- [ ] `metadata.dimensions` matches the dimensions exercised in the process
- [ ] Evaluation weights sum to 100 for applicable dimensions
- [ ] N/A dimensions have `weight: 0` and `notApplicable` reason
- [ ] Process has at least 3 steps to make scoring meaningful
- [ ] Task description clearly specifies the process the agent must follow
- [ ] Process exercises at least 2 different obedience dimensions

## Reporting Issues

Open an issue on the repository with:
- Steps to reproduce
- Expected vs actual behavior
- Relevant log output
