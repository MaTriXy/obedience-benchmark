# Skill: Task Creator (benchmark-case-creator)

## Purpose

Guide users through authoring new benchmark tasks for the Obedience Benchmark.
Provides templates for common process patterns, generates both `metadata.yaml`
and `*.process.js` stubs, validates created tasks against the JSON Schema, and
places tasks in the correct catalog directory.

## When to Use

- User wants to add a new benchmark task to the catalog
- User wants to see available process-pattern templates
- User wants to generate a task scaffold from a template
- User wants to validate a task directory they are writing

## Inputs

| Parameter      | Type     | Required | Description                                        |
|----------------|----------|----------|----------------------------------------------------|
| `action`       | string   | yes      | One of `create`, `list-templates`, `validate`       |
| `templateId`   | string   | for create | Template pattern to use (see table below)         |
| `name`         | string   | for create | Task name (`^[a-z0-9][a-z0-9-]{2,63}$`)          |
| `domain`       | string   | for create | Problem domain (see schema enum)                  |
| `complexity`   | string   | for create | `low`, `medium`, or `high`                        |
| `description`  | string   | for create | Natural-language task description                 |
| `taskDir`      | string   | for validate | Path to an existing task directory to validate   |
| `catalogDir`   | string   | no       | Base catalog directory (default: `benchmark-tasks`) |

## Templates

Templates generate JS process files that use the babysitter SDK format
(`defineTask()`, `ctx.task()`, `Promise.all()`, and plain JS control flow).

| Template ID      | Pattern                 | Description                                          | Dimensions Exercised                                         |
|------------------|-------------------------|------------------------------------------------------|--------------------------------------------------------------|
| `sequential`     | Linear pipeline         | Steps A -> B -> C executed in strict order            | completeness, ordering, granularity, errorHandling           |
| `map-reduce`     | Parallel fan-out/fan-in | Split work, process branches concurrently, aggregate  | completeness, ordering, parallelism, aggregation             |
| `iterative`      | Loop with exit condition | Repeat body until convergence or max iterations       | completeness, ordering, granularity, conditionality          |
| `conditional`    | Branching with rollback  | Evaluate condition, branch, optional rollback on fail | completeness, ordering, conditionality, errorHandling        |

## Process

### Creating a New Task (`action: create`)

1. Select a template by `templateId`
2. Generate `metadata.yaml` from the template + user-supplied config (name, domain, complexity, description)
3. Generate `<task-name>.process.js` with the template's process pattern using `ctx.*` calls
4. Validate the generated task against the JSON Schema
5. Write files to `<catalogDir>/<domain>/<task-name>/`

### Listing Templates (`action: list-templates`)

Returns the array of available `TaskTemplate` objects with id, description,
example use-case, and exercised dimensions.

### Validating a Task (`action: validate`)

1. Check `metadata.yaml` exists and parses as valid YAML
2. Validate against `skills/obedience-types/scripts/schemas/task-definition.schema.json`
3. Check `processRef` points to an existing `*.process.js` file
4. Verify that `metadata.name` follows the naming pattern
5. Check that dimension weights are reasonable (each 0-1)
6. Return a `ValidationResult` with `valid` flag and any errors

## Output

- **create**: New task directory containing `metadata.yaml` and `<name>.process.js`
- **list-templates**: `TaskTemplate[]` array
- **validate**: `ValidationResult` with `valid: boolean` and `errors: string[]`

## Key Files

| File | Purpose |
|------|---------|
| `skills/task-creator/scripts/creator.ts` | Core logic: `getTemplates()`, `generateTask()`, `validateGeneratedTask()`, `saveTask()` |
| `skills/task-creator/templates/sequential.template.js` | Sequential pipeline template |
| `skills/task-creator/templates/map-reduce.template.js` | Parallel fan-out/fan-in template |
| `skills/task-creator/templates/iterative.template.js` | Loop with convergence template |
| `skills/task-creator/templates/conditional.template.js` | Branching with rollback template |
| `skills/obedience-types/scripts/schemas/task-definition.schema.json` | JSON Schema for metadata.yaml validation |
| `skills/obedience-types/scripts/types.ts` | TypeScript type definitions |

## Example Usage

```typescript
import { getTemplates, generateTask, validateGeneratedTask, saveTask } from './creator.js';

// 1. List available templates
const templates = getTemplates();

// 2. Generate a task from a template
const task = generateTask('sequential', {
  name: 'translate-markdown-doc',
  domain: 'translation',
  complexity: 'medium',
  description: 'Translate a Markdown document through a multi-step pipeline',
});

// 3. Save to disk
const taskDir = saveTask(task, './benchmark-tasks');

// 4. Validate the saved task
const result = validateGeneratedTask(taskDir);
console.log(result.valid); // true
```
