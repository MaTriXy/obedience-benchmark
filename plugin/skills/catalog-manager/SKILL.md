# Skill: Catalog Manager

## Purpose

Browse, search, filter, and validate the benchmark task catalog. The catalog lives in `skills/catalog-manager/benchmarks/` organized by domain. Each task is a directory containing a `task.yaml` (metadata + evaluation criteria) and a `*.process.js` file (the prescribed process as executable code).

## When to Use

- User wants to see what benchmark tasks are available
- User wants to filter tasks by domain, complexity, dimensions, or tags
- User wants to validate that task definitions are well-formed
- The benchmarker skill needs a task selection before running
- User asks "show me all translation tasks" or "which tasks test conditionality?"
- User wants a summary of catalog coverage across dimensions

## Inputs

- **benchmarksDir** (optional): path to the benchmarks directory; defaults to `skills/catalog-manager/benchmarks/`
- **filter** (optional): a `CatalogFilter` object with any combination of:
  - `domains` — array of domain strings (e.g. `["translation", "code-refactoring"]`)
  - `complexity` — array of complexity levels (`["low", "medium", "high"]`)
  - `dimensions` — array of `ObedienceDimension` values to require (e.g. `["conditionality", "parallelism"]`)
  - `tags` — array of free-form tag strings
  - `namePattern` — regex pattern to match against task names
  - `validatedOnly` — if `true`, only return tasks that pass validation
- **action**: one of `list`, `search`, `validate`, `describe`, `summary`

## Process

1. Call `loadCatalog(benchmarksDir)` to scan the benchmarks directory recursively for task directories containing `task.yaml`.
2. For each task directory:
   a. Load and parse `task.yaml` using the `yaml` package.
   b. Validate the parsed YAML against `skills/common/scripts/schemas/task-definition.schema.json` using Ajv (best-effort).
   c. Verify that a `*.process.js` file exists in the directory.
   d. Build a `CatalogEntry` with paths, metadata, and validation status.
3. If a filter is provided, call `filterCatalog(entries, filter)` to narrow results.
4. For `validate` action, call `validateTask(taskDir)` on individual task directories.
5. For `summary` action, call `getCatalogSummary(entries)` to produce aggregate stats.
6. Return a `TaskSelection` or `CatalogSummary` as appropriate.

## Output

- **list/search**: A `TaskSelection` object (see `skills/common/scripts/types.ts`) containing matching catalog entries with metadata, paths, and validation status.
- **validate**: A `ValidationResult` object with `valid: boolean`, `errors: string[]`, and the `entry` if valid.
- **summary**: A `CatalogSummary` object with counts grouped by domain, complexity, and dimension coverage.

## Key Functions

- `loadCatalog(benchmarksDir: string): CatalogEntry[]` -- scan dirs, load task.yaml, validate, return entries
- `filterCatalog(entries: CatalogEntry[], filter: CatalogFilter): CatalogEntry[]` -- filter by domain, complexity, dimensions, tags, name pattern
- `validateTask(taskDir: string): ValidationResult` -- validate a single task directory fully
- `getCatalogSummary(entries: CatalogEntry[]): CatalogSummary` -- stats: count by domain, complexity, dimension coverage

## Key Files

- `skills/catalog-manager/catalog.ts` -- core catalog logic
- `skills/catalog-manager/catalog.test.ts` -- unit tests
- `skills/common/scripts/schemas/task-definition.schema.json` -- JSON Schema for task.yaml
- `skills/common/scripts/types.ts` -- `CatalogEntry`, `CatalogFilter`, `TaskSelection` types
- `skills/catalog-manager/benchmarks/` -- the task catalog directory tree

## Validation Rules

1. `task.yaml` must exist in the task directory
2. `task.yaml` must contain: `name`, `domain`, `complexity`, `description`, `dimensions`, `evaluation`
3. A `*.process.js` file must exist in the task directory
4. `name` must match the pattern `^[a-z0-9][a-z0-9-]{2,63}$`
5. `domain` must be one of: general, translation, data-analysis, coding, text-processing, algorithms
6. `complexity` must be one of: low, medium, high
7. All 7 evaluation dimensions should be present (with `weight: 0` and `notApplicable` for inapplicable ones)
8. Evaluation weights for applicable dimensions should sum to 100

## Usage Examples

```typescript
import { loadCatalog, filterCatalog, validateTask, getCatalogSummary } from './catalog.js';

// Load all tasks
const entries = loadCatalog('./skills/catalog-manager/benchmarks');

// Filter to translation tasks testing conditionality
const filtered = filterCatalog(entries, {
  domains: ['translation'],
  dimensions: ['conditionality'],
});

// Validate a single task
const result = validateTask('./skills/catalog-manager/benchmarks/full/my-task');

// Get catalog overview
const summary = getCatalogSummary(entries);
console.log(summary.totalTasks);
console.log(summary.byDomain);      // { translation: 3, ... }
console.log(summary.byComplexity);   // { low: 2, medium: 5, high: 1 }
console.log(summary.dimensionCoverage); // { completeness: 7, ordering: 5, ... }
```
