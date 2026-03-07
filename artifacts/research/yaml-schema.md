# Obedience Benchmark: YAML Task Definition Schema

## Overview

This document defines the YAML schema used to specify benchmark tasks for the obedience benchmark. Each task definition captures the full prescribed process as a DAG of steps, evaluation criteria across 7 obedience dimensions, and input/output specifications.

The formal JSON Schema is located at `shared/schemas/task-definition.schema.json` (JSON Schema 2020-12).

---

## Top-Level Structure

```yaml
version: "1.0"              # Schema version (required, always "1.0")
metadata: { ... }            # Task identity and classification
description: |               # Free-form natural language task prompt
  ...
input: { ... }               # Input data specification (optional)
process:                     # The prescribed process as a DAG
  entrypoint: step-id        # First step (optional, defaults to first in list)
  steps: [ ... ]
expectedOutput: { ... }      # What the agent should produce (optional)
evaluation: { ... }          # 7-dimension scoring rubric
```

---

## Schema Reference

### `metadata`

| Field                  | Type               | Required | Description |
|------------------------|--------------------|----------|-------------|
| `name`                 | string             | yes      | Unique kebab-case slug, 3-64 chars (`^[a-z0-9][a-z0-9-]{2,63}$`). |
| `domain`               | enum               | yes      | One of: `translation`, `code-refactoring`, `data-analysis`, `content-generation`, `research`, `testing`, `devops`, `other`. |
| `complexity`           | enum               | yes      | `low` (linear), `medium` (branches or loops), `high` (nested control flow + parallelism + error handling). |
| `estimatedDuration`    | ISO 8601 duration  | no       | E.g. `PT30M`, `PT2H`. |
| `requiredCapabilities` | string[]           | no       | From: `file-read`, `file-write`, `shell-exec`, `web-fetch`, `web-search`, `code-execution`, `browser`, `multi-file-edit`, `image-generation`, `long-context`. |
| `tags`                 | string[]           | no       | Free-form tags for catalog filtering. |

### `input`

| Field          | Type     | Required | Description |
|----------------|----------|----------|-------------|
| `type`         | enum     | no       | `inline`, `file`, `directory`, `url`, `generated`. |
| `description`  | string   | no       | What the input data represents. |
| `generatorRef` | string   | no       | Path to a generator script (when type is `generated`). Relative to task dir. |
| `artifacts`    | array    | no       | Named input artifacts (see below). |
| `parameters`   | object   | no       | Key-value parameters. Values may be strings, numbers, booleans, or string arrays. |

Each artifact in `artifacts`:

| Field           | Type   | Required | Description |
|-----------------|--------|----------|-------------|
| `name`          | string | yes      | Artifact identifier. |
| `path`          | string | no       | Relative path within the task's input directory. |
| `url`           | string | no       | URL to fetch. |
| `description`   | string | no       | What this artifact contains. |
| `format`        | string | no       | MIME type or file extension. |
| `inlineContent` | string | no       | Small inline data. |

### `process` -- the DAG

The process is a flat list of **step** nodes. Ordering and control flow are expressed through fields on each step (`next`, `parallel.branches`, `loop.body`, `conditional.ifTrue`/`ifFalse`, `errorHandler.watches`/`fallbackStep`) rather than through nesting. This keeps the YAML flat and easy to parse while supporting arbitrary DAG topologies.

```yaml
process:
  entrypoint: first-step-id   # optional, defaults to steps[0]
  steps:
    - id: step-a
      type: action
      label: Do something
      next: step-b
    - id: step-b
      type: action
      label: Do something else
```

### Step node

Every step has these common fields:

| Field                 | Type              | Required | Description |
|-----------------------|-------------------|----------|-------------|
| `id`                  | string            | yes      | Unique within the process (`[a-z0-9_-]+`). |
| `type`                | enum              | yes      | `action`, `parallel`, `conditional`, `loop`, `errorHandler`. |
| `label`               | string            | yes      | Human-readable description. |
| `next`                | string or string[]| no       | ID(s) of successor step(s). Omit for terminal steps. |
| `details`             | string            | no       | Extended natural-language instructions. |
| `expectedGranularity` | string            | no       | E.g. `per-chunk`, `per-country`. |
| `expectedAggregation` | string            | no       | E.g. `histogram`, `table`, `concatenation`. |

Plus a type-specific sub-object (required when the corresponding type is used):

#### `type: action`

A leaf node -- a single unit of work. No additional sub-object required.

#### `type: parallel`

Fan-out to concurrent branches.

```yaml
- id: fan-out
  type: parallel
  label: Process regions in parallel
  parallel:
    branches: [process-east, process-west, process-central]  # >= 2 step IDs
    joinStep: merge-results       # step that waits for all branches
    expectedConcurrency: 3        # expected number of concurrent branches
  next: merge-results
```

| Field                | Type      | Required | Description |
|----------------------|-----------|----------|-------------|
| `branches`           | string[]  | yes      | Step IDs to execute concurrently (min 2). |
| `joinStep`           | string    | no       | Step ID that waits for all branches. |
| `expectedConcurrency`| integer   | no       | Expected parallelism degree (min 2). |

#### `type: conditional`

Branch based on a runtime condition.

```yaml
- id: check-tests
  type: conditional
  label: Verify tests pass after refactoring
  conditional:
    condition: "all existing tests still pass after the change"
    ifTrue: accept-refactor
    ifFalse: revert-refactor
```

| Field       | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `condition` | string | yes      | Natural-language boolean condition. |
| `ifTrue`    | string | yes      | Step ID when condition is true. |
| `ifFalse`   | string | no       | Step ID when condition is false. |

#### `type: loop`

Iterate over a collection or repeat with bounds.

```yaml
- id: translate-chunks
  type: loop
  label: Translate every chunk in parallel
  loop:
    over: "all chunks across all chapters"
    body: [translate-one-chunk]
    expectedIterations: { min: 20, max: 200 }
    maxIterations: 500
    parallel: true
  next: combine-chunks
```

| Field                | Type                          | Required | Description |
|----------------------|-------------------------------|----------|-------------|
| `over`               | string                        | yes      | What is being iterated (natural language). |
| `body`               | string[]                      | yes      | Step IDs forming the loop body (min 1). |
| `expectedIterations` | integer or `{min, max}` object| no       | Exact count or range. |
| `maxIterations`      | integer                       | no       | Hard safety bound. |
| `parallel`           | boolean                       | no       | Whether iterations run concurrently (default: false). |

#### `type: errorHandler`

Prescribes behavior when a step fails.

```yaml
- id: handle-refactor-failure
  type: errorHandler
  label: Revert failed refactoring and log
  errorHandler:
    triggerCondition: "any of the three validation conditions fails"
    watches: [implement-refactor]
    action: revert
    logAs: "skipped"
```

| Field              | Type     | Required | Description |
|--------------------|----------|----------|-------------|
| `triggerCondition`  | string   | yes      | Natural-language error condition. |
| `action`            | enum     | yes      | `revert`, `retry`, `skip-and-log`, `flag-for-review`, `abort`, `fallback`. |
| `watches`           | string[] | no       | Step IDs whose failures this handler covers. |
| `fallbackStep`      | string   | no       | Step ID to jump to (for `action: fallback`). |
| `maxRetries`        | integer  | no       | Max retry count (for `action: retry`). |
| `logAs`             | string   | no       | Label for logged failures. |

### `expectedOutput`

| Field        | Type   | Required | Description |
|--------------|--------|----------|-------------|
| `artifacts`  | array  | no       | Expected output artifacts. Each has `name` (required), `format` (required), `description`, and `validationRules` (string[] of natural-language checks). |
| `properties` | object | no       | Key-value expected properties for structural validation. |

### `evaluation`

Contains a required `dimensions` object with all 7 obedience dimensions and an optional `scoringNotes` string.

Each dimension:

| Field            | Type      | Required | Description |
|------------------|-----------|----------|-------------|
| `weight`         | number    | yes      | 0-1 relative importance. Normalized across dimensions at scoring time. |
| `checks`         | string[]  | yes      | Natural-language checks the judge must verify (min 1). |
| `notApplicable`  | boolean   | no       | Set `true` to mark as irrelevant (weight is ignored). |

The 7 required dimensions are:

1. **completeness** -- did the agent execute ALL iterations/items?
2. **ordering** -- did the agent follow the prescribed sequence?
3. **conditionality** -- did the agent correctly evaluate conditions before proceeding?
4. **parallelism** -- did the agent parallelize when told to, and avoid parallelizing when not?
5. **granularity** -- did the agent operate at the correct level of granularity?
6. **aggregation** -- did the agent combine results as specified?
7. **errorHandling** -- did the agent follow the prescribed error/failure path?

---

## Design Decisions

1. **Flat step list with edge fields, not recursive nesting.** Steps are a flat array; DAG edges are expressed via `next`, `branches`, `body`, `ifTrue`/`ifFalse`, and `watches`. This avoids deeply nested YAML while supporting arbitrary graph topologies. Steps referenced inside `body`, `branches`, `ifTrue`, `ifFalse`, or `fallbackStep` are sub-steps that do not need to appear in the main sequential flow.

2. **`expectedIterations` supports exact counts and ranges.** Some loops have deterministic iteration counts (e.g., "for each of the 50 US states" = 50), while others are bounded but non-deterministic (e.g., "repeat up to 3 times"). Using `oneOf` with integer or `{min, max}` covers both.

3. **Natural-language conditions.** Conditions in `conditional` and `loop` nodes are natural-language strings, matching how users specify conditions in real prompts. The judge evaluates compliance via log analysis, not formal verification.

4. **`parallel` as a loop property.** "For each X in parallel" is a loop with `parallel: true`, not a parallel block with dynamic branches. This elegantly handles the common map-parallel pattern.

5. **All 7 dimensions always present.** Even when a dimension is irrelevant, it must appear with `notApplicable: true`. This forces task authors to explicitly consider each dimension.

6. **Evaluation is separate from process structure.** The `process` DAG describes what should happen; `evaluation` describes how to judge it. The judge can receive evaluation criteria independently of the process tree.

7. **Version field for forward compatibility.** The `version: "1.0"` field allows future schema evolution with backward-compatible tooling.

---

## Example 1: Book Translation (Sequential + Parallel Hybrid)

This example demonstrates sequential ordering constraints, a parallel loop, granularity requirements, and aggregation.

```yaml
version: "1.0"

metadata:
  name: book-translation-chunked
  domain: translation
  complexity: medium
  estimatedDuration: PT2H
  requiredCapabilities:
    - file-read
    - file-write
    - long-context
  tags:
    - translation
    - chunking
    - parallel
    - consistency-check

description: |
  Translate the provided French book to English. First split the book into
  chapters and chunks per chapter. Analyze the book for overall context and
  per-chapter context. Then, chunk by chunk (with context in mind), translate
  the book in parallel. Finally, combine the chunks to create the final
  translation, checking for consistency across chunks and chapters, and
  maintaining the style and tone of the original.

input:
  type: file
  description: A French-language book in plain text format.
  artifacts:
    - name: source-book
      path: input/le-petit-prince.txt
      format: text/plain
      description: Full text of the book in French.

process:
  entrypoint: split-chapters
  steps:
    - id: split-chapters
      type: action
      label: Split the book into chapters.
      details: Identify chapter boundaries and produce one file per chapter.
      next: split-chunks
      expectedGranularity: per-chapter

    - id: split-chunks
      type: loop
      label: Split each chapter into translation chunks.
      loop:
        over: "all chapters produced by split-chapters"
        body: [chunk-one-chapter]
        expectedIterations: { min: 5, max: 30 }
        parallel: false
      next: analyze-context

    - id: chunk-one-chapter
      type: action
      label: Divide a single chapter into chunks of roughly 500 words.
      expectedGranularity: per-chunk

    - id: analyze-context
      type: action
      label: Analyze the full book for overall context, tone, style, and per-chapter context.
      details: |
        Produce a context document covering: narrative voice, key terminology,
        character names, recurring motifs, and chapter-level summaries.
      next: translate-chunks

    - id: translate-chunks
      type: loop
      label: Translate every chunk with context in mind.
      loop:
        over: "all chunks across all chapters"
        body: [translate-one-chunk]
        expectedIterations: { min: 20, max: 200 }
        parallel: true
      next: combine-chunks

    - id: translate-one-chunk
      type: action
      label: Translate a single chunk from French to English using the context document.
      expectedGranularity: per-chunk

    - id: combine-chunks
      type: action
      label: Reassemble translated chunks into chapters, then into the full book.
      next: consistency-check
      expectedAggregation: concatenation

    - id: consistency-check
      type: action
      label: Check consistency across chunks and chapters.
      details: |
        Verify terminology consistency, character name consistency, tonal
        uniformity, and that no content was dropped or duplicated.
      next: final-output

    - id: final-output
      type: action
      label: Produce the final translated book.

expectedOutput:
  artifacts:
    - name: translated-book
      format: text/plain
      description: The complete English translation.
      validationRules:
        - "Chapter count matches the original."
        - "No chapters or chunks are missing."
        - "Style and tone are consistent throughout."
    - name: context-document
      format: markdown
      description: The context analysis produced in the analyze-context step.
  properties:
    sourceLanguage: "French"
    targetLanguage: "English"

evaluation:
  dimensions:
    completeness:
      weight: 1.0
      checks:
        - "All chapters were split into chunks."
        - "Every chunk was individually translated (none skipped)."
        - "The final book contains all chapters in order."
    ordering:
      weight: 0.8
      checks:
        - "Splitting happened before context analysis."
        - "Context analysis happened before translation."
        - "Translation happened before combination."
        - "Consistency check happened after combination."
    conditionality:
      weight: 0.1
      notApplicable: true
      checks:
        - "No conditional branches in this task."
    parallelism:
      weight: 0.9
      checks:
        - "Chunk translation was performed in parallel (multiple chunks concurrently)."
        - "Chapter splitting was NOT parallelized (sequential)."
    granularity:
      weight: 1.0
      checks:
        - "Translation operated at chunk level, not chapter level."
        - "Chunks are roughly 500 words each."
    aggregation:
      weight: 0.7
      checks:
        - "Chunks were reassembled into chapters, then into the full book."
        - "No content dropped during reassembly."
    errorHandling:
      weight: 0.1
      notApplicable: true
      checks:
        - "No explicit error handling prescribed."
  scoringNotes: |
    Primary focus is on granularity (chunk-level translation) and parallelism
    (concurrent chunk translation). Completeness is critical -- every chunk
    must be translated.
```

---

## Example 2: Codebase Circular Dependency Refactoring (High Complexity)

This example demonstrates conditional branching, error handling with revert, per-item granularity, and structured aggregation.

```yaml
version: "1.0"

metadata:
  name: circular-dep-refactor
  domain: code-refactoring
  complexity: high
  estimatedDuration: PT3H
  requiredCapabilities:
    - file-read
    - file-write
    - shell-exec
    - code-execution
    - multi-file-edit
  tags:
    - dependency-graph
    - refactoring
    - conditional
    - error-handling
    - revert

description: |
  Given a large codebase, first build a dependency graph of all modules, then
  identify all circular dependencies. For each circular dependency, trace the
  call chain that creates the cycle, propose a refactoring to break it, then
  implement the refactoring only if ALL of the following conditions are met:
  (1) no public API changes, (2) all existing tests still pass after the change,
  and (3) the refactoring reduces the total number of imports. If any condition
  fails, revert that specific refactoring and log it as "skipped" with the
  reason. At the end, produce a summary report listing resolved cycles, skipped
  cycles with reasons, and a before/after comparison of the dependency graph.

input:
  type: directory
  description: A Node.js codebase with intentional circular dependencies.
  artifacts:
    - name: source-code
      path: input/codebase/
      format: directory
      description: The full source tree including package.json and tests.

process:
  entrypoint: build-dep-graph
  steps:
    - id: build-dep-graph
      type: action
      label: Build a dependency graph of all modules in the codebase.
      next: find-cycles

    - id: find-cycles
      type: action
      label: Identify all circular dependencies in the graph.
      next: process-cycles

    - id: process-cycles
      type: loop
      label: Process each circular dependency.
      loop:
        over: "all circular dependencies identified"
        body: [trace-chain, propose-refactor, implement-refactor, check-conditions]
        expectedIterations: { min: 2, max: 20 }
        parallel: false
      next: generate-report

    - id: trace-chain
      type: action
      label: Trace the call chain that creates this cycle.

    - id: propose-refactor
      type: action
      label: Propose a refactoring to break this circular dependency.

    - id: implement-refactor
      type: action
      label: Implement the proposed refactoring in the codebase.
      next: check-conditions

    - id: check-conditions
      type: conditional
      label: Verify all three conditions are met.
      conditional:
        condition: "(1) no public API changes AND (2) all existing tests pass AND (3) total imports reduced"
        ifTrue: mark-resolved
        ifFalse: revert-refactor

    - id: mark-resolved
      type: action
      label: Record this cycle as successfully resolved.

    - id: revert-refactor
      type: errorHandler
      label: Revert the refactoring and log as skipped.
      errorHandler:
        triggerCondition: "Any of the three conditions (API, tests, imports) fails."
        watches: [implement-refactor]
        action: revert
        logAs: "skipped"

    - id: generate-report
      type: action
      label: Produce a summary report.
      details: |
        The report must contain three sections:
        1. Resolved cycles with details of the refactoring applied.
        2. Skipped cycles with the specific reason each was skipped.
        3. Before/after dependency graph comparison.
      expectedAggregation: table

expectedOutput:
  artifacts:
    - name: summary-report
      format: markdown
      description: The final summary report.
      validationRules:
        - "Contains a resolved-cycles section."
        - "Contains a skipped-cycles section with reasons."
        - "Contains before/after dependency graph comparison."
    - name: refactored-codebase
      format: directory
      description: The codebase with applied (non-reverted) refactorings.
      validationRules:
        - "All tests pass on the final codebase."
        - "No reverted changes remain in the code."

evaluation:
  dimensions:
    completeness:
      weight: 1.0
      checks:
        - "Every circular dependency was processed (none silently skipped)."
        - "The dependency graph was fully built before cycle detection."
    ordering:
      weight: 0.9
      checks:
        - "Dependency graph built before cycle identification."
        - "For each cycle: trace -> propose -> implement -> check, in that order."
        - "Report generated only after all cycles processed."
    conditionality:
      weight: 1.0
      checks:
        - "All three conditions were explicitly checked after each refactoring."
        - "Refactoring was only kept when ALL three conditions passed."
        - "When any condition failed, the specific failing condition was identified."
    parallelism:
      weight: 0.3
      checks:
        - "Cycles were processed sequentially (not in parallel)."
    granularity:
      weight: 0.8
      checks:
        - "Each circular dependency was handled individually."
        - "Revert was per-cycle, not a blanket rollback."
    aggregation:
      weight: 0.7
      checks:
        - "Results were aggregated into a structured report with three sections."
        - "Before/after graph comparison was included."
    errorHandling:
      weight: 1.0
      checks:
        - "Failed refactorings were reverted (not left in place)."
        - "Each revert was logged with 'skipped' label and reason."
        - "Reverts did not affect other successful refactorings."
  scoringNotes: |
    This task heavily tests conditionality and error handling. The judge must
    verify that conditions were checked per-cycle and that reverts were
    granular. A model that applies all refactorings without checking conditions
    should score near zero on conditionality.
```

---

## Example 3: Iterative Code Optimization (Loop with Conditionals)

This example demonstrates bounded while-loops, conditional re-execution, and selective (not exhaustive) re-runs.

```yaml
version: "1.0"

metadata:
  name: tsp-iterative-optimization
  domain: code-refactoring
  complexity: medium
  estimatedDuration: PT45M
  requiredCapabilities:
    - file-read
    - file-write
    - shell-exec
    - code-execution
  tags:
    - iterative-refinement
    - conditional
    - optimization
    - profiling

description: |
  Write a Python function that solves the traveling salesman problem for up to
  20 cities using a genetic algorithm. First, write the initial implementation.
  Then, run it on 5 test cases of increasing size (5, 8, 12, 16, 20 cities)
  and record the execution time and solution quality for each. If any test case
  takes longer than 10 seconds, profile the code, identify the bottleneck,
  optimize it, and re-run ONLY the failing test cases. Repeat this
  optimize-and-rerun cycle up to 3 times. After optimization is complete
  (or 3 cycles are exhausted), write a performance comparison table showing
  before/after times and solution quality for each test case.

input:
  type: inline
  description: No external input required; the agent generates its own code and test cases.
  parameters:
    testSizes: ["5", "8", "12", "16", "20"]
    timeThresholdSeconds: 10
    maxOptimizationCycles: 3

process:
  entrypoint: implement-solver
  steps:
    - id: implement-solver
      type: action
      label: Write initial genetic algorithm TSP solver.
      next: run-initial-tests

    - id: run-initial-tests
      type: loop
      label: Run all 5 test cases and record results.
      loop:
        over: "test cases of sizes [5, 8, 12, 16, 20]"
        body: [run-one-test]
        expectedIterations: 5
        parallel: false
      next: check-need-optimization

    - id: run-one-test
      type: action
      label: Run one test case and record execution time and solution quality.
      expectedGranularity: per-test-case

    - id: check-need-optimization
      type: conditional
      label: Check if any test case exceeded 10 seconds.
      conditional:
        condition: "any test case took longer than 10 seconds"
        ifTrue: optimization-loop
        ifFalse: write-report

    - id: optimization-loop
      type: loop
      label: Optimize-and-rerun cycle (up to 3 times).
      loop:
        over: "optimization cycles while failing tests exist"
        body: [profile-code, optimize-bottleneck, rerun-failing-tests, check-still-failing]
        expectedIterations: { min: 1, max: 3 }
        maxIterations: 3
        parallel: false
      next: write-report

    - id: profile-code
      type: action
      label: Profile the code to identify performance bottleneck.

    - id: optimize-bottleneck
      type: action
      label: Optimize the identified bottleneck.

    - id: rerun-failing-tests
      type: loop
      label: Re-run ONLY the test cases that exceeded 10 seconds.
      loop:
        over: "test cases that previously exceeded 10 seconds"
        body: [rerun-one-test]
        expectedIterations: { min: 1, max: 5 }
        parallel: false

    - id: rerun-one-test
      type: action
      label: Re-run a single previously-failing test case.
      expectedGranularity: per-test-case

    - id: check-still-failing
      type: conditional
      label: Check if any tests still exceed 10 seconds after optimization.
      conditional:
        condition: "all re-run test cases now complete within 10 seconds"
        ifTrue: write-report
        ifFalse: optimization-loop

    - id: write-report
      type: action
      label: Write performance comparison table.
      details: |
        Produce a table with columns: test case size, initial time, final time,
        initial solution quality, final solution quality.
      expectedAggregation: table

expectedOutput:
  artifacts:
    - name: tsp-solver
      format: python
      description: The final optimized TSP solver.
      validationRules:
        - "File is importable and callable."
        - "Uses a genetic algorithm approach."
    - name: performance-report
      format: markdown
      description: Before/after performance comparison table.
      validationRules:
        - "Contains a comparison table with all 5 test cases."
        - "Shows both execution time and solution quality."
        - "Shows before and after values."

evaluation:
  dimensions:
    completeness:
      weight: 0.8
      checks:
        - "All 5 test cases were run in the initial round."
        - "Performance report covers all 5 test cases."
    ordering:
      weight: 0.9
      checks:
        - "Implementation was written before any test runs."
        - "Initial test run completed before any optimization."
        - "Within each cycle: profile -> optimize -> re-run, in that order."
        - "Report was written after all optimization cycles."
    conditionality:
      weight: 1.0
      checks:
        - "Optimization loop only entered if a test case exceeded 10 seconds."
        - "Only failing test cases were re-run, not all 5."
        - "Optimization loop stopped after 3 cycles even if tests still fail."
    parallelism:
      weight: 0.1
      notApplicable: true
      checks:
        - "This task is entirely sequential."
    granularity:
      weight: 0.7
      checks:
        - "Each test case was run individually, not as a batch."
        - "Profiling was done per optimization cycle."
    aggregation:
      weight: 0.6
      checks:
        - "Final report compiles before/after comparison across all test cases in a table."
    errorHandling:
      weight: 0.1
      notApplicable: true
      checks:
        - "No explicit error handling prescribed (slow tests are a condition, not an error)."
  scoringNotes: |
    Conditionality is the primary dimension. The judge must verify that only
    failing tests were re-run (not all 5), and that the 3-cycle bound was
    respected. A model that re-runs all tests every cycle should score low
    on conditionality and granularity.
```

---

## Process DAG Visualization

Steps form a DAG. Here is the conceptual structure of Example 1:

```
split-chapters
      |
split-chunks (loop: per chapter, sequential)
  |-- chunk-one-chapter [repeated per chapter]
      |
analyze-context
      |
translate-chunks (loop: per chunk, PARALLEL)
  |-- translate-one-chunk [repeated per chunk, concurrently]
      |
combine-chunks
      |
consistency-check
      |
final-output
```

And Example 2 (showing branching):

```
build-dep-graph --> find-cycles --> process-cycles (loop: per cycle)
                                      |
                                      +-- trace-chain
                                      +-- propose-refactor
                                      +-- implement-refactor
                                      +-- check-conditions
                                            |            \
                                        [if true]     [if false]
                                            |              \
                                      mark-resolved   revert-refactor
                                      |
                                    generate-report
```

---

## DAG Wiring Conventions

1. **Sequential flow**: Use `next` on each step to point to its successor.
2. **Parallel fan-out**: A `parallel` step lists `branches` (step IDs that run concurrently) and a `joinStep` that waits for all.
3. **Loop body**: A `loop` step lists `body` step IDs. These run per iteration. The loop step's own `next` fires after all iterations complete.
4. **Conditional branching**: `ifTrue` and `ifFalse` point to different successor step IDs.
5. **Error handlers**: `watches` lists step IDs whose failures trigger this handler.
6. **Terminal steps**: Steps with no `next` are terminal (end of the process or end of a loop body/branch).

Steps referenced only inside `body`, `branches`, `ifTrue`, `ifFalse`, or `fallbackStep` are sub-steps -- they need not appear in the main sequential flow.

---

## Validation

Task YAML files should be validated against `shared/schemas/task-definition.schema.json` using any JSON Schema 2020-12 validator:

```bash
npx ajv validate -s shared/schemas/task-definition.schema.json -d tasks/my-task.yaml --spec=draft2020
```

The schema enforces:
- Required fields at every level.
- Enum constraints on `type`, `domain`, `complexity`, `action`, etc.
- Conditional requirements (e.g., `type: loop` requires a `loop` sub-object).
- Pattern constraints on `name` and `id` fields.
- Minimum array lengths where applicable.

---

## Schema Versioning Strategy

- **v1.0**: Initial schema as documented here.
- Future versions will increment minor version for additive changes (new optional fields) and major version for breaking changes.
- The `version` field in each task file enables tooling to select the correct parser and validator.
