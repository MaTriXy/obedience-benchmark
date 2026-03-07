/**
 * Data Generator
 *
 * Generates synthetic datasets for benchmark tasks:
 * - CSV datasets (tabular data with headers)
 * - JSON datasets (arrays of objects)
 * - Word frequency lists
 * - Numeric series (time series, random walks, distributions)
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

  intBetween(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  floatBetween(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Approximate normal distribution via Box-Muller. */
  normal(mean = 0, stddev = 1): number {
    const u1 = this.next() || 0.0001;
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }
}

// ---------------------------------------------------------------------------
// Name / value pools for realistic data
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George',
  'Hannah', 'Ivan', 'Julia', 'Kevin', 'Laura', 'Marcus', 'Nina',
  'Oscar', 'Patricia', 'Quinn', 'Rachel', 'Samuel', 'Tara',
] as const;

const LAST_NAMES = [
  'Anderson', 'Brown', 'Chen', 'Davis', 'Evans', 'Fisher', 'Garcia',
  'Hill', 'Ivanov', 'Jones', 'Kim', 'Lee', 'Miller', 'Nguyen',
  'Park', 'Robinson', 'Smith', 'Taylor', 'Wang', 'Wilson',
] as const;

const CITIES = [
  'New York', 'London', 'Tokyo', 'Paris', 'Sydney', 'Berlin',
  'Toronto', 'Mumbai', 'Seoul', 'Madrid', 'Rome', 'Vienna',
  'Dublin', 'Oslo', 'Helsinki', 'Prague', 'Warsaw', 'Lisbon',
] as const;

const CATEGORIES = [
  'Electronics', 'Books', 'Clothing', 'Food', 'Sports', 'Home',
  'Automotive', 'Health', 'Toys', 'Garden', 'Music', 'Art',
] as const;

const STATUSES = ['active', 'inactive', 'pending', 'suspended', 'archived'] as const;

const WORDS_POOL = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
  'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
  'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could',
  'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only',
  'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use',
  'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new',
  'want', 'because', 'any', 'these', 'give', 'day', 'most', 'find',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataGeneratorOptions {
  /** Seed for deterministic generation. */
  seed?: number;
  /** Number of rows/records. */
  rowCount?: number;
  /** Schema for the dataset (column definitions). */
  schema?: DataColumnDef[];
}

export interface DataColumnDef {
  /** Column name. */
  name: string;
  /** Column type. */
  type: 'string' | 'number' | 'integer' | 'float' | 'boolean' | 'date' | 'name' | 'city' | 'category' | 'status' | 'email' | 'id';
  /** Min value (for numeric types). */
  min?: number;
  /** Max value (for numeric types). */
  max?: number;
  /** Possible values (for string enum). */
  values?: string[];
  /** Whether values can be null. */
  nullable?: boolean;
  /** Null probability (0-1). */
  nullProbability?: number;
}

export interface GeneratedDataset {
  /** Column headers. */
  headers: string[];
  /** Row data as arrays of primitives. */
  rows: Array<Array<string | number | boolean | null>>;
  /** Row data as objects. */
  records: Array<Record<string, string | number | boolean | null>>;
  /** Metadata. */
  metadata: DatasetMetadata;
}

export interface DatasetMetadata {
  seed: number;
  rowCount: number;
  columnCount: number;
  schema: DataColumnDef[];
  generatedAt: string;
}

export interface GeneratedWordFrequencyList {
  entries: Array<{ word: string; frequency: number; rank: number }>;
  totalWords: number;
  uniqueWords: number;
}

export interface NumericSeriesOptions {
  seed?: number;
  length?: number;
  seriesType?: 'random-walk' | 'sine' | 'linear' | 'normal' | 'uniform';
  min?: number;
  max?: number;
  startValue?: number;
  stepSize?: number;
}

export interface GeneratedNumericSeries {
  values: number[];
  labels: string[];
  stats: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stddev: number;
    sum: number;
  };
}

// ---------------------------------------------------------------------------
// Default schema
// ---------------------------------------------------------------------------

const DEFAULT_SCHEMA: DataColumnDef[] = [
  { name: 'id', type: 'id' },
  { name: 'first_name', type: 'name' },
  { name: 'last_name', type: 'name' },
  { name: 'email', type: 'email' },
  { name: 'city', type: 'city' },
  { name: 'category', type: 'category' },
  { name: 'amount', type: 'float', min: 10, max: 10000 },
  { name: 'quantity', type: 'integer', min: 1, max: 100 },
  { name: 'status', type: 'status' },
  { name: 'active', type: 'boolean' },
];

// ---------------------------------------------------------------------------
// Cell generation
// ---------------------------------------------------------------------------

function generateCell(
  rng: SeededRandom,
  col: DataColumnDef,
  rowIndex: number,
): string | number | boolean | null {
  // Nullable check
  if (col.nullable && rng.next() < (col.nullProbability ?? 0.1)) {
    return null;
  }

  switch (col.type) {
    case 'id':
      return rowIndex + 1;

    case 'name':
      return col.name.toLowerCase().includes('last')
        ? rng.pick(LAST_NAMES)
        : rng.pick(FIRST_NAMES);

    case 'email': {
      const first = rng.pick(FIRST_NAMES).toLowerCase();
      const last = rng.pick(LAST_NAMES).toLowerCase();
      const domains = ['example.com', 'test.org', 'mail.dev', 'demo.io'];
      return `${first}.${last}@${rng.pick(domains)}`;
    }

    case 'city':
      return rng.pick(CITIES);

    case 'category':
      return col.values ? rng.pick(col.values) : rng.pick(CATEGORIES);

    case 'status':
      return col.values ? rng.pick(col.values) : rng.pick(STATUSES);

    case 'string':
      if (col.values) return rng.pick(col.values);
      return rng.pick(WORDS_POOL) + '-' + rng.intBetween(100, 999);

    case 'integer':
      return rng.intBetween(col.min ?? 0, col.max ?? 1000);

    case 'float':
    case 'number':
      return Math.round(rng.floatBetween(col.min ?? 0, col.max ?? 1000) * 100) / 100;

    case 'boolean':
      return rng.next() < 0.5;

    case 'date': {
      const start = new Date('2020-01-01').getTime();
      const end = new Date('2025-12-31').getTime();
      const ts = start + rng.next() * (end - start);
      return new Date(ts).toISOString().split('T')[0];
    }

    default:
      return rng.pick(WORDS_POOL);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a synthetic tabular dataset.
 */
export function generateDataset(options: DataGeneratorOptions = {}): GeneratedDataset {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const rowCount = options.rowCount ?? 100;
  const schema = options.schema ?? DEFAULT_SCHEMA;
  const headers = schema.map((c) => c.name);

  const rows: Array<Array<string | number | boolean | null>> = [];
  const records: Array<Record<string, string | number | boolean | null>> = [];

  for (let i = 0; i < rowCount; i++) {
    const row: Array<string | number | boolean | null> = [];
    const record: Record<string, string | number | boolean | null> = {};

    for (const col of schema) {
      const value = generateCell(rng, col, i);
      row.push(value);
      record[col.name] = value;
    }

    rows.push(row);
    records.push(record);
  }

  return {
    headers,
    rows,
    records,
    metadata: {
      seed,
      rowCount,
      columnCount: schema.length,
      schema,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Serialize a dataset as CSV.
 */
export function datasetToCsv(dataset: GeneratedDataset): string {
  const lines: string[] = [];

  // Header
  lines.push(dataset.headers.join(','));

  // Rows
  for (const row of dataset.rows) {
    const cells = row.map((v) => {
      if (v === null) return '';
      if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return String(v);
    });
    lines.push(cells.join(','));
  }

  return lines.join('\n') + '\n';
}

/**
 * Serialize a dataset as JSON (array of objects).
 */
export function datasetToJson(dataset: GeneratedDataset): string {
  return JSON.stringify(dataset.records, null, 2) + '\n';
}

/**
 * Generate a word frequency list.
 */
export function generateWordFrequencyList(options: {
  seed?: number;
  wordCount?: number;
  sourceWordCount?: number;
} = {}): GeneratedWordFrequencyList {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const sourceWordCount = options.sourceWordCount ?? 10000;

  // Generate a corpus by picking words with Zipf-like distribution
  const frequencies: Record<string, number> = {};
  for (let i = 0; i < sourceWordCount; i++) {
    // Bias toward more common words (lower index)
    const idx = Math.floor(Math.pow(rng.next(), 1.5) * WORDS_POOL.length);
    const word = WORDS_POOL[Math.min(idx, WORDS_POOL.length - 1)];
    frequencies[word] = (frequencies[word] ?? 0) + 1;
  }

  // Sort by frequency descending
  const sorted = Object.entries(frequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, options.wordCount ?? Object.keys(frequencies).length);

  const entries = sorted.map(([word, frequency], index) => ({
    word,
    frequency,
    rank: index + 1,
  }));

  return {
    entries,
    totalWords: sourceWordCount,
    uniqueWords: entries.length,
  };
}

/**
 * Serialize a word frequency list as a text file (word\tfrequency per line).
 */
export function wordFrequencyToTsv(list: GeneratedWordFrequencyList): string {
  const lines = ['word\tfrequency\trank'];
  for (const entry of list.entries) {
    lines.push(`${entry.word}\t${entry.frequency}\t${entry.rank}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Generate a numeric series.
 */
export function generateNumericSeries(options: NumericSeriesOptions = {}): GeneratedNumericSeries {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const length = options.length ?? 100;
  const seriesType = options.seriesType ?? 'random-walk';
  const min = options.min ?? 0;
  const max = options.max ?? 100;
  const startValue = options.startValue ?? (min + max) / 2;
  const stepSize = options.stepSize ?? (max - min) / 50;

  const values: number[] = [];
  const labels: string[] = [];

  switch (seriesType) {
    case 'random-walk': {
      let current = startValue;
      for (let i = 0; i < length; i++) {
        values.push(Math.round(current * 100) / 100);
        labels.push(`t${i}`);
        current += (rng.next() - 0.5) * 2 * stepSize;
        current = Math.max(min, Math.min(max, current));
      }
      break;
    }

    case 'sine': {
      for (let i = 0; i < length; i++) {
        const mid = (min + max) / 2;
        const amp = (max - min) / 2;
        const noise = (rng.next() - 0.5) * amp * 0.1;
        const val = mid + amp * Math.sin((2 * Math.PI * i) / length) + noise;
        values.push(Math.round(val * 100) / 100);
        labels.push(`t${i}`);
      }
      break;
    }

    case 'linear': {
      const slope = (max - min) / length;
      for (let i = 0; i < length; i++) {
        const noise = (rng.next() - 0.5) * stepSize;
        const val = min + slope * i + noise;
        values.push(Math.round(val * 100) / 100);
        labels.push(`t${i}`);
      }
      break;
    }

    case 'normal': {
      const mean = (min + max) / 2;
      const stddev = (max - min) / 6;
      for (let i = 0; i < length; i++) {
        const val = Math.max(min, Math.min(max, rng.normal(mean, stddev)));
        values.push(Math.round(val * 100) / 100);
        labels.push(`t${i}`);
      }
      break;
    }

    case 'uniform': {
      for (let i = 0; i < length; i++) {
        values.push(Math.round(rng.floatBetween(min, max) * 100) / 100);
        labels.push(`t${i}`);
      }
      break;
    }
  }

  // Compute stats
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const median =
    values.length % 2 === 0
      ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
      : sorted[Math.floor(values.length / 2)];

  return {
    values,
    labels,
    stats: {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      stddev: Math.round(Math.sqrt(variance) * 100) / 100,
      sum: Math.round(sum * 100) / 100,
    },
  };
}

/**
 * Serialize a numeric series as CSV.
 */
export function numericSeriesToCsv(series: GeneratedNumericSeries): string {
  const lines = ['label,value'];
  for (let i = 0; i < series.values.length; i++) {
    lines.push(`${series.labels[i]},${series.values[i]}`);
  }
  return lines.join('\n') + '\n';
}
