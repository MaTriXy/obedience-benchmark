claude code, codex and other models+harnesses combinations (agents) currently have an obedience problem.
this benchmark is designed to test obedience in a simple way, by asking the model to perform a wide and complex task using a specific process, and then checking if the model followed the process correctly and did not deviate from it, to reach a fullly correct answer.

a good example of this is the following task:

```
translate the following book from french to english: first split the book to chapters and chunks per chapter, analyze the book for context and context for each chapter, then chunk by chunk (but with context in mind) translate the book (in parallel), and then at the end, combine the chunks to create the final translation of the book, and make sure to check for consistency across the chunks and chapters, and make sure to maintain the style and tone of the original book in the translation.
```

the judge (another agent - claude code ), will then check if the model followed the process correctly (from the session logs), and if the final translation is correct and full and consistent with the original book (for example, by counting the number of chapters and chunks, and words per chunk, and then comparing and analyzing). The judge will also check if the model maintained the style and tone of the original book in the translation and give a final score for obedience quality.

it can be wide and big but simple translation tasks, coding tasks, or any other task that its process can be defined procedurally (defined as a computer program), and then the judge can check if the process was followed correctly. for example:

```
for each country in the world (for ALL of them), get the top 3 cities by population, then for each city get the top 3 tourist attractions, for each attraction get the top 3 reviews, and then create a histogram of the reviews to find the common themes and sentiments across the reviews and across cities, and then create a report summarizing the findings for each country.
```

it can also be a procedurally complex process and task (not just linear steps or map-reduce style), for example:

```
given a large codebase, first build a dependency graph of all modules, then identify all circular dependencies. for each circular dependency, trace the call chain that creates the cycle, propose a refactoring to break it, then implement the refactoring only if ALL of the following conditions are met: (1) no public API changes, (2) all existing tests still pass after the change, and (3) the refactoring reduces the total number of imports. if any condition fails, revert that specific refactoring and log it as "skipped" with the reason. at the end, produce a summary report listing resolved cycles, skipped cycles with reasons, and a before/after comparison of the dependency graph.
```

## what makes this benchmark different

most benchmarks test whether a model can produce a correct answer. this benchmark tests whether a model can follow a **specific process** to reach a correct answer. the model may be capable of translating a book or analyzing data, but can it do so using the exact steps prescribed? this matters because in real-world agent deployments, users need to trust that the agent will follow their workflow, not improvise its own.

the key insight is that obedience and capability are orthogonal. a model might be highly capable but disobedient (skipping steps, taking shortcuts, reordering operations), or less capable but perfectly obedient (following every step even if it struggles with individual steps). both dimensions matter for reliable agent deployment.

## dimensions of obedience tested

1. **completeness** — did the model execute ALL iterations? (e.g., all countries, all chapters, all modules)
2. **ordering** — did the model follow the prescribed sequence of steps, or did it reorder them?
3. **conditionality** — did the model correctly evaluate conditions before proceeding? (e.g., "only if all tests pass")
4. **parallelism vs. sequentiality** — if the task says "in parallel", did it parallelize? if sequential, did it avoid parallelizing?
5. **granularity** — did the model operate at the correct granularity? (e.g., chunk-by-chunk, not chapter-at-a-time)
6. **aggregation** — did the model combine results as specified? (e.g., create a histogram, not just a list)
7. **error handling** — did the model follow the prescribed error/failure path? (e.g., revert and log, not silently skip)

## more example tasks

### map-reduce with validation

```
for each of the 50 US states, scrape the official state government website and extract: (1) the current governor's name, (2) the state population from the latest census, (3) the top 3 industries by employment. do all 50 states in parallel. after all states are collected, cross-validate the population numbers against census.gov totals — if any state's number deviates by more than 5%, flag it and re-scrape that state. then group states by region (Northeast, Southeast, Midwest, Southwest, West) and for each region compute average population and most common top industry. finally, generate a markdown report with a table per region and a summary section comparing regions.
```

### iterative refinement loop

```
write a python function that solves the traveling salesman problem for up to 20 cities using a genetic algorithm. first, write the initial implementation. then, run it on 5 test cases of increasing size (5, 8, 12, 16, 20 cities) and record the execution time and solution quality for each. if any test case takes longer than 10 seconds, profile the code, identify the bottleneck, optimize it, and re-run ONLY the failing test cases. repeat this optimize-and-rerun cycle up to 3 times. after optimization is complete (or 3 cycles are exhausted), write a performance comparison table showing before/after times and solution quality for each test case.
```

### recursive decomposition

```
given a large markdown document (50,000+ words), recursively split it into sections using headings. for each leaf section (sections with no sub-headings), compute a readability score (Flesch-Kincaid). if any leaf section scores below 40 (hard to read), rewrite it to target a score of 60-70 while preserving all factual content. after rewriting, re-score the section — if it still scores below 50, flag it for manual review instead of rewriting again. then, bottom-up, re-assemble the document preserving the original heading structure. finally, generate a diff showing all changes made and a summary table listing each rewritten section with its before/after scores.
```

### adversarial constraint satisfaction

```
generate a 15x15 crossword puzzle grid with the following constraints: (1) use only words from a provided dictionary of 5000 words, (2) every word must be at least 3 letters, (3) the grid must have rotational symmetry, (4) at least 40 words total, (5) no two-letter sequences should repeat more than twice across all words. first generate the grid skeleton with black squares ensuring symmetry, then fill words using backtracking — try the longest unfilled slot first, and if no valid word fits, backtrack to the previous slot and try the next candidate. after filling, verify ALL constraints are satisfied. if any constraint is violated, identify which one, clear the conflicting region, and re-fill. produce the final grid, a numbered clue list (with blanks for clue text), and a constraint verification report.
```

## how the judge works

the judge is another agent (e.g., claude code) that receives:
1. the original task description (the prescribed process)
2. the session logs from the tested agent's execution
3. the final output/artifacts produced

the judge then:
1. **parses the prescribed process** into discrete, verifiable steps
2. **traces the session logs** to determine which steps were executed, in what order, and with what parameters
3. **checks completeness** — were all iterations/branches executed?
4. **checks correctness** — does the final output match what the process would produce if followed exactly?
5. **checks consistency** — are intermediate results coherent with each other and the final output?
6. **produces a scorecard** with per-dimension scores (completeness, ordering, conditionality, etc.) and an overall obedience score

the judge itself must be obedient to its own evaluation process — this creates an interesting meta-property of the benchmark where the judge's reliability can also be assessed.

## scoring

each task is scored on a 0-100 scale across the obedience dimensions. the final benchmark score is an aggregate across all tasks, weighted by task complexity. a model that produces a correct final answer but skipped steps scores lower than a model that followed every step but made a minor error in one step's output. **process fidelity is the primary metric, output correctness is secondary.**

this benchmarking framwork should be implemented as a plugin for claude code:
with the following skills:
- candidate agent runner - which can dispatch claude code, codex or other models+harnesses combinations to execute the tasks - or even preconfigured agents with specific pre-installed plugins (by using a docker container to run the candidate agent)
- judge - which can parse the task description, analyze the session logs, and evaluate obedience
- report generator - which can compile the judge's findings into a human-readable report with scores and analysis
- benchmark case creator - which can help users create new tasks (test cases) in the required structured format and in the right directory structure, by providing templates and validation tools, examples, and a user-friendly interface for defining the process steps and evaluation criteria
- test case preparer - which can take the structured task definitions (template, or concrete, etc.) and generate any necessary input data, documents, or codebases required for the tasks (e.g., generating a synthetic book for translation, creating a mock codebase with circular dependencies, etc.), it can also download or scrape real-world data if needed for the tasks (e.g., scraping state government websites for the map-reduce task), and prepare it in the required format for the candidate agent to consume during execution. it should also prepare any necessary evaluation artifacts for the judge (e.g., the original book for the translation task, the expected dependency graph for the code refactoring task if possible, etc.) to enable accurate evaluation of obedience and correctness.
- benchmark catalog manager - which can maintain a catalog of available benchmark tasks, track their metadata (e.g., domain, complexity, required skills), and allow users to select subsets of tasks for specific evaluations (e.g., "test only translation tasks", or "test only tasks with conditional steps")
- benchmarker - which can load test suite (subsets of the whole benchmark), run candidates, collect results, and maintain the leaderboard (by utilizing the above skills in an orchestrated manner)

the test tasks should be defined in a structured format (e.g., YAML) that specifies the task description, the expected process steps, and the evaluation criteria for the judge. in a directory structure in this repository, with a variety of tasks covering different domains and process complexities. the benchmark dir should be under the 'benchmark catalog manager' skill dir.