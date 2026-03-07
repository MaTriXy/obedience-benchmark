# Skill: Report Generator

## Purpose

Compile judge scorecards from one or more benchmark runs into human-readable reports with per-task breakdowns, dimension analysis, evidence citations, and aggregate leaderboard rankings.

## When to Use

- After the judge has scored one or more task runs
- When the benchmarker completes a full benchmark suite
- When a user wants a summary of results across runs or agents

## Inputs

- **scorecards**: One or more `ObedienceScorecard` objects
- **format**: `markdown` (default), `json`, or `both`
- **outputDir**: Where to write reports (defaults to `results/<run-id>/`)

## Process

1. Load all scorecards for the benchmark run
2. For each task, generate a detail section:
   - Overall score and per-dimension breakdown
   - Highlights (dimensions scored 80+) and issues (dimensions scored below 50)
   - Evidence excerpts for deductions
   - Prescribed vs observed step comparison
3. Generate aggregate analysis:
   - Average scores across all tasks per dimension
   - Strongest and weakest dimensions
   - Common obedience patterns and anti-patterns
4. Update the leaderboard (`leaderboard/leaderboard.json`):
   - Insert or update the agent's entry
   - Recompute rankings
5. Write output files

## Output

- `report.md` -- Full markdown report with tables, per-task details, and analysis
- `report.json` -- Structured `BenchmarkReport` object
- `leaderboard/leaderboard.json` -- Updated leaderboard

## Key Files

- `shared/types.ts` -- `BenchmarkReport`, `Leaderboard`, `LeaderboardEntry` types
