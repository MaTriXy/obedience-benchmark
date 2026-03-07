# Obedience Benchmark Plugin — Process Description

## Goal

Build a Claude Code plugin that benchmarks AI agent obedience — measuring whether agents follow prescribed processes, not just produce correct outputs. The plugin has 7 skills, a YAML-based task catalog, and supports both local and Docker-based candidate execution.

## Process Summary

The build is organized into 6 phases with quality gates and convergence loops.

---

### Phase 1: Architecture & Design

**Purpose:** Research the problem space and design the plugin before writing any code.

**Steps:**
1. **Parallel research** (4 agents simultaneously):
   - Research existing agent benchmarks (AgentBench, SWE-bench, GAIA) for patterns and gaps
   - Research Claude Code plugin conventions (plugin.json, SKILL.md format, directory layout)
   - Design the YAML task definition schema (process steps as DAG, evaluation criteria per dimension)
   - Design the Docker-based runner with local-subprocess fallback
2. **Architecture synthesis:** Combine all research into a cohesive architecture document covering directory structure, plugin.json, data flow, inter-skill communication, and type definitions.
3. **Breakpoint:** Human reviews the architecture before implementation begins.

---

### Phase 2: Plugin Scaffold & Core Infrastructure

**Purpose:** Create the skeleton that all skills build upon.

**Steps:**
1. **Plugin scaffold:** Create plugin.json, directory structure, 7 empty SKILL.md stubs.
2. **Parallel infrastructure** (3 agents simultaneously):
   - YAML task schema: JSON Schema file + TypeScript types + validator with unit tests
   - Shared types: ObedienceScorecard, LogEvent, RunnerConfig, CatalogEntry, etc.
   - Log collector: Structured event capture overlay + parser for the judge
3. **Scaffold verification:** Compile check, file existence check, schema validation test.

---

### Phase 3: Skill Implementation

**Purpose:** Build all 7 skills with acceptance criteria and test coverage.

**Dependency order:**
1. **Catalog Manager** (foundational — loads/indexes YAML tasks)
2. **Benchmark Case Creator + Test Case Preparer** (parallel, both depend on catalog manager)
3. **Candidate Agent Runner** (depends on log collector)
4. **Judge** (depends on shared types, YAML schema)
5. **Report Generator** (depends on judge output format)
6. **Benchmarker Orchestrator** (depends on all other skills)

Each skill implementation includes:
- Complete SKILL.md following Claude Code conventions
- TypeScript source files
- Unit tests
- Acceptance criteria verification

**Skills detail:**

| Skill | Key Responsibilities |
|-------|---------------------|
| **catalog-manager** | Load/validate YAML tasks, index by domain/complexity/dimensions, subset selection |
| **benchmark-case-creator** | Templates, validation, guided creation of new YAML benchmark tasks |
| **test-case-preparer** | Generate synthetic input data (books, codebases, datasets), prepare judge artifacts |
| **candidate-runner** | Dispatch agents (local subprocess or Docker), capture native + structured logs |
| **judge** | LLM-as-judge scoring across 7 obedience dimensions with structured rubric |
| **report-generator** | Per-task reports, comparison reports, aggregate suite reports with leaderboard |
| **benchmarker** | Top-level orchestrator: load suite, run candidates, collect scores, generate reports |

**Breakpoint:** Human reviews all 7 skill implementations before catalog seeding.

---

### Phase 4: Seed Benchmark Catalog

**Purpose:** Populate the catalog with test cases for development and release.

**Steps (parallel):**
1. **Smoke test tasks** (3 simple tasks):
   - `hello-world`: 3-step sequential — tests completeness + ordering
   - `parallel-sum`: split-map-combine — tests parallelism + aggregation
   - `conditional-skip`: if-else with logging — tests conditionality + error handling
2. **Full benchmark tasks** (7 tasks from request.task.md):
   - Book translation (translation domain, map-reduce)
   - Countries/cities/attractions (data-analysis domain, deep iteration)
   - Circular dependency refactoring (coding domain, conditional + rollback)
   - US states scraping (data-analysis domain, map-reduce + validation)
   - TSP genetic algorithm (coding domain, iterative refinement)
   - Markdown readability (text-processing domain, recursive decomposition)
   - Crossword puzzle (algorithms domain, backtracking + constraint satisfaction)
3. **Catalog validation:** Schema check all YAML files, verify dimension coverage, DAG validity.

---

### Phase 5: Integration & End-to-End Verification

**Purpose:** Wire skills together and verify the full pipeline works.

**Steps:**
1. **Integration wiring:** Verify benchmarker can call each skill in the correct sequence.
2. **E2E smoke test:** Run the simplest smoke test task through the complete pipeline (catalog -> preparer -> runner -> judge -> report) using a mock candidate.
3. **Quality gate:** Verify the scorecard has all 7 dimensions scored (0-100), report was generated, mock candidate scored >80.
4. **Fix-and-retest loop** (if quality gate fails): Up to 3 iterations of: diagnose failure -> fix -> re-run E2E -> re-check quality gate.
5. **Breakpoint** (only if loop exhausts): Human decides whether to continue manually or accept current state.

---

### Phase 6: Documentation & Final Review

**Purpose:** Make the plugin usable by others.

**Steps (parallel):**
1. **README.md:** Quick start, dimension explanations, skill usage, YAML format, runner config, architecture diagram.
2. **CONTRIBUTING.md:** How to add benchmark tasks, YAML format guide, quality checklist.
3. **Final review:** Comprehensive assessment — structure vs architecture, SKILL.md completeness, catalog coverage, E2E results, documentation quality.
4. **Breakpoint:** Final human approval.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Stack | Node.js/TypeScript | Matches babysitter SDK ecosystem |
| Task format | YAML | Human-writable, machine-parseable, supports complex step structures |
| Runner | Local + Docker | Local for dev speed, Docker for CI isolation |
| Log capture | Native + structured overlay | Native for debugging, structured for deterministic judge parsing |
| Judge | LLM-as-judge with structured rubric | 7 dimensions require qualitative assessment |
| Plugin layout | Standard babysitter conventions | skills/<name>/SKILL.md, shared/, benchmarks/ under catalog-manager |
| Catalog seeding | Simple smoke tests + full request.task.md examples | Smoke for dev iteration, full for release |

## Obedience Dimensions (scored by the judge)

1. **Completeness** — Did the agent execute ALL iterations?
2. **Ordering** — Did the agent follow the prescribed step sequence?
3. **Conditionality** — Did the agent evaluate conditions correctly before proceeding?
4. **Parallelism** — Did the agent parallelize/sequentialize as instructed?
5. **Granularity** — Did the agent operate at the correct chunk/batch size?
6. **Aggregation** — Did the agent combine results as specified?
7. **Error Handling** — Did the agent follow the prescribed error/failure path?
