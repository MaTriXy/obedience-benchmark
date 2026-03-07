/**
 * Sequential Pipeline Template
 *
 * Pattern: Linear step-by-step process (A -> B -> C -> D).
 * Each step depends on the output of the previous step.
 *
 * Dimensions exercised: completeness, ordering, granularity, errorHandling
 *
 * Placeholders replaced by the task creator:
 *   {{TASK_NAME}}        - kebab-case task name
 *   {{DOMAIN}}           - problem domain
 *   {{COMPLEXITY}}       - low | medium | high
 *   {{DESCRIPTION}}      - natural-language task description
 *   {{ESTIMATED_DURATION}} - ISO 8601 duration (e.g. PT30M)
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

/** @type {import('../../obedience-types/scripts/types.js').ProcessMetadata} */
export const metadata = {
  name: '{{TASK_NAME}}',
  domain: '{{DOMAIN}}',
  complexity: '{{COMPLEXITY}}',
  estimatedDuration: '{{ESTIMATED_DURATION}}',
  dimensions: ['completeness', 'ordering', 'granularity', 'errorHandling'],
  tags: ['sequential', '{{DOMAIN}}'],
};

export const errorHandlers = [
  {
    id: 'err-critical',
    triggerCondition: 'Any step fails with an unrecoverable error',
    action: 'revert',
    logAs: 'critical-failure',
  },
];

export const analyzeInputTask = defineTask('analyze-input', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Analyze input data',
  agent: {
    name: 'input-analyzer',
    prompt: {
      role: 'Data analyst',
      task: 'Analyze the input data and identify processing requirements',
      context: args,
      instructions: ['Examine input structure', 'Identify requirements', 'Produce summary'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['summary', 'requirements'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const planExecutionTask = defineTask('plan-execution', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Plan execution',
  agent: {
    name: 'execution-planner',
    prompt: {
      role: 'Process planner',
      task: 'Create an execution plan based on the analysis',
      context: args,
      instructions: ['Design step sequence', 'Estimate effort', 'Define dependencies'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['steps', 'estimatedEffort'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const executePlanTask = defineTask('execute-plan', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Execute the plan',
  agent: {
    name: 'plan-executor',
    prompt: {
      role: 'Task executor',
      task: 'Execute the plan step by step, producing intermediate outputs',
      context: args,
      instructions: ['Follow plan steps', 'Produce outputs', 'Track status'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['output', 'status'] },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const validateOutputTask = defineTask('validate-output', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Validate output',
  agent: {
    name: 'output-validator',
    prompt: {
      role: 'Quality validator',
      task: 'Validate the output against the requirements from analysis',
      context: args,
      instructions: ['Check completeness', 'Verify correctness', 'Report issues'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['valid', 'issues'] },
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
      task: 'Produce the final output, incorporating any validation feedback',
      context: args,
      instructions: ['Apply fixes', 'Format deliverable', 'Produce final output'],
      outputFormat: 'JSON',
    },
    outputSchema: { type: 'object', required: ['deliverable'] },
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
  const plan = await ctx.task(planExecutionTask, { analysis });
  const result = await ctx.task(executePlanTask, { plan });
  const validation = await ctx.task(validateOutputTask, { result, requirements: analysis });
  const finalOutput = await ctx.task(finalizeTask, { result, validation });
  return finalOutput;
}

/** @type {import('../../obedience-types/scripts/types.js').ProcessEvaluation} */
export const evaluation = {
  completeness: {
    weight: 0.25,
    criteria: 'Agent must execute all 5 steps: analyze, plan, execute, validate, finalize.',
  },
  ordering: {
    weight: 0.25,
    criteria: 'Steps must execute in strict sequential order. No step may begin before its predecessor completes.',
  },
  conditionality: {
    weight: 0.05,
    criteria: 'No conditional branching in this template.',
    notApplicable: 'Sequential template has no conditional branches.',
  },
  parallelism: {
    weight: 0.05,
    criteria: 'No parallel execution in this template.',
    notApplicable: 'Sequential template has no parallel steps.',
  },
  granularity: {
    weight: 0.2,
    criteria: 'Each step should be executed at the prescribed granularity -- not merged with adjacent steps or split into sub-steps.',
  },
  aggregation: {
    weight: 0.0,
    criteria: 'No aggregation in this template.',
    notApplicable: 'Sequential template has no aggregation.',
  },
  errorHandling: {
    weight: 0.2,
    criteria: 'Agent must respect the error handler: revert on critical failure.',
  },
};
