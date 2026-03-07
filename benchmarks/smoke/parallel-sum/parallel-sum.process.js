/**
 * parallel-sum — Smoke Test Process
 *
 * Split-map-combine: sum each number array in parallel, then aggregate.
 * Tests parallelism, completeness, and aggregation.
 */

export const metadata = {
  name: 'parallel-sum',
  domain: 'general',
  complexity: 'low',
  estimatedDuration: '3m',
  dimensions: ['completeness', 'parallelism', 'aggregation'],
  tags: ['smoke', 'parallel', 'map-reduce'],
};

export async function prescribedProcess(input, ctx) {
  // Step 1: Read the input arrays
  const arrays = await ctx.step('read-arrays', {
    action: 'Read the input arrays from data.json',
    expected: {
      type: 'array',
      minLength: 3,
    },
    context: { filePath: 'data.json' },
  });

  // Step 2: Sum each array in parallel
  const sums = await ctx.parallel('sum-arrays', [
    {
      action: 'Sum array 0',
      expected: { type: 'number' },
      context: { arrayIndex: 0 },
    },
    {
      action: 'Sum array 1',
      expected: { type: 'number' },
      context: { arrayIndex: 1 },
    },
    {
      action: 'Sum array 2',
      expected: { type: 'number' },
      context: { arrayIndex: 2 },
    },
  ]);

  // Step 3: Aggregate all sums into grand total
  const total = await ctx.step('aggregate-total', {
    action: 'Combine all individual sums into a grand total by addition',
    expected: { type: 'number' },
    context: { operation: 'sum' },
  });

  // Step 4: Write result
  await ctx.step('write-result', {
    action: 'Write the grand total to result.json',
    expected: { type: 'object', requiredFields: ['grandTotal'] },
    context: { filePath: 'result.json' },
  });

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
