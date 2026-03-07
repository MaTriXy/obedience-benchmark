# Skill: Obedience Types

## Purpose

Shared type definitions and JSON schemas used across all obedience benchmark skills. Provides the foundational types that the judge, catalog-manager, task-creator, and other skills import.

## When to Use

Invoke this skill when you need to understand the type system or schemas for:
- Obedience dimensions and scoring (ObedienceDimension, DimensionScore, ObedienceScorecard)
- Task catalog entries (CatalogEntry, CatalogFilter)
- Process file structure (ProcessModule, ProcessMetadata, ProcessEvaluation, TaskDefinition)
- Benchmark runs (BenchmarkRun, PreparedTask)
- Session logs (LogEvent, ParsedSessionLog, ObservedStep)

## Key Files

| File | Description |
|------|-------------|
| `scripts/types.ts` | All shared type definitions (ObedienceDimension, TaskDefinition, CatalogEntry, ObedienceScorecard, etc.) |
| `scripts/schemas/task-definition.schema.json` | JSON Schema for validating task metadata.yaml files |

## Importing

Other skills import from this skill's scripts directory:

```typescript
import type { ObedienceDimension, ProcessModule } from '../obedience-types/scripts/types.js';
```
