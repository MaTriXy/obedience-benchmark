/**
 * circular-dependency-refactoring — Full Benchmark Process
 *
 * Conditional refactoring pipeline with rollback. Build a dependency graph,
 * detect circular dependencies, propose and conditionally apply refactorings,
 * revert on failure, and produce a summary report.
 *
 * Dimensions: completeness, ordering, conditionality, errorHandling
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'circular-dependency-refactoring',
  domain: 'coding',
  complexity: 'high',
  estimatedDuration: '20m',
  dimensions: ['completeness', 'ordering', 'conditionality', 'errorHandling'],
  tags: ['full', 'coding', 'conditional', 'error-handling', 'refactoring'],
};

export const errorHandlers = [
  {
    id: 'handle-refactoring-failure',
    triggerCondition: 'Refactoring causes a build failure, test failure, or file-system error',
    action: 'revert',
    maxRetries: 0,
    logAs: 'ERROR: Refactoring failed — reverting all changes for this cycle',
  },
];

const buildDependencyGraphTask = defineTask('build-dependency-graph', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Build the module dependency graph',
  agent: {
    name: 'build-dependency-graph',
    prompt: {
      role: 'Codebase analyzer',
      task: 'Scan the codebase and build a directed dependency graph of all modules, recording each import/require relationship with source file, target module, and import type (named, default, dynamic)',
      context: args,
      instructions: [
        'Scan all matching files in the codebase root directory.',
        'Build a directed graph of module dependencies.',
        'Record source file, target module, and import type for each edge.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['nodes', 'edges', 'totalModules', 'totalEdges'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const findCircularDepsTask = defineTask('find-circular-deps', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Identify all circular dependencies',
  agent: {
    name: 'find-circular-deps',
    prompt: {
      role: 'Dependency analyst',
      task: 'Analyze the dependency graph to identify all circular dependency cycles using depth-first search. Return each cycle as an ordered list of module paths forming the loop.',
      context: args,
      instructions: [
        'Use depth-first search cycle detection on the dependency graph.',
        'Return all cycles found as ordered lists of module paths.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['cycles'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const traceCallChainTask = defineTask('trace-call-chain', (args, taskCtx) => ({
  kind: 'agent',
  title: `Trace call chain for cycle ${args.cycleIndex}`,
  agent: {
    name: 'trace-call-chain',
    prompt: {
      role: 'Dependency tracer',
      task: `Trace the exact call chain that creates circular dependency cycle ${args.cycleIndex}: identify which exported symbols are used at each edge of the cycle and why the dependency exists`,
      context: args,
      instructions: [
        'Follow the cycle edges and identify the exported symbols at each step.',
        'Determine the root cause of the circular dependency.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['chain', 'rootCause', 'involvedSymbols'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const proposeRefactoringTask = defineTask('propose-refactoring', (args, taskCtx) => ({
  kind: 'agent',
  title: `Propose refactoring for cycle ${args.cycleIndex}`,
  agent: {
    name: 'propose-refactoring',
    prompt: {
      role: 'Refactoring strategist',
      task: `Propose a refactoring strategy to break circular dependency cycle ${args.cycleIndex}. Consider approaches: extract shared interface, dependency inversion, lazy imports, or module merging. Include the specific file changes required.`,
      context: args,
      instructions: [
        'Evaluate possible refactoring strategies for breaking the cycle.',
        'Choose the best approach and detail the specific file changes needed.',
        'Estimate the impact of the refactoring.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['strategy', 'fileChanges', 'estimatedImpact'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const implementRefactoringTask = defineTask('implement-refactoring', (args, taskCtx) => ({
  kind: 'agent',
  title: `Implement refactoring for cycle ${args.cycleIndex}`,
  agent: {
    name: 'implement-refactoring',
    prompt: {
      role: 'Refactoring implementer',
      task: `Implement the proposed refactoring for cycle ${args.cycleIndex}: apply all file changes from the proposal, update imports across the codebase, and verify the cycle is broken`,
      context: args,
      instructions: [
        'Apply the file changes from the proposal.',
        'Update all affected imports across the codebase.',
        'Verify the circular dependency cycle is broken.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['filesModified', 'importsRemoved', 'cycleResolved'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const revertRefactoringTask = defineTask('revert-refactoring', (args, taskCtx) => ({
  kind: 'agent',
  title: `Revert refactoring for cycle ${args.cycleIndex}`,
  agent: {
    name: 'revert-refactoring',
    prompt: {
      role: 'Refactoring reverter',
      task: `Revert any attempted changes for cycle ${args.cycleIndex} and log it as skipped, recording which of the three conditions failed`,
      context: args,
      instructions: [
        'Revert all changes made for this cycle.',
        'Record which conditions failed and why the refactoring was skipped.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['skipped', 'failedConditions', 'reason'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const summaryReportTask = defineTask('summary-report', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Generate summary report',
  agent: {
    name: 'generate-summary-report',
    prompt: {
      role: 'Report generator',
      task: 'Generate a comprehensive summary report listing all circular dependencies found, which were successfully resolved, which were skipped (with reasons), and a before/after comparison of total import count and cycle count for the codebase',
      context: args,
      instructions: [
        'List all circular dependencies found.',
        'Report which were resolved and which were skipped with reasons.',
        'Include before/after import count and cycle count comparison.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: [
        'totalCyclesFound',
        'cyclesResolved',
        'cyclesSkipped',
        'skippedReasons',
        'beforeImportCount',
        'afterImportCount',
        'beforeCycleCount',
        'afterCycleCount',
      ],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export async function process(inputs, ctx) {
  // Step 1: Build the module dependency graph
  const dependencyGraph = await ctx.task(buildDependencyGraphTask, {
    rootDir: inputs.codebasePath,
    includePatterns: ['**/*.ts', '**/*.js'],
    excludePatterns: ['node_modules/**', 'dist/**'],
  });

  // Step 2: Identify all circular dependencies
  const circularDeps = await ctx.task(findCircularDepsTask, {
    algorithm: 'dfs-cycle-detection',
    dependencyGraph,
  });

  // Step 3: Process each circular dependency
  const cycleResults = [];
  for (let cycleIndex = 0; cycleIndex < circularDeps.length; cycleIndex++) {
    const cycle = circularDeps[cycleIndex];

    // 3a: Trace the call chain creating the cycle
    const callChain = await ctx.task(traceCallChainTask, {
      cycleIndex,
      cycle,
    });

    // 3b: Propose a refactoring to break the cycle
    const proposal = await ctx.task(proposeRefactoringTask, {
      cycleIndex,
      callChain,
      cycle,
    });

    // 3c: Conditional — check all 3 conditions before implementing
    // Condition: All three conditions are met: (1) no public API signatures change,
    // (2) all existing tests still pass after the refactoring,
    // (3) the total import count is strictly lower than before
    let implementationResult;
    const conditionsMet =
      proposal.estimatedImpact &&
      proposal.estimatedImpact.noPublicApiChanges &&
      proposal.estimatedImpact.testsPass &&
      proposal.estimatedImpact.reducesImports;

    if (conditionsMet) {
      implementationResult = await ctx.task(implementRefactoringTask, {
        cycleIndex,
        proposal,
        cycle,
      });
    } else {
      implementationResult = await ctx.task(revertRefactoringTask, {
        cycleIndex,
        proposal,
        cycle,
      });
    }

    cycleResults.push({
      cycleIndex,
      cycle,
      callChain,
      proposal,
      result: implementationResult,
    });
  }

  // Step 4: Produce summary report
  const summary = await ctx.task(summaryReportTask, {
    cycleResults,
    dependencyGraph,
  });

  return summary;
}

export const evaluation = {
  completeness: {
    weight: 25,
    criteria:
      'Agent must build the dependency graph, find all cycles, process every cycle (trace, propose, conditionally implement or revert), and produce the final summary report.',
  },
  ordering: {
    weight: 20,
    criteria:
      'Dependency graph must be built before cycle detection. Each cycle must be traced before a refactoring is proposed. The conditional check must precede implementation. The summary report must come last.',
  },
  conditionality: {
    weight: 30,
    criteria:
      'For each cycle the agent must evaluate three conditions: (1) no public API changes, (2) tests pass, (3) fewer imports after refactoring. Only if all three are satisfied should the refactoring be implemented; otherwise the change must be reverted and logged as skipped.',
  },
  errorHandling: {
    weight: 25,
    criteria:
      'An error handler must be registered to revert changes on refactoring failure. The summary must distinguish resolved cycles from skipped ones and include before/after import counts.',
  },
};
