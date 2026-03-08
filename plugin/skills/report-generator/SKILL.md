# Skill: Report Generator

## Purpose

Compile judge scorecards from one or more benchmark runs into human-readable HTML reports with per-task breakdowns, dimension analysis, evidence citations, agent output comparison, and aggregate leaderboard rankings. Supports comparison between two agents (primary vs baseline) and multi-task index pages.

## When to Use

- After the judge has scored one or more task runs
- When the benchmarker completes a full benchmark suite
- When a user wants a summary of results across runs or agents
- When comparing two agents (e.g., babysitter-orchestrated vs pure-claude-code)

## Report Types

### Comparison Report (per-task)
Side-by-side analysis of two agents' performance on a single task:
- Task overview with description, prescribed process steps, and evaluation criteria
- Dimension radar chart (only applicable dimensions shown)
- Dimension score bars (only applicable dimensions, N/A dimensions hidden)
- Judge evidence per dimension with pass/fail per check for both agents
- Agent output JSON snippets with structural diff analysis
- Head-to-head comparison table (applicable dimensions only, plus time taken row)
- Leaderboard ranking with time taken per agent

### Individual Report (per-agent)
Single agent's performance on a task with the same sections minus comparison.

### Aggregate Index
Multi-task summary linking to individual comparison reports:
- Overall scores with delta
- Task summary table
- Per-task cards with scores and links

## Inputs

### HTML Report (`renderHtmlReport`)
- **report**: `BenchmarkReport` object (primary agent)
- **options**: `HtmlReportOptions`
  - `compareWith`: Optional `BenchmarkReport` for baseline agent
  - `title`: Override report title
  - `taskDescriptions`: Task descriptions keyed by taskName
  - `prescribedSteps`: Ordered process steps per task
  - `evaluationCriteria`: Per-dimension criteria with weights
  - `agentOutputSamples`: Primary agent's JSON output per task
  - `baselineOutputSamples`: Baseline agent's JSON output per task

### Index Page (`renderIndexHtml`)
- **entries**: `IndexEntry[]` with per-task scores and report URLs
- **options**: `IndexOptions` with agent IDs and overall scores

## Dimension Handling

- **Applicable dimensions** (weight > 0, not marked `notApplicable`): Shown with scores, bars, radar points, and evidence
- **N/A dimensions** (weight = 0 or `notApplicable: true`): Completely hidden from all visualizations — radar chart, score bars, comparison table, and evidence sections
- Strongest/weakest dimension computed only from applicable dimensions

## Output Files

| File | Description |
|------|-------------|
| `<task>/comparison-report.html` | Per-task comparison report |
| `pure-claude/report.html` | Baseline agent individual report |
| `babysitter/report.html` | Primary agent individual report |
| `index.html` | Multi-task aggregate index |
| `comparison-report.html` | Compatibility copy of first task's comparison |

## Key Files

| File | Purpose |
|------|---------|
| `skills/report-generator/scripts/html-report.ts` | Core HTML rendering functions |
| `scripts/gen-comparison-html-report.ts` | Comparison report generation pipeline |
| `skills/obedience-types/scripts/types.ts` | `BenchmarkReport`, `ObedienceScorecard`, `DimensionScore` types |

## Running

```bash
# Generate comparison reports from judge scorecards
npx tsx scripts/gen-comparison-html-report.ts
```

Requires judge scorecards at `results/full-comparison/<agent>/scorecard.json` (produced by `scripts/judge-outputs.ts`).

## Time Taken

Duration data flows through the pipeline:
1. Each agent stores timing in `results/full-comparison/<agent>/timing.json` with `{ durationMs: number }`
2. `judge-outputs.ts` reads timing and writes `durationMs` into each scorecard
3. `gen-comparison-html-report.ts` passes duration into `BenchmarkReport.summary.totalDurationMs`
4. The HTML report displays time taken in: overall score stats, head-to-head comparison table (with % faster/slower), and leaderboard
