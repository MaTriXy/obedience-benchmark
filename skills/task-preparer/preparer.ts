/**
 * Task Preparer -- Core Logic
 *
 * Reads a task's metadata.yaml, generates or acquires all required input data,
 * prepares evaluation artifacts for the judge, and returns a fully resolved
 * PreparedTask ready for execution.
 *
 * Run tests with: npx tsx --test skills/task-preparer/preparer.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import type { CatalogEntry, PreparedTask } from '../../shared/types.js';

import {
  generateBook,
  generateBookMarkdown,
  generateDocument,
  generateWordList,
  generateRawText,
} from './generators/text-generator.js';
import type { TextGeneratorOptions } from './generators/text-generator.js';

import {
  generateCodebase,
} from './generators/code-generator.js';
import type { CodeGeneratorOptions } from './generators/code-generator.js';

import {
  generateDataset,
  datasetToCsv,
  datasetToJson,
  generateWordFrequencyList,
  wordFrequencyToTsv,
  generateNumericSeries,
  numericSeriesToCsv,
} from './generators/data-generator.js';
import type { DataGeneratorOptions, NumericSeriesOptions } from './generators/data-generator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed input spec from a task's metadata.yaml. */
export interface InputSpec {
  type?: 'inline' | 'file' | 'directory' | 'url' | 'generated';
  description?: string;
  generatorRef?: string;
  artifacts?: Array<{
    name: string;
    path?: string;
    url?: string;
    description?: string;
    format?: string;
    inlineContent?: string;
  }>;
  parameters?: Record<string, string | number | boolean | string[]>;
}

/** Parsed expected output spec from metadata.yaml. */
export interface ExpectedOutputSpec {
  artifacts?: Array<{
    name: string;
    format: string;
    description?: string;
    validationRules?: string[];
  }>;
  properties?: Record<string, string | number | boolean>;
}

/** The full parsed task definition from metadata.yaml. */
export interface TaskDefinition {
  version: string;
  metadata: {
    name: string;
    domain: string;
    complexity: string;
    estimatedDuration?: string;
    requiredCapabilities?: string[];
    tags?: string[];
  };
  description: string;
  processRef: string;
  input?: InputSpec;
  expectedOutput?: ExpectedOutputSpec;
  evaluation: {
    dimensions: Record<string, {
      weight: number;
      checks: string[];
      notApplicable?: boolean;
    }>;
    scoringNotes?: string;
  };
}

/** Data returned from a generator invocation. */
export interface GeneratedData {
  /** Files generated (relativePath -> content). */
  files: Map<string, string>;
  /** Metadata about what was generated. */
  metadata: Record<string, unknown>;
}

/** Evaluation artifacts for the judge. */
export interface EvalArtifacts {
  /** Paths to evaluation files created on disk. */
  filePaths: string[];
  /** In-memory artifact data (written to disk as JSON). */
  data: Record<string, unknown>;
}

/** Options for prepareTask. */
export interface PrepareOptions {
  /** Base output directory. Defaults to results/prepared/ relative to project root. */
  outputDir?: string;
  /** Force regeneration even if cached data exists. */
  force?: boolean;
  /** Seed override for deterministic generation. */
  seed?: number;
}

// ---------------------------------------------------------------------------
// Internal: resolve project root
// ---------------------------------------------------------------------------

function getProjectRoot(): string {
  // Walk up from this file to find package.json
  const thisDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  let dir = thisDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return thisDir;
}

// ---------------------------------------------------------------------------
// Internal: read task definition
// ---------------------------------------------------------------------------

function readTaskDefinition(yamlPath: string): TaskDefinition {
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`Task YAML not found: ${yamlPath}`);
  }
  const text = fs.readFileSync(yamlPath, 'utf-8');
  const parsed = YAML.parse(text) as TaskDefinition;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid YAML structure in ${yamlPath}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Internal: directory helpers
// ---------------------------------------------------------------------------

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Internal: resolve seed
// ---------------------------------------------------------------------------

function resolveSeed(taskName: string, overrideSeed?: number): number {
  if (overrideSeed !== undefined) return overrideSeed;
  // Deterministic seed from task name
  let hash = 0;
  for (let i = 0; i < taskName.length; i++) {
    hash = ((hash << 5) - hash + taskName.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 42;
}

// ---------------------------------------------------------------------------
// Internal: domain-based generator selection
// ---------------------------------------------------------------------------

/**
 * Select and invoke the appropriate generator based on the task domain
 * and input spec, returning the generated data.
 */
function selectAndRunGenerator(
  taskDef: TaskDefinition,
  seed: number,
): GeneratedData {
  const domain = taskDef.metadata.domain;
  const inputSpec = taskDef.input;
  const generatorRef = inputSpec?.generatorRef;
  const params = inputSpec?.parameters ?? {};

  // If a generatorRef is specified, dispatch by name
  if (generatorRef) {
    return dispatchByGeneratorRef(generatorRef, params, seed);
  }

  // Otherwise, dispatch by domain
  switch (domain) {
    case 'translation':
    case 'content-generation':
      return generateTextData(params, seed);

    case 'code-refactoring':
    case 'testing':
    case 'devops':
      return generateCodeData(params, seed);

    case 'data-analysis':
    case 'research':
      return generateAnalyticsData(params, seed);

    default:
      return generateTextData(params, seed);
  }
}

function dispatchByGeneratorRef(
  ref: string,
  params: Record<string, string | number | boolean | string[]>,
  seed: number,
): GeneratedData {
  const normalized = ref.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (normalized.includes('book') || normalized.includes('text') || normalized.includes('translation')) {
    return generateTextData(params, seed);
  }
  if (normalized.includes('code') || normalized.includes('codebase') || normalized.includes('refactor')) {
    return generateCodeData(params, seed);
  }
  if (normalized.includes('data') || normalized.includes('dataset') || normalized.includes('csv')) {
    return generateAnalyticsData(params, seed);
  }
  if (normalized.includes('word') || normalized.includes('frequency')) {
    return generateWordListData(params, seed);
  }
  if (normalized.includes('numeric') || normalized.includes('series') || normalized.includes('timeseries')) {
    return generateNumericData(params, seed);
  }

  // Default fallback: text
  return generateTextData(params, seed);
}

// ---------------------------------------------------------------------------
// Generator dispatchers
// ---------------------------------------------------------------------------

function generateTextData(
  params: Record<string, string | number | boolean | string[]>,
  seed: number,
): GeneratedData {
  const files = new Map<string, string>();
  const metadata: Record<string, unknown> = {};

  const textOpts: TextGeneratorOptions = {
    seed,
    targetWordCount: typeof params['wordCount'] === 'number' ? params['wordCount'] : 5000,
    chapterCount: typeof params['chapterCount'] === 'number' ? params['chapterCount'] : undefined,
    title: typeof params['title'] === 'string' ? params['title'] : undefined,
    language: typeof params['language'] === 'string' ? params['language'] : 'en',
  };

  // Generate a book
  const book = generateBook(textOpts);
  const bookMd = generateBookMarkdown(textOpts);
  files.set('book.md', bookMd);

  // Also write individual chapters
  for (const chapter of book.chapters) {
    const filename = `chapter-${String(chapter.number).padStart(2, '0')}.md`;
    files.set(filename, `## Chapter ${chapter.number}: ${chapter.title}\n\n${chapter.content}\n`);
  }

  // Generate a word list from the book content
  const wordList = generateWordList({ seed, targetWordCount: book.totalWordCount });
  files.set('word-list.json', JSON.stringify(wordList, null, 2) + '\n');

  metadata.bookTitle = book.title;
  metadata.chapterCount = book.chapters.length;
  metadata.totalWordCount = book.totalWordCount;
  metadata.uniqueWords = wordList.totalUniqueWords;
  metadata.language = textOpts.language;

  return { files, metadata };
}

function generateCodeData(
  params: Record<string, string | number | boolean | string[]>,
  seed: number,
): GeneratedData {
  const files = new Map<string, string>();
  const metadata: Record<string, unknown> = {};

  const codeOpts: CodeGeneratorOptions = {
    seed,
    moduleCount: typeof params['moduleCount'] === 'number' ? params['moduleCount'] : 8,
    circularDeps: params['circularDeps'] === true || params['circularDeps'] === undefined,
    circularDepCount: typeof params['circularDepCount'] === 'number' ? params['circularDepCount'] : 2,
    includeTests: params['includeTests'] !== false,
    includeConfigs: params['includeConfigs'] !== false,
    projectName: typeof params['projectName'] === 'string' ? params['projectName'] : undefined,
    language: (params['language'] === 'javascript' ? 'javascript' : 'typescript') as 'typescript' | 'javascript',
  };

  const codebase = generateCodebase(codeOpts);

  for (const file of codebase.files) {
    files.set(file.relativePath, file.content);
  }

  metadata.projectName = codebase.projectName;
  metadata.moduleCount = codebase.metadata.moduleCount;
  metadata.totalFiles = codebase.metadata.totalFiles;
  metadata.totalLines = codebase.metadata.totalLines;
  metadata.hasCircularDeps = codebase.metadata.hasCircularDeps;
  metadata.circularDepPairs = codebase.metadata.circularDepPairs;
  metadata.modules = codebase.metadata.modules;

  return { files, metadata };
}

function generateAnalyticsData(
  params: Record<string, string | number | boolean | string[]>,
  seed: number,
): GeneratedData {
  const files = new Map<string, string>();
  const metadata: Record<string, unknown> = {};

  const dataOpts: DataGeneratorOptions = {
    seed,
    rowCount: typeof params['rowCount'] === 'number' ? params['rowCount'] : 200,
  };

  const dataset = generateDataset(dataOpts);

  // CSV version
  files.set('dataset.csv', datasetToCsv(dataset));
  // JSON version
  files.set('dataset.json', datasetToJson(dataset));

  // Also generate a numeric series
  const seriesOpts: NumericSeriesOptions = {
    seed: seed + 1,
    length: typeof params['seriesLength'] === 'number' ? params['seriesLength'] : 100,
    seriesType: 'random-walk',
  };
  const series = generateNumericSeries(seriesOpts);
  files.set('timeseries.csv', numericSeriesToCsv(series));

  // Word frequency list
  const wordFreq = generateWordFrequencyList({ seed: seed + 2, sourceWordCount: 5000 });
  files.set('word-frequencies.tsv', wordFrequencyToTsv(wordFreq));

  metadata.datasetRowCount = dataset.metadata.rowCount;
  metadata.datasetColumnCount = dataset.metadata.columnCount;
  metadata.datasetHeaders = dataset.headers;
  metadata.seriesLength = series.values.length;
  metadata.seriesStats = series.stats;
  metadata.wordFrequencyUniqueWords = wordFreq.uniqueWords;

  return { files, metadata };
}

function generateWordListData(
  params: Record<string, string | number | boolean | string[]>,
  seed: number,
): GeneratedData {
  const files = new Map<string, string>();
  const metadata: Record<string, unknown> = {};

  const sourceWordCount = typeof params['sourceWordCount'] === 'number' ? params['sourceWordCount'] : 10000;
  const wordFreq = generateWordFrequencyList({ seed, sourceWordCount });

  files.set('word-frequencies.tsv', wordFrequencyToTsv(wordFreq));
  files.set('word-frequencies.json', JSON.stringify(wordFreq.entries, null, 2) + '\n');
  files.set('words.txt', wordFreq.entries.map((e) => e.word).join('\n') + '\n');

  metadata.totalWords = wordFreq.totalWords;
  metadata.uniqueWords = wordFreq.uniqueWords;

  return { files, metadata };
}

function generateNumericData(
  params: Record<string, string | number | boolean | string[]>,
  seed: number,
): GeneratedData {
  const files = new Map<string, string>();
  const metadata: Record<string, unknown> = {};

  const seriesTypes = ['random-walk', 'sine', 'linear', 'normal', 'uniform'] as const;

  for (const seriesType of seriesTypes) {
    const opts: NumericSeriesOptions = {
      seed: seed + seriesTypes.indexOf(seriesType),
      length: typeof params['seriesLength'] === 'number' ? params['seriesLength'] : 100,
      seriesType,
      min: typeof params['min'] === 'number' ? params['min'] : 0,
      max: typeof params['max'] === 'number' ? params['max'] : 100,
    };
    const series = generateNumericSeries(opts);
    files.set(`series-${seriesType}.csv`, numericSeriesToCsv(series));
    metadata[`${seriesType}Stats`] = series.stats;
  }

  return { files, metadata };
}

// ---------------------------------------------------------------------------
// Internal: inline artifact materialization
// ---------------------------------------------------------------------------

function materializeInlineArtifacts(
  inputSpec: InputSpec,
  inputDir: string,
): void {
  if (!inputSpec.artifacts) return;

  for (const artifact of inputSpec.artifacts) {
    if (artifact.inlineContent) {
      const targetPath = path.join(inputDir, artifact.path ?? artifact.name);
      writeFile(targetPath, artifact.inlineContent);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: file / directory copy
// ---------------------------------------------------------------------------

function materializeFileArtifacts(
  inputSpec: InputSpec,
  taskDir: string,
  inputDir: string,
): void {
  if (!inputSpec.artifacts) return;

  for (const artifact of inputSpec.artifacts) {
    if (!artifact.path) continue;
    const sourcePath = path.resolve(taskDir, artifact.path);
    const targetPath = path.join(inputDir, artifact.path);

    if (!fs.existsSync(sourcePath)) {
      console.warn(`[task-preparer] Warning: source artifact not found: ${sourcePath}`);
      continue;
    }

    ensureDir(path.dirname(targetPath));

    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copyDirRecursive(src: string, dest: string): void {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: URL download (placeholder, uses fs fetch if available)
// ---------------------------------------------------------------------------

async function materializeUrlArtifacts(
  inputSpec: InputSpec,
  inputDir: string,
): Promise<void> {
  if (!inputSpec.artifacts) return;

  for (const artifact of inputSpec.artifacts) {
    if (!artifact.url) continue;

    const targetName = artifact.path ?? artifact.name;
    const targetPath = path.join(inputDir, targetName);
    ensureDir(path.dirname(targetPath));

    try {
      const response = await fetch(artifact.url);
      if (!response.ok) {
        console.warn(
          `[task-preparer] Warning: failed to fetch ${artifact.url}: ${response.status}`,
        );
        continue;
      }
      const text = await response.text();
      fs.writeFileSync(targetPath, text, 'utf-8');
    } catch (err) {
      console.warn(
        `[task-preparer] Warning: error fetching ${artifact.url}: ${(err as Error).message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: prompt composition
// ---------------------------------------------------------------------------

function composeTaskPrompt(
  taskDef: TaskDefinition,
  inputDir: string,
): string {
  const parts: string[] = [];

  parts.push(`# Task: ${taskDef.metadata.name}`);
  parts.push('');
  parts.push(taskDef.description);
  parts.push('');

  // Input references
  parts.push('## Input Data');
  parts.push('');
  parts.push(`Input files are located in: ${inputDir}`);

  if (taskDef.input?.artifacts) {
    parts.push('');
    parts.push('Available input artifacts:');
    for (const artifact of taskDef.input.artifacts) {
      const loc = artifact.path ?? artifact.name;
      const desc = artifact.description ? ` -- ${artifact.description}` : '';
      parts.push(`- \`${loc}\`${desc}`);
    }
  }

  if (taskDef.input?.parameters) {
    parts.push('');
    parts.push('Parameters:');
    for (const [key, value] of Object.entries(taskDef.input.parameters)) {
      parts.push(`- ${key}: ${JSON.stringify(value)}`);
    }
  }

  // Expected output
  if (taskDef.expectedOutput?.artifacts) {
    parts.push('');
    parts.push('## Expected Output');
    parts.push('');
    for (const artifact of taskDef.expectedOutput.artifacts) {
      const desc = artifact.description ? ` -- ${artifact.description}` : '';
      const rules = artifact.validationRules
        ? `\n  Validation: ${artifact.validationRules.join('; ')}`
        : '';
      parts.push(`- \`${artifact.name}\` (${artifact.format})${desc}${rules}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Public API: generateSyntheticData
// ---------------------------------------------------------------------------

/**
 * Generate synthetic input data based on a task's input spec and domain.
 *
 * Can be called standalone (outside of full task preparation) for testing
 * or data inspection.
 */
export function generateSyntheticData(
  inputSpec: InputSpec,
  domain: string,
  options: { seed?: number; taskName?: string } = {},
): GeneratedData {
  const seed = resolveSeed(options.taskName ?? 'default', options.seed);

  const taskDef: TaskDefinition = {
    version: '1.0',
    metadata: { name: options.taskName ?? 'synthetic', domain, complexity: 'medium' },
    description: '',
    processRef: './dummy.process.js',
    input: inputSpec,
    evaluation: { dimensions: {} as TaskDefinition['evaluation']['dimensions'] },
  };

  return selectAndRunGenerator(taskDef, seed);
}

// ---------------------------------------------------------------------------
// Public API: prepareEvaluationArtifacts
// ---------------------------------------------------------------------------

/**
 * Create evaluation reference artifacts for the judge.
 *
 * These include ground truth values, expected counts, reference data, and
 * the full evaluation criteria from the task definition. The judge loads
 * these to verify the agent's output.
 */
export function prepareEvaluationArtifacts(
  catalogEntry: CatalogEntry,
  inputData: GeneratedData,
  taskDef: TaskDefinition,
  evalDir: string,
): EvalArtifacts {
  ensureDir(evalDir);

  const filePaths: string[] = [];
  const data: Record<string, unknown> = {};

  // 1. Write evaluation criteria
  const criteriaPath = path.join(evalDir, 'evaluation-criteria.json');
  const criteria = {
    taskName: catalogEntry.name,
    domain: catalogEntry.domain,
    complexity: catalogEntry.complexity,
    dimensions: taskDef.evaluation.dimensions,
    scoringNotes: taskDef.evaluation.scoringNotes ?? null,
  };
  writeFile(criteriaPath, JSON.stringify(criteria, null, 2) + '\n');
  filePaths.push(criteriaPath);
  data.criteria = criteria;

  // 2. Write input generation metadata (ground truth for what was generated)
  const genMetaPath = path.join(evalDir, 'generation-metadata.json');
  const genMeta = {
    taskName: catalogEntry.name,
    generatedAt: new Date().toISOString(),
    inputMetadata: Object.fromEntries(
      Object.entries(inputData.metadata).map(([k, v]) => [k, v]),
    ),
    inputFiles: [...inputData.files.keys()],
  };
  writeFile(genMetaPath, JSON.stringify(genMeta, null, 2) + '\n');
  filePaths.push(genMetaPath);
  data.generationMetadata = genMeta;

  // 3. Write expected output spec (if defined)
  if (taskDef.expectedOutput) {
    const expectedPath = path.join(evalDir, 'expected-output.json');
    writeFile(expectedPath, JSON.stringify(taskDef.expectedOutput, null, 2) + '\n');
    filePaths.push(expectedPath);
    data.expectedOutput = taskDef.expectedOutput;
  }

  // 4. Domain-specific ground truth
  const groundTruth = buildGroundTruth(catalogEntry.domain, inputData);
  if (Object.keys(groundTruth).length > 0) {
    const gtPath = path.join(evalDir, 'ground-truth.json');
    writeFile(gtPath, JSON.stringify(groundTruth, null, 2) + '\n');
    filePaths.push(gtPath);
    data.groundTruth = groundTruth;
  }

  // 5. Write process reference path
  const processRefPath = path.join(evalDir, 'process-ref.json');
  const processRef = {
    taskName: catalogEntry.name,
    processPath: catalogEntry.processPath,
  };
  writeFile(processRefPath, JSON.stringify(processRef, null, 2) + '\n');
  filePaths.push(processRefPath);
  data.processRef = processRef;

  return { filePaths, data };
}

/**
 * Build domain-specific ground truth from generated data.
 */
function buildGroundTruth(
  domain: string,
  inputData: GeneratedData,
): Record<string, unknown> {
  const gt: Record<string, unknown> = {};

  switch (domain) {
    case 'translation':
    case 'content-generation': {
      gt.totalWordCount = inputData.metadata.totalWordCount ?? null;
      gt.chapterCount = inputData.metadata.chapterCount ?? null;
      gt.uniqueWords = inputData.metadata.uniqueWords ?? null;
      gt.language = inputData.metadata.language ?? null;
      gt.bookTitle = inputData.metadata.bookTitle ?? null;
      break;
    }

    case 'code-refactoring':
    case 'testing':
    case 'devops': {
      gt.moduleCount = inputData.metadata.moduleCount ?? null;
      gt.totalFiles = inputData.metadata.totalFiles ?? null;
      gt.totalLines = inputData.metadata.totalLines ?? null;
      gt.hasCircularDeps = inputData.metadata.hasCircularDeps ?? null;
      gt.circularDepPairs = inputData.metadata.circularDepPairs ?? null;
      gt.modules = inputData.metadata.modules ?? null;
      break;
    }

    case 'data-analysis':
    case 'research': {
      gt.datasetRowCount = inputData.metadata.datasetRowCount ?? null;
      gt.datasetColumnCount = inputData.metadata.datasetColumnCount ?? null;
      gt.datasetHeaders = inputData.metadata.datasetHeaders ?? null;
      gt.seriesStats = inputData.metadata.seriesStats ?? null;
      gt.wordFrequencyUniqueWords = inputData.metadata.wordFrequencyUniqueWords ?? null;
      break;
    }
  }

  return gt;
}

// ---------------------------------------------------------------------------
// Public API: prepareTask
// ---------------------------------------------------------------------------

/**
 * Prepare a benchmark task for execution.
 *
 * Reads the task's metadata.yaml, generates/acquires all required input data,
 * prepares evaluation artifacts, composes the task prompt, and returns a
 * fully resolved PreparedTask.
 */
export async function prepareTask(
  catalogEntry: CatalogEntry,
  options: PrepareOptions = {},
): Promise<PreparedTask> {
  const startTime = Date.now();

  // Resolve output directory
  const projectRoot = getProjectRoot();
  const baseOutputDir = options.outputDir ?? path.join(projectRoot, 'results', 'prepared');
  const taskOutputDir = path.join(baseOutputDir, catalogEntry.name);
  const inputDir = path.join(taskOutputDir, 'input');
  const evalDir = path.join(taskOutputDir, 'evaluation');

  // Check cache (skip if force)
  if (!options.force && fs.existsSync(taskOutputDir)) {
    const markerPath = path.join(taskOutputDir, '.prepared.json');
    if (fs.existsSync(markerPath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as PreparedTask;
        // Validate that cached entry still has valid paths
        if (fs.existsSync(cached.inputDir)) {
          return cached;
        }
      } catch {
        // Cache corrupted; regenerate
      }
    }
  }

  // Clean and create directories
  if (fs.existsSync(taskOutputDir)) {
    fs.rmSync(taskOutputDir, { recursive: true, force: true });
  }
  ensureDir(inputDir);
  ensureDir(evalDir);

  // Read the task definition
  const taskDef = readTaskDefinition(catalogEntry.yamlPath);
  const inputSpec = taskDef.input ?? {};
  const inputType = inputSpec.type ?? 'generated';
  const seed = resolveSeed(catalogEntry.name, options.seed);

  // Materialize input data based on type
  let generatedData: GeneratedData = { files: new Map(), metadata: {} };

  switch (inputType) {
    case 'inline': {
      materializeInlineArtifacts(inputSpec, inputDir);
      break;
    }

    case 'file':
    case 'directory': {
      materializeFileArtifacts(inputSpec, catalogEntry.taskDir, inputDir);
      break;
    }

    case 'url': {
      await materializeUrlArtifacts(inputSpec, inputDir);
      break;
    }

    case 'generated':
    default: {
      generatedData = selectAndRunGenerator(taskDef, seed);
      // Write all generated files to the input directory
      for (const [relativePath, content] of generatedData.files) {
        writeFile(path.join(inputDir, relativePath), content);
      }
      break;
    }
  }

  // Validate that artifacts exist (if declared)
  const missingArtifacts: string[] = [];
  if (inputSpec.artifacts) {
    for (const artifact of inputSpec.artifacts) {
      const artifactPath = path.join(inputDir, artifact.path ?? artifact.name);
      if (!fs.existsSync(artifactPath)) {
        missingArtifacts.push(artifact.name);
      }
    }
  }
  if (missingArtifacts.length > 0) {
    console.warn(
      `[task-preparer] Warning: missing input artifacts for ${catalogEntry.name}: ${missingArtifacts.join(', ')}`,
    );
  }

  // Prepare evaluation artifacts
  const evalArtifacts = prepareEvaluationArtifacts(
    catalogEntry,
    generatedData,
    taskDef,
    evalDir,
  );

  // Compose the task prompt
  const taskPrompt = composeTaskPrompt(taskDef, inputDir);

  // Build the PreparedTask
  const preparedTask: PreparedTask = {
    catalogEntry,
    inputDir: path.resolve(inputDir),
    taskPrompt,
    evaluationArtifacts: evalArtifacts.filePaths.map((p) => path.resolve(p)),
    preparedAt: new Date().toISOString(),
    preparationDurationMs: Date.now() - startTime,
  };

  // Write cache marker
  const markerPath = path.join(taskOutputDir, '.prepared.json');
  writeFile(markerPath, JSON.stringify(preparedTask, null, 2) + '\n');

  return preparedTask;
}

// ---------------------------------------------------------------------------
// Public API: cleanupPreparedData
// ---------------------------------------------------------------------------

/**
 * Remove all materialized data for a prepared task.
 */
export function cleanupPreparedData(preparedTask: PreparedTask): void {
  // The input dir is inside the task output dir; find the parent
  const taskOutputDir = path.dirname(preparedTask.inputDir);

  if (fs.existsSync(taskOutputDir)) {
    fs.rmSync(taskOutputDir, { recursive: true, force: true });
  }
}
