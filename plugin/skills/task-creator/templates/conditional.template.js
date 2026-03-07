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

import { defineTask } from '@a5c-ai/babysitter-sdk';

/** @type {import('../../obedience-types/scripts/types.js').ProcessMetadata} */
export const metadata = {
  name: '{{TASK_NAME}}',
  domain: '{{DOMAIN}}',
  complexity: '{{COMPLEXITY}}',
  estimatedDuration: '{{ESTIMATED_DURATION}}',
  dimensions: ['completeness', 'ordering', 'conditionality', 'errorHandling'],
  tags: ['conditional', 'branching', 'rollback', '{{DOMAIN}}'],
};

export const errorHandlers = [
  {
    id: 'err-branch-failure',
    triggerCondition: 'The chosen branch produces invalid output or fails validation',
    action: 'revert',
    logAs: 'branch-rollback',
  },
  {
    id: 'err-both-branches-failed',
    triggerCondition: 'Both primary and fallback branches fail validation',
    action: 'flag-for-review',
    logAs: 'dual-branch-failure',
  },
];

export const analyzeInputTask = defineTask('analyze-input', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Analyze input and determine branch criteria',
  agent: {
    name: 'branch-analyzer',
    prompt: {
      role: 'Decision analyst',
      task: 'Analyze the input and determine which processing strategy is appropriate',
      context: args,
      instructions: ['Examine input shape', 'Evaluate criteria', 'Recommend branch'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['criteria', 'recommendation'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const optimizedPathTask = defineTask('optimized-path', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Execute optimized processing path',
  agent: {
    name: 'optimized-processor',
    prompt: {
      role: 'Optimized processor',
      task: 'Execute the optimized processing path (faster, requires specific input shape)',
      context: args,
      instructions: ['Apply optimized strategy', 'Validate input shape', 'Produce output'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['output', 'strategy'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const standardPathTask = defineTask('standard-path', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Execute standard processing path',
  agent: {
    name: 'standard-processor',
    prompt: {
      role: 'Standard processor',
      task: 'Execute the standard processing path (slower, handles all input shapes)',
      context: args,
      instructions: ['Apply standard strategy', 'Handle all shapes', 'Produce output'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['output', 'strategy'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const validateBranchTask = defineTask('validate-branch-output', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Validate branch output',
  agent: {
    name: 'branch-validator',
    prompt: {
      role: 'Quality validator',
      task: 'Validate the output from the chosen branch against quality criteria',
      context: args,
      instructions: ['Check output validity', 'Identify issues', 'Compute score'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['valid', 'issues', 'score'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const postProcessTask = defineTask('post-process', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Post-process final output',
  agent: {
    name: 'post-processor',
    prompt: {
      role: 'Output formatter',
      task: 'Apply post-processing to the final branch output (formatting, cleanup)',
      context: args,
      instructions: ['Format output', 'Clean up', 'Produce deliverable'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['deliverable'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const finalValidationTask = defineTask('final-validation', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Final validation',
  agent: {
    name: 'final-validator',
    prompt: {
      role: 'Final validator',
      task: 'Perform a final validation pass on the complete output',
      context: args,
      instructions: ['Validate completeness', 'Check consistency', 'Produce summary'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['valid', 'summary'] },
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

  // Primary branch decision
  let branchResult;
  if (analysis.criteria.meetsOptimizedCriteria) {
    branchResult = await ctx.task(optimizedPathTask, { analysis });
  } else {
    branchResult = await ctx.task(standardPathTask, { analysis });
  }

  // Validate branch output
  const validation = await ctx.task(validateBranchTask, { branchResult });

  // Rollback: if validation fails, try the alternative branch
  let finalBranchResult = branchResult;
  if (!validation.valid) {
    if (analysis.criteria.meetsOptimizedCriteria) {
      finalBranchResult = await ctx.task(standardPathTask, { analysis });
    } else {
      finalBranchResult = await ctx.task(optimizedPathTask, { analysis });
    }
  }

  const postProcessed = await ctx.task(postProcessTask, { branchResult: finalBranchResult });
  const finalValidation = await ctx.task(finalValidationTask, { postProcessed });

  return { postProcessed, finalValidation };
}

/** @type {import('../../obedience-types/scripts/types.js').ProcessEvaluation} */
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
