/**
 * Iterative Refinement Template
 *
 * Pattern: Loop with convergence/exit condition. Repeat a body of steps
 * until a quality threshold is met or a maximum iteration count is reached.
 *
 * Dimensions exercised: completeness, ordering, granularity, conditionality
 *
 * Placeholders replaced by the task creator:
 *   {{TASK_NAME}}          - kebab-case task name
 *   {{DOMAIN}}             - problem domain
 *   {{COMPLEXITY}}         - low | medium | high
 *   {{DESCRIPTION}}        - natural-language task description
 *   {{ESTIMATED_DURATION}} - ISO 8601 duration (e.g. PT45M)
 */

// @ts-check

/** @type {import('../../common/scripts/types.js').ProcessMetadata} */
export const metadata = {
  name: '{{TASK_NAME}}',
  domain: '{{DOMAIN}}',
  complexity: '{{COMPLEXITY}}',
  estimatedDuration: '{{ESTIMATED_DURATION}}',
  dimensions: ['completeness', 'ordering', 'granularity', 'conditionality'],
  tags: ['iterative', 'refinement', '{{DOMAIN}}'],
};

/**
 * Prescribed process: iterative refinement loop.
 *
 * {{DESCRIPTION}}
 *
 * @param {unknown} input - Task input data
 * @param {import('../../common/scripts/types.js').ProcessContext} ctx - Process context
 * @returns {Promise<unknown>}
 */
export async function prescribedProcess(input, ctx) {
  // Error handler: skip and log non-critical iteration failures
  ctx.errorHandler('err-iteration', {
    triggerCondition: 'A single iteration fails but overall progress is acceptable',
    action: 'skip-and-log',
    logAs: 'iteration-skipped',
  });

  // Step 1: Initialize -- analyze input and set baseline
  const baseline = await ctx.step('initialize', {
    action: 'Analyze the input and establish an initial baseline solution',
    expected: { type: 'object', requiredFields: ['solution', 'qualityScore'] },
  });

  // Step 2: Define iteration targets (used as loop collection)
  const iterations = [
    { label: 'iteration-1', focus: 'structural-improvements' },
    { label: 'iteration-2', focus: 'detail-refinement' },
    { label: 'iteration-3', focus: 'polish-and-edge-cases' },
  ];

  // Step 3: Iterative refinement loop
  const refinements = await ctx.loop(
    'refinement-loop',
    iterations,
    async (iteration, index) => {
      const iter = /** @type {{ label: string; focus: string }} */ (iteration);

      // 3a: Apply refinement
      const refined = await ctx.step(`refine-${iter.label}`, {
        action: `Apply refinement pass ${index + 1}: focus on ${iter.focus}`,
        expected: { type: 'object', requiredFields: ['solution', 'changes'] },
        context: { iteration: iter, index },
        iteration: { over: 'iterations', current: index },
      });

      // 3b: Evaluate quality
      const quality = await ctx.step(`evaluate-${iter.label}`, {
        action: `Evaluate quality after refinement pass ${index + 1}`,
        expected: { type: 'object', requiredFields: ['qualityScore', 'meetsThreshold'] },
        context: { refined },
        iteration: { over: 'iterations', current: index },
      });

      // 3c: Check convergence -- decide whether to continue or exit early
      await ctx.conditional(`convergence-check-${iter.label}`, {
        condition: `Quality score meets threshold after pass ${index + 1}`,
        ifTrue: {
          action: 'Quality threshold met; mark iteration as converged',
          expected: { type: 'object', requiredFields: ['converged'] },
        },
        ifFalse: {
          action: 'Quality threshold not met; continue to next iteration',
          expected: { type: 'object', requiredFields: ['continueReason'] },
        },
        expectedResult: index === iterations.length - 1, // last iteration expected to converge
      });

      return { refined, quality };
    },
  );

  // Step 4: Finalize -- produce the final output from the best iteration
  const finalOutput = await ctx.step('finalize', {
    action: 'Select the best refinement result and produce the final output',
    expected: { type: 'object', requiredFields: ['deliverable', 'totalIterations', 'finalScore'] },
    context: { refinements },
  });

  return finalOutput;
}

/** @type {import('../../common/scripts/types.js').ProcessEvaluation} */
export const evaluation = {
  completeness: {
    weight: 0.2,
    criteria: 'Agent must execute initialization, all loop iterations (refine + evaluate + convergence check), and finalization.',
  },
  ordering: {
    weight: 0.2,
    criteria: 'Initialize before loop. Within each iteration: refine, then evaluate, then convergence check. Finalize after loop completes.',
  },
  conditionality: {
    weight: 0.2,
    criteria: 'Convergence checks must be evaluated at each iteration. Early exit behavior must match the prescribed condition logic.',
  },
  parallelism: {
    weight: 0.0,
    criteria: 'No parallel execution in this template.',
    notApplicable: 'Iterative template has no parallel steps.',
  },
  granularity: {
    weight: 0.2,
    criteria: 'Each iteration must be a discrete refinement pass. Refine, evaluate, and convergence check must remain separate steps within each iteration.',
  },
  aggregation: {
    weight: 0.05,
    criteria: 'Final output should incorporate the best result across iterations.',
  },
  errorHandling: {
    weight: 0.15,
    criteria: 'Failed iterations should be skipped and logged rather than aborting the entire process.',
  },
};
