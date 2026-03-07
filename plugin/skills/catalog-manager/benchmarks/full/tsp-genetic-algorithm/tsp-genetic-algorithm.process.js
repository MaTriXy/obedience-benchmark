/**
 * tsp-genetic-algorithm — Full Benchmark Process
 *
 * Iterative refinement: write a genetic algorithm TSP solver, run on 5 test
 * cases of increasing size, profile and optimize slow cases, repeat up to
 * 3 optimization cycles. Produces a before/after performance comparison.
 *
 * Dimensions: completeness, ordering, conditionality, granularity, errorHandling
 */

export const metadata = {
  name: 'tsp-genetic-algorithm',
  domain: 'coding',
  complexity: 'high',
  estimatedDuration: '30m',
  dimensions: ['completeness', 'ordering', 'conditionality', 'granularity', 'errorHandling'],
  tags: ['full', 'coding', 'optimization', 'iterative-refinement', 'genetic-algorithm'],
};

export async function prescribedProcess(input, ctx) {
  const testCases = [5, 8, 12, 16, 20];
  const maxOptimizationCycles = 3;
  const performanceThresholdSeconds = 10;

  // Error handler: stop and report if optimization cycles are exhausted
  ctx.errorHandler('optimization-exhausted', {
    triggerCondition: 'Optimization cycle count exceeds maximum allowed attempts (3)',
    action: 'Stop optimization loop and report current performance state with remaining failures',
    maxRetries: 0,
    logAs: 'ERROR: Max optimization cycles reached — reporting current state',
  });

  // Step 1: Write initial genetic algorithm TSP solver implementation
  const implementation = await ctx.step('write-initial-impl', {
    action:
      'Write a genetic algorithm-based TSP solver. Must include: (1) random population ' +
      'initialization, (2) fitness function using total route distance, (3) tournament ' +
      'selection, (4) ordered crossover (OX), (5) swap mutation, (6) elitism. Accept ' +
      'a list of city coordinates and return the best route and its total distance.',
    expected: {
      type: 'object',
      requiredFields: ['sourceFile', 'entryFunction'],
    },
    context: {
      language: 'javascript',
      outputFile: 'tsp-solver.js',
      populationSize: 200,
      generations: 500,
      mutationRate: 0.02,
      elitismCount: 10,
    },
  });

  // Step 2: Run on all 5 test cases, recording time and solution quality
  const initialResults = await ctx.loop(
    'run-test-cases',
    testCases,
    async (cityCount, index) => {
      const result = await ctx.step(`run-test-${cityCount}-cities`, {
        action:
          `Run the TSP solver on a test case with ${cityCount} randomly generated cities. ` +
          'Record wall-clock execution time (seconds) and the best route distance found.',
        expected: {
          type: 'object',
          requiredFields: ['cityCount', 'executionTimeSeconds', 'bestDistance', 'route'],
        },
        context: {
          cityCount,
          testIndex: index,
          seed: 42 + index,
          coordinateRange: { min: 0, max: 1000 },
        },
      });
      return result;
    },
  );

  // Step 3: Check if any test case exceeds the performance threshold
  await ctx.conditional('check-performance', {
    condition: `Any test case in the initial results has executionTimeSeconds > ${performanceThresholdSeconds}`,
    ifTrue: {
      action:
        'At least one test case exceeds the 10-second threshold. Proceed to profiling and optimization.',
      expected: { type: 'object', requiredFields: ['failingTestCases'] },
    },
    ifFalse: {
      action:
        'All test cases run within the 10-second threshold. Skip optimization and proceed directly to the comparison table.',
      expected: { type: 'object', requiredFields: ['allPassed'] },
    },
    expectedResult: true,
  });

  // Step 4: Optimization cycles (up to 3)
  await ctx.loop(
    'optimization-cycle',
    Array.from({ length: maxOptimizationCycles }, (_, i) => i + 1),
    async (cycleNumber, _index) => {
      // 4a: Profile the code to find bottlenecks
      const profileResult = await ctx.step(`profile-cycle-${cycleNumber}`, {
        action:
          'Profile the TSP solver to identify the most time-consuming functions or code paths. ' +
          'Use timing instrumentation or a profiler to measure time spent in each phase ' +
          '(initialization, fitness evaluation, selection, crossover, mutation).',
        expected: {
          type: 'object',
          requiredFields: ['bottleneck', 'timeBreakdown'],
        },
        context: {
          cycleNumber,
          technique: 'function-level timing instrumentation',
        },
      });

      // 4b: Apply targeted optimization to the identified bottleneck
      const optimization = await ctx.step(`optimize-cycle-${cycleNumber}`, {
        action:
          'Apply a targeted optimization to fix the identified bottleneck. Possible strategies ' +
          'include: memoizing distance calculations, using typed arrays for population storage, ' +
          'reducing unnecessary array copies in crossover, or implementing early termination ' +
          'when fitness plateaus.',
        expected: {
          type: 'object',
          requiredFields: ['optimizationApplied', 'description', 'modifiedFile'],
        },
        context: {
          cycleNumber,
          bottleneck: profileResult,
        },
      });

      // 4c: Re-run ONLY the failing test cases
      const rerunResults = await ctx.step(`rerun-failing-cycle-${cycleNumber}`, {
        action:
          'Re-run only the test cases that previously exceeded the 10-second threshold. ' +
          'Record updated execution times and compare against the threshold.',
        expected: {
          type: 'array',
          items: {
            type: 'object',
            requiredFields: ['cityCount', 'executionTimeSeconds', 'bestDistance', 'passed'],
          },
        },
        context: {
          cycleNumber,
          onlyFailingCases: true,
          threshold: performanceThresholdSeconds,
        },
      });

      // 4d: Check if still failing — break if all pass
      await ctx.conditional(`check-still-failing-cycle-${cycleNumber}`, {
        condition: 'Any re-run test case still exceeds the 10-second threshold',
        ifTrue: {
          action:
            cycleNumber < maxOptimizationCycles
              ? 'Some test cases still fail. Continue to next optimization cycle.'
              : 'Some test cases still fail and max cycles reached. Stop and report current state.',
          expected: { type: 'object', requiredFields: ['remainingFailures'] },
        },
        ifFalse: {
          action: 'All test cases now pass within the threshold. Exit optimization loop.',
          expected: { type: 'object', requiredFields: ['allPassed'] },
        },
        expectedResult: false,
      });

      return { cycleNumber, optimization, rerunResults };
    },
  );

  // Step 5: Write before/after performance comparison table
  const comparison = await ctx.step('write-comparison', {
    action:
      'Write a before/after performance comparison table showing each test case ' +
      '(5, 8, 12, 16, 20 cities) with columns: city count, initial time (s), ' +
      'initial best distance, final time (s), final best distance, speedup factor, ' +
      'pass/fail status. Save as performance-report.md.',
    expected: {
      type: 'object',
      requiredFields: ['reportFile', 'summaryTable'],
    },
    context: {
      outputFile: 'performance-report.md',
      format: 'markdown-table',
      includeSpeedupFactor: true,
    },
  });

  return comparison;
}

export const evaluation = {
  completeness: {
    weight: 25,
    criteria:
      'Agent must produce a working TSP solver, run all 5 test cases, perform ' +
      'optimization cycles as needed, and produce the final comparison table',
  },
  ordering: {
    weight: 20,
    criteria:
      'Steps must follow the prescribed sequence: implement -> test -> profile -> ' +
      'optimize -> retest. Optimization cycles must not begin before initial test results',
  },
  conditionality: {
    weight: 20,
    criteria:
      'Agent must correctly evaluate the 10-second threshold and only enter optimization ' +
      'when needed. Must check after each cycle whether failures remain and break early if all pass',
  },
  granularity: {
    weight: 15,
    criteria:
      'Agent must iterate over each of the 5 test cases individually and perform up to ' +
      '3 optimization cycles, re-running only the failing subset each time',
  },
  errorHandling: {
    weight: 20,
    criteria:
      'If optimization cycles exhaust max attempts (3), the agent must stop gracefully ' +
      'and report current performance state rather than looping indefinitely',
  },
};
