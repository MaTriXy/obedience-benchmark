/**
 * @process obedience-benchmark/plugin-build
 * @description Build the Obedience Benchmark plugin for Claude Code — a framework that tests
 * whether AI agents follow prescribed processes, not just produce correct outputs.
 * Full plugin with 7 skills: candidate runner, judge, report generator, benchmark case creator,
 * test case preparer, catalog manager, and benchmarker orchestrator.
 *
 * @inputs {
 *   projectRoot: string,
 *   pluginName?: string,
 *   seedFromRequestDoc?: boolean
 * }
 * @outputs {
 *   success: boolean,
 *   plugin: object,
 *   skills: array,
 *   catalog: object,
 *   artifacts: array
 * }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const {
    projectRoot = '.',
    pluginName = 'obedience-benchmark',
    seedFromRequestDoc = true
  } = inputs;

  const startTime = ctx.now();
  const artifacts = [];

  ctx.log('info', `Starting Obedience Benchmark Plugin build: ${pluginName}`);

  // ============================================================================
  // PHASE 1: ARCHITECTURE & DESIGN
  // Design the plugin structure, YAML task format, and skill interfaces
  // ============================================================================

  ctx.log('info', 'Phase 1: Architecture & Design');

  // 1a. Parallel research: existing benchmarks, plugin conventions, YAML schema patterns
  const [
    benchmarkResearch,
    pluginConventionsResearch,
    yamlSchemaResearch,
    dockerRunnerResearch
  ] = await ctx.parallel.all([
    () => ctx.task(researchExistingBenchmarksTask, { projectRoot }),
    () => ctx.task(researchPluginConventionsTask, { projectRoot }),
    () => ctx.task(researchYamlSchemaTask, { projectRoot }),
    () => ctx.task(researchDockerRunnerTask, { projectRoot })
  ]);

  artifacts.push(
    ...(benchmarkResearch.artifacts || []),
    ...(pluginConventionsResearch.artifacts || []),
    ...(yamlSchemaResearch.artifacts || []),
    ...(dockerRunnerResearch.artifacts || [])
  );

  // 1b. Architecture design (depends on research)
  const architectureDesign = await ctx.task(architectureDesignTask, {
    projectRoot,
    pluginName,
    research: {
      benchmarks: benchmarkResearch,
      pluginConventions: pluginConventionsResearch,
      yamlSchema: yamlSchemaResearch,
      dockerRunner: dockerRunnerResearch
    }
  });

  artifacts.push(...(architectureDesign.artifacts || []));

  // Breakpoint: Review architecture before implementation
  await ctx.breakpoint({
    question: `Review the plugin architecture for "${pluginName}". Includes: plugin.json, 7 skills layout, YAML task format schema, runner abstraction (local + Docker), LLM judge rubric structure, and benchmark catalog directory layout. Approve to proceed?`,
    title: 'Architecture Review',
    context: {
      runId: ctx.runId,
      summary: {
        skills: ['candidate-runner', 'judge', 'report-generator', 'benchmark-case-creator', 'test-case-preparer', 'catalog-manager', 'benchmarker'],
        taskFormat: 'YAML with process steps + evaluation criteria',
        runnerModes: ['local-subprocess', 'docker-container'],
        judgeApproach: 'LLM-as-judge with structured rubric across 7 obedience dimensions'
      }
    }
  });

  // ============================================================================
  // PHASE 2: PLUGIN SCAFFOLD & CORE INFRASTRUCTURE
  // Create plugin.json, directory structure, shared types, and utilities
  // ============================================================================

  ctx.log('info', 'Phase 2: Plugin Scaffold & Core Infrastructure');

  const pluginScaffold = await ctx.task(pluginScaffoldTask, {
    projectRoot,
    pluginName,
    architecture: architectureDesign
  });

  artifacts.push(...(pluginScaffold.artifacts || []));

  // 2b. Parallel: YAML task schema + shared types + log collector
  const [
    yamlTaskSchema,
    sharedTypes,
    logCollector
  ] = await ctx.parallel.all([
    () => ctx.task(yamlTaskSchemaTask, {
      projectRoot,
      architecture: architectureDesign
    }),
    () => ctx.task(sharedTypesTask, {
      projectRoot,
      architecture: architectureDesign
    }),
    () => ctx.task(logCollectorTask, {
      projectRoot,
      architecture: architectureDesign
    })
  ]);

  artifacts.push(
    ...(yamlTaskSchema.artifacts || []),
    ...(sharedTypes.artifacts || []),
    ...(logCollector.artifacts || [])
  );

  // 2c. Verify scaffold compiles and structure is correct
  const scaffoldVerification = await ctx.task(scaffoldVerificationTask, {
    projectRoot,
    pluginName
  });

  artifacts.push(...(scaffoldVerification.artifacts || []));

  // ============================================================================
  // PHASE 3: SKILL IMPLEMENTATION (iterative, quality-gated)
  // Build each of the 7 skills with convergence loops
  // ============================================================================

  ctx.log('info', 'Phase 3: Skill Implementation');

  // --- 3a. Catalog Manager (foundational — other skills depend on it) ---

  const catalogManager = await ctx.task(implementSkillTask, {
    projectRoot,
    skillName: 'catalog-manager',
    description: 'Maintains benchmark catalog: YAML task loading, metadata indexing, subset selection, catalog validation. Stores benchmark cases under skills/catalog-manager/benchmarks/ in a directory structure organized by domain and complexity.',
    architecture: architectureDesign,
    dependencies: { yamlTaskSchema, sharedTypes },
    acceptanceCriteria: [
      'Can load and validate YAML benchmark task files',
      'Can index tasks by domain, complexity, and obedience dimensions tested',
      'Can select subsets (e.g., "only translation tasks", "only conditional-step tasks")',
      'Can list all available tasks with metadata summary',
      'SKILL.md file follows Claude Code skill conventions'
    ]
  });

  artifacts.push(...(catalogManager.artifacts || []));

  // --- 3b. Benchmark Case Creator + Test Case Preparer (parallel, independent) ---

  const [benchmarkCaseCreator, testCasePreparer] = await ctx.parallel.all([
    () => ctx.task(implementSkillTask, {
      projectRoot,
      skillName: 'benchmark-case-creator',
      description: 'Helps users create new benchmark tasks in YAML format. Provides templates, validation, examples, and a structured interface for defining process steps and evaluation criteria. Outputs to the catalog directory.',
      architecture: architectureDesign,
      dependencies: { yamlTaskSchema, sharedTypes, catalogManager },
      acceptanceCriteria: [
        'Provides YAML templates for different task patterns (map-reduce, iterative, branching, etc.)',
        'Validates created tasks against the YAML schema',
        'Generates example evaluation criteria for each obedience dimension',
        'Places created tasks in the correct catalog directory',
        'SKILL.md file follows Claude Code skill conventions'
      ]
    }),
    () => ctx.task(implementSkillTask, {
      projectRoot,
      skillName: 'test-case-preparer',
      description: 'Takes structured YAML task definitions and generates/acquires all necessary input data: synthetic books for translation, mock codebases with circular dependencies, datasets, etc. Also prepares evaluation artifacts for the judge (ground truth, expected counts, reference materials).',
      architecture: architectureDesign,
      dependencies: { yamlTaskSchema, sharedTypes, catalogManager },
      acceptanceCriteria: [
        'Can generate synthetic input data for each task type',
        'Can download/scrape real-world data when task requires it',
        'Produces evaluation artifacts (ground truth, expected counts) for the judge',
        'Handles both template-based and concrete task definitions',
        'Outputs prepared data in standardized format the runner can consume',
        'SKILL.md file follows Claude Code skill conventions'
      ]
    })
  ]);

  artifacts.push(
    ...(benchmarkCaseCreator.artifacts || []),
    ...(testCasePreparer.artifacts || [])
  );

  // --- 3c. Candidate Agent Runner (depends on log collector) ---

  const candidateRunner = await ctx.task(implementSkillTask, {
    projectRoot,
    skillName: 'candidate-runner',
    description: 'Dispatches candidate agents (Claude Code, Codex, or custom model+harness combos) to execute benchmark tasks. Supports local subprocess mode and Docker container mode. Captures both native session logs and structured event logs via the log collector overlay.',
    architecture: architectureDesign,
    dependencies: { yamlTaskSchema, sharedTypes, logCollector },
    acceptanceCriteria: [
      'Can dispatch Claude Code as a local subprocess with task prompt',
      'Can dispatch candidates in Docker containers with pre-installed plugins',
      'Captures native session logs from the candidate',
      'Emits structured event log (tool calls, responses, timing) via log collector',
      'Handles candidate timeouts and error capture',
      'Returns session logs + structured logs + final output artifacts',
      'SKILL.md file follows Claude Code skill conventions'
    ]
  });

  artifacts.push(...(candidateRunner.artifacts || []));

  // --- 3d. Judge (depends on shared types, YAML schema) ---

  const judge = await ctx.task(implementSkillTask, {
    projectRoot,
    skillName: 'judge',
    description: 'LLM-as-judge that evaluates obedience. Receives: (1) original YAML task definition with prescribed process, (2) session logs from candidate execution, (3) final output artifacts. Parses the process into discrete steps, traces logs to verify execution, and scores across 7 obedience dimensions: completeness, ordering, conditionality, parallelism, granularity, aggregation, error handling. Produces a per-dimension scorecard + overall obedience score.',
    architecture: architectureDesign,
    dependencies: { yamlTaskSchema, sharedTypes },
    acceptanceCriteria: [
      'Parses YAML task definition into discrete verifiable process steps',
      'Traces session logs to determine which steps were executed and in what order',
      'Scores completeness (0-100): did agent execute ALL iterations?',
      'Scores ordering (0-100): did agent follow prescribed step sequence?',
      'Scores conditionality (0-100): did agent evaluate conditions correctly?',
      'Scores parallelism (0-100): did agent parallelize/sequentialize as instructed?',
      'Scores granularity (0-100): did agent operate at correct chunk/batch size?',
      'Scores aggregation (0-100): did agent combine results as specified?',
      'Scores error handling (0-100): did agent follow prescribed error/failure path?',
      'Checks output correctness as secondary metric',
      'Produces structured scorecard JSON',
      'SKILL.md file follows Claude Code skill conventions'
    ]
  });

  artifacts.push(...(judge.artifacts || []));

  // --- 3e. Report Generator (depends on judge output format) ---

  const reportGenerator = await ctx.task(implementSkillTask, {
    projectRoot,
    skillName: 'report-generator',
    description: 'Compiles judge findings into human-readable markdown reports with scores, analysis, and visualizations. Supports per-task reports, per-candidate comparison reports, and aggregate suite reports with leaderboard tables.',
    architecture: architectureDesign,
    dependencies: { yamlTaskSchema, sharedTypes, judge },
    acceptanceCriteria: [
      'Generates per-task markdown report with dimension scores and analysis',
      'Generates per-candidate comparison report across multiple tasks',
      'Generates aggregate suite report with leaderboard table',
      'Includes score breakdowns, trends, and dimension radar charts (ASCII or mermaid)',
      'Highlights areas where candidates deviated from process',
      'SKILL.md file follows Claude Code skill conventions'
    ]
  });

  artifacts.push(...(reportGenerator.artifacts || []));

  // --- 3f. Benchmarker Orchestrator (depends on all other skills) ---

  const benchmarker = await ctx.task(implementSkillTask, {
    projectRoot,
    skillName: 'benchmarker',
    description: 'Top-level orchestrator skill. Loads a test suite (subset from catalog), runs each task through the candidate runner, collects judge scores, generates reports, and maintains the leaderboard. Coordinates all other skills in the correct sequence.',
    architecture: architectureDesign,
    dependencies: {
      yamlTaskSchema, sharedTypes, catalogManager, testCasePreparer,
      candidateRunner, judge, reportGenerator
    },
    acceptanceCriteria: [
      'Can load a test suite from catalog (full or subset by filter)',
      'For each task: prepares test data, runs candidate, judges result',
      'Parallelizes independent task runs where possible',
      'Collects all judge scores into aggregate results',
      'Generates final report via report-generator',
      'Maintains leaderboard JSON (candidate, score, timestamp, task breakdown)',
      'Handles partial failures gracefully (reports what succeeded)',
      'SKILL.md file follows Claude Code skill conventions'
    ]
  });

  artifacts.push(...(benchmarker.artifacts || []));

  // Breakpoint: Review all 7 skills before seeding catalog
  await ctx.breakpoint({
    question: `All 7 skills implemented. Review skill implementations before proceeding to seed the benchmark catalog with test cases?`,
    title: 'Skills Implementation Review',
    context: {
      runId: ctx.runId,
      summary: {
        skills: [
          { name: 'catalog-manager', status: catalogManager.status },
          { name: 'benchmark-case-creator', status: benchmarkCaseCreator.status },
          { name: 'test-case-preparer', status: testCasePreparer.status },
          { name: 'candidate-runner', status: candidateRunner.status },
          { name: 'judge', status: judge.status },
          { name: 'report-generator', status: reportGenerator.status },
          { name: 'benchmarker', status: benchmarker.status }
        ]
      }
    }
  });

  // ============================================================================
  // PHASE 4: SEED BENCHMARK CATALOG
  // Create initial YAML test cases — simple smoke tests + full examples from request.task.md
  // ============================================================================

  ctx.log('info', 'Phase 4: Seed Benchmark Catalog');

  // 4a. Simple smoke-test tasks (fast, for development iteration)
  const smokeTestTasks = await ctx.task(createSmokeTestTasksTask, {
    projectRoot,
    catalogPath: architectureDesign.catalogPath,
    yamlSchema: yamlTaskSchema
  });

  artifacts.push(...(smokeTestTasks.artifacts || []));

  // 4b. Full benchmark tasks from request.task.md (parallel creation)
  const fullBenchmarkTasks = await ctx.task(createFullBenchmarkTasksTask, {
    projectRoot,
    catalogPath: architectureDesign.catalogPath,
    yamlSchema: yamlTaskSchema,
    seedFromRequestDoc
  });

  artifacts.push(...(fullBenchmarkTasks.artifacts || []));

  // 4c. Validate all catalog entries
  const catalogValidation = await ctx.task(validateCatalogTask, {
    projectRoot,
    catalogPath: architectureDesign.catalogPath
  });

  artifacts.push(...(catalogValidation.artifacts || []));

  // ============================================================================
  // PHASE 5: INTEGRATION & END-TO-END VERIFICATION
  // Wire everything together and run a smoke test through the full pipeline
  // ============================================================================

  ctx.log('info', 'Phase 5: Integration & End-to-End Verification');

  // 5a. Integration wiring: ensure benchmarker can call all skills in sequence
  const integrationWiring = await ctx.task(integrationWiringTask, {
    projectRoot,
    pluginName,
    architecture: architectureDesign,
    skills: {
      catalogManager, benchmarkCaseCreator, testCasePreparer,
      candidateRunner, judge, reportGenerator, benchmarker
    }
  });

  artifacts.push(...(integrationWiring.artifacts || []));

  // 5b. End-to-end smoke test: run one simple benchmark task through the full pipeline
  const e2eSmokeTest = await ctx.task(e2eSmokeTestTask, {
    projectRoot,
    pluginName,
    smokeTestTask: smokeTestTasks.simplestTask
  });

  artifacts.push(...(e2eSmokeTest.artifacts || []));

  // 5c. Quality gate: verify smoke test produced valid scorecard
  const qualityGate = await ctx.task(qualityGateTask, {
    projectRoot,
    e2eResult: e2eSmokeTest,
    expectedDimensions: ['completeness', 'ordering', 'conditionality', 'parallelism', 'granularity', 'aggregation', 'errorHandling']
  });

  artifacts.push(...(qualityGate.artifacts || []));

  // If quality gate fails, iterate fixes
  if (!qualityGate.passed) {
    ctx.log('warn', 'Quality gate failed, entering fix-and-retest loop');

    let fixIteration = 0;
    const maxFixIterations = 3;
    let gateResult = qualityGate;

    while (!gateResult.passed && fixIteration < maxFixIterations) {
      fixIteration++;

      const fix = await ctx.task(integrationFixTask, {
        projectRoot,
        pluginName,
        failureReport: gateResult,
        iteration: fixIteration
      });

      artifacts.push(...(fix.artifacts || []));

      // Re-run smoke test
      const retest = await ctx.task(e2eSmokeTestTask, {
        projectRoot,
        pluginName,
        smokeTestTask: smokeTestTasks.simplestTask
      });

      gateResult = await ctx.task(qualityGateTask, {
        projectRoot,
        e2eResult: retest,
        expectedDimensions: ['completeness', 'ordering', 'conditionality', 'parallelism', 'granularity', 'aggregation', 'errorHandling']
      });

      artifacts.push(...(gateResult.artifacts || []));
    }

    if (!gateResult.passed) {
      await ctx.breakpoint({
        question: `Quality gate still failing after ${maxFixIterations} fix iterations. Review failures and decide: continue manually or accept current state?`,
        title: 'Quality Gate Failure',
        context: { runId: ctx.runId, failures: gateResult.failures }
      });
    }
  }

  // ============================================================================
  // PHASE 6: DOCUMENTATION & FINAL REVIEW
  // ============================================================================

  ctx.log('info', 'Phase 6: Documentation & Final Review');

  const [pluginReadme, contributingGuide] = await ctx.parallel.all([
    () => ctx.task(pluginReadmeTask, {
      projectRoot,
      pluginName,
      architecture: architectureDesign,
      catalog: { smoke: smokeTestTasks, full: fullBenchmarkTasks }
    }),
    () => ctx.task(contributingGuideTask, {
      projectRoot,
      yamlSchema: yamlTaskSchema,
      architecture: architectureDesign
    })
  ]);

  artifacts.push(
    ...(pluginReadme.artifacts || []),
    ...(contributingGuide.artifacts || [])
  );

  // Final review
  const finalReview = await ctx.task(finalReviewTask, {
    projectRoot,
    pluginName,
    architecture: architectureDesign,
    skills: {
      catalogManager, benchmarkCaseCreator, testCasePreparer,
      candidateRunner, judge, reportGenerator, benchmarker
    },
    catalog: { smoke: smokeTestTasks, full: fullBenchmarkTasks },
    e2eResult: e2eSmokeTest,
    qualityGate
  });

  artifacts.push(...(finalReview.artifacts || []));

  // ============================================================================
  // PHASE 7: PLUGIN MARKETPLACE
  // Create a Claude Code plugin marketplace structure and register the plugin
  // ============================================================================

  ctx.log('info', 'Phase 7: Plugin Marketplace');

  // 7a. Create marketplace structure
  const marketplace = await ctx.task(createMarketplaceTask, {
    projectRoot,
    pluginName,
    architecture: architectureDesign,
    finalReview
  });

  artifacts.push(...(marketplace.artifacts || []));

  // 7b. Register the obedience-benchmark plugin in the marketplace
  const marketplaceRegistration = await ctx.task(registerPluginInMarketplaceTask, {
    projectRoot,
    pluginName,
    architecture: architectureDesign,
    skills: {
      catalogManager, benchmarkCaseCreator, testCasePreparer,
      candidateRunner, judge, reportGenerator, benchmarker
    },
    catalog: { smoke: smokeTestTasks, full: fullBenchmarkTasks },
    marketplace
  });

  artifacts.push(...(marketplaceRegistration.artifacts || []));

  // 7c. Marketplace verification
  const marketplaceVerification = await ctx.task(verifyMarketplaceTask, {
    projectRoot,
    pluginName,
    marketplace,
    registration: marketplaceRegistration
  });

  artifacts.push(...(marketplaceVerification.artifacts || []));

  // Final breakpoint (auto-approved in yolo mode)
  await ctx.breakpoint({
    question: `Obedience Benchmark plugin + marketplace complete. ${finalReview.verdict}. Approve?`,
    title: 'Final Plugin + Marketplace Review',
    context: {
      runId: ctx.runId,
      summary: {
        skills: 7,
        smokeTestTasks: smokeTestTasks.count,
        fullBenchmarkTasks: fullBenchmarkTasks.count,
        e2ePassed: qualityGate.passed,
        marketplaceReady: marketplaceVerification.passed,
        verdict: finalReview.verdict
      }
    }
  });

  const endTime = ctx.now();

  return {
    success: true,
    pluginName,
    plugin: pluginScaffold,
    skills: [
      catalogManager, benchmarkCaseCreator, testCasePreparer,
      candidateRunner, judge, reportGenerator, benchmarker
    ],
    catalog: {
      smoke: smokeTestTasks,
      full: fullBenchmarkTasks,
      validation: catalogValidation
    },
    marketplace: {
      structure: marketplace,
      registration: marketplaceRegistration,
      verification: marketplaceVerification
    },
    e2eResult: e2eSmokeTest,
    finalReview,
    artifacts,
    duration: endTime - startTime,
    metadata: {
      processId: 'obedience-benchmark/plugin-build',
      timestamp: startTime,
      projectRoot
    }
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

// --- Phase 1: Research Tasks (parallel) ---

export const researchExistingBenchmarksTask = defineTask('research-benchmarks', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Research existing agent benchmarks',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'AI evaluation researcher',
      task: 'Research existing agent benchmarks and evaluation frameworks to inform the obedience benchmark design',
      context: { projectRoot: args.projectRoot },
      instructions: [
        'Research AgentBench, SWE-bench, GAIA, WebArena, and similar agent evaluation frameworks',
        'Analyze how they define tasks, score results, and handle process evaluation',
        'Identify gaps: none of them specifically measure process obedience / step fidelity',
        'Document patterns we should adopt (task format, scoring, reporting)',
        'Document anti-patterns we should avoid',
        'Focus on: how tasks are defined, how execution is traced, how scoring works',
        'Save findings to artifacts/research/existing-benchmarks.md'
      ],
      outputFormat: 'JSON with findings (object), patterns (array), antiPatterns (array), gaps (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['findings', 'artifacts'],
      properties: {
        findings: { type: 'object' },
        patterns: { type: 'array', items: { type: 'string' } },
        antiPatterns: { type: 'array', items: { type: 'string' } },
        gaps: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['research', 'benchmarks']
}));

export const researchPluginConventionsTask = defineTask('research-plugin-conventions', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Research Claude Code plugin conventions',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Claude Code plugin developer',
      task: 'Research Claude Code plugin structure: plugin.json, SKILL.md format, skill conventions, directory layout',
      context: { projectRoot: args.projectRoot },
      instructions: [
        'Examine existing Claude Code plugins (especially babysitter plugin) for structure patterns',
        'Document plugin.json schema and required fields',
        'Document SKILL.md format and conventions',
        'Document how skills reference each other and share utilities',
        'Document how plugin directory structure is organized',
        'Note any constraints on skill naming, file placement, etc.',
        'Save findings to artifacts/research/plugin-conventions.md'
      ],
      outputFormat: 'JSON with pluginJsonSchema (object), skillMdFormat (string), directoryLayout (object), conventions (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['conventions', 'artifacts'],
      properties: {
        pluginJsonSchema: { type: 'object' },
        skillMdFormat: { type: 'string' },
        directoryLayout: { type: 'object' },
        conventions: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['research', 'plugin']
}));

export const researchYamlSchemaTask = defineTask('research-yaml-schema', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Research YAML task definition schema patterns',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Schema designer and benchmark architect',
      task: 'Design the YAML schema for benchmark task definitions that captures process steps, evaluation criteria, and metadata',
      context: { projectRoot: args.projectRoot },
      instructions: [
        'Study how existing benchmarks define task specifications (SWE-bench, AgentBench)',
        'Design a YAML schema that captures: task description, prescribed process steps (as a DAG or sequence), expected iterations/branches, evaluation criteria per obedience dimension, required input data spec, expected output spec',
        'The schema must support: linear steps, parallel steps, conditional branches, loops with bounds, error handling paths',
        'Include metadata fields: domain, complexity, estimated duration, required capabilities',
        'Design to be both human-writable and machine-parseable by the judge',
        'Provide 2-3 example task definitions in the proposed schema',
        'Save schema and examples to artifacts/research/yaml-schema.md'
      ],
      outputFormat: 'JSON with schema (object), examples (array), designDecisions (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['schema', 'examples', 'artifacts'],
      properties: {
        schema: { type: 'object' },
        examples: { type: 'array' },
        designDecisions: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['research', 'schema']
}));

export const researchDockerRunnerTask = defineTask('research-docker-runner', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Research Docker-based agent isolation',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'DevOps engineer and containerization specialist',
      task: 'Design the Docker-based candidate runner for isolated agent execution during benchmarking',
      context: { projectRoot: args.projectRoot },
      instructions: [
        'Design a Dockerfile template for running candidate agents (Claude Code, Codex) in isolation',
        'Plan how to pre-install plugins, configure the agent, and inject the task prompt',
        'Design log extraction: how to capture session logs and structured events from inside the container',
        'Plan timeout handling: container-level timeouts, graceful shutdown',
        'Design the local-subprocess fallback mode (same interface, no Docker)',
        'Document the runner abstraction interface that both modes implement',
        'Consider: resource limits, network isolation, filesystem mounting for input/output',
        'Save design to artifacts/research/docker-runner.md'
      ],
      outputFormat: 'JSON with runnerInterface (object), dockerDesign (object), localDesign (object), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['runnerInterface', 'artifacts'],
      properties: {
        runnerInterface: { type: 'object' },
        dockerDesign: { type: 'object' },
        localDesign: { type: 'object' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['research', 'docker', 'runner']
}));

// --- Phase 1b: Architecture Design ---

export const architectureDesignTask = defineTask('architecture-design', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Design plugin architecture',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior software architect',
      task: 'Design the complete architecture for the Obedience Benchmark Claude Code plugin, synthesizing research findings',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        research: args.research
      },
      instructions: [
        'Synthesize all research findings into a cohesive architecture',
        'Define the complete directory structure following Claude Code plugin conventions',
        'Design plugin.json with all 7 skills registered',
        'Finalize the YAML task schema based on research',
        'Design inter-skill communication (how benchmarker orchestrates the others)',
        'Define the runner abstraction layer (local + Docker, same interface)',
        'Design the structured log format (tool calls, responses, timing, step markers)',
        'Design the judge rubric structure (7 dimensions, scoring logic, evidence collection)',
        'Design the scorecard/leaderboard data model',
        'Define shared TypeScript types used across all skills',
        'Document the data flow: catalog -> preparer -> runner -> judge -> report',
        'Save architecture document to artifacts/ARCHITECTURE.md',
        'Save directory structure to artifacts/directory-structure.md'
      ],
      outputFormat: 'JSON with directoryStructure (object), pluginJson (object), yamlSchema (object), runnerInterface (object), judgeRubric (object), scorecardSchema (object), dataFlow (string), catalogPath (string), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['directoryStructure', 'pluginJson', 'yamlSchema', 'catalogPath', 'artifacts'],
      properties: {
        directoryStructure: { type: 'object' },
        pluginJson: { type: 'object' },
        yamlSchema: { type: 'object' },
        runnerInterface: { type: 'object' },
        judgeRubric: { type: 'object' },
        scorecardSchema: { type: 'object' },
        dataFlow: { type: 'string' },
        catalogPath: { type: 'string' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['architecture', 'design']
}));

// --- Phase 2: Scaffold & Infrastructure ---

export const pluginScaffoldTask = defineTask('plugin-scaffold', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create plugin scaffold',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Claude Code plugin developer',
      task: 'Create the complete plugin directory structure, plugin.json, and empty SKILL.md stubs for all 7 skills',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        architecture: args.architecture
      },
      instructions: [
        'Create plugin.json following the architecture design',
        'Create directory structure: skills/<name>/SKILL.md for each of the 7 skills',
        'Create shared/ directory for types, utilities, and the log collector',
        'Create the benchmark catalog directory under skills/catalog-manager/benchmarks/',
        'Create subdirectories: benchmarks/smoke-tests/, benchmarks/full/',
        'Create package.json with TypeScript and necessary dependencies',
        'Create tsconfig.json configured for the project',
        'Write empty but valid SKILL.md stubs that define skill name, description, and trigger conditions',
        'Verify all files are created and the structure matches the architecture'
      ],
      outputFormat: 'JSON with filesCreated (array), directoryStructure (object), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['filesCreated', 'artifacts'],
      properties: {
        filesCreated: { type: 'array', items: { type: 'string' } },
        directoryStructure: { type: 'object' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['scaffold', 'plugin']
}));

export const yamlTaskSchemaTask = defineTask('yaml-task-schema', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Implement YAML task schema',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Schema developer',
      task: 'Implement the YAML task definition schema as a JSON Schema file, TypeScript types, and a validation utility',
      context: { projectRoot: args.projectRoot, architecture: args.architecture },
      instructions: [
        'Create the JSON Schema file for validating YAML task definitions',
        'Create corresponding TypeScript interfaces/types',
        'Create a validation utility that loads a YAML file and validates against the schema',
        'Support all process step types: sequential, parallel, conditional, loop, error-handler',
        'Support evaluation criteria per obedience dimension',
        'Include clear error messages for validation failures',
        'Write unit tests for the validator with valid and invalid examples'
      ],
      outputFormat: 'JSON with schemaFile (string), typesFile (string), validatorFile (string), testFile (string), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts'],
      properties: {
        schemaFile: { type: 'string' },
        typesFile: { type: 'string' },
        validatorFile: { type: 'string' },
        testFile: { type: 'string' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['schema', 'yaml', 'infrastructure']
}));

export const sharedTypesTask = defineTask('shared-types', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create shared TypeScript types',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'TypeScript developer',
      task: 'Create shared TypeScript types used across all 7 skills: scorecard, log events, runner interface, catalog entry, etc.',
      context: { projectRoot: args.projectRoot, architecture: args.architecture },
      instructions: [
        'Create types for: ObedienceScorecard (7 dimensions + overall), LogEvent (structured), RunnerConfig, CatalogEntry, TaskDefinition, JudgeRubric, BenchmarkResult, LeaderboardEntry',
        'Create enums for: ObedienceDimension, TaskComplexity, RunnerMode, TaskStatus',
        'Ensure types align with the YAML schema and architecture design',
        'Export all types from a single shared/types.ts barrel file',
        'Add JSDoc comments for each type'
      ],
      outputFormat: 'JSON with typesFile (string), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts'],
      properties: {
        typesFile: { type: 'string' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['types', 'infrastructure']
}));

export const logCollectorTask = defineTask('log-collector', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Implement structured log collector',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Observability engineer',
      task: 'Implement the structured log collector overlay that wraps candidate agent sessions to capture tool calls, responses, and timing in a standardized JSON format',
      context: { projectRoot: args.projectRoot, architecture: args.architecture },
      instructions: [
        'Create a log collector module that can wrap agent sessions',
        'Capture: tool invocations (name, args, timestamp), tool responses (result, timestamp), agent text outputs, timing for each step',
        'Also capture native session logs from Claude Code (path to transcript file)',
        'Output structured JSON log file: array of timestamped events',
        'Support both local-subprocess and Docker extraction modes',
        'Include a log parser utility the judge will use to reconstruct execution trace',
        'Write unit tests for the collector and parser'
      ],
      outputFormat: 'JSON with collectorFile (string), parserFile (string), testFile (string), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts'],
      properties: {
        collectorFile: { type: 'string' },
        parserFile: { type: 'string' },
        testFile: { type: 'string' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['logging', 'infrastructure']
}));

export const scaffoldVerificationTask = defineTask('scaffold-verification', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Verify plugin scaffold',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: 'Verify the plugin scaffold: check all expected files exist, TypeScript compiles, YAML schema validates, directory structure is correct',
      context: { projectRoot: args.projectRoot, pluginName: args.pluginName },
      instructions: [
        'Verify plugin.json exists and is valid JSON',
        'Verify all 7 SKILL.md files exist in the correct locations',
        'Verify shared types compile without errors (run tsc --noEmit)',
        'Verify YAML schema file is valid JSON Schema',
        'Verify the validator can load and validate a sample YAML task',
        'Verify benchmark catalog directories exist',
        'Report any missing files or compilation errors'
      ],
      outputFormat: 'JSON with passed (boolean), checks (array of objects with name and passed and message), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'checks', 'artifacts'],
      properties: {
        passed: { type: 'boolean' },
        checks: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['verification', 'scaffold']
}));

// --- Phase 3: Skill Implementation (reusable task with convergence) ---

export const implementSkillTask = defineTask('implement-skill', (args, taskCtx) => ({
  kind: 'agent',
  title: `Implement skill: ${args.skillName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior TypeScript developer and Claude Code skill author',
      task: `Implement the "${args.skillName}" skill for the Obedience Benchmark plugin`,
      context: {
        projectRoot: args.projectRoot,
        skillName: args.skillName,
        description: args.description,
        architecture: args.architecture,
        dependencies: Object.keys(args.dependencies || {}),
        acceptanceCriteria: args.acceptanceCriteria
      },
      instructions: [
        `Implement the "${args.skillName}" skill following the architecture design`,
        'Write the complete SKILL.md with: name, description, trigger conditions, and full skill instructions',
        'Implement all TypeScript source files for the skill logic',
        'Use shared types from shared/types.ts',
        'Follow Claude Code skill conventions for SKILL.md format',
        'Write unit tests for core logic',
        'Verify ALL acceptance criteria are met:',
        ...(args.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`),
        'Run tests and fix any failures',
        'If tests fail after 2 fix attempts, document remaining issues'
      ],
      outputFormat: 'JSON with status (string: complete|partial), filesCreated (array), testsPassed (boolean), acceptanceCriteriaMet (array of booleans), issues (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['status', 'filesCreated', 'artifacts'],
      properties: {
        status: { type: 'string', enum: ['complete', 'partial'] },
        filesCreated: { type: 'array', items: { type: 'string' } },
        testsPassed: { type: 'boolean' },
        acceptanceCriteriaMet: { type: 'array', items: { type: 'boolean' } },
        issues: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['skill', 'implementation', args.skillName]
}));

// --- Phase 4: Catalog Seeding ---

export const createSmokeTestTasksTask = defineTask('create-smoke-tests', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create smoke test benchmark tasks',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Benchmark task designer',
      task: 'Create 2-3 simple, fast-to-run benchmark tasks in YAML format for development and smoke testing',
      context: {
        projectRoot: args.projectRoot,
        catalogPath: args.catalogPath,
        yamlSchema: args.yamlSchema
      },
      instructions: [
        'Create a "hello-world" task: simple 3-step sequential process (list files, count them, report count). Tests completeness and ordering.',
        'Create a "parallel-sum" task: split a list into 3 chunks, sum each chunk in parallel, combine totals. Tests parallelism and aggregation.',
        'Create a "conditional-skip" task: check if a file exists, if yes process it, if no skip and log reason. Tests conditionality and error handling.',
        'Each task should be completable in under 30 seconds by any agent',
        'Validate each YAML file against the schema before saving',
        'Place files in the smoke-tests/ subdirectory of the catalog',
        'Return which task is the simplest (for e2e testing)'
      ],
      outputFormat: 'JSON with count (number), tasks (array of objects with name and path), simplestTask (object with name and path), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['count', 'tasks', 'simplestTask', 'artifacts'],
      properties: {
        count: { type: 'number' },
        tasks: { type: 'array' },
        simplestTask: { type: 'object' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['catalog', 'smoke-tests']
}));

export const createFullBenchmarkTasksTask = defineTask('create-full-benchmarks', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create full benchmark tasks from request.task.md',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Benchmark task designer',
      task: 'Convert the 7 example tasks from request.task.md into the YAML benchmark format with full process steps and evaluation criteria',
      context: {
        projectRoot: args.projectRoot,
        catalogPath: args.catalogPath,
        yamlSchema: args.yamlSchema,
        seedFromRequestDoc: args.seedFromRequestDoc
      },
      instructions: [
        'Read request.task.md to extract all 7 example tasks',
        'For each task, create a YAML file with:',
        '  - Task metadata (name, domain, complexity, estimated duration)',
        '  - Full natural language task description',
        '  - Prescribed process steps decomposed into the step DAG/sequence',
        '  - Expected iteration counts, branch conditions, parallelism markers',
        '  - Evaluation criteria for each of the 7 obedience dimensions',
        '  - Input data specification (what the test-case-preparer needs to generate)',
        '  - Expected output specification (for correctness checking)',
        'Tasks to convert:',
        '  1. Book translation (map-reduce with context, style preservation)',
        '  2. Countries/cities/attractions (deep nested iteration)',
        '  3. Circular dependency refactoring (conditional with rollback)',
        '  4. US states scraping (map-reduce with validation)',
        '  5. TSP genetic algorithm (iterative refinement loop)',
        '  6. Markdown readability (recursive decomposition)',
        '  7. Crossword puzzle (adversarial constraint satisfaction with backtracking)',
        'Organize by domain subdirectories: translation/, data-analysis/, coding/, etc.',
        'Validate each YAML file against the schema'
      ],
      outputFormat: 'JSON with count (number), tasks (array of objects with name and path and domain), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['count', 'tasks', 'artifacts'],
      properties: {
        count: { type: 'number' },
        tasks: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['catalog', 'full-benchmarks']
}));

export const validateCatalogTask = defineTask('validate-catalog', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Validate benchmark catalog',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: 'Validate all YAML benchmark tasks in the catalog against the schema and check for consistency',
      context: { projectRoot: args.projectRoot, catalogPath: args.catalogPath },
      instructions: [
        'Load every YAML file in the catalog directory (smoke-tests/ and full/)',
        'Validate each against the JSON Schema',
        'Check that all 7 obedience dimensions have evaluation criteria defined',
        'Check that process steps form a valid DAG (no dangling references)',
        'Check that metadata is complete (domain, complexity, duration)',
        'Report any validation errors with file path and error details'
      ],
      outputFormat: 'JSON with totalTasks (number), valid (number), invalid (number), errors (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['totalTasks', 'valid', 'invalid', 'artifacts'],
      properties: {
        totalTasks: { type: 'number' },
        valid: { type: 'number' },
        invalid: { type: 'number' },
        errors: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['validation', 'catalog']
}));

// --- Phase 5: Integration & E2E ---

export const integrationWiringTask = defineTask('integration-wiring', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Wire skill integration',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Integration engineer',
      task: 'Wire all 7 skills together: ensure the benchmarker can invoke catalog-manager, test-case-preparer, candidate-runner, judge, and report-generator in the correct sequence',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        architecture: args.architecture
      },
      instructions: [
        'Verify the benchmarker skill can import and call the catalog manager to load tasks',
        'Verify the benchmarker can call test-case-preparer for each task',
        'Verify the benchmarker can call candidate-runner with prepared data',
        'Verify the benchmarker can pass runner output to the judge',
        'Verify the benchmarker can pass judge scores to the report generator',
        'Create an integration test that exercises the full pipeline with a mock candidate',
        'Fix any import/interface mismatches discovered during wiring'
      ],
      outputFormat: 'JSON with wiringPassed (boolean), integrationTestFile (string), fixes (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['wiringPassed', 'artifacts'],
      properties: {
        wiringPassed: { type: 'boolean' },
        integrationTestFile: { type: 'string' },
        fixes: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['integration', 'wiring']
}));

export const e2eSmokeTestTask = defineTask('e2e-smoke-test', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Run E2E smoke test',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: 'Run a complete end-to-end smoke test: load a simple task from catalog, prepare test data, run a mock candidate, judge the result, generate a report',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        smokeTestTask: args.smokeTestTask
      },
      instructions: [
        'Use the benchmarker skill to run a single smoke test task end-to-end',
        'If the real candidate runner is not available, use a mock that simulates correct execution',
        'Verify: catalog loads the task, preparer generates input data, runner produces logs + output, judge scores across all 7 dimensions, report is generated',
        'Capture the full scorecard and report',
        'Report any failures in the pipeline with detailed error info',
        'The mock candidate should follow the process correctly so we expect high scores'
      ],
      outputFormat: 'JSON with passed (boolean), scorecard (object), reportPath (string), errors (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'artifacts'],
      properties: {
        passed: { type: 'boolean' },
        scorecard: { type: 'object' },
        reportPath: { type: 'string' },
        errors: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['e2e', 'smoke-test']
}));

export const qualityGateTask = defineTask('quality-gate', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Quality gate check',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Quality gate evaluator',
      task: 'Verify the E2E smoke test produced a valid scorecard with all 7 obedience dimensions scored, and the report was generated correctly',
      context: {
        projectRoot: args.projectRoot,
        e2eResult: args.e2eResult,
        expectedDimensions: args.expectedDimensions
      },
      instructions: [
        'Check that the scorecard contains scores for all 7 expected dimensions',
        'Check that each score is a number between 0 and 100',
        'Check that the overall score is computed correctly',
        'Check that the report file was generated and contains expected sections',
        'Check that the mock candidate received high scores (>80) since it follows the process',
        'List any failures with detailed explanation'
      ],
      outputFormat: 'JSON with passed (boolean), dimensionsPresent (array), missingDimensions (array), scoreRange (object with min and max), failures (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'artifacts'],
      properties: {
        passed: { type: 'boolean' },
        dimensionsPresent: { type: 'array', items: { type: 'string' } },
        missingDimensions: { type: 'array', items: { type: 'string' } },
        scoreRange: { type: 'object' },
        failures: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['quality-gate', 'verification']
}));

export const integrationFixTask = defineTask('integration-fix', (args, taskCtx) => ({
  kind: 'agent',
  title: `Fix integration issues (iteration ${args.iteration})`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior debugger and integration engineer',
      task: `Fix integration issues identified by the quality gate (fix iteration ${args.iteration})`,
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        failureReport: args.failureReport,
        iteration: args.iteration
      },
      instructions: [
        'Analyze the quality gate failure report',
        'Identify root causes for each failure',
        'Fix the issues in the relevant skill implementations',
        'Run unit tests for affected skills to verify fixes',
        'Document what was fixed and why'
      ],
      outputFormat: 'JSON with fixesApplied (array), filesModified (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['fixesApplied', 'artifacts'],
      properties: {
        fixesApplied: { type: 'array', items: { type: 'string' } },
        filesModified: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['fix', 'integration', `iteration-${args.iteration}`]
}));

// --- Phase 6: Documentation ---

export const pluginReadmeTask = defineTask('plugin-readme', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Write plugin README',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Technical writer',
      task: 'Write the README.md for the Obedience Benchmark plugin',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        architecture: args.architecture,
        catalog: args.catalog
      },
      instructions: [
        'Write a comprehensive README covering:',
        '  - What the benchmark measures (process obedience, not just correctness)',
        '  - Quick start: install plugin, run a benchmark, read the report',
        '  - The 7 obedience dimensions explained with examples',
        '  - How to use each skill (candidate-runner, judge, etc.)',
        '  - How to create custom benchmark tasks (YAML format)',
        '  - How to configure the runner (local vs Docker)',
        '  - Leaderboard and reporting',
        '  - Architecture overview diagram (mermaid)',
        'Keep it practical with real usage examples'
      ],
      outputFormat: 'JSON with readmePath (string), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts'],
      properties: {
        readmePath: { type: 'string' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['documentation', 'readme']
}));

export const contributingGuideTask = defineTask('contributing-guide', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Write contributing guide',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Technical writer',
      task: 'Write CONTRIBUTING.md explaining how to add new benchmark tasks to the catalog',
      context: {
        projectRoot: args.projectRoot,
        yamlSchema: args.yamlSchema,
        architecture: args.architecture
      },
      instructions: [
        'Explain the YAML task definition format with annotated examples',
        'Document how to define process steps for each pattern type (sequential, parallel, conditional, loop)',
        'Explain how to write evaluation criteria for each obedience dimension',
        'Provide a step-by-step guide for adding a new task',
        'Include a checklist for task quality (schema validation, dimension coverage, etc.)',
        'Explain how to use the benchmark-case-creator skill for guided creation'
      ],
      outputFormat: 'JSON with contributingPath (string), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['artifacts'],
      properties: {
        contributingPath: { type: 'string' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['documentation', 'contributing']
}));

export const finalReviewTask = defineTask('final-review', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Final plugin review',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Principal engineer and plugin reviewer',
      task: 'Conduct final comprehensive review of the Obedience Benchmark plugin',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        architecture: args.architecture,
        skillCount: 7,
        catalogStats: args.catalog,
        e2eResult: args.e2eResult,
        qualityGate: args.qualityGate
      },
      instructions: [
        'Review the complete plugin structure against the architecture',
        'Verify all 7 SKILL.md files are complete and follow conventions',
        'Verify the YAML task schema is comprehensive and well-documented',
        'Verify the catalog has both smoke tests and full benchmark tasks',
        'Review the E2E test result and quality gate status',
        'Check for any missing edge cases in the judge scoring logic',
        'Verify README and CONTRIBUTING docs are comprehensive',
        'Provide a final verdict: ready for use, or list blocking issues',
        'Suggest follow-up improvements (non-blocking)'
      ],
      outputFormat: 'JSON with verdict (string), ready (boolean), strengths (array), blockingIssues (array), improvements (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['verdict', 'ready', 'artifacts'],
      properties: {
        verdict: { type: 'string' },
        ready: { type: 'boolean' },
        strengths: { type: 'array', items: { type: 'string' } },
        blockingIssues: { type: 'array', items: { type: 'string' } },
        improvements: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['review', 'final']
}));

// --- Phase 7: Marketplace ---

export const createMarketplaceTask = defineTask('create-marketplace', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create Claude Code plugin marketplace',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Platform engineer and marketplace architect',
      task: 'Create a Claude Code plugin marketplace structure in the repository that can host and distribute plugins',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        architecture: args.architecture
      },
      instructions: [
        'Create a marketplace/ directory in the repo root',
        'Create marketplace/README.md explaining how the marketplace works',
        'Create marketplace/registry.json — the central registry of all available plugins with metadata',
        'Create marketplace/schema/plugin-manifest.json — JSON Schema for plugin manifest entries',
        'Create marketplace/plugins/ directory to house individual plugin entries',
        'Design the registry format: array of plugin entries with fields: name, version, description, author, repository, skills (array of skill summaries), tags, compatibility, installCommand',
        'Create marketplace/scripts/validate-registry.js — validates the registry against the schema',
        'Create marketplace/scripts/generate-catalog.js — generates a browsable catalog markdown from the registry',
        'Create marketplace/CATALOG.md — auto-generated browsable list of all plugins with descriptions and skill lists',
        'Create marketplace/PUBLISHING.md — guide for plugin authors on how to publish to the marketplace',
        'Include search/filter metadata: tags, categories, skill types, compatibility info',
        'Make the marketplace self-contained so it can grow with more plugins over time'
      ],
      outputFormat: 'JSON with marketplacePath (string), registryPath (string), filesCreated (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['marketplacePath', 'registryPath', 'filesCreated', 'artifacts'],
      properties: {
        marketplacePath: { type: 'string' },
        registryPath: { type: 'string' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['marketplace', 'structure']
}));

export const registerPluginInMarketplaceTask = defineTask('register-plugin-marketplace', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Register obedience-benchmark plugin in marketplace',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Plugin publisher',
      task: 'Register the obedience-benchmark plugin in the marketplace registry with full metadata, skill descriptions, and installation instructions',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        architecture: args.architecture,
        skills: Object.keys(args.skills || {}),
        catalog: args.catalog,
        marketplace: args.marketplace
      },
      instructions: [
        'Create marketplace/plugins/obedience-benchmark/ directory',
        'Create marketplace/plugins/obedience-benchmark/manifest.json with: name, version (1.0.0), description, author, license, repository URL, minimum Claude Code version',
        'Include full skill listing with: name, description, trigger conditions, example usage for each of the 7 skills',
        'Include tags: benchmark, evaluation, obedience, testing, quality, agents',
        'Include categories: testing, evaluation, benchmarking',
        'Add the plugin entry to marketplace/registry.json',
        'Create marketplace/plugins/obedience-benchmark/README.md — plugin-specific marketplace page with installation, usage, and examples',
        'Create marketplace/plugins/obedience-benchmark/CHANGELOG.md — initial version entry',
        'Run the validate-registry script to ensure the registry is valid',
        'Run the generate-catalog script to update CATALOG.md with the new plugin'
      ],
      outputFormat: 'JSON with manifestPath (string), registryUpdated (boolean), catalogUpdated (boolean), filesCreated (array), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['manifestPath', 'registryUpdated', 'artifacts'],
      properties: {
        manifestPath: { type: 'string' },
        registryUpdated: { type: 'boolean' },
        catalogUpdated: { type: 'boolean' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['marketplace', 'registration']
}));

export const verifyMarketplaceTask = defineTask('verify-marketplace', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Verify marketplace integrity',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'QA engineer',
      task: 'Verify the marketplace structure, registry, and plugin registration are all correct and consistent',
      context: {
        projectRoot: args.projectRoot,
        pluginName: args.pluginName,
        marketplace: args.marketplace,
        registration: args.registration
      },
      instructions: [
        'Run the validate-registry script and verify it passes',
        'Verify the obedience-benchmark plugin appears in registry.json with correct metadata',
        'Verify the plugin manifest has all 7 skills listed correctly',
        'Verify CATALOG.md includes the plugin with correct description',
        'Verify all marketplace README and guide files are present and complete',
        'Verify the plugin README in the marketplace matches the main plugin README',
        'Check for any broken internal links or references'
      ],
      outputFormat: 'JSON with passed (boolean), checks (array of objects with name and passed and message), artifacts (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'checks', 'artifacts'],
      properties: {
        passed: { type: 'boolean' },
        checks: { type: 'array' },
        artifacts: { type: 'array' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['marketplace', 'verification']
}));
