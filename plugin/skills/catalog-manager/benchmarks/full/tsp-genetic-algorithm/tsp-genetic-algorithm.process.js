/**
 * tsp-genetic-algorithm — Full Benchmark Process
 *
 * Iterative refinement: write a genetic algorithm TSP solver, run on 5 test
 * cases of increasing size, profile and optimize slow cases, repeat up to
 * 3 optimization cycles. Produces a before/after performance comparison.
 *
 * Dimensions: completeness, ordering, conditionality, granularity, errorHandling
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'tsp-genetic-algorithm',
  domain: 'coding',
  complexity: 'high',
  estimatedDuration: '30m',
  dimensions: ['completeness', 'ordering', 'conditionality', 'granularity', 'errorHandling'],
  tags: ['full', 'coding', 'optimization', 'iterative-refinement', 'genetic-algorithm'],
};

export const errorHandlers = [
  {
    id: 'optimization-exhausted',
    triggerCondition: 'Optimization cycle count exceeds maximum allowed attempts (3)',
    action: 'Stop optimization loop and report current performance state with remaining failures',
    maxRetries: 0,
    logAs: 'ERROR: Max optimization cycles reached — reporting current state',
  },
];

export const writeInitialImpl = defineTask('write-initial-impl', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Write initial genetic algorithm TSP solver implementation',
  agent: {
    name: 'write-tsp-solver',
    prompt: {
      role: 'software-engineer',
      task: 'Write a genetic algorithm-based TSP solver. Must include: (1) random population initialization, (2) fitness function using total route distance, (3) tournament selection, (4) ordered crossover (OX), (5) swap mutation, (6) elitism. Accept a list of city coordinates and return the best route and its total distance.',
      context: args,
      instructions: [
        'Implement random population initialization',
        'Implement fitness function using total route distance',
        'Implement tournament selection',
        'Implement ordered crossover (OX)',
        'Implement swap mutation',
        'Implement elitism',
        'Accept city coordinates and return best route and total distance',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['sourceFile', 'entryFunction'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const runTestCase = defineTask('run-test-case', (args, taskCtx) => ({
  kind: 'agent',
  title: `Run TSP solver on test case with ${args.cityCount} cities`,
  agent: {
    name: 'run-tsp-test',
    prompt: {
      role: 'test-runner',
      task: `Run the TSP solver on a test case with ${args.cityCount} randomly generated cities. Record wall-clock execution time (seconds) and the best route distance found.`,
      context: args,
      instructions: [
        `Generate ${args.cityCount} random cities using the provided seed`,
        'Run the TSP solver on the generated cities',
        'Record wall-clock execution time in seconds',
        'Record the best route distance found',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['cityCount', 'executionTimeSeconds', 'bestDistance', 'route'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const checkPerformancePass = defineTask('check-performance-pass', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Check if all test cases pass the performance threshold',
  agent: {
    name: 'check-performance-threshold',
    prompt: {
      role: 'performance-analyst',
      task: 'All test cases run within the 10-second threshold. Skip optimization and proceed directly to the comparison table.',
      context: args,
      instructions: [
        'Confirm all test cases are within the threshold',
        'Return allPassed confirmation',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['allPassed'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const checkPerformanceFail = defineTask('check-performance-fail', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Identify test cases exceeding performance threshold',
  agent: {
    name: 'identify-failing-tests',
    prompt: {
      role: 'performance-analyst',
      task: 'At least one test case exceeds the 10-second threshold. Proceed to profiling and optimization.',
      context: args,
      instructions: [
        'Identify all test cases that exceed the 10-second threshold',
        'Return list of failing test cases',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['failingTestCases'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const profileCycle = defineTask('profile-cycle', (args, taskCtx) => ({
  kind: 'agent',
  title: `Profile TSP solver — optimization cycle ${args.cycleNumber}`,
  agent: {
    name: 'profile-tsp-solver',
    prompt: {
      role: 'performance-profiler',
      task: 'Profile the TSP solver to identify the most time-consuming functions or code paths. Use timing instrumentation or a profiler to measure time spent in each phase (initialization, fitness evaluation, selection, crossover, mutation).',
      context: args,
      instructions: [
        'Instrument or profile the TSP solver code',
        'Measure time spent in each phase',
        'Identify the primary bottleneck',
        'Return bottleneck and time breakdown',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['bottleneck', 'timeBreakdown'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const optimizeCycle = defineTask('optimize-cycle', (args, taskCtx) => ({
  kind: 'agent',
  title: `Apply targeted optimization — cycle ${args.cycleNumber}`,
  agent: {
    name: 'optimize-tsp-bottleneck',
    prompt: {
      role: 'performance-optimizer',
      task: 'Apply a targeted optimization to fix the identified bottleneck. Possible strategies include: memoizing distance calculations, using typed arrays for population storage, reducing unnecessary array copies in crossover, or implementing early termination when fitness plateaus.',
      context: args,
      instructions: [
        'Analyze the identified bottleneck',
        'Choose an appropriate optimization strategy',
        'Apply the optimization to the code',
        'Return description of optimization applied',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['optimizationApplied', 'description', 'modifiedFile'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const rerunFailingTests = defineTask('rerun-failing-tests', (args, taskCtx) => ({
  kind: 'agent',
  title: `Re-run failing test cases — cycle ${args.cycleNumber}`,
  agent: {
    name: 'rerun-failing-tsp-tests',
    prompt: {
      role: 'test-runner',
      task: 'Re-run only the test cases that previously exceeded the 10-second threshold. Record updated execution times and compare against the threshold.',
      context: args,
      instructions: [
        'Re-run only the previously failing test cases',
        'Record updated execution times',
        'Compare each result against the 10-second threshold',
        'Mark each as pass/fail',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['results'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const checkStillFailingContinue = defineTask('check-still-failing-continue', (args, taskCtx) => ({
  kind: 'agent',
  title: `Check remaining failures — cycle ${args.cycleNumber}`,
  agent: {
    name: 'check-remaining-failures',
    prompt: {
      role: 'performance-analyst',
      task: args.cycleNumber < args.maxCycles
        ? 'Some test cases still fail. Continue to next optimization cycle.'
        : 'Some test cases still fail and max cycles reached. Stop and report current state.',
      context: args,
      instructions: [
        'Identify which test cases still exceed the threshold',
        'Return list of remaining failures',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['remainingFailures'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const checkStillFailingAllPass = defineTask('check-still-failing-all-pass', (args, taskCtx) => ({
  kind: 'agent',
  title: 'All test cases now pass within threshold',
  agent: {
    name: 'confirm-all-pass',
    prompt: {
      role: 'performance-analyst',
      task: 'All test cases now pass within the threshold. Exit optimization loop.',
      context: args,
      instructions: [
        'Confirm all test cases pass within the 10-second threshold',
        'Return allPassed confirmation',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['allPassed'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const writeComparison = defineTask('write-comparison', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Write before/after performance comparison table',
  agent: {
    name: 'write-performance-comparison',
    prompt: {
      role: 'report-generator',
      task: 'Write a before/after performance comparison table showing each test case (5, 8, 12, 16, 20 cities) with columns: city count, initial time (s), initial best distance, final time (s), final best distance, speedup factor, pass/fail status. Save as performance-report.md.',
      context: args,
      instructions: [
        'Create a markdown table with all test cases',
        'Include columns for city count, initial time, initial distance, final time, final distance, speedup factor, status',
        'Compute speedup factor for each test case',
        'Save as performance-report.md',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['reportFile', 'summaryTable'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export async function process(inputs, ctx) {
  const testCases = [5, 8, 12, 16, 20];
  const maxOptimizationCycles = 3;
  const performanceThresholdSeconds = 10;

  // Step 1: Write initial genetic algorithm TSP solver implementation
  const implementation = await ctx.task(writeInitialImpl, {
    language: 'javascript',
    outputFile: 'tsp-solver.js',
    populationSize: 200,
    generations: 500,
    mutationRate: 0.02,
    elitismCount: 10,
  });

  // Step 2: Run on all 5 test cases, recording time and solution quality
  const initialResults = [];
  for (let index = 0; index < testCases.length; index++) {
    const cityCount = testCases[index];
    const result = await ctx.task(runTestCase, {
      cityCount,
      testIndex: index,
      seed: 42 + index,
      coordinateRange: { min: 0, max: 1000 },
    });
    initialResults.push(result);
  }

  // Step 3: Check if any test case exceeds the performance threshold
  const hasFailures = initialResults.some(r => r.executionTimeSeconds > performanceThresholdSeconds);
  if (hasFailures) {
    await ctx.task(checkPerformanceFail, { initialResults, threshold: performanceThresholdSeconds });
  } else {
    await ctx.task(checkPerformancePass, { initialResults, threshold: performanceThresholdSeconds });
  }

  // Step 4: Optimization cycles (up to 3)
  for (let cycleNumber = 1; cycleNumber <= maxOptimizationCycles; cycleNumber++) {
    // 4a: Profile the code to find bottlenecks
    const profileResult = await ctx.task(profileCycle, {
      cycleNumber,
      technique: 'function-level timing instrumentation',
    });

    // 4b: Apply targeted optimization to the identified bottleneck
    const optimization = await ctx.task(optimizeCycle, {
      cycleNumber,
      bottleneck: profileResult,
    });

    // 4c: Re-run ONLY the failing test cases
    const rerunResults = await ctx.task(rerunFailingTests, {
      cycleNumber,
      onlyFailingCases: true,
      threshold: performanceThresholdSeconds,
    });

    // 4d: Check if still failing — break if all pass
    const stillFailing = rerunResults.results && rerunResults.results.some(r => !r.passed);
    if (stillFailing) {
      await ctx.task(checkStillFailingContinue, {
        cycleNumber,
        maxCycles: maxOptimizationCycles,
        rerunResults,
      });
    } else {
      await ctx.task(checkStillFailingAllPass, { rerunResults });
      break;
    }
  }

  // Step 5: Write before/after performance comparison table
  const comparison = await ctx.task(writeComparison, {
    outputFile: 'performance-report.md',
    format: 'markdown-table',
    includeSpeedupFactor: true,
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
