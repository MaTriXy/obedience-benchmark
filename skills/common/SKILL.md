# Skill: Common

## Purpose

Shared type definitions, process context API, and JSON schemas used across all obedience benchmark skills. This skill is not invoked directly — it provides the foundational types and utilities that other skills import.

## Key Files

| File | Description |
|------|-------------|
| `scripts/types.ts` | All shared type definitions (ObedienceDimension, CatalogEntry, ProcessStep, ObedienceScorecard, etc.) |
| `scripts/process-helpers.js` | ProcessContext API for prescribed process files (ctx.step, ctx.parallel, ctx.loop, ctx.conditional, ctx.errorHandler) |
| `scripts/schemas/task-definition.schema.json` | JSON Schema for validating task.yaml files |
