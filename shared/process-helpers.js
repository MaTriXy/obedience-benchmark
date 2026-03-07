/**
 * Obedience Benchmark -- Process Definition Helpers
 *
 * Provides the ProcessContext API that *.process.js files use to declare
 * their prescribed steps. When executed in "trace mode" (by the judge),
 * each method call records the step into an ordered trace without actually
 * performing any work. The resulting trace is the canonical reference
 * for what steps the agent should have executed.
 *
 * Modeled after the babysitter SDK's process/task definition pattern.
 *
 * Usage in a process file:
 *
 *   import { createProcessContext } from '../../shared/process-helpers.js';
 *
 *   export async function prescribedProcess(input, ctx) {
 *     const result = await ctx.step('analyze', {
 *       action: 'Analyze the input data',
 *       expected: { type: 'object', requiredFields: ['summary'] }
 *     });
 *     // ...
 *   }
 */

// ---------------------------------------------------------------------------
// Sequence counter (global per trace execution)
// ---------------------------------------------------------------------------

let _sequenceCounter = 0;

function nextSequence() {
  return _sequenceCounter++;
}

function resetSequence() {
  _sequenceCounter = 0;
}

// ---------------------------------------------------------------------------
// ProcessContext -- the recording context
// ---------------------------------------------------------------------------

/**
 * ProcessContext records every step/parallel/loop/conditional/errorHandler
 * call into an ordered trace. It does NOT execute any real work -- it
 * produces stub return values matching the `expected` shape so the
 * process function can proceed through its control flow.
 */
export class ProcessContext {
  /**
   * @param {string} taskName -- name of the task being traced
   */
  constructor(taskName) {
    /** @type {string} */
    this.taskName = taskName;
    /** @type {import('./types.js').ProcessStep[]} */
    this.steps = [];
    /** @type {string|undefined} */
    this._currentParent = undefined;
    /** @type {Set<string>} */
    this._activeDimensions = new Set();
  }

  // -------------------------------------------------------------------------
  // ctx.step(id, spec) -- sequential step
  // -------------------------------------------------------------------------

  /**
   * Record a single sequential step.
   *
   * @param {string} id -- unique step identifier
   * @param {import('./types.js').StepSpec} spec -- step specification
   * @returns {Promise<unknown>} -- stub value matching spec.expected
   */
  async step(id, spec) {
    const step = {
      id,
      type: 'step',
      action: spec.action,
      parent: this._currentParent,
      iteration: spec.iteration,
      expected: spec.expected,
      context: spec.context,
      sequence: nextSequence(),
    };
    this.steps.push(step);
    this._activeDimensions.add('completeness');
    this._activeDimensions.add('ordering');
    return _stubValue(spec.expected);
  }

  // -------------------------------------------------------------------------
  // ctx.parallel(id, specs) -- concurrent steps
  // -------------------------------------------------------------------------

  /**
   * Record a set of steps that must execute in parallel.
   *
   * @param {string} id -- identifier for the parallel group
   * @param {import('./types.js').StepSpec[]} specs -- step specifications
   * @returns {Promise<unknown[]>} -- array of stub values
   */
  async parallel(id, specs) {
    const children = specs.map((spec, i) => ({
      id: `${id}[${i}]`,
      type: 'step',
      action: spec.action,
      parent: id,
      iteration: spec.iteration,
      expected: spec.expected,
      context: spec.context,
      sequence: nextSequence(),
    }));

    const step = {
      id,
      type: 'parallel',
      action: `Parallel group: ${specs.length} concurrent steps`,
      parent: this._currentParent,
      children,
      sequence: nextSequence(),
    };
    this.steps.push(step);
    this._activeDimensions.add('parallelism');
    this._activeDimensions.add('completeness');
    return specs.map((spec) => _stubValue(spec.expected));
  }

  // -------------------------------------------------------------------------
  // ctx.loop(id, collection, bodyFn) -- iteration
  // -------------------------------------------------------------------------

  /**
   * Record a loop over a collection. Calls bodyFn for each item to
   * capture the loop body's steps.
   *
   * @param {string} id -- identifier for the loop
   * @param {unknown[]} collection -- items to iterate over
   * @param {(item: unknown, index: number) => Promise<unknown>} bodyFn -- loop body
   * @returns {Promise<unknown[]>} -- array of results from each iteration
   */
  async loop(id, collection, bodyFn) {
    const loopStep = {
      id,
      type: 'loop',
      action: `Loop over ${collection.length} items`,
      parent: this._currentParent,
      children: [],
      sequence: nextSequence(),
    };
    this.steps.push(loopStep);

    const previousParent = this._currentParent;
    this._currentParent = id;

    const results = [];
    for (let i = 0; i < collection.length; i++) {
      const result = await bodyFn(collection[i], i);
      results.push(result);
    }

    // Collect child steps that were recorded during the loop
    loopStep.children = this.steps.filter(
      (s) => s.parent === id && s.id !== id
    );

    this._currentParent = previousParent;
    this._activeDimensions.add('completeness');
    this._activeDimensions.add('granularity');
    return results;
  }

  // -------------------------------------------------------------------------
  // ctx.conditional(id, spec) -- branching
  // -------------------------------------------------------------------------

  /**
   * Record a conditional branch.
   *
   * @param {string} id -- identifier for the conditional
   * @param {import('./types.js').ConditionalSpec} spec -- conditional spec
   * @returns {Promise<unknown>} -- stub value from the expected-true branch
   */
  async conditional(id, spec) {
    const step = {
      id,
      type: 'conditional',
      action: `Conditional: ${spec.condition}`,
      parent: this._currentParent,
      children: [
        {
          id: `${id}:ifTrue`,
          type: 'step',
          action: spec.ifTrue.action,
          parent: id,
          expected: spec.ifTrue.expected,
          sequence: nextSequence(),
        },
      ],
      expected: spec.ifTrue.expected,
      sequence: nextSequence(),
    };

    if (spec.ifFalse) {
      step.children.push({
        id: `${id}:ifFalse`,
        type: 'step',
        action: spec.ifFalse.action,
        parent: id,
        expected: spec.ifFalse.expected,
        sequence: nextSequence(),
      });
    }

    this.steps.push(step);
    this._activeDimensions.add('conditionality');

    // Return stub for the "true" branch (the expected path)
    const branchSpec = spec.expectedResult === false ? spec.ifFalse : spec.ifTrue;
    return _stubValue(branchSpec?.expected);
  }

  // -------------------------------------------------------------------------
  // ctx.errorHandler(id, spec) -- error handling registration
  // -------------------------------------------------------------------------

  /**
   * Register an error handling strategy for a scope.
   *
   * @param {string} id -- identifier for the error handler
   * @param {import('./types.js').ErrorHandlerSpec} spec -- error handler spec
   */
  errorHandler(id, spec) {
    const step = {
      id,
      type: 'errorHandler',
      action: `Error handler: ${spec.triggerCondition} -> ${spec.action}`,
      parent: this._currentParent,
      sequence: nextSequence(),
      context: {
        triggerCondition: spec.triggerCondition,
        action: spec.action,
        maxRetries: spec.maxRetries,
        logAs: spec.logAs,
      },
    };
    this.steps.push(step);
    this._activeDimensions.add('errorHandling');
  }

  // -------------------------------------------------------------------------
  // ctx.getTrace() -- retrieve the recorded trace
  // -------------------------------------------------------------------------

  /**
   * Get the full recorded process trace.
   *
   * @returns {import('./types.js').ProcessTrace}
   */
  getTrace() {
    const allSteps = this._flattenSteps(this.steps);
    return {
      taskName: this.taskName,
      steps: this.steps,
      totalStepCount: allSteps.length,
      activeDimensions: Array.from(this._activeDimensions),
    };
  }

  /**
   * Recursively flatten all steps including children.
   * @param {import('./types.js').ProcessStep[]} steps
   * @returns {import('./types.js').ProcessStep[]}
   */
  _flattenSteps(steps) {
    const flat = [];
    for (const step of steps) {
      flat.push(step);
      if (step.children) {
        flat.push(...this._flattenSteps(step.children));
      }
    }
    return flat;
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new ProcessContext for tracing a process definition.
 *
 * @param {string} taskName -- the task name
 * @returns {ProcessContext}
 */
export function createProcessContext(taskName) {
  resetSequence();
  return new ProcessContext(taskName);
}

// ---------------------------------------------------------------------------
// traceProcess -- execute a process module in trace mode
// ---------------------------------------------------------------------------

/**
 * Execute a process module's prescribedProcess function in trace mode,
 * capturing the full step trace without performing real work.
 *
 * @param {import('./types.js').ProcessModule} processModule -- the imported process module
 * @param {unknown} [input] -- optional mock input data
 * @returns {Promise<import('./types.js').ProcessTrace>} -- the recorded trace
 */
export async function traceProcess(processModule, input) {
  const ctx = createProcessContext(processModule.metadata.name);
  await processModule.prescribedProcess(input ?? {}, ctx);
  return ctx.getTrace();
}

// ---------------------------------------------------------------------------
// defineStep -- convenience for self-documenting step specs
// ---------------------------------------------------------------------------

/**
 * Helper to create a well-typed StepSpec with IDE autocompletion.
 * Pure convenience -- just returns the input object.
 *
 * @param {import('./types.js').StepSpec} spec
 * @returns {import('./types.js').StepSpec}
 */
export function defineStep(spec) {
  return spec;
}

// ---------------------------------------------------------------------------
// Stub value generator
// ---------------------------------------------------------------------------

/**
 * Generate a stub return value that matches the expected shape.
 * Used in trace mode so the process function's control flow proceeds
 * correctly (e.g., iterating over the result of a step).
 *
 * @param {import('./types.js').ExpectedShape} [expected]
 * @returns {unknown}
 */
function _stubValue(expected) {
  if (!expected) return undefined;

  switch (expected.type) {
    case 'string':
      return 'stub-value';
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'array': {
      const len = expected.minLength ?? 3;
      return Array.from({ length: len }, (_, i) => ({
        index: i,
        title: `Item ${i}`,
        value: `stub-${i}`,
      }));
    }
    case 'object': {
      const obj = {};
      if (expected.requiredFields) {
        for (const field of expected.requiredFields) {
          obj[field] = `stub-${field}`;
        }
      }
      return obj;
    }
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Exports summary
// ---------------------------------------------------------------------------
// createProcessContext(taskName)  -- create a recording context
// traceProcess(module, input?)   -- trace a process module end-to-end
// defineStep(spec)               -- convenience for step spec creation
// ProcessContext                  -- the context class (for advanced usage)
