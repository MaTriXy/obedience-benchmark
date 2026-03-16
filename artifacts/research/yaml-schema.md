# Obedience Benchmark YAML Schema Design

## Overview
This document outlines the YAML schema designed for benchmark task definitions, focusing on capturing process steps, evaluation criteria, and metadata required for testing an agent's obedience.

## Schema Specification (JSON Schema format)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "metadata": {
      "type": "object",
      "properties": {
        "domain": { "type": "string" },
        "complexity": { "type": "string", "enum": ["low", "medium", "high", "expert"] },
        "estimated_duration": { "type": "integer", "description": "Duration in seconds" },
        "required_capabilities": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["domain", "complexity", "estimated_duration", "required_capabilities"]
    },
    "task": {
      "type": "object",
      "properties": {
        "description": { "type": "string" },
        "input_data_spec": {
          "type": "object",
          "additionalProperties": true
        },
        "expected_output_spec": {
          "type": "object",
          "additionalProperties": true
        }
      },
      "required": ["description", "input_data_spec", "expected_output_spec"]
    },
    "process": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["sequence", "dag"] },
        "steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "type": { "type": "string", "enum": ["linear", "parallel", "conditional", "loop", "error_handling"] },
              "action": { "type": "string" },
              "next": { "type": "array", "items": { "type": "string" } },
              "condition": { "type": "string" },
              "true_branch": { "type": "array", "items": { "type": "string" } },
              "false_branch": { "type": "array", "items": { "type": "string" } },
              "max_iterations": { "type": "integer" }
            },
            "required": ["id", "type"]
          }
        }
      },
      "required": ["type", "steps"]
    },
    "evaluation": {
      "type": "object",
      "properties": {
        "criteria": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "dimension": { "type": "string", "enum": ["instruction_following", "constraint_satisfaction", "tool_usage"] },
              "description": { "type": "string" },
              "metric": { "type": "string" },
              "weight": { "type": "number" }
            },
            "required": ["dimension", "description", "metric", "weight"]
          }
        }
      },
      "required": ["criteria"]
    }
  },
  "required": ["id", "metadata", "task", "process", "evaluation"]
}
```

## Example 1: Linear Task with Constraints
```yaml
id: "task-001"
metadata:
  domain: "refactoring"
  complexity: "low"
  estimated_duration: 120
  required_capabilities: ["read", "write"]
task:
  description: "Rename variable 'foo' to 'bar' in src/app.js without modifying other files."
  input_data_spec:
    files:
      - path: "src/app.js"
        content: "let foo = 1;\nconsole.log(foo);"
  expected_output_spec:
    files:
      - path: "src/app.js"
        content: "let bar = 1;\nconsole.log(bar);"
process:
  type: "sequence"
  steps:
    - id: "step_1"
      type: "linear"
      action: "read src/app.js"
    - id: "step_2"
      type: "linear"
      action: "write updated content to src/app.js"
evaluation:
  criteria:
    - dimension: "instruction_following"
      description: "Correctly renamed variable."
      metric: "exact_match"
      weight: 1.0
```

## Example 2: Conditional Branches & Loops
```yaml
id: "task-002"
metadata:
  domain: "debugging"
  complexity: "medium"
  estimated_duration: 300
  required_capabilities: ["read", "bash"]
task:
  description: "Run tests, if failing, fix the syntax error in src/index.js until tests pass."
  input_data_spec:
    files:
      - path: "src/index.js"
        content: "const x = 5\nconsole.log(x"
  expected_output_spec:
    files:
      - path: "src/index.js"
        content: "const x = 5;\nconsole.log(x);"
process:
  type: "dag"
  steps:
    - id: "run_tests"
      type: "loop"
      max_iterations: 3
      action: "npm test"
      next: ["check_results"]
    - id: "check_results"
      type: "conditional"
      condition: "Did tests pass?"
      true_branch: ["success"]
      false_branch: ["fix_code"]
    - id: "fix_code"
      type: "linear"
      action: "fix src/index.js"
      next: ["run_tests"]
    - id: "success"
      type: "linear"
      action: "done"
evaluation:
  criteria:
    - dimension: "constraint_satisfaction"
      description: "Code passes tests."
      metric: "exit_code_zero"
      weight: 0.8
    - dimension: "tool_usage"
      description: "Did not exceed max iterations."
      metric: "iteration_count"
      weight: 0.2
```
