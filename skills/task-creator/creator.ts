/**
 * Task Creator -- Core Logic
 *
 * Provides functions to list templates, generate new benchmark tasks from
 * templates, validate generated tasks, and save them to the catalog directory.
 *
 * Tasks consist of:
 *   - metadata.yaml  (task metadata, input spec, evaluation criteria)
 *   - *.process.js   (prescribed process using ProcessContext API)
 */

import fs from 'node:fs';
import path from 'node:path';
import _Ajv2020 from 'ajv/dist/2020.js';
const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;
type Ajv2020Instance = InstanceType<typeof Ajv2020>;
import YAML from 'yaml';

import type { ObedienceDimension } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Identifier for a process-pattern template. */
export type TemplateId = 'sequential' | 'map-reduce' | 'iterative' | 'conditional';

/** Describes an available template. */
export interface TaskTemplate {
  /** Template identifier. */
  id: TemplateId;
  /** Human-readable pattern name. */
  patternName: string;
  /** Description of the pattern. */
  description: string;
  /** Example use-case. */
  example: string;
  /** Obedience dimensions exercised by tasks using this template. */
  dimensions: ObedienceDimension[];
}

/** User-supplied configuration for generating a task. */
export interface TaskConfig {
  /** Task name (must match `^[a-z0-9][a-z0-9-]{2,63}$`). */
  name: string;
  /** Problem domain. */
  domain: string;
  /** Process complexity. */
  complexity: 'low' | 'medium' | 'high';
  /** Natural-language description of the task. */
  description: string;
  /** ISO 8601 estimated duration (default: PT30M). */
  estimatedDuration?: string;
}

/** The generated task files, ready to be saved to disk. */
export interface GeneratedTask {
  /** Task name. */
  name: string;
  /** Domain. */
  domain: string;
  /** Content of metadata.yaml. */
  metadataYaml: string;
  /** Filename of the process file (e.g. "my-task.process.js"). */
  processFileName: string;
  /** Content of the *.process.js file. */
  processJs: string;
}

/** Result of validating a task directory. */
export interface ValidationResult {
  /** Whether the task is valid. */
  valid: boolean;
  /** List of errors found (empty if valid). */
  errors: string[];
  /** Warnings (non-blocking). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TASK_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

const VALID_DOMAINS = [
  'translation',
  'code-refactoring',
  'data-analysis',
  'content-generation',
  'research',
  'testing',
  'devops',
  'other',
] as const;

const DEFAULT_ESTIMATED_DURATION: Record<string, string> = {
  low: 'PT15M',
  medium: 'PT30M',
  high: 'PT1H',
};

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const TEMPLATES: TaskTemplate[] = [
  {
    id: 'sequential',
    patternName: 'Sequential Pipeline',
    description:
      'Linear step-by-step process where each step depends on the output of the previous one. ' +
      'Steps execute in strict order: A -> B -> C -> D.',
    example: 'Simple transformation pipeline, document processing, data migration.',
    dimensions: ['completeness', 'ordering', 'granularity', 'errorHandling'],
  },
  {
    id: 'map-reduce',
    patternName: 'Map-Reduce (Parallel Fan-out / Fan-in)',
    description:
      'Split input into chunks, process chunks concurrently in parallel, then aggregate results ' +
      'into a single output.',
    example: 'Translation of document chunks, parallel data validation, batch API calls.',
    dimensions: ['completeness', 'ordering', 'parallelism', 'aggregation'],
  },
  {
    id: 'iterative',
    patternName: 'Iterative Refinement',
    description:
      'Loop over a body of steps with a convergence/exit condition. Repeat until a quality ' +
      'threshold is met or a maximum number of iterations is reached.',
    example: 'Optimization with profiling, iterative code review, progressive summarization.',
    dimensions: ['completeness', 'ordering', 'granularity', 'conditionality'],
  },
  {
    id: 'conditional',
    patternName: 'Conditional Branching with Rollback',
    description:
      'Evaluate conditions to choose execution paths. If a chosen path fails validation, ' +
      'roll back and execute the alternative branch.',
    example: 'Refactoring with constraint checks, deployment with rollback, A/B processing.',
    dimensions: ['completeness', 'ordering', 'conditionality', 'errorHandling'],
  },
];

// ---------------------------------------------------------------------------
// Template file loading
// ---------------------------------------------------------------------------

/**
 * Resolve the absolute path to a template file.
 */
function templateFilePath(templateId: TemplateId): string {
  const dirName = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  return path.resolve(dirName, 'templates', `${templateId}.template.js`);
}

/**
 * Read a template file and return its contents.
 */
function readTemplate(templateId: TemplateId): string {
  const filePath = templateFilePath(templateId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all available task templates.
 *
 * @returns Array of TaskTemplate descriptors.
 */
export function getTemplates(): TaskTemplate[] {
  return [...TEMPLATES];
}

/**
 * Generate a new benchmark task from a template and user config.
 *
 * Produces both the `metadata.yaml` content and the `*.process.js` content
 * with all placeholders replaced by the user's configuration values.
 *
 * @param templateId - Which template pattern to use.
 * @param config - User-supplied task configuration.
 * @returns A GeneratedTask with the file contents ready to save.
 * @throws If the templateId is unknown or config is invalid.
 */
export function generateTask(templateId: TemplateId, config: TaskConfig): GeneratedTask {
  // --- Validate config ---
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    throw new Error(`Invalid task config:\n  - ${configErrors.join('\n  - ')}`);
  }

  // --- Find the template ---
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(
      `Unknown template "${templateId}". Available: ${TEMPLATES.map((t) => t.id).join(', ')}`,
    );
  }

  const estimatedDuration = config.estimatedDuration ?? DEFAULT_ESTIMATED_DURATION[config.complexity];

  // --- Generate process.js from template ---
  const rawTemplate = readTemplate(templateId);
  const processJs = rawTemplate
    .replace(/\{\{TASK_NAME\}\}/g, config.name)
    .replace(/\{\{DOMAIN\}\}/g, config.domain)
    .replace(/\{\{COMPLEXITY\}\}/g, config.complexity)
    .replace(/\{\{DESCRIPTION\}\}/g, config.description)
    .replace(/\{\{ESTIMATED_DURATION\}\}/g, estimatedDuration);

  // --- Generate metadata.yaml ---
  const metadataObj = buildMetadataYamlObject(config, template, estimatedDuration);
  const metadataYaml = YAML.stringify(metadataObj, { indent: 2, lineWidth: 120 });

  return {
    name: config.name,
    domain: config.domain,
    metadataYaml,
    processFileName: `${config.name}.process.js`,
    processJs,
  };
}

/**
 * Validate a task directory that has already been saved to disk.
 *
 * Checks:
 * 1. metadata.yaml exists and parses
 * 2. metadata.yaml conforms to the JSON Schema
 * 3. processRef file exists
 * 4. Task name follows naming convention
 * 5. Dimension weights are valid
 *
 * @param taskDir - Absolute path to the task directory.
 * @returns ValidationResult with errors and warnings.
 */
export function validateGeneratedTask(taskDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const resolvedDir = path.resolve(taskDir);

  // 1. Check directory exists
  if (!fs.existsSync(resolvedDir)) {
    return { valid: false, errors: [`Task directory does not exist: ${resolvedDir}`], warnings };
  }

  // 2. Check metadata.yaml exists
  const yamlPath = path.join(resolvedDir, 'metadata.yaml');
  if (!fs.existsSync(yamlPath)) {
    return { valid: false, errors: ['metadata.yaml not found in task directory'], warnings };
  }

  // 3. Parse YAML
  let parsed: Record<string, unknown>;
  try {
    const yamlText = fs.readFileSync(yamlPath, 'utf-8');
    parsed = YAML.parse(yamlText) as Record<string, unknown>;
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse metadata.yaml: ${(err as Error).message}`],
      warnings,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['metadata.yaml did not parse to an object'], warnings };
  }

  // 4. Validate against JSON Schema
  const schemaPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
    '../../shared/schemas/task-definition.schema.json',
  );

  try {
    const schemaText = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaText);
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const schemaValid = validate(parsed);
    if (!schemaValid && validate.errors) {
      for (const err of validate.errors) {
        const loc = err.instancePath || '/';
        errors.push(`Schema: ${loc} ${err.message ?? 'unknown error'}`);
      }
    }
  } catch (err) {
    errors.push(`Schema validation failed: ${(err as Error).message}`);
  }

  // 5. Check processRef
  const processRef = parsed['processRef'] as string | undefined;
  if (processRef) {
    const processPath = path.resolve(resolvedDir, processRef);
    if (!fs.existsSync(processPath)) {
      errors.push(`processRef "${processRef}" does not exist at ${processPath}`);
    }
  } else {
    errors.push('metadata.yaml is missing the "processRef" field');
  }

  // 6. Check *.process.js exists in directory
  const files = fs.readdirSync(resolvedDir);
  const processFiles = files.filter((f) => f.endsWith('.process.js'));
  if (processFiles.length === 0) {
    errors.push('No *.process.js file found in task directory');
  } else if (processFiles.length > 1) {
    warnings.push(`Multiple *.process.js files found: ${processFiles.join(', ')}`);
  }

  // 7. Validate task name format
  const metadata = parsed['metadata'] as Record<string, unknown> | undefined;
  const name = metadata?.['name'] as string | undefined;
  if (name && !TASK_NAME_PATTERN.test(name)) {
    errors.push(
      `Task name "${name}" does not match required pattern: ^[a-z0-9][a-z0-9-]{2,63}$`,
    );
  }

  // 8. Validate dimension weights
  const evaluation = parsed['evaluation'] as Record<string, unknown> | undefined;
  const dimensions = evaluation?.['dimensions'] as Record<string, unknown> | undefined;
  if (dimensions) {
    let totalWeight = 0;
    for (const [dimName, dimValue] of Object.entries(dimensions)) {
      const dimConfig = dimValue as Record<string, unknown> | undefined;
      if (!dimConfig) continue;
      const weight = dimConfig['weight'] as number | undefined;
      if (weight !== undefined) {
        if (weight < 0 || weight > 1) {
          errors.push(`Dimension "${dimName}" has invalid weight ${weight} (must be 0-1)`);
        }
        totalWeight += weight;
      }
    }
    if (totalWeight < 0.5) {
      warnings.push(`Total dimension weight is ${totalWeight.toFixed(2)}, which seems low`);
    }
    if (totalWeight > 2.0) {
      warnings.push(`Total dimension weight is ${totalWeight.toFixed(2)}, which seems high`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Save a generated task to the catalog directory.
 *
 * Creates the directory structure `<catalogDir>/<domain>/<task-name>/` and
 * writes both `metadata.yaml` and the `*.process.js` file.
 *
 * @param task - The generated task from `generateTask()`.
 * @param catalogDir - Base catalog directory (e.g. "./benchmark-tasks").
 * @returns Absolute path to the created task directory.
 * @throws If the task directory already exists (to prevent accidental overwrites).
 */
export function saveTask(task: GeneratedTask, catalogDir: string): string {
  const resolvedCatalogDir = path.resolve(catalogDir);
  const taskDir = path.join(resolvedCatalogDir, task.domain, task.name);

  // Safety: do not overwrite existing tasks
  if (fs.existsSync(taskDir)) {
    throw new Error(
      `Task directory already exists: ${taskDir}. ` +
      'Remove it first or choose a different task name.',
    );
  }

  // Create the directory tree
  fs.mkdirSync(taskDir, { recursive: true });

  // Write metadata.yaml
  const yamlPath = path.join(taskDir, 'metadata.yaml');
  fs.writeFileSync(yamlPath, task.metadataYaml, 'utf-8');

  // Write *.process.js
  const processPath = path.join(taskDir, task.processFileName);
  fs.writeFileSync(processPath, task.processJs, 'utf-8');

  return taskDir;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validate a TaskConfig and return an array of error messages (empty if valid).
 */
function validateConfig(config: TaskConfig): string[] {
  const errors: string[] = [];

  if (!config.name) {
    errors.push('name is required');
  } else if (!TASK_NAME_PATTERN.test(config.name)) {
    errors.push(
      `name "${config.name}" does not match pattern: ^[a-z0-9][a-z0-9-]{2,63}$`,
    );
  }

  if (!config.domain) {
    errors.push('domain is required');
  } else if (!VALID_DOMAINS.includes(config.domain as typeof VALID_DOMAINS[number])) {
    errors.push(
      `domain "${config.domain}" is not valid. Must be one of: ${VALID_DOMAINS.join(', ')}`,
    );
  }

  if (!config.complexity) {
    errors.push('complexity is required');
  } else if (!['low', 'medium', 'high'].includes(config.complexity)) {
    errors.push(`complexity "${config.complexity}" must be one of: low, medium, high`);
  }

  if (!config.description) {
    errors.push('description is required');
  }

  if (config.estimatedDuration) {
    const durationPattern = /^P(?!$)(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/;
    if (!durationPattern.test(config.estimatedDuration)) {
      errors.push(
        `estimatedDuration "${config.estimatedDuration}" does not match ISO 8601 duration pattern`,
      );
    }
  }

  return errors;
}

/**
 * Build the metadata.yaml object structure matching the task-definition schema.
 */
function buildMetadataYamlObject(
  config: TaskConfig,
  template: TaskTemplate,
  estimatedDuration: string,
): Record<string, unknown> {
  // Build dimension evaluation criteria with sensible defaults.
  // Dimensions exercised by the template get higher weights.
  const allDimensions: ObedienceDimension[] = [
    'completeness',
    'ordering',
    'conditionality',
    'parallelism',
    'granularity',
    'aggregation',
    'errorHandling',
  ];

  const dimensionsCriteria: Record<string, unknown> = {};
  for (const dim of allDimensions) {
    const isExercised = template.dimensions.includes(dim);
    dimensionsCriteria[dim] = {
      weight: isExercised ? 0.2 : 0.0,
      checks: isExercised
        ? [`Verify the agent correctly handles the ${dim} aspect of the prescribed process`]
        : [`Not applicable for the ${template.patternName} pattern`],
      ...(isExercised ? {} : { notApplicable: true }),
    };
  }

  return {
    version: '1.0',
    metadata: {
      name: config.name,
      domain: config.domain,
      complexity: config.complexity,
      estimatedDuration,
      tags: [template.id, config.domain],
    },
    description: config.description,
    processRef: `./${config.name}.process.js`,
    input: {
      type: 'inline',
      description: 'Input data for the task. Replace with actual input specification.',
      parameters: {},
    },
    expectedOutput: {
      artifacts: [
        {
          name: 'result',
          format: 'json',
          description: 'The output produced by following the prescribed process.',
          validationRules: [
            'Output must contain all required fields as specified by the process steps',
          ],
        },
      ],
    },
    evaluation: {
      dimensions: dimensionsCriteria,
      scoringNotes:
        `This task uses the "${template.patternName}" pattern. ` +
        `Focus scoring on: ${template.dimensions.join(', ')}.`,
    },
  };
}
