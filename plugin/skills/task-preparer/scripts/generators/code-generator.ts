/**
 * Code Generator
 *
 * Generates mock codebases for benchmark tasks involving code-refactoring,
 * testing, and devops domains. Supports:
 * - Multi-file TypeScript/JavaScript projects
 * - Circular dependency injection
 * - Test file stubs
 * - Configuration files (tsconfig, package.json, etc.)
 *
 * All generation is deterministic given the same seed.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0 || 1;
  }

  next(): number {
    let s = this.state;
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    this.state = s;
    return (s >>> 0) / 4294967296;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = [...arr];
    const result: T[] = [];
    const count = Math.min(n, copy.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(this.next() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    return result;
  }

  intBetween(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  boolean(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

const MODULE_NAMES = [
  'auth', 'user', 'product', 'order', 'payment', 'notification',
  'analytics', 'config', 'database', 'cache', 'logger', 'validator',
  'router', 'middleware', 'handler', 'service', 'repository', 'utils',
  'helpers', 'constants', 'types', 'errors', 'events', 'queue',
] as const;

const CLASS_NAMES = [
  'Manager', 'Service', 'Controller', 'Repository', 'Factory',
  'Builder', 'Handler', 'Processor', 'Provider', 'Adapter',
  'Resolver', 'Validator', 'Transformer', 'Dispatcher', 'Registry',
] as const;

const METHOD_NAMES = [
  'initialize', 'process', 'validate', 'transform', 'execute',
  'create', 'update', 'delete', 'find', 'findAll', 'getById',
  'save', 'remove', 'notify', 'publish', 'subscribe', 'handle',
  'configure', 'reset', 'refresh', 'sync', 'fetch', 'parse',
] as const;

const VARIABLE_TYPES = [
  'string', 'number', 'boolean', 'string[]', 'number[]',
  'Record<string, unknown>', 'Map<string, string>', 'Set<string>',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeGeneratorOptions {
  /** Seed for deterministic generation. */
  seed?: number;
  /** Number of source modules to generate. */
  moduleCount?: number;
  /** Whether to inject circular dependencies. */
  circularDeps?: boolean;
  /** Number of circular dependency pairs to inject. */
  circularDepCount?: number;
  /** Whether to generate test files. */
  includeTests?: boolean;
  /** Whether to generate config files (tsconfig, package.json). */
  includeConfigs?: boolean;
  /** Project name. */
  projectName?: string;
  /** Language: 'typescript' or 'javascript'. */
  language?: 'typescript' | 'javascript';
}

export interface GeneratedFile {
  /** Relative path within the project. */
  relativePath: string;
  /** File content. */
  content: string;
  /** File purpose (for metadata). */
  purpose: string;
}

export interface GeneratedCodebase {
  /** Project name. */
  projectName: string;
  /** All generated files. */
  files: GeneratedFile[];
  /** Metadata about the codebase. */
  metadata: CodebaseMetadata;
}

export interface CodebaseMetadata {
  seed: number;
  language: string;
  moduleCount: number;
  totalFiles: number;
  totalLines: number;
  hasCircularDeps: boolean;
  circularDepPairs: Array<[string, string]>;
  hasTests: boolean;
  modules: string[];
}

// ---------------------------------------------------------------------------
// Internal: module content generation
// ---------------------------------------------------------------------------

interface ModuleSpec {
  name: string;
  className: string;
  imports: string[];
  methods: string[];
  exports: string[];
}

function generateModuleSpecs(
  rng: SeededRandom,
  count: number,
): ModuleSpec[] {
  const selectedModules = rng.sample(MODULE_NAMES, Math.min(count, MODULE_NAMES.length));

  // If we need more than the pool, append numbered variants
  while (selectedModules.length < count) {
    const base = rng.pick(MODULE_NAMES);
    selectedModules.push(`${base}${selectedModules.length}` as typeof MODULE_NAMES[number]);
  }

  const specs: ModuleSpec[] = [];
  for (const moduleName of selectedModules) {
    const className =
      moduleName.charAt(0).toUpperCase() +
      moduleName.slice(1) +
      rng.pick(CLASS_NAMES);

    const methodCount = rng.intBetween(2, 5);
    const methods = rng.sample(METHOD_NAMES, methodCount);

    specs.push({
      name: moduleName,
      className,
      imports: [],
      methods: [...methods],
      exports: [className],
    });
  }

  // Wire up imports: each module imports from 1-3 others (no self-import)
  for (const spec of specs) {
    const others = specs.filter((s) => s.name !== spec.name);
    const importCount = rng.intBetween(1, Math.min(3, others.length));
    const imported = rng.sample(others, importCount);
    spec.imports = imported.map((s) => s.name);
  }

  return specs;
}

function injectCircularDeps(
  specs: ModuleSpec[],
  rng: SeededRandom,
  pairCount: number,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];

  for (let i = 0; i < pairCount && specs.length >= 2; i++) {
    const [a, b] = rng.sample(specs, 2);

    // Ensure a imports b AND b imports a
    if (!a.imports.includes(b.name)) {
      a.imports.push(b.name);
    }
    if (!b.imports.includes(a.name)) {
      b.imports.push(a.name);
    }

    pairs.push([a.name, b.name]);
  }

  return pairs;
}

function renderTypeScriptModule(spec: ModuleSpec): string {
  const lines: string[] = [];
  const rng = new SeededRandom(spec.name.length * 31);

  // File header
  lines.push(`/**`);
  lines.push(` * ${spec.className} module`);
  lines.push(` *`);
  lines.push(` * Provides ${spec.name} functionality.`);
  lines.push(` */`);
  lines.push('');

  // Imports
  for (const imp of spec.imports) {
    const impClass =
      imp.charAt(0).toUpperCase() + imp.slice(1) + 'Service';
    lines.push(`import { ${impClass} } from './${imp}.js';`);
  }
  if (spec.imports.length > 0) lines.push('');

  // Interface
  lines.push(`export interface ${spec.className}Config {`);
  lines.push(`  enabled: boolean;`);
  lines.push(`  timeout: number;`);
  lines.push(`  retries: number;`);
  lines.push(`}`);
  lines.push('');

  // Class
  lines.push(`export class ${spec.className} {`);
  lines.push(`  private config: ${spec.className}Config;`);
  lines.push(`  private initialized = false;`);

  // Add fields for imports
  for (const imp of spec.imports) {
    const impClass =
      imp.charAt(0).toUpperCase() + imp.slice(1) + 'Service';
    lines.push(`  private ${imp}: ${impClass} | null = null;`);
  }
  lines.push('');

  // Constructor
  lines.push(`  constructor(config: Partial<${spec.className}Config> = {}) {`);
  lines.push(`    this.config = {`);
  lines.push(`      enabled: config.enabled ?? true,`);
  lines.push(`      timeout: config.timeout ?? 5000,`);
  lines.push(`      retries: config.retries ?? 3,`);
  lines.push(`    };`);
  lines.push(`  }`);
  lines.push('');

  // Methods
  for (const method of spec.methods) {
    const returnType = rng.pick(VARIABLE_TYPES);
    lines.push(`  async ${method}(): Promise<${returnType}> {`);
    lines.push(`    if (!this.initialized) {`);
    lines.push(`      throw new Error('${spec.className} not initialized');`);
    lines.push(`    }`);
    lines.push(`    // TODO: implement ${method}`);
    lines.push(`    return undefined as unknown as ${returnType};`);
    lines.push(`  }`);
    lines.push('');
  }

  lines.push(`  async initialize(): Promise<void> {`);
  lines.push(`    this.initialized = true;`);
  for (const imp of spec.imports) {
    const impClass =
      imp.charAt(0).toUpperCase() + imp.slice(1) + 'Service';
    lines.push(`    this.${imp} = new ${impClass}();`);
  }
  lines.push(`  }`);
  lines.push('');

  lines.push(`  isInitialized(): boolean {`);
  lines.push(`    return this.initialized;`);
  lines.push(`  }`);

  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

function renderJavaScriptModule(spec: ModuleSpec): string {
  const lines: string[] = [];
  const rng = new SeededRandom(spec.name.length * 31);

  lines.push(`/**`);
  lines.push(` * ${spec.className} module`);
  lines.push(` *`);
  lines.push(` * Provides ${spec.name} functionality.`);
  lines.push(` */`);
  lines.push('');

  for (const imp of spec.imports) {
    const impClass =
      imp.charAt(0).toUpperCase() + imp.slice(1) + 'Service';
    lines.push(`const { ${impClass} } = require('./${imp}');`);
  }
  if (spec.imports.length > 0) lines.push('');

  lines.push(`class ${spec.className} {`);
  lines.push(`  constructor(config = {}) {`);
  lines.push(`    this.config = {`);
  lines.push(`      enabled: config.enabled ?? true,`);
  lines.push(`      timeout: config.timeout ?? 5000,`);
  lines.push(`      retries: config.retries ?? 3,`);
  lines.push(`    };`);
  lines.push(`    this.initialized = false;`);
  for (const imp of spec.imports) {
    lines.push(`    this.${imp} = null;`);
  }
  lines.push(`  }`);
  lines.push('');

  for (const method of spec.methods) {
    void rng.pick(VARIABLE_TYPES); // consume for determinism parity
    lines.push(`  async ${method}() {`);
    lines.push(`    if (!this.initialized) {`);
    lines.push(`      throw new Error('${spec.className} not initialized');`);
    lines.push(`    }`);
    lines.push(`    // TODO: implement ${method}`);
    lines.push(`    return undefined;`);
    lines.push(`  }`);
    lines.push('');
  }

  lines.push(`  async initialize() {`);
  lines.push(`    this.initialized = true;`);
  for (const imp of spec.imports) {
    const impClass =
      imp.charAt(0).toUpperCase() + imp.slice(1) + 'Service';
    lines.push(`    this.${imp} = new ${impClass}();`);
  }
  lines.push(`  }`);
  lines.push('');

  lines.push(`  isInitialized() {`);
  lines.push(`    return this.initialized;`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push('');
  lines.push(`module.exports = { ${spec.className} };`);
  lines.push('');

  return lines.join('\n');
}

function generateTestFile(
  spec: ModuleSpec,
  language: 'typescript' | 'javascript',
): string {
  const ext = language === 'typescript' ? '.js' : '';
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Tests for ${spec.className}`);
  lines.push(` */`);
  lines.push('');

  if (language === 'typescript') {
    lines.push(`import { describe, it, beforeEach } from 'node:test';`);
    lines.push(`import assert from 'node:assert/strict';`);
    lines.push(`import { ${spec.className} } from '../src/${spec.name}${ext}';`);
  } else {
    lines.push(`const { describe, it, beforeEach } = require('node:test');`);
    lines.push(`const assert = require('node:assert/strict');`);
    lines.push(`const { ${spec.className} } = require('../src/${spec.name}');`);
  }
  lines.push('');

  lines.push(`describe('${spec.className}', () => {`);
  lines.push(`  let instance${language === 'typescript' ? `: ${spec.className}` : ''};`);
  lines.push('');

  lines.push(`  beforeEach(() => {`);
  lines.push(`    instance = new ${spec.className}();`);
  lines.push(`  });`);
  lines.push('');

  lines.push(`  it('should create an instance', () => {`);
  lines.push(`    assert.ok(instance);`);
  lines.push(`  });`);
  lines.push('');

  lines.push(`  it('should not be initialized by default', () => {`);
  lines.push(`    assert.strictEqual(instance.isInitialized(), false);`);
  lines.push(`  });`);
  lines.push('');

  lines.push(`  it('should initialize successfully', async () => {`);
  lines.push(`    await instance.initialize();`);
  lines.push(`    assert.strictEqual(instance.isInitialized(), true);`);
  lines.push(`  });`);
  lines.push('');

  for (const method of spec.methods) {
    lines.push(`  it('should throw if ${method} is called before init', async () => {`);
    lines.push(`    await assert.rejects(() => instance.${method}(), {`);
    lines.push(`      message: '${spec.className} not initialized',`);
    lines.push(`    });`);
    lines.push(`  });`);
    lines.push('');
  }

  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}

function generatePackageJson(projectName: string, language: 'typescript' | 'javascript'): string {
  const pkg: Record<string, unknown> = {
    name: projectName,
    version: '1.0.0',
    description: `Generated mock project: ${projectName}`,
    main: language === 'typescript' ? 'dist/index.js' : 'src/index.js',
    type: language === 'typescript' ? 'module' : 'commonjs',
    scripts: {
      build: language === 'typescript' ? 'tsc' : 'echo "No build step"',
      test: 'node --test test/',
    },
    dependencies: {},
    devDependencies: language === 'typescript'
      ? { typescript: '^5.4.0', '@types/node': '^20.11.0' }
      : {},
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'Node16',
      moduleResolution: 'Node16',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'dist', 'test'],
  };

  return JSON.stringify(config, null, 2) + '\n';
}

function generateIndexFile(specs: ModuleSpec[], language: 'typescript' | 'javascript'): string {
  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Main entry point - re-exports all modules.`);
  lines.push(` */`);
  lines.push('');

  for (const spec of specs) {
    if (language === 'typescript') {
      lines.push(`export { ${spec.className} } from './${spec.name}.js';`);
    } else {
      lines.push(`const { ${spec.className} } = require('./${spec.name}');`);
    }
  }

  if (language === 'javascript') {
    lines.push('');
    lines.push('module.exports = {');
    for (const spec of specs) {
      lines.push(`  ${spec.className},`);
    }
    lines.push('};');
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a complete mock codebase.
 */
export function generateCodebase(options: CodeGeneratorOptions = {}): GeneratedCodebase {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const language = options.language ?? 'typescript';
  const moduleCount = options.moduleCount ?? rng.intBetween(5, 10);
  const includeTests = options.includeTests ?? true;
  const includeConfigs = options.includeConfigs ?? true;
  const circularDeps = options.circularDeps ?? false;
  const circularDepCount = options.circularDepCount ?? rng.intBetween(1, 3);
  const projectName = options.projectName ?? `mock-project-${seed}`;

  const ext = language === 'typescript' ? '.ts' : '.js';
  const testExt = language === 'typescript' ? '.test.ts' : '.test.js';

  // Generate module specs
  const specs = generateModuleSpecs(rng, moduleCount);

  // Inject circular dependencies if requested
  let circularPairs: Array<[string, string]> = [];
  if (circularDeps) {
    circularPairs = injectCircularDeps(specs, rng, circularDepCount);
  }

  const files: GeneratedFile[] = [];

  // Source files
  for (const spec of specs) {
    const content = language === 'typescript'
      ? renderTypeScriptModule(spec)
      : renderJavaScriptModule(spec);

    files.push({
      relativePath: `src/${spec.name}${ext}`,
      content,
      purpose: `${spec.name} module source`,
    });
  }

  // Index file
  files.push({
    relativePath: `src/index${ext}`,
    content: generateIndexFile(specs, language),
    purpose: 'Main entry point',
  });

  // Test files
  if (includeTests) {
    for (const spec of specs) {
      files.push({
        relativePath: `test/${spec.name}${testExt}`,
        content: generateTestFile(spec, language),
        purpose: `Tests for ${spec.name}`,
      });
    }
  }

  // Config files
  if (includeConfigs) {
    files.push({
      relativePath: 'package.json',
      content: generatePackageJson(projectName, language),
      purpose: 'Package manifest',
    });

    if (language === 'typescript') {
      files.push({
        relativePath: 'tsconfig.json',
        content: generateTsConfig(),
        purpose: 'TypeScript configuration',
      });
    }
  }

  // Compute metadata
  let totalLines = 0;
  for (const f of files) {
    totalLines += f.content.split('\n').length;
  }

  return {
    projectName,
    files,
    metadata: {
      seed,
      language,
      moduleCount,
      totalFiles: files.length,
      totalLines,
      hasCircularDeps: circularPairs.length > 0,
      circularDepPairs: circularPairs,
      hasTests: includeTests,
      modules: specs.map((s) => s.name),
    },
  };
}
