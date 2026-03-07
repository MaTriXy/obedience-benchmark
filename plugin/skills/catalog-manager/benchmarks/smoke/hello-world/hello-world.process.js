/**
 * hello-world — Smoke Test Process
 *
 * A simple 3-step sequential process that tests completeness and ordering.
 * The agent must: (1) read input, (2) transform to uppercase, (3) write output.
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'hello-world',
  domain: 'general',
  complexity: 'low',
  estimatedDuration: '2m',
  dimensions: ['completeness', 'ordering'],
  tags: ['smoke', 'sequential', 'beginner'],
};

export const readInput = defineTask('read-input', {
  kind: 'agent',
  title: 'Read the contents of input.txt',
  agent: {
    name: 'step-executor',
    prompt: {
      role: 'file reader',
      task: 'Read the contents of input.txt',
      context: 'filePath: input.txt',
      instructions: 'Read the file and return its text content.',
      outputFormat: 'string',
    },
    outputSchema: { type: 'string', minLength: 1 },
  },
  io: {
    inputJsonPath: '$.input',
    outputJsonPath: '$.content',
  },
});

export const transformUppercase = defineTask('transform-uppercase', {
  kind: 'agent',
  title: 'Convert the text content to uppercase',
  agent: {
    name: 'data-processor',
    prompt: {
      role: 'text transformer',
      task: 'Convert the text content to uppercase',
      context: 'operation: toUpperCase',
      instructions: 'Transform the provided text to uppercase.',
      outputFormat: 'string',
    },
    outputSchema: { type: 'string', minLength: 1 },
  },
  io: {
    inputJsonPath: '$.content',
    outputJsonPath: '$.transformed',
  },
});

export const writeOutput = defineTask('write-output', {
  kind: 'agent',
  title: 'Write the transformed text to output.txt',
  agent: {
    name: 'step-executor',
    prompt: {
      role: 'file writer',
      task: 'Write the transformed text to output.txt',
      context: 'filePath: output.txt',
      instructions: 'Write the provided text content to the output file.',
      outputFormat: 'string',
    },
    outputSchema: { type: 'string' },
  },
  io: {
    inputJsonPath: '$.transformed',
    outputJsonPath: '$.writeResult',
  },
});

export async function process(inputs, ctx) {
  // Step 1: Read the input file
  const content = await ctx.task(readInput, inputs);

  // Step 2: Transform to uppercase
  const transformed = await ctx.task(transformUppercase, { content });

  // Step 3: Write the output
  await ctx.task(writeOutput, { transformed });

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
