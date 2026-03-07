/**
 * parallel-sum — Smoke Test Process
 *
 * Split-map-combine: sum each number array in parallel, then aggregate.
 * Tests parallelism, completeness, and aggregation.
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'parallel-sum',
  domain: 'general',
  complexity: 'low',
  estimatedDuration: '3m',
  dimensions: ['completeness', 'parallelism', 'aggregation'],
  tags: ['smoke', 'parallel', 'map-reduce'],
};

export const readArrays = defineTask('read-arrays', {
  kind: 'agent',
  title: 'Read the input arrays from data.json',
  agent: {
    name: 'step-executor',
    prompt: {
      role: 'file reader',
      task: 'Read the input arrays from data.json',
      context: 'filePath: data.json',
      instructions: 'Read and parse the JSON file containing arrays of numbers.',
      outputFormat: 'array',
    },
    outputSchema: { type: 'array', minLength: 3 },
  },
  io: {
    inputJsonPath: '$.input',
    outputJsonPath: '$.arrays',
  },
});

export const sumArray0 = defineTask('sum-array-0', {
  kind: 'agent',
  title: 'Sum array 0',
  agent: {
    name: 'data-processor',
    prompt: {
      role: 'array summer',
      task: 'Sum array 0',
      context: 'arrayIndex: 0',
      instructions: 'Compute the sum of all numbers in the given array.',
      outputFormat: 'number',
    },
    outputSchema: { type: 'number' },
  },
  io: {
    inputJsonPath: '$.arrays[0]',
    outputJsonPath: '$.sums[0]',
  },
});

export const sumArray1 = defineTask('sum-array-1', {
  kind: 'agent',
  title: 'Sum array 1',
  agent: {
    name: 'data-processor',
    prompt: {
      role: 'array summer',
      task: 'Sum array 1',
      context: 'arrayIndex: 1',
      instructions: 'Compute the sum of all numbers in the given array.',
      outputFormat: 'number',
    },
    outputSchema: { type: 'number' },
  },
  io: {
    inputJsonPath: '$.arrays[1]',
    outputJsonPath: '$.sums[1]',
  },
});

export const sumArray2 = defineTask('sum-array-2', {
  kind: 'agent',
  title: 'Sum array 2',
  agent: {
    name: 'data-processor',
    prompt: {
      role: 'array summer',
      task: 'Sum array 2',
      context: 'arrayIndex: 2',
      instructions: 'Compute the sum of all numbers in the given array.',
      outputFormat: 'number',
    },
    outputSchema: { type: 'number' },
  },
  io: {
    inputJsonPath: '$.arrays[2]',
    outputJsonPath: '$.sums[2]',
  },
});

export const aggregateTotal = defineTask('aggregate-total', {
  kind: 'agent',
  title: 'Combine all individual sums into a grand total by addition',
  agent: {
    name: 'data-processor',
    prompt: {
      role: 'aggregator',
      task: 'Combine all individual sums into a grand total by addition',
      context: 'operation: sum',
      instructions: 'Add all provided sums together to produce a grand total.',
      outputFormat: 'number',
    },
    outputSchema: { type: 'number' },
  },
  io: {
    inputJsonPath: '$.sums',
    outputJsonPath: '$.total',
  },
});

export const writeResult = defineTask('write-result', {
  kind: 'agent',
  title: 'Write the grand total to result.json',
  agent: {
    name: 'step-executor',
    prompt: {
      role: 'file writer',
      task: 'Write the grand total to result.json',
      context: 'filePath: result.json',
      instructions: 'Write the grand total as a JSON object with a grandTotal field.',
      outputFormat: 'object with requiredFields: grandTotal',
    },
    outputSchema: { type: 'object', requiredFields: ['grandTotal'] },
  },
  io: {
    inputJsonPath: '$.total',
    outputJsonPath: '$.writeResult',
  },
});

export async function process(inputs, ctx) {
  // Step 1: Read the input arrays
  const arrays = await ctx.task(readArrays, inputs);

  // Step 2: Sum each array in parallel
  const sums = await Promise.all([
    ctx.task(sumArray0, { arrays }),
    ctx.task(sumArray1, { arrays }),
    ctx.task(sumArray2, { arrays }),
  ]);

  // Step 3: Aggregate all sums into grand total
  const total = await ctx.task(aggregateTotal, { sums });

  // Step 4: Write result
  await ctx.task(writeResult, { total });

  return total;
}

export const evaluation = {
  completeness: {
    weight: 30,
    criteria: 'Agent must process all arrays and produce the final total',
  },
  parallelism: {
    weight: 40,
    criteria: 'The summing of individual arrays must happen in parallel, not sequentially',
  },
  aggregation: {
    weight: 30,
    criteria: 'Individual sums must be combined into a single grand total via addition',
  },
};
