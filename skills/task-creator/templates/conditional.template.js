/**
 * Conditional Branching with Rollback Template
 *
 * Pattern: Evaluate conditions to choose execution paths. If a chosen path
 * fails validation, roll back and take the alternative branch.
 *
 * Dimensions exercised: completeness, ordering, conditionality, errorHandling
 *
 * Placeholders replaced by the task creator:
 *   {{TASK_NAME}}          - kebab-case task name
 *   {{DOMAIN}}             - problem domain
 *   {{COMPLEXITY}}         - low | medium | high
 *   {{DESCRIPTION}}        - natural-language task description
 *   {{ESTIMATED_DURATION}} - ISO 8601 duration (e.g. PT1H)
 */

// @ts-check

/** @type {import('../../common/scripts/types.js').ProcessMetadata} */
export const metadata = {
  name: '{{TASK_NAME}}',
  domain: '{{DOMAIN}}',
  complexity: '{{COMPLEXITY}}',
  estimatedDuration: '{{ESTIMATED_DURATION}}',
  dimensions: ['completeness', 'ordering', 'conditionality', 'errorHandling'],
  tags: ['conditional', 'branching', 'rollback', '{{DOMAIN}}'],
};

/**
 * Prescribed process: conditional branching with rollback.
 *
 * {{DESCRIPTION}}
 *
 * @param {unknown} input - Task input data
 * @param {import('../../common/scripts/types.js').ProcessContext} ctx - Process context
 * @returns {Promise<unknown>}
 */
export async function prescribedProcess(input, ctx) {
  // Error handler: revert on branch failure (rollback pattern)
  ctx.errorHandler('err-branch-failure', {
    triggerCondition: 'The chosen branch produces invalid output or fails validation',
    action: 'revert',
    logAs: 'branch-rollback',
  });

  // Error handler: flag for review if both branches fail
  ctx.errorHandler('err-both-branches-failed', {
    triggerCondition: 'Both primary and fallback branches fail validation',
    action: 'flag-for-review',
    logAs: 'dual-branch-failure',
  });

  // Step 1: Analyze input and determine branch criteria
  const analysis = await ctx.step('analyze-input', {
    action: 'Analyze the input and determine which processing strategy is appropriate',
    expected: { type: 'object', requiredFields: ['criteria', 'recommendation'] },
  });

  // Step 2: Primary branch decision
  const branchResult = await ctx.conditional('primary-branch', {
    condition: 'Input meets criteria for the optimized processing path',
    ifTrue: {
      action: 'Execute the optimized processing path (faster, requires specific input shape)',
      expected: { type: 'object', requiredFields: ['output', 'strategy'] },
    },
    ifFalse: {
      action: 'Execute the standard processing path (slower, handles all input shapes)',
      expected: { type: 'object', requiredFields: ['output', 'strategy'] },
    },
    expectedResult: true,
  });

  // Step 3: Validate the branch output
  const validation = await ctx.step('validate-branch-output', {
    action: 'Validate the output from the chosen branch against quality criteria',
    expected: { type: 'object', requiredFields: ['valid', 'issues', 'score'] },
    context: { branchResult },
  });

  // Step 4: Rollback decision -- if validation fails, try the other branch
  const rollbackResult = await ctx.conditional('rollback-decision', {
    condition: 'Branch output passed validation (no rollback needed)',
    ifTrue: {
      action: 'Accept the branch output as-is; no rollback needed',
      expected: { type: 'object', requiredFields: ['accepted', 'finalOutput'] },
    },
    ifFalse: {
      action: 'Rollback: discard the failed branch output and execute the alternative branch',
      expected: { type: 'object', requiredFields: ['rolledBack', 'alternativeOutput'] },
    },
    expectedResult: true,
  });

  // Step 5: Post-processing (common path after branching)
  const postProcessed = await ctx.step('post-process', {
    action: 'Apply post-processing to the final branch output (formatting, cleanup)',
    expected: { type: 'object', requiredFields: ['deliverable'] },
    context: { rollbackResult },
  });

  // Step 6: Final validation
  const finalValidation = await ctx.step('final-validation', {
    action: 'Perform a final validation pass on the complete output',
    expected: { type: 'object', requiredFields: ['valid', 'summary'] },
    context: { postProcessed },
  });

  return { postProcessed, finalValidation };
}

/** @type {import('../../common/scripts/types.js').ProcessEvaluation} */
export const evaluation = {
  completeness: {
    weight: 0.2,
    criteria: 'Agent must execute: analysis, primary branch, validation, rollback decision, post-processing, and final validation.',
  },
  ordering: {
    weight: 0.15,
    criteria: 'Analysis before branching. Validation after branch execution. Rollback decision after validation. Post-processing and final validation at the end.',
  },
  conditionality: {
    weight: 0.3,
    criteria: 'Agent must correctly evaluate both the primary branch condition and the rollback condition. The correct branch must be chosen based on the condition evaluation.',
  },
  parallelism: {
    weight: 0.0,
    criteria: 'No parallel execution in this template.',
    notApplicable: 'Conditional template has no parallel steps.',
  },
  granularity: {
    weight: 0.1,
    criteria: 'Branch execution and validation must remain separate steps. Rollback must be a distinct operation from the re-execution.',
  },
  aggregation: {
    weight: 0.0,
    criteria: 'No aggregation in this template.',
    notApplicable: 'Conditional template has no aggregation.',
  },
  errorHandling: {
    weight: 0.25,
    criteria: 'Agent must implement the rollback pattern: revert on branch failure, flag for review if both branches fail.',
  },
};
