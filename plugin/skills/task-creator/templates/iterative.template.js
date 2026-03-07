/**
 * Iterative Refinement Template
 *
 * Pattern: Loop with convergence/exit condition. Repeat a body of steps
 * until a quality threshold is met or a maximum iteration count is reached.
 *
 * Dimensions exercised: completeness, ordering, granularity, conditionality
 *
 * Placeholders replaced by the task creator:
 *   {{TASK_NAME}}          - kebab-case task name
 *   {{DOMAIN}}             - problem domain
 *   {{COMPLEXITY}}         - low | medium | high
 *   {{DESCRIPTION}}        - natural-language task description
 *   {{ESTIMATED_DURATION}} - ISO 8601 duration (e.g. PT45M)
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/** @type {import('../../obedience-types/scripts/types.js').ProcessMetadata} */
export const metadata = {
  name: '{{TASK_NAME}}',
  domain: '{{DOMAIN}}',
  complexity: '{{COMPLEXITY}}',
  estimatedDuration: '{{ESTIMATED_DURATION}}',
  dimensions: ['completeness', 'ordering', 'granularity', 'conditionality'],
  tags: ['iterative', 'refinement', '{{DOMAIN}}'],
};

export const errorHandlers = [
  {
    id: 'err-iteration',
    triggerCondition: 'A single iteration fails but overall progress is acceptable',
    action: 'skip-and-log',
    logAs: 'iteration-skipped',
  },
];

export const initializeTask = defineTask('initialize', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Initialize baseline',
  agent: {
    name: 'baseline-initializer',
    prompt: {
      role: 'Analyst',
      task: 'Analyze the input and establish an initial baseline solution',
      context: args,
      instructions: ['Examine input', 'Create baseline solution', 'Score quality'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['solution', 'qualityScore'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const refineTask = defineTask('refine', (args, taskCtx) => ({
  kind: 'agent',
  title: `Refinement pass ${args.iterationIndex + 1}: ${args.focus}`,
  agent: {
    name: 'refiner',
    prompt: {
      role: 'Quality improver',
      task: `Apply refinement pass ${args.iterationIndex + 1}: focus on ${args.focus}`,
      context: args,
      instructions: ['Identify improvements', 'Apply changes', 'Track modifications'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['solution', 'changes'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const evaluateQualityTask = defineTask('evaluate-quality', (args, taskCtx) => ({
  kind: 'agent',
  title: `Evaluate quality after pass ${args.iterationIndex + 1}`,
  agent: {
    name: 'quality-evaluator',
    prompt: {
      role: 'Quality evaluator',
      task: `Evaluate quality after refinement pass ${args.iterationIndex + 1}`,
      context: args,
      instructions: ['Compute quality score', 'Check threshold', 'Report findings'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['qualityScore', 'meetsThreshold'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const finalizeTask = defineTask('finalize', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Finalize output',
  agent: {
    name: 'finalizer',
    prompt: {
      role: 'Output finalizer',
      task: 'Select the best refinement result and produce the final output',
      context: args,
      instructions: ['Select best iteration', 'Format deliverable', 'Report final score'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['deliverable', 'totalIterations', 'finalScore'] },
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
  const baseline = await ctx.task(initializeTask, { input: inputs });

  const iterations = [
    { label: 'iteration-1', focus: 'structural-improvements' },
    { label: 'iteration-2', focus: 'detail-refinement' },
    { label: 'iteration-3', focus: 'polish-and-edge-cases' },
  ];

  const refinements = [];
  for (let i = 0; i < iterations.length; i++) {
    const iter = iterations[i];
    const refined = await ctx.task(refineTask, { iterationIndex: i, focus: iter.focus, baseline });
    const quality = await ctx.task(evaluateQualityTask, { iterationIndex: i, refined });

    refinements.push({ refined, quality });

    // Convergence check: exit early if quality threshold met
    if (quality.meetsThreshold) {
      break;
    }
  }

  const finalOutput = await ctx.task(finalizeTask, { refinements });
  return finalOutput;
}

/** @type {import('../../obedience-types/scripts/types.js').ProcessEvaluation} */
export const evaluation = {
  completeness: {
    weight: 0.2,
    criteria: 'Agent must execute initialization, all loop iterations (refine + evaluate + convergence check), and finalization.',
  },
  ordering: {
    weight: 0.2,
    criteria: 'Initialize before loop. Within each iteration: refine, then evaluate, then convergence check. Finalize after loop completes.',
  },
  conditionality: {
    weight: 0.2,
    criteria: 'Convergence checks must be evaluated at each iteration. Early exit behavior must match the prescribed condition logic.',
  },
  parallelism: {
    weight: 0.0,
    criteria: 'No parallel execution in this template.',
    notApplicable: 'Iterative template has no parallel steps.',
  },
  granularity: {
    weight: 0.2,
    criteria: 'Each iteration must be a discrete refinement pass. Refine, evaluate, and convergence check must remain separate steps within each iteration.',
  },
  aggregation: {
    weight: 0.05,
    criteria: 'Final output should incorporate the best result across iterations.',
  },
  errorHandling: {
    weight: 0.15,
    criteria: 'Failed iterations should be skipped and logged rather than aborting the entire process.',
  },
};
