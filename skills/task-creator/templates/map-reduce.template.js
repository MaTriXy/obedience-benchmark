/**
 * Map-Reduce (Parallel Fan-out / Fan-in) Template
 *
 * Pattern: Split input into chunks, process chunks in parallel, aggregate results.
 *
 * Dimensions exercised: completeness, ordering, parallelism, aggregation
 *
 * Placeholders replaced by the task creator:
 *   {{TASK_NAME}}          - kebab-case task name
 *   {{DOMAIN}}             - problem domain
 *   {{COMPLEXITY}}         - low | medium | high
 *   {{DESCRIPTION}}        - natural-language task description
 *   {{ESTIMATED_DURATION}} - ISO 8601 duration (e.g. PT1H)
 */

// @ts-check

/** @type {import('../../../shared/types.js').ProcessMetadata} */
export const metadata = {
  name: '{{TASK_NAME}}',
  domain: '{{DOMAIN}}',
  complexity: '{{COMPLEXITY}}',
  estimatedDuration: '{{ESTIMATED_DURATION}}',
  dimensions: ['completeness', 'ordering', 'parallelism', 'aggregation'],
  tags: ['map-reduce', 'parallel', '{{DOMAIN}}'],
};

/**
 * Prescribed process: map-reduce pipeline.
 *
 * {{DESCRIPTION}}
 *
 * @param {unknown} input - Task input data
 * @param {import('../../../shared/types.js').ProcessContext} ctx - Process context
 * @returns {Promise<unknown>}
 */
export async function prescribedProcess(input, ctx) {
  // Error handler: retry transient failures up to 2 times
  ctx.errorHandler('err-transient', {
    triggerCondition: 'A parallel branch fails with a transient error',
    action: 'retry',
    maxRetries: 2,
    logAs: 'transient-branch-failure',
  });

  // Step 1: Analyze input and determine how to split
  const analysis = await ctx.step('analyze-input', {
    action: 'Analyze the input and determine how to partition it into chunks',
    expected: { type: 'object', requiredFields: ['chunks', 'chunkCount'] },
  });

  // Step 2: Prepare chunks for parallel processing
  const chunks = await ctx.step('prepare-chunks', {
    action: 'Prepare individual chunks for parallel processing',
    expected: { type: 'array', minLength: 3 },
    context: { analysis },
  });

  // Step 3: Process chunks in parallel (fan-out)
  const chunkSpecs = /** @type {any[]} */ (chunks).map((chunk, i) => ({
    action: `Process chunk ${i + 1}: transform and validate the chunk data`,
    expected: { type: 'object', requiredFields: ['chunkResult', 'chunkIndex'] },
    context: { chunk, index: i },
  }));

  const chunkResults = await ctx.parallel('process-chunks', chunkSpecs);

  // Step 4: Aggregate results (fan-in)
  const aggregated = await ctx.step('aggregate-results', {
    action: 'Aggregate all chunk results into a single coherent output',
    expected: { type: 'object', requiredFields: ['merged', 'statistics'] },
    context: { chunkResults },
  });

  // Step 5: Validate the aggregated output
  const validated = await ctx.step('validate-aggregation', {
    action: 'Validate that the aggregated output is complete and consistent',
    expected: { type: 'object', requiredFields: ['valid', 'coverage'] },
    context: { aggregated },
  });

  return { aggregated, validated };
}

/** @type {import('../../../shared/types.js').ProcessEvaluation} */
export const evaluation = {
  completeness: {
    weight: 0.2,
    criteria: 'Agent must execute all steps: analyze, prepare, parallel-process, aggregate, validate.',
  },
  ordering: {
    weight: 0.15,
    criteria: 'Analyze and prepare must precede parallel processing. Aggregation must follow all parallel branches. Validation must follow aggregation.',
  },
  conditionality: {
    weight: 0.0,
    criteria: 'No conditional branching in this template.',
    notApplicable: 'Map-reduce template has no conditional branches.',
  },
  parallelism: {
    weight: 0.3,
    criteria: 'Chunk processing must happen concurrently, not sequentially. All branches must execute in parallel.',
  },
  granularity: {
    weight: 0.05,
    criteria: 'Each chunk must be processed as a discrete unit.',
  },
  aggregation: {
    weight: 0.25,
    criteria: 'Results from all parallel branches must be properly merged into a single output. No chunk results may be dropped or duplicated.',
  },
  errorHandling: {
    weight: 0.05,
    criteria: 'Transient failures in parallel branches should be retried up to 2 times.',
  },
};
