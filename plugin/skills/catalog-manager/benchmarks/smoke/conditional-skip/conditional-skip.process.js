/**
 * conditional-skip — Smoke Test Process
 *
 * Conditional branching with error handling. Read config, check a flag,
 * take the appropriate branch. Tests conditionality and error handling.
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'conditional-skip',
  domain: 'general',
  complexity: 'low',
  estimatedDuration: '3m',
  dimensions: ['completeness', 'conditionality', 'errorHandling'],
  tags: ['smoke', 'conditional', 'error-handling'],
};

export const errorHandler = {
  id: 'handle-malformed-data',
  triggerCondition: 'Item data is missing required fields or malformed',
  action: 'skip-and-log',
  logAs: 'WARN: Skipping malformed item',
};

export const readConfig = defineTask('read-config', {
  kind: 'agent',
  title: 'Read the configuration from config.json',
  agent: {
    name: 'step-executor',
    prompt: {
      role: 'file reader',
      task: 'Read the configuration from config.json',
      context: 'filePath: config.json',
      instructions: 'Read and parse the JSON configuration file.',
      outputFormat: 'object with requiredFields: processAll, items',
    },
    outputSchema: { type: 'object', requiredFields: ['processAll', 'items'] },
  },
  io: {
    inputJsonPath: '$.input',
    outputJsonPath: '$.config',
  },
});

export const processAllItems = defineTask('process-all-items', {
  kind: 'agent',
  title: 'Process ALL items from the list',
  agent: {
    name: 'data-processor',
    prompt: {
      role: 'item processor',
      task: 'Process ALL items from the list',
      context: 'condition: config.processAll === true',
      instructions: 'Process every item in the provided list.',
      outputFormat: 'array',
    },
    outputSchema: { type: 'array', minLength: 1 },
  },
  io: {
    inputJsonPath: '$.config.items',
    outputJsonPath: '$.result',
  },
});

export const processPriorityItems = defineTask('process-priority-items', {
  kind: 'agent',
  title: 'Process only items marked as priority',
  agent: {
    name: 'data-processor',
    prompt: {
      role: 'item processor',
      task: 'Process only items marked as priority',
      context: 'condition: config.processAll === false',
      instructions: 'Process only the items that are marked as priority.',
      outputFormat: 'array',
    },
    outputSchema: { type: 'array', minLength: 1 },
  },
  io: {
    inputJsonPath: '$.config.items',
    outputJsonPath: '$.result',
  },
});

export const writeResults = defineTask('write-results', {
  kind: 'agent',
  title: 'Write the processed items to output.json',
  agent: {
    name: 'step-executor',
    prompt: {
      role: 'file writer',
      task: 'Write the processed items to output.json',
      context: 'filePath: output.json',
      instructions: 'Write the processed items as a JSON object with processedCount and items fields.',
      outputFormat: 'object with requiredFields: processedCount, items',
    },
    outputSchema: { type: 'object', requiredFields: ['processedCount', 'items'] },
  },
  io: {
    inputJsonPath: '$.result',
    outputJsonPath: '$.writeResult',
  },
});

export const logSummary = defineTask('log-summary', {
  kind: 'agent',
  title: 'Log a summary of processed vs skipped items',
  agent: {
    name: 'step-executor',
    prompt: {
      role: 'logger',
      task: 'Log a summary of processed vs skipped items',
      context: 'includeSkippedCount: true',
      instructions: 'Produce a summary string showing how many items were processed and how many were skipped.',
      outputFormat: 'string',
    },
    outputSchema: { type: 'string' },
  },
  io: {
    inputJsonPath: '$.result',
    outputJsonPath: '$.summary',
  },
});

export async function process(inputs, ctx) {
  // Step 1: Read config
  const config = await ctx.task(readConfig, inputs);

  // Step 2: Conditional branch based on processAll flag
  let result;
  if (config.processAll === true) {
    result = await ctx.task(processAllItems, { config });
  } else {
    result = await ctx.task(processPriorityItems, { config });
  }

  // Step 3: Write processed results
  await ctx.task(writeResults, { result });

  // Step 4: Log summary
  await ctx.task(logSummary, { result });

  return result;
}

export const evaluation = {
  completeness: {
    weight: 30,
    criteria: 'Agent must read config, evaluate condition, and process the correct subset',
  },
  conditionality: {
    weight: 40,
    criteria: 'Agent must check processAll flag and take the correct branch',
  },
  errorHandling: {
    weight: 30,
    criteria: 'Agent must log skipped items and handle missing/malformed data gracefully',
  },
};
