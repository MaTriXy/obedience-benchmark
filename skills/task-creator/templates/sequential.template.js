/**
 * Sequential Pipeline Template
 *
 * Pattern: Linear step-by-step process (A -> B -> C -> D).
 * Each step depends on the output of the previous step.
 *
 * Dimensions exercised: completeness, ordering, granularity, errorHandling
 *
 * Placeholders replaced by the task creator:
 *   {{TASK_NAME}}        - kebab-case task name
 *   {{DOMAIN}}           - problem domain
 *   {{COMPLEXITY}}       - low | medium | high
 *   {{DESCRIPTION}}      - natural-language task description
 *   {{ESTIMATED_DURATION}} - ISO 8601 duration (e.g. PT30M)
 */

// @ts-check

/** @type {import('../../../shared/types.js').ProcessMetadata} */
export const metadata = {
  name: '{{TASK_NAME}}',
  domain: '{{DOMAIN}}',
  complexity: '{{COMPLEXITY}}',
  estimatedDuration: '{{ESTIMATED_DURATION}}',
  dimensions: ['completeness', 'ordering', 'granularity', 'errorHandling'],
  tags: ['sequential', '{{DOMAIN}}'],
};

/**
 * Prescribed process: sequential pipeline.
 *
 * {{DESCRIPTION}}
 *
 * @param {unknown} input - Task input data
 * @param {import('../../../shared/types.js').ProcessContext} ctx - Process context
 * @returns {Promise<unknown>}
 */
export async function prescribedProcess(input, ctx) {
  // Error handler: revert on critical failure
  ctx.errorHandler('err-critical', {
    triggerCondition: 'Any step fails with an unrecoverable error',
    action: 'revert',
    logAs: 'critical-failure',
  });

  // Step 1: Analyze input
  const analysis = await ctx.step('analyze-input', {
    action: 'Analyze the input data and identify processing requirements',
    expected: { type: 'object', requiredFields: ['summary', 'requirements'] },
  });

  // Step 2: Plan execution
  const plan = await ctx.step('plan-execution', {
    action: 'Create an execution plan based on the analysis',
    expected: { type: 'object', requiredFields: ['steps', 'estimatedEffort'] },
    context: { analysis },
  });

  // Step 3: Execute the plan
  const result = await ctx.step('execute-plan', {
    action: 'Execute the plan step by step, producing intermediate outputs',
    expected: { type: 'object', requiredFields: ['output', 'status'] },
    context: { plan },
  });

  // Step 4: Validate output
  const validation = await ctx.step('validate-output', {
    action: 'Validate the output against the requirements from analysis',
    expected: { type: 'object', requiredFields: ['valid', 'issues'] },
    context: { result, requirements: analysis },
  });

  // Step 5: Finalize
  const finalOutput = await ctx.step('finalize', {
    action: 'Produce the final output, incorporating any validation feedback',
    expected: { type: 'object', requiredFields: ['deliverable'] },
    context: { result, validation },
  });

  return finalOutput;
}

/** @type {import('../../../shared/types.js').ProcessEvaluation} */
export const evaluation = {
  completeness: {
    weight: 0.25,
    criteria: 'Agent must execute all 5 steps: analyze, plan, execute, validate, finalize.',
  },
  ordering: {
    weight: 0.25,
    criteria: 'Steps must execute in strict sequential order. No step may begin before its predecessor completes.',
  },
  conditionality: {
    weight: 0.05,
    criteria: 'No conditional branching in this template.',
    notApplicable: 'Sequential template has no conditional branches.',
  },
  parallelism: {
    weight: 0.05,
    criteria: 'No parallel execution in this template.',
    notApplicable: 'Sequential template has no parallel steps.',
  },
  granularity: {
    weight: 0.2,
    criteria: 'Each step should be executed at the prescribed granularity -- not merged with adjacent steps or split into sub-steps.',
  },
  aggregation: {
    weight: 0.0,
    criteria: 'No aggregation in this template.',
    notApplicable: 'Sequential template has no aggregation.',
  },
  errorHandling: {
    weight: 0.2,
    criteria: 'Agent must respect the error handler: revert on critical failure.',
  },
};
