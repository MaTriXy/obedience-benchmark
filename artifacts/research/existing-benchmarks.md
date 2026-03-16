# Existing Benchmarks Research

## Overview
This document evaluates existing agent evaluation frameworks and benchmarks to inform the design of the obedience benchmark. Specifically, we analyze SWE-bench, GAIA, WebArena, and AgentBench.

## Existing Frameworks

### SWE-bench
- **Task Definition:** Resolving real GitHub issues in Python repositories. Tasks are defined by the repository state and issue description.
- **Scoring:** Automated execution of repository test suites. The agent succeeds if the test suite passes (including tests for the bug fix) without breaking existing tests.
- **Process Evaluation:** Non-existent. It relies purely on the correctness of the final patch file generated.

### WebArena
- **Task Definition:** Goal-oriented web browsing tasks executed in an isolated, simulated environment (Docker containers).
- **Scoring:** End-state verification based on database changes or explicit string matches in the browser UI.
- **Process Evaluation:** Evaluates the trajectory (the sequence of actions), but mostly to ensure the agent doesn't take catastrophic actions. Obedience to specific constraints per step is minimal.

### GAIA
- **Task Definition:** Real-world questions that require tool use and reasoning, defined via prompt and context.
- **Scoring:** Exact match or deterministic comparison of the final answer.
- **Process Evaluation:** Completely outcome-based. How the agent arrives at the answer does not affect the score as long as it is correct.

### AgentBench
- **Task Definition:** A suite of multi-turn interactions evaluating LLM agents across diverse environments (OS, Database, Knowledge Graph).
- **Scoring:** Task-specific metrics, usually success rate.
- **Process Evaluation:** Mostly functional evaluation of step outcomes rather than strict fidelity to an operational process or constraint.

## Gaps Identified
None of these benchmarks explicitly measure **process obedience** or **step fidelity**. Agents can succeed in SWE-bench or WebArena by ignoring constraints, taking dangerous shortcuts, or using prohibited tools, provided the final state passes the tests. There is no penalty for violating negative constraints (e.g., "Do not use `sed`").

## Patterns to Adopt
- Programmatic and automated evaluation (no human-in-the-loop).
- Isolated sandbox environments to run tasks safely.
- Clear, unambiguous pass/fail criteria via assertion scripts.

## Anti-Patterns to Avoid
- Evaluating solely the end outcome while ignoring the execution trajectory.
- Loose task definitions where agents can "cheat" by bypassing the intended workflow.
- Lack of strict negative constraints in the prompt.