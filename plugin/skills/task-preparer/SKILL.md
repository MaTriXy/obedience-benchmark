# Skill: Task Preparer

## Purpose

Prepare benchmark tasks for execution by generating or acquiring all input data,
materializing artifacts on disk, producing evaluation reference materials for the
judge, and returning a fully resolved `PreparedTask` object.

## When to Use

- Before running a candidate agent against a benchmark task.
- When a task's `input.type` is `generated` and synthetic data must be created.
- When input type is `inline`, `file`, `directory`, or `url` and artifacts need materialization.
- When evaluation reference artifacts (ground truth, expected counts, reference materials) must be prepared for the judge.

## Inputs

| Parameter      | Type            | Required | Description                                                       |
|----------------|-----------------|----------|-------------------------------------------------------------------|
| `catalogEntry` | `CatalogEntry`  | Yes      | A validated catalog entry from the catalog manager.               |
| `outputDir`    | `string`        | No       | Where to materialize inputs. Defaults to `results/<run-id>/prepared/`. |

## Outputs

A `PreparedTask` object (see `skills/obedience-types/scripts/types.ts`) containing:

- `catalogEntry` -- the original catalog entry
- `inputDir` -- absolute path to the directory with materialized input artifacts
- `taskPrompt` -- composed task prompt including the task description and input references
- `systemPrompt` -- optional system-level prompt
- `evaluationArtifacts` -- absolute paths to all evaluation reference files
- `preparedAt` -- ISO-8601 timestamp
- `preparationDurationMs` -- time taken to prepare in milliseconds

## Process

1. Read the task's `metadata.yaml` to determine the input specification.
2. Create the output directory structure: `<outputDir>/<taskName>/input/` and `<outputDir>/<taskName>/evaluation/`.
3. Based on `input.type`:
   - **`inline`**: Write each artifact's `inlineContent` to files in the input directory.
   - **`file` / `directory`**: Copy static input files from the task directory.
   - **`url`**: Download from the specified URL.
   - **`generated`**: Use built-in generators (text, code, data) keyed by the `generatorRef` or by domain heuristics.
4. Validate that all declared input artifacts exist and are non-empty.
5. Prepare evaluation reference artifacts in the `evaluation/` subdirectory:
   - Ground truth values, expected counts, reference translations, etc.
   - Serialized as JSON files the judge can load.
6. Compose the task prompt from the task description, input paths, and parameters.
7. Return a fully populated `PreparedTask`.

## Data Generators

The skill includes three built-in generators under `generators/`:

| Generator            | Module                  | Produces                                                       |
|----------------------|-------------------------|----------------------------------------------------------------|
| **Text Generator**   | `text-generator.ts`     | Synthetic books, documents, markdown files, word lists          |
| **Code Generator**   | `code-generator.ts`     | Mock codebases with circular dependencies, test stubs, configs  |
| **Data Generator**   | `data-generator.ts`     | Datasets (CSV/JSON), word frequency lists, numeric series       |

Generators are selected automatically based on the task's `domain` field or explicitly
via the `generatorRef` field in the input spec.

## Key Files

- `skills/task-preparer/scripts/preparer.ts` -- core preparation logic
- `skills/task-preparer/scripts/generators/text-generator.ts` -- synthetic text generation
- `skills/task-preparer/scripts/generators/code-generator.ts` -- mock codebase generation
- `skills/task-preparer/scripts/generators/data-generator.ts` -- dataset / numeric generation
- `skills/obedience-types/scripts/types.ts` -- `PreparedTask`, `CatalogEntry` types
- `skills/obedience-types/scripts/schemas/task-definition.schema.json` -- task YAML schema (InputSpec definition)

## Notes

- Generator output is deterministic given the same task spec (uses seeded randomness).
- Large generated inputs are cached by task name; set `force` option to regenerate.
- The preparer logs every generated artifact path for reproducibility.
- Cleanup of temporary data is supported via `cleanupPreparedData()`.
- All paths in the returned `PreparedTask` are absolute.
