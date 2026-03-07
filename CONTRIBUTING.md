# Contributing to Obedience Benchmark

## Adding Benchmark Tasks

### 1. Create the task directory

```bash
mkdir benchmarks/full/my-task-name
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

Create `my-task-name.process.js` using the ProcessContext API:

```javascript
export const metadata = {
  name: 'my-task-name',
  domain: 'coding',
  complexity: 'medium',
  estimatedDuration: '5m',
  dimensions: ['completeness', 'ordering'],
  tags: ['relevant-tag'],
};

export async function prescribedProcess(input, ctx) {
  // Define the exact steps the agent must follow
  // Use ctx.step(), ctx.parallel(), ctx.loop(),
  // ctx.conditional(), ctx.errorHandler()
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
/catalog-manager Validate task at benchmarks/full/my-task-name
```

## ProcessContext API Reference

| Method | Signature | Tests Dimensions |
|--------|-----------|-----------------|
| `step` | `ctx.step(id, { action, expected?, context? })` | completeness, ordering |
| `parallel` | `ctx.parallel(id, [specs...])` | parallelism, completeness |
| `loop` | `ctx.loop(id, collection, bodyFn)` | completeness, granularity |
| `conditional` | `ctx.conditional(id, { condition, ifTrue, ifFalse? })` | conditionality |
| `errorHandler` | `ctx.errorHandler(id, { triggerCondition, action })` | errorHandling |

## Quality Checklist

Before submitting a new task:

- [ ] `task.yaml` passes schema validation
- [ ] Process file exports `metadata`, `prescribedProcess`, and `evaluation`
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
