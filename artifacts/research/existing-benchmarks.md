# Existing Agent Benchmarks and Evaluation Frameworks

Research conducted: 2026-03-07
Purpose: Inform design of an "obedience benchmark" that measures process fidelity and step-level instruction adherence.

---

## 1. Benchmarks Analyzed

### 1.1 AgentBench (ICLR 2024)

**Source:** Liu et al., "AgentBench: Evaluating LLMs as Agents" (THUDM, ICLR 2024)
([paper](https://arxiv.org/abs/2308.03688) | [repo](https://github.com/THUDM/AgentBench))

**Task Format:**
- 8 distinct environments (OS interaction, database operations, knowledge graph, digital card game, lateral thinking puzzles, house-holding, web shopping, web browsing)
- Dialogue paradigm with two roles: user (instruction + environment feedback) and agent
- Multi-round interactive challenges; estimated 5-50 solving rounds per problem
- Dev and Test splits per dataset
- Unified evaluation toolkit with a common agent-environment loop across all environments

**Scoring:**
- Primary metric: Success Rate (SR) per environment
- Overall AgentBench score (OA): weighted average across all environments
- Weights computed as reciprocal of average score across all tested LLMs per task
- Score normalization: each task's average score resized to 1 across all models, then averaged
- Detailed error analysis (context limit exceeded, invalid actions, reasoning failures) for diagnostics, but not scored dimensions

**Process Evaluation:** None. Evaluates only final task outcome (success/failure). No intermediate step scoring. Error taxonomy hints at process-level signals but stops short of scoring them.

**Key Insight:** Identified poor long-term reasoning, decision-making, and instruction following as main obstacles. However, does not measure *which* instructions were followed or ignored.

---

### 1.2 SWE-bench (ICLR 2024)

**Source:** Jimenez et al., "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"
([site](https://www.swebench.com) | [paper](https://arxiv.org/abs/2310.06770))

**Task Format:**
- 2,294 real GitHub issues from 12 Python repositories
- Input: issue text description + Docker environment with repo at pre-fix commit
- Output: patch file (diff) specifying lines to modify
- JSONL prediction format with fields: `instance_id`, `model_name_or_path`, `model_patch`
- Hidden unit tests (FAIL_TO_PASS and PASS_TO_PASS) from the ground-truth PR

**Scoring:**

| Metric | Description |
|---|---|
| Resolve Rate (primary) | % of tasks where patch passes all FAIL_TO_PASS tests AND no PASS_TO_PASS tests regress. Binary pass/fail. |
| Patch Apply Rate | % of generated patches that apply cleanly. |
| Fix Rate (soft) | Fraction of FAIL_TO_PASS tests fixed, zeroed if any regression. Captures partial progress. |

**Process Evaluation:** None. Only the final patch is evaluated against tests. The agent's exploration strategy, file edits, debugging steps, and tool usage are invisible to the scorer.

**Variants and lessons:**
- *SWE-bench Verified* (500 instances): Four-stage curation pipeline (automated, LLM, sandboxed, human audit). Exemplary for quality control.
- *SWE-bench Pro*: Harder, longer-horizon tasks (avg 21 files). Top models score only ~23% vs. 70%+ on Verified, exposing the gap between benchmark and real capability.
- *SWE-bench Live*: Continuously updated from post-2024 issues to resist contamination.

**Key Insight:** The binary resolve-rate metric is clean but loses signal on partial progress; the Fix Rate soft metric is a useful complement. Dual evaluation problem -- benchmarks both the agentic harness and the foundation model, making attribution difficult.

---

### 1.3 GAIA (General AI Assistants Benchmark, ICLR 2024)

**Source:** Mialon et al., "GAIA: A Benchmark for General AI Assistants" (Meta-FAIR, Hugging Face)
([paper](https://arxiv.org/abs/2311.12983) | [leaderboard](https://hal.cs.princeton.edu/gaia))

**Task Format:**
- 466 human-annotated tasks mixing text questions with attached context (images, files)
- Three difficulty levels:
  - Level 1: no tools, up to 5 steps
  - Level 2: 5-10 steps, some tool use
  - Level 3: arbitrarily long sequences, any number of tools
- Answers designed to be concise, factual, unambiguous (number, string, or list of strings)

**Scoring:**
- Exact-match automated scoring against ground truth answers
- Validation set (165 questions) scored locally; test set submitted to leaderboard
- Binary: correct or incorrect final answer. No partial credit.
- Design principles: ungameability, unambiguity, simplicity

**Process Evaluation:** Difficulty levels are defined by number of steps and tools required, implicitly acknowledging process complexity. However, evaluation is purely on the final answer. No scoring of whether the agent actually used the expected number of steps or the right tools.

**Key Insight:** Human performance 92% vs. GPT-4 with plugins at 15% (initially); best systems now ~75%. "Simple answer, hard process" design philosophy is instructive. Validation set showed contamination issues -- models memorized portions. We should plan for held-out test sets.

---

### 1.4 WebArena (2023) and WebArena Verified (2025)

**Source:** Zhou et al., "WebArena: A Realistic Web Environment for Building Autonomous Agents"
([site](https://webarena.dev) | [paper](https://arxiv.org/abs/2307.13854) | [verified repo](https://github.com/ServiceNow/webarena-verified))

**Task Format:**
- 812 long-horizon tasks from 241 templates across 4 domains (e-commerce, social forum, collaborative development, content management)
- Natural language "intents" as task descriptions
- Observations: URL, DOM/accessibility trees, screenshots, tab context
- Actions: click, hover, type, keyboard, tab operations, navigation
- Includes deliberately unachievable tasks (tests hallucination avoidance)
- Environment resets between episodes (like OpenAI Gym)

**Scoring (original):**
- End-to-end functional correctness (binary success rate)
- Used substring matching and page-level checks -- known to inflate scores by 1.4-5.2%

**Scoring (WebArena Verified):**
- Template macro success (SRtmpl) with 95% confidence intervals
- Type-aware exact matching with semantic normalization
- Backend state verification for mutation tasks
- Structured JSON schema with explicit status codes for deterministic scoring
- Removed LLM-as-judge and substring matching
- Failure-mode breakdowns included in reporting
- Reduced false-negative rate by 11.3 percentage points

**Process Evaluation:** Minimal. Checks final environment state, not the path taken. WebArena Verified adds backend state verification and failure-mode breakdowns, approaching process-level diagnostics but still fundamentally outcome-focused.

**Extensions:**
- *VisualWebArena*: Multimodal visual web tasks
- *WebChoreArena*: 532 tedium-focused tasks emphasizing memory, calculation, long-term reasoning
- *ST-WebAgentBench*: Adds policy compliance (see section 1.6)

---

### 1.5 IFEval and Instruction-Following Benchmarks

**Source:** Zhou et al. (Google), "Instruction-Following Evaluation for Large Language Models" (2023)
([paper](https://arxiv.org/abs/2311.07911) | [dataset](https://huggingface.co/datasets/google/IFEval))

**Task Format:**
- ~500 prompts, each containing one or more *verifiable instructions*
- 25 types of verifiable instructions (e.g., "write in more than 400 words," "mention keyword X at least 3 times," "respond in JSON format")
- Instructions are programmatically checkable -- no human judgment needed

**Scoring:**
- Strict accuracy: all constraints in the prompt must be met exactly
- Loose accuracy: relaxed verification to reduce false negatives (complement to strict)
- Measured at both prompt level (all instructions met?) and individual instruction level
- Automated, unbiased, reproducible

**Process Evaluation:** IFEval evaluates *output* compliance, not *process* compliance. It checks whether the response satisfies format/content constraints, not whether the agent followed a prescribed sequence of steps.

**Extensions (2024-2025):**
- *AgentIF*: Benchmarks instruction following in agentic scenarios. Metrics: constraint success rate (CSR) and instruction success rate (ISR). All tested models scored ISR < 30%. Failure modes worst on conditional, nested, and meta-constraints.
- *IF-RewardBench*: Comprehensive taxonomy of 7 constraint categories (Numerical, Format, Content, Linguistic, Style, Situation, Action) and 4 composition types (Single, And, Chain, Selection).
- *IFEval++*: Introduces reliable@k metric; models show up to 61.8% performance drop under prompt variations.
- *Multi-IF*: Multi-turn, multilingual instruction following evaluation.

**Key Insight:** IFEval's verifiable-instruction design is the gold standard for automated, unbiased constraint checking. AgentIF's low ISR scores (<30%) confirm that instruction following in agentic settings is genuinely hard and unsolved -- validating the need for our benchmark.

---

### 1.6 ST-WebAgentBench (IBM Research, ICML 2025)

**Source:** Shlomov et al., "ST-WebAgentBench: Evaluating Safety and Trustworthiness in Web Agents"
([paper](https://arxiv.org/abs/2410.06703) | [repo](https://github.com/segev-shlomov/ST-WebAgentBench))

**Task Format:**
- 222 tasks paired with Safety/Trust (ST) policies
- YAML-based policy templates: concise rules encoding constraints
- Extends WebArena environments (GitLab, ShoppingAdmin, CRM)
- Six orthogonal safety/trust dimensions: User-Consent, Boundary, Strict Execution, Hierarchy, Robustness, Error Handling
- Built on BrowserGym framework
- Supports human-in-the-loop scenarios (agents can defer or request confirmation)

**Scoring:**
- **Completion Under Policy (CuP):** Task success rate when policy compliance is required -- credits only completions that respect all applicable policies
- **Risk Ratio:** Quantifies policy violations across dimensions
- Per-dimension breakdown of compliance

**Process Evaluation:** YES -- closest existing benchmark to "process obedience." Evaluates whether agents follow prescribed policies during execution, not just outcome. However, focuses specifically on safety/trust policies rather than general step-level instruction fidelity.

**Key Findings:**
- Average CuP is less than 2/3 of nominal completion rate, exposing critical safety gaps
- Agents hallucinate extra steps not part of the task
- Per-task risk ratio grows roughly linearly with the number of enforced templates
- Today's agents lack robust mechanisms for handling concurrent constraints

---

### 1.7 tau-bench (Sierra Research, 2024)

**Source:** Yao et al., "tau-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains"

**Task Format:**
- Dynamic multi-turn conversations between simulated user and agent
- Two domains: retail and airline customer service
- Agent provided with domain-specific API tools AND policy guidelines
- Conversations involve tool calls, policy lookups, and user clarification

**Scoring:**
- Database state comparison: end-of-conversation DB state vs. annotated goal state
- Novel metric: pass^k -- evaluates reliability over k independent trials
- Measures consistency, not just single-attempt success

**Process Evaluation:** Partial. Policy guidelines are provided and agents must follow them, but scoring is still on final DB state. Does not score *which* policies were followed during the conversation.

**Key Insight:** Even GPT-4o succeeds on less than 50% of tasks; pass^8 < 25% in retail. Highlights the gap between single-attempt success and reliable behavior.

---

### 1.8 TaskBench and Tool-Use Benchmarks

**Sources:** TaskBench ([paper](https://arxiv.org/pdf/2311.18760)), ToolBench, API-Bank

**TaskBench Task Format:**
- User requests decomposed into tool invocation graphs
- Each task has a gold graph specifying which tools to call, in what order, with what parameters
- Task automation requires: task decomposition, tool invocation, and parameter prediction

**TaskBench Scoring (TASKEVAL):**
- Tool node accuracy (were the right tools selected?)
- Edge accuracy (were dependencies/ordering correct?)
- Parameter Name F1 (t-F1) and Parameter Name+Value F1 (v-F1)
- Significant performance drop from simple (1-2 tool) to complex (6+ tool) graphs: 96.16% accuracy for single-node vs. 25% for 8-node graphs

**Process Evaluation:** TaskBench is the closest to scoring *process* in the tool-use domain -- the tool invocation graph IS the process. However, it evaluates tool selection and sequencing, not adherence to arbitrary natural-language process instructions.

**ToolBench:** Large-scale tool-use benchmark. Up to 50% of queries and 75% of trajectories suffered from incompleteness or hallucinations in initial releases. Real-world APIs are prone to deprecation and response drift.

**Relevance:** Graph-based scoring of tool invocation order and dependencies is a useful pattern for evaluating step sequencing.

---

### 1.9 Additional Relevant Benchmarks

**DARE-bench (2025):** Measures "process-aware evaluation that captures instruction adherence and process fidelity" for data science tasks. Identifies the critical gap that existing benchmarks can only evaluate final-answer accuracy, leaving process fidelity largely unmeasured. Closest conceptual match to our goals.

**LiveSWEBench:** Evaluates both process and outcome. Checks individual decisions (e.g., did agent run tests after coding? did it follow instructions step by step?).

**TheAgentCompany:** Tasks require many consecutive steps with partial credit for completing subtasks.

**WebCanvas:** Measures success rates at "key nodes" in workflow for finer-grained progress tracking.

---

## 2. How Benchmarks Define Tasks: Common Patterns

### Task Definition Patterns
1. **Natural language task descriptions** -- all benchmarks use human-readable instructions/intents
2. **Structured metadata** -- instance IDs, difficulty levels, domain tags, expected tool sets
3. **Dev/test splits** -- separate development and evaluation sets; test sets often hidden behind leaderboards
4. **Templated task generation** -- WebArena uses 241 templates to generate 812 tasks; enables systematic coverage
5. **Ground truth annotations** -- human-validated expected outcomes (answers, DB states, patches)
6. **Containerized/reproducible environments** -- Docker, self-hosted web apps, controlled APIs
7. **Difficulty tiering** -- GAIA's 3 levels, TaskBench's graph complexity, SWE-bench variants

### Scoring Patterns
1. **Binary success rate as primary metric** -- nearly universal across all benchmarks
2. **Pass@k for reliability** -- multiple attempts to measure consistency (SWE-bench pass@3, tau-bench pass^k)
3. **Weighted aggregation across tasks** -- AgentBench's normalized weighting scheme
4. **Confidence intervals** -- WebArena Verified reports 95% t-intervals
5. **Deterministic over stochastic scoring** -- strong trend away from LLM-as-judge toward exact/semantic matching
6. **Leaderboard-based evaluation** -- hidden test sets with submission-based scoring
7. **Soft/partial metrics alongside hard metrics** -- SWE-bench Fix Rate, TheAgentCompany subtask credit

### Process Evaluation Patterns (Emerging)
1. **Policy compliance metrics** -- ST-WebAgentBench's CuP and Risk Ratio
2. **Graph-based step evaluation** -- TaskBench's tool invocation graph scoring
3. **Intermediate checkpoints** -- TheAgentCompany and WebCanvas partial credit at key nodes
4. **Multi-dimensional scoring** -- ST-WebAgentBench's 6 dimensions
5. **Trajectory-level evaluation** -- trajectory_exact_match, trajectory_precision, trajectory_recall

---

## 3. Identified Gaps: No Benchmark Measures "Process Obedience"

### Summary Gap Table

| Benchmark | Outcome eval | Process eval | Instruction compliance | Step fidelity |
|---|---|---|---|---|
| AgentBench | Yes | No | No | No |
| SWE-bench | Yes (tests) | No | No | No |
| GAIA | Yes (exact match) | No | No | No |
| WebArena | Yes (functional) | Minimal | No | No |
| ST-WebAgentBench | Yes | Partial (safety policy) | Safety policies only | No |
| IFEval | N/A | N/A | Output format only | No |
| AgentIF | N/A | N/A | Output constraints | No |
| tau-bench | Yes (DB state) | Partial (policies given) | Implicit | No |
| TaskBench | Yes | Partial (tool graph) | Tool selection only | No |
| DARE-bench | Yes | Yes (emerging) | Partial | Partial |

### Specific Gaps

**Gap 1: No benchmark systematically measures whether an agent follows prescribed multi-step procedures.**
Existing benchmarks provide a goal and check the outcome. Even ST-WebAgentBench, which checks policy compliance, focuses on safety constraints rather than procedural fidelity. No benchmark says "follow steps A, B, C in this order" and measures adherence to that sequence.

**Gap 2: Step-level fidelity is not measured independently from outcome.**
An agent could achieve the correct outcome by skipping steps, reordering them, or taking shortcuts. Current benchmarks would score this as success. No benchmark penalizes correct outcomes achieved through incorrect processes.

**Gap 3: No benchmark measures partial obedience with granularity.**
Binary success/failure dominates. Even partial-credit systems (TheAgentCompany) score subtask completion, not step adherence. No rubric exists for "followed 7 of 10 prescribed steps."

**Gap 4: Instruction decomposition fidelity is unmeasured.**
When given complex multi-part instructions, do agents faithfully decompose and execute each part? AgentIF tests constraint compliance but in isolated scenarios, not multi-step procedures.

**Gap 5: No benchmark distinguishes between types of disobedience.**
Skipping a step vs. reordering steps vs. substituting steps vs. adding unrequested steps -- each represents a different failure mode with different real-world implications. No taxonomy of disobedience exists in current benchmarks.

**Gap 6: Conditional branch fidelity is untested.**
When instructions include conditionals ("if X, do Y; otherwise do Z"), no benchmark measures whether the agent followed the correct branch as specified.

---

## 4. Patterns to Adopt for the Obedience Benchmark

### 4.1 Task Format

| Pattern | Source | Recommendation |
|---|---|---|
| Structured task schema | WebArena Verified | Use JSON/YAML task definitions with explicit fields for instructions, constraints, expected steps, and metadata. |
| Difficulty levels | GAIA | Categorize tasks by complexity (number of steps, branching, constraint density). |
| Environment isolation | SWE-bench | Each task runs in an isolated, reproducible environment (Docker or equivalent). |
| Programmatically verifiable constraints | IFEval | Wherever possible, define constraints that can be checked automatically without LLM-as-judge. |
| Gold process specification | TaskBench | Include a ground-truth step sequence (or graph) for each task. |
| Policy templates | ST-WebAgentBench | Use YAML-based templates for defining process constraints, enabling extensibility. |
| Templated generation | WebArena | Use templates to generate task variants, ensuring systematic coverage. |
| Ground truth at step AND outcome level | Novel | Define expected intermediate states AND final state. |

### 4.2 Scoring

| Pattern | Source | Recommendation |
|---|---|---|
| Binary + soft metrics | SWE-bench | Report both strict pass/fail (all steps correct) and soft scores (fraction of steps correct). |
| Multi-dimensional scoring | ST-WebAgentBench | Score along orthogonal dimensions: step ordering, constraint adherence, completeness, no unauthorized actions. |
| Outcome AND process composite | ST-WebAgentBench (CuP) | Primary metric should combine outcome correctness with process fidelity. |
| Confidence intervals | WebArena Verified | Report 95% CIs and macro averages over task templates. |
| Failure-mode breakdowns | WebArena Verified, AgentBench | Categorize failures (skipped step, wrong order, extra step, constraint violation). |
| Strict/loose variants | IFEval | Offer strict (exact process match) and loose (tolerant of minor deviations) scoring modes. |
| Reliability metric | tau-bench | Include pass@k or pass^k to measure consistency across runs. |
| Graph-based step scoring | TaskBench | Score tool/step dependencies and ordering using graph comparison metrics. |

### 4.3 Reporting

| Pattern | Source | Recommendation |
|---|---|---|
| Per-dimension scores | ST-WebAgentBench | Report scores per process-obedience dimension, not just aggregate. |
| Template-level aggregation | WebArena Verified | Aggregate by task template/category, not just overall. |
| Error taxonomy | AgentBench | Publish a taxonomy of failure modes specific to process obedience. |
| Held-out test set + leaderboard | GAIA, SWE-bench | Maintain a held-out test set for official scoring; publish only validation-set results openly. |
| Cost and latency reporting | Emerging practice | Report token usage, API costs, and wall-clock time alongside accuracy. |

---

## 5. Anti-Patterns to Avoid

### 5.1 Evaluation Design Anti-Patterns

| Anti-pattern | Source/Example | Mitigation |
|---|---|---|
| **Substring matching for scoring** | WebArena (original) inflated scores by 1.4-5.2% | Use structured, type-aware comparators with normalization. |
| **LLM-as-judge without calibration** | ToolBench ToolEval; known to be inconsistent and non-deterministic | Prefer programmatic verification. If LLM-as-judge is necessary, calibrate against human labels and report inter-annotator agreement. |
| **Single aggregate metric** | Many benchmarks report only one number | Always report per-dimension and per-category breakdowns alongside the aggregate. |
| **Evaluating only the final state** | All major benchmarks (SWE-bench, GAIA, WebArena) | Our benchmark's entire purpose is to avoid this; we must log and score intermediate steps. |
| **Binary-only scoring** | Nearly universal | Insufficient granularity for measuring partial compliance. Include continuous/fractional scores. |
| **Single-attempt evaluation** | tau-bench showed agents are highly inconsistent | Always measure reliability across multiple runs. |

### 5.2 Dataset Quality Anti-Patterns

| Anti-pattern | Source/Example | Mitigation |
|---|---|---|
| **Ambiguous instructions** | WebArena (pre-Verified) had ambiguous tasks; GAIA ~5% annotation error rate | Every task should be reviewed for unambiguous interpretation. Invest heavily in annotation quality with multi-stage curation. |
| **No human validation** | Initial SWE-bench had noisy instances | Implement multi-stage curation (automated + LLM + sandboxed + human audit), following SWE-bench Verified. |
| **Static, public test sets** | GAIA validation set showed contamination | Plan for held-out test sets, periodic refresh, and contamination detection. Follow SWE-bench Live model. |
| **Insufficient task diversity** | SWE-bench (only Python, 12 repos) | Ensure coverage across domains, complexity levels, and constraint types. |
| **Ignoring unachievable cases** | Most benchmarks omit these | Include tasks where correct behavior is to refuse or ask for clarification (WebArena pattern). |

### 5.3 Benchmark Gaming Anti-Patterns

| Anti-pattern | Source/Example | Mitigation |
|---|---|---|
| **Training on the test set** | Widespread; 13B models can match GPT-4 on contaminated benchmarks | Held-out test sets, periodic refresh, contamination detection. A simple variation of test data can easily bypass n-gram decontamination. |
| **Selective reporting** | Leaderboard culture encourages cherry-picking | Require multi-run results with variance reporting. Standardize reporting format. |
| **Optimizing for the metric, not the task** | Goodhart's Law; agents that "game" outcome checks | Process scoring inherently resists gaming: the agent must follow prescribed steps, not just produce the right output. |
| **Overly permissive scoring** | WebArena string matching false positives | Err on the side of strict scoring; offer a separate loose mode for diagnostics. |
| **Conflating harness and model evaluation** | SWE-bench's dual evaluation problem | Clearly document what is being measured. Separate model capability from scaffolding quality where possible. |
| **Benchmark saturation** | Leading models at near-ceiling on older benchmarks | Design with headroom; include genuinely difficult tasks (long step sequences, complex conditionals). |

### 5.4 Process-Specific Anti-Patterns

| Anti-pattern | Description | Mitigation |
|---|---|---|
| **Non-reproducible environments** | Results vary across runs due to environment state | Always containerize; pin dependencies; reset state between tasks. |
| **Opaque evaluation pipelines** | Black-box success rates with no visibility into why agents fail | Prefer glass-box analytics pipelines with full trajectory logging and error inspection. |
| **Ignoring cost/efficiency** | An obedient but extremely slow/expensive agent is not useful | Report cost and latency alongside accuracy metrics. |
| **Rewarding correct outcomes from wrong processes** | The core gap in all existing benchmarks | Score process and outcome independently; the primary metric should require both. |
| **Overfitting to public benchmark distributions** | Models show up to 57% performance drop from public to novel prompts | Include diverse, novel task formulations and test with prompt variations. |

---

## 6. Summary Comparison Table

| Benchmark | # Tasks | Primary Metric | Process Eval | Step Scoring | Policy Compliance | Reliability Metric |
|-----------|---------|---------------|-------------|-------------|-------------------|--------------------|
| AgentBench | 8 envs | Success Rate | No | No | No | No |
| SWE-bench | 2294 | Resolved Rate | No | No | No | pass@k |
| GAIA | 466 | Exact Match | No | No | No | No |
| WebArena | 812 | Functional Correctness | Minimal | No | No | No |
| tau-bench | 2 domains | DB State Match | Partial | No | Implicit | pass^k |
| ST-WebAgentBench | 222 | CuP + Risk Ratio | Yes (safety) | No | Yes (6 dims) | No |
| IFEval | ~500 | Strict/Loose Accuracy | No | No | Output only | No |
| AgentIF | varies | ISR/CSR | No | No | Partial | No |
| TaskBench | varies | TASKEVAL (graph) | Partial | Partial (graph) | Tool selection | No |
| DARE-bench | varies | Verifiable GT | Yes | Partial | No | No |

**No existing benchmark provides comprehensive measurement of step-level process obedience.**

---

## 7. Consolidated Recommendations for Obedience Benchmark Design

1. **Define a clear taxonomy of obedience dimensions:** step completion, step ordering, step fidelity (correct execution of each step), constraint adherence, no unauthorized additions, conditional branch correctness, and appropriate refusal of invalid instructions.

2. **Score process independently from outcome:** An agent that achieves the right answer through the wrong process should score differently from one that follows the prescribed process faithfully. Report both dimensions and a composite.

3. **Adopt the CuP model for composite scoring:** Following ST-WebAgentBench, credit task success only when process fidelity requirements are also met.

4. **Use checkpoint-based verification:** Define expected intermediate states after each step and verify them programmatically (IFEval-style verifiable constraints at each checkpoint).

5. **Support multiple obedience profiles:** Some tasks may require strict sequential execution; others may allow flexible ordering. The benchmark should test both and report separately.

6. **Include adversarial cases:** Tasks where shortcuts exist but are not permitted; tasks where the "obvious" approach violates a constraint; tasks with deliberately misleading context.

7. **Measure types of disobedience separately:** Skipping, reordering, substituting, and adding steps are different failure modes with different severity. Report each distinctly.

8. **Adopt JSON/YAML task format** with fields for: task_id, description, prescribed_steps[], per_step_constraints[], expected_checkpoints[], expected_outcome, difficulty_level, domain, constraint_types[], and metadata.

9. **Report multi-dimensional scores** including: overall obedience score, per-dimension scores, outcome score, composite score, per-difficulty-level breakdown, failure-mode distribution, confidence intervals, and cost/latency.

10. **Plan for longevity:** Held-out test sets, periodic refresh, contamination detection, and versioned releases following SWE-bench Live and WebArena Verified best practices.

---

## Sources

- [AgentBench (arXiv)](https://arxiv.org/abs/2308.03688) | [GitHub](https://github.com/THUDM/AgentBench)
- [SWE-bench](https://www.swebench.com/SWE-bench/) | [SWE-bench Verified (OpenAI)](https://openai.com/index/introducing-swe-bench-verified/) | [SWE-bench Pro (Scale AI)](https://scale.com/leaderboard/swe_bench_pro_public)
- [GAIA (arXiv)](https://arxiv.org/abs/2311.12983) | [Leaderboard](https://hal.cs.princeton.edu/gaia)
- [WebArena (arXiv)](https://arxiv.org/abs/2307.13854) | [Site](https://webarena.dev) | [Verified (GitHub)](https://github.com/ServiceNow/webarena-verified)
- [ST-WebAgentBench (arXiv)](https://arxiv.org/abs/2410.06703) | [GitHub](https://github.com/segev-shlomov/ST-WebAgentBench)
- [IFEval (arXiv)](https://arxiv.org/abs/2311.07911) | [Dataset (HuggingFace)](https://huggingface.co/datasets/google/IFEval)
- [AgentIF (Tsinghua)](https://keg.cs.tsinghua.edu.cn/persons/xubin/papers/AgentIF.pdf)
- [IF-RewardBench (arXiv)](https://arxiv.org/html/2603.04738)
- [TaskBench (arXiv)](https://arxiv.org/pdf/2311.18760)
- [DARE-bench (arXiv)](https://arxiv.org/html/2602.24288)
- [Evaluation and Benchmarking of LLM Agents: A Survey](https://arxiv.org/html/2507.21504v1)
- [SWE-bench Live](https://www.emergentmind.com/topics/swe-bench-live)
- [Agent Benchmarks 2025 Guide (o-mega)](https://o-mega.ai/articles/the-best-ai-agent-evals-and-benchmarks-full-2025-guide)
- [Agentic Design: AgentBench Pattern](https://agentic-design.ai/patterns/evaluation-monitoring/agentbench)
