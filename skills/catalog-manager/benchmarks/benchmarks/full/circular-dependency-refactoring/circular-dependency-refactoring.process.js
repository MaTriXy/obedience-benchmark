/**
 * circular-dependency-refactoring — Full Benchmark Process
 *
 * Conditional refactoring pipeline with rollback. Build a dependency graph,
 * detect circular dependencies, propose and conditionally apply refactorings,
 * revert on failure, and produce a summary report.
 *
 * Dimensions: completeness, ordering, conditionality, errorHandling
 */

export const metadata = {
  name: 'circular-dependency-refactoring',
  domain: 'coding',
  complexity: 'high',
  estimatedDuration: '20m',
  dimensions: ['completeness', 'ordering', 'conditionality', 'errorHandling'],
  tags: ['full', 'coding', 'conditional', 'error-handling', 'refactoring'],
};

export async function prescribedProcess(input, ctx) {
  // Register error handler for refactoring failures
  ctx.errorHandler('handle-refactoring-failure', {
    triggerCondition: 'Refactoring causes a build failure, test failure, or file-system error',
    action: 'revert',
    maxRetries: 0,
    logAs: 'ERROR: Refactoring failed — reverting all changes for this cycle',
  });

  // Step 1: Build the module dependency graph
  const dependencyGraph = await ctx.step('build-dependency-graph', {
    action: 'Scan the codebase and build a directed dependency graph of all modules, recording each import/require relationship with source file, target module, and import type (named, default, dynamic)',
    expected: {
      type: 'object',
      requiredFields: ['nodes', 'edges', 'totalModules', 'totalEdges'],
    },
    context: {
      rootDir: input.codebasePath,
      includePatterns: ['**/*.ts', '**/*.js'],
      excludePatterns: ['node_modules/**', 'dist/**'],
    },
  });

  // Step 2: Identify all circular dependencies
  const circularDeps = await ctx.step('find-circular-deps', {
    action: 'Analyze the dependency graph to identify all circular dependency cycles using depth-first search. Return each cycle as an ordered list of module paths forming the loop.',
    expected: {
      type: 'array',
    },
    context: {
      algorithm: 'dfs-cycle-detection',
      dependencyGraph,
    },
  });

  // Step 3: Process each circular dependency
  const cycleResults = await ctx.loop('process-cycles', circularDeps, async (cycle, cycleIndex) => {
    // 3a: Trace the call chain creating the cycle
    const callChain = await ctx.step(`trace-call-chain-${cycleIndex}`, {
      action: `Trace the exact call chain that creates circular dependency cycle ${cycleIndex}: identify which exported symbols are used at each edge of the cycle and why the dependency exists`,
      expected: {
        type: 'object',
        requiredFields: ['chain', 'rootCause', 'involvedSymbols'],
      },
      context: {
        cycleIndex,
        cycle,
      },
    });

    // 3b: Propose a refactoring to break the cycle
    const proposal = await ctx.step(`propose-refactoring-${cycleIndex}`, {
      action: `Propose a refactoring strategy to break circular dependency cycle ${cycleIndex}. Consider approaches: extract shared interface, dependency inversion, lazy imports, or module merging. Include the specific file changes required.`,
      expected: {
        type: 'object',
        requiredFields: ['strategy', 'fileChanges', 'estimatedImpact'],
      },
      context: {
        cycleIndex,
        callChain,
        cycle,
      },
    });

    // 3c: Conditional — check all 3 conditions before implementing
    const implementationResult = await ctx.conditional(`check-conditions-${cycleIndex}`, {
      condition: 'All three conditions are met: (1) no public API signatures change, (2) all existing tests still pass after the refactoring, (3) the total import count is strictly lower than before',
      ifTrue: {
        action: `Implement the proposed refactoring for cycle ${cycleIndex}: apply all file changes from the proposal, update imports across the codebase, and verify the cycle is broken`,
        expected: {
          type: 'object',
          requiredFields: ['filesModified', 'importsRemoved', 'cycleResolved'],
        },
      },
      ifFalse: {
        action: `Revert any attempted changes for cycle ${cycleIndex} and log it as skipped, recording which of the three conditions failed`,
        expected: {
          type: 'object',
          requiredFields: ['skipped', 'failedConditions', 'reason'],
        },
      },
      expectedResult: true,
    });

    return {
      cycleIndex,
      cycle,
      callChain,
      proposal,
      result: implementationResult,
    };
  });

  // Step 4: Produce summary report
  const summary = await ctx.step('summary-report', {
    action: 'Generate a comprehensive summary report listing all circular dependencies found, which were successfully resolved, which were skipped (with reasons), and a before/after comparison of total import count and cycle count for the codebase',
    expected: {
      type: 'object',
      requiredFields: [
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
    context: {
      cycleResults,
      dependencyGraph,
    },
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
