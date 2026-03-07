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

import { defineTask } from '@a5c-ai/babysitter-sdk';

/** @type {import('../../obedience-types/scripts/types.js').ProcessMetadata} */
export const metadata = {
  name: '{{TASK_NAME}}',
  domain: '{{DOMAIN}}',
  complexity: '{{COMPLEXITY}}',
  estimatedDuration: '{{ESTIMATED_DURATION}}',
  dimensions: ['completeness', 'ordering', 'parallelism', 'aggregation'],
  tags: ['map-reduce', 'parallel', '{{DOMAIN}}'],
};

export const errorHandlers = [
  {
    id: 'err-transient',
    triggerCondition: 'A parallel branch fails with a transient error',
    action: 'retry',
    maxRetries: 2,
    logAs: 'transient-branch-failure',
  },
];

export const analyzeInputTask = defineTask('analyze-input', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Analyze input for chunking',
  agent: {
    name: 'chunk-analyzer',
    prompt: {
      role: 'Data analyst',
      task: 'Analyze the input and determine how to partition it into chunks',
      context: args,
      instructions: ['Examine data structure', 'Determine chunk boundaries', 'Count chunks'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['chunks', 'chunkCount'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const prepareChunksTask = defineTask('prepare-chunks', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Prepare chunks for processing',
  agent: {
    name: 'chunk-preparer',
    prompt: {
      role: 'Data preparer',
      task: 'Prepare individual chunks for parallel processing',
      context: args,
      instructions: ['Split input into chunks', 'Validate each chunk', 'Return chunk array'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'array' },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const processChunkTask = defineTask('process-chunk', (args, taskCtx) => ({
  kind: 'agent',
  title: `Process chunk ${args.index}`,
  agent: {
    name: 'chunk-processor',
    prompt: {
      role: 'Data processor',
      task: `Process chunk ${args.index}: transform and validate the chunk data`,
      context: args,
      instructions: ['Transform chunk data', 'Validate result', 'Return processed chunk'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['chunkResult', 'chunkIndex'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const aggregateResultsTask = defineTask('aggregate-results', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Aggregate chunk results',
  agent: {
    name: 'result-aggregator',
    prompt: {
      role: 'Data aggregator',
      task: 'Aggregate all chunk results into a single coherent output',
      context: args,
      instructions: ['Merge all chunk results', 'Compute statistics', 'Ensure completeness'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['merged', 'statistics'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const validateAggregationTask = defineTask('validate-aggregation', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Validate aggregated output',
  agent: {
    name: 'aggregation-validator',
    prompt: {
      role: 'Quality validator',
      task: 'Validate that the aggregated output is complete and consistent',
      context: args,
      instructions: ['Check completeness', 'Verify consistency', 'Report coverage'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['valid', 'coverage'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

/**
 * {{DESCRIPTION}}
 */
export async function process(inputs, ctx) {
  const analysis = await ctx.task(analyzeInputTask, { input: inputs });
  const chunks = await ctx.task(prepareChunksTask, { analysis });

  // Process chunks in parallel (fan-out)
  const chunkResults = await Promise.all(
    chunks.map((chunk, i) => ctx.task(processChunkTask, { chunk, index: i })),
  );

  // Aggregate results (fan-in)
  const aggregated = await ctx.task(aggregateResultsTask, { chunkResults });
  const validated = await ctx.task(validateAggregationTask, { aggregated });

  return { aggregated, validated };
}

/** @type {import('../../obedience-types/scripts/types.js').ProcessEvaluation} */
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
