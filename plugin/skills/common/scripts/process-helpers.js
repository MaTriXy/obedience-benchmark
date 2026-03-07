/**
 * Obedience Benchmark -- Process Definition Helpers
 *
 * Minimal utilities for working with babysitter-format process files.
 * The judge reads process files directly (their exported task definitions,
 * metadata, and evaluation criteria) rather than running them through
 * a recording context.
 */

// ---------------------------------------------------------------------------
// loadProcessModule — dynamic import of a .process.js file
// ---------------------------------------------------------------------------

/**
 * Dynamically import a process module and return its exports.
 *
 * @param {string} processPath — absolute or relative path to .process.js
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadProcessModule(processPath) {
  const mod = await import(processPath);
  return mod;
}

// ---------------------------------------------------------------------------
// extractTaskDefinitions — pull defineTask exports from a process module
// ---------------------------------------------------------------------------

/**
 * Extract all task definitions from a process module's exports.
 * Task definitions are objects created by `defineTask()` from the
 * babysitter SDK. They have a `taskName` property and a factory function.
 *
 * @param {Record<string, unknown>} mod — the imported process module
 * @returns {Array<{ name: string; exportName: string; definition: unknown }>}
 */
export function extractTaskDefinitions(mod) {
  const tasks = [];
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      value &&
      typeof value === 'object' &&
      'taskName' in value &&
      typeof value.taskName === 'string'
    ) {
      tasks.push({
        name: value.taskName,
        exportName,
        definition: value,
      });
    }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// extractProcessMetadata — get metadata, evaluation, errorHandlers
// ---------------------------------------------------------------------------

/**
 * Extract structured metadata from a process module.
 *
 * @param {Record<string, unknown>} mod — the imported process module
 * @returns {{
 *   metadata: unknown;
 *   evaluation: unknown;
 *   errorHandlers: Array<{ id: string; triggerCondition: string; action: string }>;
 *   taskCount: number;
 * }}
 */
export function extractProcessMetadata(mod) {
  const metadata = mod.metadata ?? {};
  const evaluation = mod.evaluation ?? {};
  const errorHandlers = Array.isArray(mod.errorHandlers) ? mod.errorHandlers : [];
  const tasks = extractTaskDefinitions(mod);

  return {
    metadata,
    evaluation,
    errorHandlers,
    taskCount: tasks.length,
  };
}
