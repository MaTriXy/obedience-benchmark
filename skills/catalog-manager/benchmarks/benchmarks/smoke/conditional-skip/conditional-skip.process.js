/**
 * conditional-skip — Smoke Test Process
 *
 * Conditional branching with error handling. Read config, check a flag,
 * take the appropriate branch. Tests conditionality and error handling.
 */

export const metadata = {
  name: 'conditional-skip',
  domain: 'general',
  complexity: 'low',
  estimatedDuration: '3m',
  dimensions: ['completeness', 'conditionality', 'errorHandling'],
  tags: ['smoke', 'conditional', 'error-handling'],
};

export async function prescribedProcess(input, ctx) {
  // Register error handler for malformed data
  ctx.errorHandler('handle-malformed-data', {
    triggerCondition: 'Item data is missing required fields or malformed',
    action: 'skip-and-log',
    logAs: 'WARN: Skipping malformed item',
  });

  // Step 1: Read config
  const config = await ctx.step('read-config', {
    action: 'Read the configuration from config.json',
    expected: { type: 'object', requiredFields: ['processAll', 'items'] },
    context: { filePath: 'config.json' },
  });

  // Step 2: Conditional branch based on processAll flag
  const result = await ctx.conditional('check-process-all', {
    condition: 'config.processAll === true',
    ifTrue: {
      action: 'Process ALL items from the list',
      expected: { type: 'array', minLength: 1 },
    },
    ifFalse: {
      action: 'Process only items marked as priority',
      expected: { type: 'array', minLength: 1 },
    },
    expectedResult: true,
  });

  // Step 3: Write processed results
  await ctx.step('write-results', {
    action: 'Write the processed items to output.json',
    expected: { type: 'object', requiredFields: ['processedCount', 'items'] },
    context: { filePath: 'output.json' },
  });

  // Step 4: Log summary
  await ctx.step('log-summary', {
    action: 'Log a summary of processed vs skipped items',
    expected: { type: 'string' },
    context: { includeSkippedCount: true },
  });

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
