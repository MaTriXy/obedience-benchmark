/**
 * Catalog Manager — Core Logic
 *
 * Loads, validates, indexes, and filters benchmark task definitions from the
 * benchmarks directory. Each task is a directory containing:
 *   - task.yaml      (task metadata + evaluation criteria)
 *   - *.process.js   (the prescribed process as executable code)
 *
 * Run tests with: npx tsx --test skills/catalog-manager/catalog.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import _Ajv2020 from 'ajv/dist/2020.js';
const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;
type Ajv2020Instance = InstanceType<typeof Ajv2020>;
import YAML from 'yaml';

import type {
  CatalogEntry,
  CatalogFilter,
  ObedienceDimension,
} from '../../obedience-types/scripts/types.js';

// ---------------------------------------------------------------------------
// Additional types exported by this module
// ---------------------------------------------------------------------------

/** Result of validating a single task directory. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  entry?: CatalogEntry;
}

/** Aggregate statistics about the catalog. */
export interface CatalogSummary {
  totalTasks: number;
  validTasks: number;
  invalidTasks: number;
  byDomain: Record<string, number>;
  byComplexity: Record<string, number>;
  dimensionCoverage: Record<ObedienceDimension, number>;
  allTags: string[];
}

// ---------------------------------------------------------------------------
// Schema loading & compilation
// ---------------------------------------------------------------------------

let _compiledValidator: ReturnType<Ajv2020Instance['compile']> | null = null;

/**
 * Load and compile the task-definition JSON Schema.
 * The compiled validator is cached after the first call.
 */
function getSchemaValidator(schemaPath?: string): ReturnType<Ajv2020Instance['compile']> {
  if (_compiledValidator) return _compiledValidator;

  const resolvedPath =
    schemaPath ??
    path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
      '../obedience-types/scripts/schemas/task-definition.schema.json',
    );

  const schemaText = fs.readFileSync(resolvedPath, 'utf-8');
  const schema = JSON.parse(schemaText);

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  _compiledValidator = ajv.compile(schema);
  return _compiledValidator;
}

/** Reset the cached validator (useful in tests). */
export function resetSchemaCache(): void {
  _compiledValidator = null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively find all directories that contain a `task.yaml` file.
 */
function findTaskDirs(baseDir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(baseDir)) return results;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(baseDir, entry.name);
    const yamlPath = path.join(dirPath, 'task.yaml');
    if (fs.existsSync(yamlPath)) {
      results.push(dirPath);
    }
    // Recurse into subdirectories
    results.push(...findTaskDirs(dirPath));
  }

  return results;
}

/**
 * Find the first `*.process.js` file in a directory.
 */
function findProcessFile(taskDir: string): string | undefined {
  if (!fs.existsSync(taskDir)) return undefined;
  const files = fs.readdirSync(taskDir);
  const processFile = files.find((f) => f.endsWith('.process.js'));
  return processFile ? path.join(taskDir, processFile) : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a single task directory and return a ValidationResult.
 *
 * Checks:
 * 1. task.yaml exists and is valid YAML
 * 2. task.yaml conforms to the JSON Schema (if schema is available)
 * 3. processRef points to an existing .process.js file
 * 4. A *.process.js file exists in the directory
 */
export function validateTask(taskDir: string, schemaPath?: string): ValidationResult {
  const errors: string[] = [];
  const yamlPath = path.join(taskDir, 'task.yaml');

  // 1. Check task.yaml exists
  if (!fs.existsSync(yamlPath)) {
    return { valid: false, errors: ['task.yaml not found in task directory'] };
  }

  // 2. Parse YAML
  let parsed: Record<string, unknown>;
  try {
    const yamlText = fs.readFileSync(yamlPath, 'utf-8');
    parsed = YAML.parse(yamlText) as Record<string, unknown>;
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse task.yaml: ${(err as Error).message}`],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['task.yaml did not parse to an object'] };
  }

  // 3. Validate against JSON Schema (optional — skip if schema not found)
  try {
    const validate = getSchemaValidator(schemaPath);
    const schemaValid = validate(parsed);
    if (!schemaValid && validate.errors) {
      for (const err of validate.errors) {
        const loc = err.instancePath || '/';
        errors.push(`Schema: ${loc} ${err.message ?? 'unknown error'}`);
      }
    }
  } catch {
    // Schema validation is best-effort — continue without it
  }

  // 4. Check processRef file exists
  const processRef = parsed['processRef'] as string | undefined;
  let resolvedProcessPath: string | undefined;
  if (processRef) {
    resolvedProcessPath = path.resolve(taskDir, processRef);
    if (!fs.existsSync(resolvedProcessPath)) {
      errors.push(`processRef "${processRef}" does not exist at ${resolvedProcessPath}`);
      resolvedProcessPath = undefined;
    }
  } else {
    // Fall back to any *.process.js in the directory
    resolvedProcessPath = findProcessFile(taskDir);
    if (!resolvedProcessPath) {
      errors.push('No *.process.js file found in task directory');
    }
  }

  // 5. Extract metadata — task.yaml uses flat structure (name, domain, etc. at top level)
  // Also support nested metadata.name for backwards compatibility
  const metadata = parsed['metadata'] as Record<string, unknown> | undefined;
  const name = (parsed['name'] as string) ?? (metadata?.['name'] as string) ?? path.basename(taskDir);
  const domain = (parsed['domain'] as string) ?? (metadata?.['domain'] as string) ?? 'other';
  const complexity = (parsed['complexity'] as 'low' | 'medium' | 'high') ?? (metadata?.['complexity'] as 'low' | 'medium' | 'high') ?? 'medium';
  const estimatedDuration = (parsed['estimatedDuration'] as string) ?? (metadata?.['estimatedDuration'] as string | undefined);
  const tags = (parsed['tags'] as string[]) ?? (metadata?.['tags'] as string[]) ?? [];

  // 6. Extract dimensions — task.yaml can have top-level `dimensions` array
  // or extract from evaluation keys with weight > 0
  const rawDimensions = parsed['dimensions'] as string[] | undefined;
  const evaluation = parsed['evaluation'] as Record<string, unknown> | undefined;
  const dimensions: ObedienceDimension[] = [];

  if (rawDimensions && Array.isArray(rawDimensions)) {
    // Direct dimensions array at top level
    for (const dim of rawDimensions) {
      dimensions.push(dim as ObedienceDimension);
    }
  } else if (evaluation) {
    // Extract from evaluation — dimensions with weight > 0 and no notApplicable
    for (const [dimName, dimValue] of Object.entries(evaluation)) {
      const dimConfig = dimValue as Record<string, unknown> | undefined;
      if (dimConfig) {
        const weight = dimConfig['weight'] as number | undefined;
        const na = dimConfig['notApplicable'] as string | boolean | undefined;
        if (weight && weight > 0 && !na) {
          dimensions.push(dimName as ObedienceDimension);
        }
      }
    }
  }

  const valid = errors.length === 0;

  const entry: CatalogEntry = {
    name,
    domain,
    complexity,
    estimatedDuration,
    dimensions,
    tags,
    taskDir: path.resolve(taskDir),
    yamlPath: path.resolve(yamlPath),
    processPath: resolvedProcessPath ?? '',
    validated: valid,
    validationErrors: valid ? undefined : errors,
  };

  return { valid, errors, entry };
}

/**
 * Scan a benchmarks directory, load all task metadata, validate against the
 * schema, and return an array of CatalogEntry objects.
 */
export function loadCatalog(benchmarksDir: string, schemaPath?: string): CatalogEntry[] {
  const resolvedDir = path.resolve(benchmarksDir);
  const taskDirs = findTaskDirs(resolvedDir);
  const entries: CatalogEntry[] = [];

  for (const taskDir of taskDirs) {
    const result = validateTask(taskDir, schemaPath);
    if (result.entry) {
      entries.push(result.entry);
    }
  }

  return entries;
}

/**
 * Filter catalog entries by the given criteria.
 * All filter fields are AND-combined. Array fields use OR within the array.
 * The `dimensions` filter requires all specified dimensions to be present.
 */
export function filterCatalog(
  entries: CatalogEntry[],
  filter: CatalogFilter,
): CatalogEntry[] {
  return entries.filter((entry) => {
    // Filter by domain (OR: entry.domain must match at least one)
    if (filter.domains && filter.domains.length > 0) {
      if (!filter.domains.includes(entry.domain)) return false;
    }

    // Filter by complexity (OR: entry.complexity must match at least one)
    if (filter.complexity && filter.complexity.length > 0) {
      if (!filter.complexity.includes(entry.complexity)) return false;
    }

    // Filter by dimensions (AND: all specified dimensions must be present)
    if (filter.dimensions && filter.dimensions.length > 0) {
      for (const dim of filter.dimensions) {
        if (!entry.dimensions.includes(dim)) return false;
      }
    }

    // Filter by tags (OR: entry must have at least one matching tag)
    if (filter.tags && filter.tags.length > 0) {
      const hasTag = filter.tags.some((tag) => entry.tags.includes(tag));
      if (!hasTag) return false;
    }

    // Filter by name pattern (regex)
    if (filter.namePattern) {
      const regex = new RegExp(filter.namePattern);
      if (!regex.test(entry.name)) return false;
    }

    // Filter by validation status
    if (filter.validatedOnly && !entry.validated) return false;

    return true;
  });
}

/**
 * Produce aggregate statistics about a set of catalog entries.
 */
export function getCatalogSummary(entries: CatalogEntry[]): CatalogSummary {
  const byDomain: Record<string, number> = {};
  const byComplexity: Record<string, number> = {};
  const dimensionCoverage: Record<string, number> = {};
  const tagSet = new Set<string>();

  let validCount = 0;

  for (const entry of entries) {
    // Domain counts
    byDomain[entry.domain] = (byDomain[entry.domain] ?? 0) + 1;

    // Complexity counts
    byComplexity[entry.complexity] = (byComplexity[entry.complexity] ?? 0) + 1;

    // Dimension coverage
    for (const dim of entry.dimensions) {
      dimensionCoverage[dim] = (dimensionCoverage[dim] ?? 0) + 1;
    }

    // Tags
    for (const tag of entry.tags) {
      tagSet.add(tag);
    }

    // Validation count
    if (entry.validated) validCount++;
  }

  return {
    totalTasks: entries.length,
    validTasks: validCount,
    invalidTasks: entries.length - validCount,
    byDomain,
    byComplexity,
    dimensionCoverage: dimensionCoverage as Record<ObedienceDimension, number>,
    allTags: [...tagSet].sort(),
  };
}
