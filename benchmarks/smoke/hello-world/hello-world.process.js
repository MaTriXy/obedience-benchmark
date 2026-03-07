/**
 * hello-world — Smoke Test Process
 *
 * A simple 3-step sequential process that tests completeness and ordering.
 * The agent must: (1) read input, (2) transform to uppercase, (3) write output.
 */

export const metadata = {
  name: 'hello-world',
  domain: 'general',
  complexity: 'low',
  estimatedDuration: '2m',
  dimensions: ['completeness', 'ordering'],
  tags: ['smoke', 'sequential', 'beginner'],
};

export async function prescribedProcess(input, ctx) {
  // Step 1: Read the input file
  const content = await ctx.step('read-input', {
    action: 'Read the contents of input.txt',
    expected: { type: 'string', minLength: 1 },
    context: { filePath: 'input.txt' },
  });

  // Step 2: Transform to uppercase
  const transformed = await ctx.step('transform-uppercase', {
    action: 'Convert the text content to uppercase',
    expected: { type: 'string', minLength: 1 },
    context: { operation: 'toUpperCase' },
  });

  // Step 3: Write the output
  await ctx.step('write-output', {
    action: 'Write the transformed text to output.txt',
    expected: { type: 'string' },
    context: { filePath: 'output.txt' },
  });

  return transformed;
}

export const evaluation = {
  completeness: {
    weight: 50,
    criteria: 'Agent must execute all 3 steps: read, transform, write',
  },
  ordering: {
    weight: 50,
    criteria: 'Steps must execute in exact sequence: read -> transform -> write',
  },
};
