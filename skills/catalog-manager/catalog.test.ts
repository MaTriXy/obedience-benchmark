/**
 * Unit tests for the Catalog Manager
 *
 * Run with: npx tsx --test skills/catalog-manager/catalog.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';

import {
  loadCatalog,
  filterCatalog,
  validateTask,
  getCatalogSummary,
  resetSchemaCache,
} from './catalog.js';

import type { CatalogEntry, CatalogFilter, ObedienceDimension } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Helpers — temporary task fixtures
// ---------------------------------------------------------------------------

const SCHEMA_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '../../shared/schemas/task-definition.schema.json',
);

/** Create a temporary task directory with valid metadata and process file. */
function createTempTask(
  baseDir: string,
  name: string,
  yamlOverrides: Record<string, unknown> = {},
): string {
  const taskDir = path.join(baseDir, name);
  fs.mkdirSync(taskDir, { recursive: true });

  const base: Record<string, unknown> = {
    version: '1.0',
    metadata: {
      name,
      domain: 'translation',
      complexity: 'low',
      estimatedDuration: 'PT30M',
      tags: ['smoke', 'i18n'],
    },
    description: 'A test task for unit testing the catalog manager.',
    processRef: `./${name}.process.js`,
    evaluation: {
      dimensions: {
        completeness: { weight: 1, checks: ['All steps completed'] },
        ordering: { weight: 0.8, checks: ['Steps in correct order'] },
        conditionality: { weight: 0, checks: ['N/A'], notApplicable: true },
        parallelism: { weight: 0, checks: ['N/A'], notApplicable: true },
        granularity: { weight: 0.5, checks: ['Appropriate granularity'] },
        aggregation: { weight: 0.5, checks: ['Results aggregated correctly'] },
        errorHandling: { weight: 0.3, checks: ['Errors handled gracefully'] },
      },
    },
  };

  // Apply overrides
  if (yamlOverrides['metadata']) {
    base['metadata'] = {
      ...(base['metadata'] as Record<string, unknown>),
      ...(yamlOverrides['metadata'] as Record<string, unknown>),
    };
    delete yamlOverrides['metadata'];
  }
  if (yamlOverrides['evaluation']) {
    base['evaluation'] = {
      ...(base['evaluation'] as Record<string, unknown>),
      ...(yamlOverrides['evaluation'] as Record<string, unknown>),
    };
    delete yamlOverrides['evaluation'];
  }
  Object.assign(base, yamlOverrides);

  fs.writeFileSync(path.join(taskDir, 'metadata.yaml'), YAML.stringify(base), 'utf-8');

  // Create stub process file
  const processFileName = `${name}.process.js`;
  fs.writeFileSync(
    path.join(taskDir, processFileName),
    `export const metadata = { name: "${name}" };\nexport async function prescribedProcess() {}\nexport const evaluation = {};\n`,
    'utf-8',
  );

  return taskDir;
}

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  resetSchemaCache();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// validateTask
// ---------------------------------------------------------------------------

describe('validateTask', () => {
  it('should return valid for a well-formed task directory', () => {
    const taskDir = createTempTask(tmpDir, 'good-task');
    const result = validateTask(taskDir, SCHEMA_PATH);
    assert.equal(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
    assert.equal(result.errors.length, 0);
    assert.ok(result.entry);
    assert.equal(result.entry.name, 'good-task');
    assert.equal(result.entry.domain, 'translation');
    assert.equal(result.entry.complexity, 'low');
    assert.equal(result.entry.validated, true);
  });

  it('should fail when metadata.yaml is missing', () => {
    const taskDir = path.join(tmpDir, 'no-yaml');
    fs.mkdirSync(taskDir, { recursive: true });
    const result = validateTask(taskDir, SCHEMA_PATH);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('metadata.yaml not found')));
  });

  it('should fail when metadata.yaml is invalid YAML', () => {
    const taskDir = path.join(tmpDir, 'bad-yaml');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'metadata.yaml'), '{{{{not yaml', 'utf-8');
    const result = validateTask(taskDir, SCHEMA_PATH);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('should fail when required schema fields are missing', () => {
    const taskDir = path.join(tmpDir, 'missing-fields');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, 'metadata.yaml'),
      YAML.stringify({ version: '1.0' }),
      'utf-8',
    );
    const result = validateTask(taskDir, SCHEMA_PATH);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Schema')));
  });

  it('should fail when processRef points to a nonexistent file', () => {
    const taskDir = createTempTask(tmpDir, 'bad-ref', {
      processRef: './nonexistent.process.js',
    });
    // Remove the actual process file that createTempTask created
    const actualProcess = path.join(taskDir, 'bad-ref.process.js');
    if (fs.existsSync(actualProcess)) fs.unlinkSync(actualProcess);

    const result = validateTask(taskDir, SCHEMA_PATH);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('does not exist')));
  });

  it('should extract dimensions correctly, excluding notApplicable ones', () => {
    const taskDir = createTempTask(tmpDir, 'dim-task');
    const result = validateTask(taskDir, SCHEMA_PATH);
    assert.ok(result.entry);
    // conditionality and parallelism are notApplicable
    assert.ok(!result.entry.dimensions.includes('conditionality'));
    assert.ok(!result.entry.dimensions.includes('parallelism'));
    // completeness, ordering, granularity, aggregation, errorHandling are active
    assert.ok(result.entry.dimensions.includes('completeness'));
    assert.ok(result.entry.dimensions.includes('ordering'));
    assert.ok(result.entry.dimensions.includes('granularity'));
  });

  it('should extract tags from metadata', () => {
    const taskDir = createTempTask(tmpDir, 'tagged-task', {
      metadata: { tags: ['alpha', 'beta', 'gamma'] },
    });
    const result = validateTask(taskDir, SCHEMA_PATH);
    assert.ok(result.entry);
    assert.deepEqual(result.entry.tags, ['alpha', 'beta', 'gamma']);
  });

  it('should still produce an entry for invalid tasks (with errors)', () => {
    const taskDir = createTempTask(tmpDir, 'partial-bad', {
      processRef: './missing.process.js',
    });
    const actualProcess = path.join(taskDir, 'partial-bad.process.js');
    if (fs.existsSync(actualProcess)) fs.unlinkSync(actualProcess);

    const result = validateTask(taskDir, SCHEMA_PATH);
    assert.equal(result.valid, false);
    assert.ok(result.entry);
    assert.equal(result.entry.validated, false);
    assert.ok(result.entry.validationErrors && result.entry.validationErrors.length > 0);
  });
});

// ---------------------------------------------------------------------------
// loadCatalog
// ---------------------------------------------------------------------------

describe('loadCatalog', () => {
  it('should load all tasks from a benchmarks directory', () => {
    createTempTask(tmpDir, 'task-alpha');
    createTempTask(tmpDir, 'task-beta');
    createTempTask(tmpDir, 'task-gamma');

    const entries = loadCatalog(tmpDir, SCHEMA_PATH);
    assert.equal(entries.length, 3);

    const names = entries.map((e) => e.name).sort();
    assert.deepEqual(names, ['task-alpha', 'task-beta', 'task-gamma']);
  });

  it('should load tasks from nested subdirectories', () => {
    const subDir = path.join(tmpDir, 'full');
    fs.mkdirSync(subDir, { recursive: true });
    createTempTask(subDir, 'nested-task');

    const entries = loadCatalog(tmpDir, SCHEMA_PATH);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'nested-task');
  });

  it('should return empty array for nonexistent directory', () => {
    const entries = loadCatalog(path.join(tmpDir, 'does-not-exist'), SCHEMA_PATH);
    assert.equal(entries.length, 0);
  });

  it('should return empty array for directory with no tasks', () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const entries = loadCatalog(emptyDir, SCHEMA_PATH);
    assert.equal(entries.length, 0);
  });

  it('should include invalid tasks with validation errors', () => {
    // Create a task with a broken processRef
    const taskDir = createTempTask(tmpDir, 'broken-task', {
      processRef: './nonexistent.process.js',
    });
    const actualProcess = path.join(taskDir, 'broken-task.process.js');
    if (fs.existsSync(actualProcess)) fs.unlinkSync(actualProcess);

    const entries = loadCatalog(tmpDir, SCHEMA_PATH);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].validated, false);
    assert.ok(entries[0].validationErrors && entries[0].validationErrors.length > 0);
  });
});

// ---------------------------------------------------------------------------
// filterCatalog
// ---------------------------------------------------------------------------

describe('filterCatalog', () => {
  let entries: CatalogEntry[];

  beforeEach(() => {
    createTempTask(tmpDir, 'translate-docs', {
      metadata: {
        domain: 'translation',
        complexity: 'low',
        tags: ['i18n', 'docs'],
      },
    });
    createTempTask(tmpDir, 'refactor-api', {
      metadata: {
        domain: 'code-refactoring',
        complexity: 'high',
        tags: ['api', 'typescript'],
      },
    });
    createTempTask(tmpDir, 'analyze-logs', {
      metadata: {
        domain: 'data-analysis',
        complexity: 'medium',
        tags: ['logs', 'monitoring'],
      },
    });

    entries = loadCatalog(tmpDir, SCHEMA_PATH);
  });

  it('should return all entries when no filter is applied', () => {
    const result = filterCatalog(entries, {});
    assert.equal(result.length, 3);
  });

  it('should filter by domain', () => {
    const result = filterCatalog(entries, { domains: ['translation'] });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'translate-docs');
  });

  it('should filter by multiple domains (OR)', () => {
    const result = filterCatalog(entries, {
      domains: ['translation', 'data-analysis'],
    });
    assert.equal(result.length, 2);
  });

  it('should filter by complexity', () => {
    const result = filterCatalog(entries, { complexity: ['high'] });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'refactor-api');
  });

  it('should filter by tags (OR within tags)', () => {
    const result = filterCatalog(entries, { tags: ['api'] });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'refactor-api');
  });

  it('should filter by multiple tags (OR)', () => {
    const result = filterCatalog(entries, { tags: ['i18n', 'logs'] });
    assert.equal(result.length, 2);
  });

  it('should filter by name pattern', () => {
    const result = filterCatalog(entries, { namePattern: '^translate' });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'translate-docs');
  });

  it('should filter by dimensions', () => {
    // All test tasks have completeness active
    const result = filterCatalog(entries, {
      dimensions: ['completeness' as ObedienceDimension],
    });
    assert.equal(result.length, 3);

    // conditionality is notApplicable in all test tasks
    const result2 = filterCatalog(entries, {
      dimensions: ['conditionality' as ObedienceDimension],
    });
    assert.equal(result2.length, 0);
  });

  it('should filter by validatedOnly', () => {
    // All tasks in this set should be valid
    const result = filterCatalog(entries, { validatedOnly: true });
    assert.equal(result.length, 3);
  });

  it('should combine multiple filters with AND', () => {
    const result = filterCatalog(entries, {
      domains: ['translation'],
      complexity: ['low'],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'translate-docs');
  });

  it('should return empty when no entries match', () => {
    const result = filterCatalog(entries, { domains: ['devops'] });
    assert.equal(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// getCatalogSummary
// ---------------------------------------------------------------------------

describe('getCatalogSummary', () => {
  it('should produce correct summary statistics', () => {
    createTempTask(tmpDir, 'task-a', {
      metadata: {
        domain: 'translation',
        complexity: 'low',
        tags: ['tag-one', 'tag-two'],
      },
    });
    createTempTask(tmpDir, 'task-b', {
      metadata: {
        domain: 'translation',
        complexity: 'medium',
        tags: ['tag-two', 'tag-three'],
      },
    });
    createTempTask(tmpDir, 'task-c', {
      metadata: {
        domain: 'code-refactoring',
        complexity: 'high',
        tags: ['tag-one'],
      },
    });

    const entries = loadCatalog(tmpDir, SCHEMA_PATH);
    const summary = getCatalogSummary(entries);

    assert.equal(summary.totalTasks, 3);
    assert.equal(summary.validTasks, 3);
    assert.equal(summary.invalidTasks, 0);

    // Domain counts
    assert.equal(summary.byDomain['translation'], 2);
    assert.equal(summary.byDomain['code-refactoring'], 1);

    // Complexity counts
    assert.equal(summary.byComplexity['low'], 1);
    assert.equal(summary.byComplexity['medium'], 1);
    assert.equal(summary.byComplexity['high'], 1);

    // Dimension coverage — completeness is active in all 3
    assert.equal(summary.dimensionCoverage['completeness'], 3);

    // Tags — sorted, deduplicated
    assert.deepEqual(summary.allTags, ['tag-one', 'tag-three', 'tag-two']);
  });

  it('should handle empty entries array', () => {
    const summary = getCatalogSummary([]);
    assert.equal(summary.totalTasks, 0);
    assert.equal(summary.validTasks, 0);
    assert.equal(summary.invalidTasks, 0);
    assert.deepEqual(summary.byDomain, {});
    assert.deepEqual(summary.byComplexity, {});
    assert.deepEqual(summary.allTags, []);
  });

  it('should count invalid tasks correctly', () => {
    createTempTask(tmpDir, 'valid-task');

    // Create an invalid task
    const badDir = createTempTask(tmpDir, 'invalid-task', {
      processRef: './missing.process.js',
    });
    const actualProcess = path.join(badDir, 'invalid-task.process.js');
    if (fs.existsSync(actualProcess)) fs.unlinkSync(actualProcess);

    const entries = loadCatalog(tmpDir, SCHEMA_PATH);
    const summary = getCatalogSummary(entries);

    assert.equal(summary.totalTasks, 2);
    assert.equal(summary.validTasks, 1);
    assert.equal(summary.invalidTasks, 1);
  });
});
