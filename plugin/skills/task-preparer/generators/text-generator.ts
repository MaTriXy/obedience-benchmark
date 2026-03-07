/**
 * Text Generator
 *
 * Generates synthetic text artifacts for benchmark tasks:
 * - Books (multi-chapter prose with word counts)
 * - Documents (structured markdown)
 * - Word lists (frequency-sorted)
 * - Plain text passages
 *
 * All generation is deterministic given the same seed.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (simple xorshift32 for reproducibility)
// ---------------------------------------------------------------------------

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0 || 1;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let s = this.state;
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    this.state = s;
    return (s >>> 0) / 4294967296;
  }

  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick n unique elements from an array. */
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

  /** Returns an integer in [min, max]. */
  intBetween(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

// ---------------------------------------------------------------------------
// Vocabulary pools
// ---------------------------------------------------------------------------

const NOUNS = [
  'river', 'mountain', 'forest', 'city', 'kingdom', 'library', 'tower',
  'garden', 'bridge', 'shadow', 'mirror', 'storm', 'flame', 'ocean',
  'crystal', 'lantern', 'sword', 'crown', 'compass', 'scroll', 'stone',
  'wolf', 'raven', 'dragon', 'phoenix', 'sage', 'traveler', 'merchant',
  'knight', 'scholar', 'child', 'elder', 'captain', 'weaver', 'painter',
  'village', 'harbor', 'desert', 'canyon', 'glacier', 'meadow', 'cavern',
] as const;

const ADJECTIVES = [
  'ancient', 'golden', 'silent', 'crimson', 'forgotten', 'winding',
  'shattered', 'luminous', 'hollow', 'eternal', 'verdant', 'iron',
  'sapphire', 'amber', 'obsidian', 'silver', 'copper', 'frozen',
  'endless', 'hidden', 'brave', 'weary', 'gentle', 'fierce', 'solemn',
  'brilliant', 'dark', 'pale', 'swift', 'distant', 'fragile', 'vast',
] as const;

const VERBS = [
  'wandered', 'discovered', 'traversed', 'illuminated', 'forged',
  'whispered', 'shattered', 'revealed', 'concealed', 'pursued',
  'gathered', 'constructed', 'observed', 'remembered', 'transformed',
  'crossed', 'descended', 'ascended', 'examined', 'protected',
  'carried', 'opened', 'closed', 'abandoned', 'restored', 'followed',
] as const;

const ADVERBS = [
  'carefully', 'swiftly', 'quietly', 'boldly', 'reluctantly',
  'eagerly', 'slowly', 'suddenly', 'gracefully', 'steadily',
  'deliberately', 'cautiously', 'silently', 'fiercely', 'gently',
] as const;

const CONJUNCTIONS = [
  'and', 'but', 'yet', 'so', 'for', 'while', 'although',
  'because', 'however', 'therefore', 'meanwhile', 'nevertheless',
] as const;

const PREPOSITIONS = [
  'across', 'through', 'beneath', 'beyond', 'within', 'above',
  'among', 'beside', 'toward', 'along', 'around', 'between',
] as const;

// ---------------------------------------------------------------------------
// Sentence / paragraph generation
// ---------------------------------------------------------------------------

function generateSentence(rng: SeededRandom): string {
  const patterns = [
    // The [adj] [noun] [verb] [adv] [prep] the [adj] [noun].
    () => {
      const a1 = rng.pick(ADJECTIVES);
      const n1 = rng.pick(NOUNS);
      const v = rng.pick(VERBS);
      const adv = rng.pick(ADVERBS);
      const prep = rng.pick(PREPOSITIONS);
      const a2 = rng.pick(ADJECTIVES);
      const n2 = rng.pick(NOUNS);
      return `The ${a1} ${n1} ${v} ${adv} ${prep} the ${a2} ${n2}.`;
    },
    // [conj], the [noun] [verb] the [noun].
    () => {
      const conj = rng.pick(CONJUNCTIONS);
      const n1 = rng.pick(NOUNS);
      const v = rng.pick(VERBS);
      const n2 = rng.pick(NOUNS);
      return `${conj.charAt(0).toUpperCase() + conj.slice(1)}, the ${n1} ${v} the ${n2}.`;
    },
    // A [noun] of [adj] [noun] [verb] [prep] the [noun].
    () => {
      const n1 = rng.pick(NOUNS);
      const a = rng.pick(ADJECTIVES);
      const n2 = rng.pick(NOUNS);
      const v = rng.pick(VERBS);
      const prep = rng.pick(PREPOSITIONS);
      const n3 = rng.pick(NOUNS);
      return `A ${n1} of ${a} ${n2} ${v} ${prep} the ${n3}.`;
    },
    // It was [adj] and [adj], [conj] the [noun] [verb].
    () => {
      const a1 = rng.pick(ADJECTIVES);
      const a2 = rng.pick(ADJECTIVES);
      const conj = rng.pick(CONJUNCTIONS);
      const n = rng.pick(NOUNS);
      const v = rng.pick(VERBS);
      return `It was ${a1} and ${a2}, ${conj} the ${n} ${v}.`;
    },
  ];

  return rng.pick(patterns)();
}

function generateParagraph(rng: SeededRandom, sentenceCount?: number): string {
  const count = sentenceCount ?? rng.intBetween(3, 7);
  const sentences: string[] = [];
  for (let i = 0; i < count; i++) {
    sentences.push(generateSentence(rng));
  }
  return sentences.join(' ');
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TextGeneratorOptions {
  /** Seed for deterministic generation. */
  seed?: number;
  /** Target word count (approximate). */
  targetWordCount?: number;
  /** Number of chapters (for book generation). */
  chapterCount?: number;
  /** Title for the generated text. */
  title?: string;
  /** Language tag (used in metadata, content is always English). */
  language?: string;
}

export interface GeneratedBook {
  title: string;
  chapters: GeneratedChapter[];
  totalWordCount: number;
  metadata: Record<string, unknown>;
}

export interface GeneratedChapter {
  number: number;
  title: string;
  content: string;
  wordCount: number;
}

export interface GeneratedDocument {
  title: string;
  sections: Array<{ heading: string; content: string }>;
  content: string;
  wordCount: number;
}

export interface GeneratedWordList {
  words: string[];
  frequencies: Record<string, number>;
  totalUniqueWords: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a synthetic book with chapters, suitable for translation or
 * analysis tasks.
 */
export function generateBook(options: TextGeneratorOptions = {}): GeneratedBook {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const chapterCount = options.chapterCount ?? rng.intBetween(5, 12);
  const targetWords = options.targetWordCount ?? 5000;
  const wordsPerChapter = Math.ceil(targetWords / chapterCount);

  const title = options.title ?? `The ${rng.pick(ADJECTIVES).charAt(0).toUpperCase() + rng.pick(ADJECTIVES).slice(1)} ${rng.pick(NOUNS).charAt(0).toUpperCase() + rng.pick(NOUNS).slice(1)}`;

  const chapters: GeneratedChapter[] = [];
  let totalWordCount = 0;

  for (let i = 0; i < chapterCount; i++) {
    const chapterTitle = `The ${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)}`;
    const paragraphs: string[] = [];
    let chapterWords = 0;

    while (chapterWords < wordsPerChapter) {
      const para = generateParagraph(rng);
      paragraphs.push(para);
      chapterWords += para.split(/\s+/).length;
    }

    const content = paragraphs.join('\n\n');
    const wordCount = content.split(/\s+/).length;
    totalWordCount += wordCount;

    chapters.push({
      number: i + 1,
      title: chapterTitle.charAt(0).toUpperCase() + chapterTitle.slice(1),
      content,
      wordCount,
    });
  }

  return {
    title,
    chapters,
    totalWordCount,
    metadata: {
      seed,
      chapterCount,
      language: options.language ?? 'en',
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generate a synthetic book as a single markdown string.
 */
export function generateBookMarkdown(options: TextGeneratorOptions = {}): string {
  const book = generateBook(options);
  const parts: string[] = [`# ${book.title}`, ''];

  for (const chapter of book.chapters) {
    parts.push(`## Chapter ${chapter.number}: ${chapter.title}`);
    parts.push('');
    parts.push(chapter.content);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Generate a structured markdown document with sections.
 */
export function generateDocument(options: TextGeneratorOptions = {}): GeneratedDocument {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const sectionCount = rng.intBetween(4, 8);
  const targetWords = options.targetWordCount ?? 2000;
  const wordsPerSection = Math.ceil(targetWords / sectionCount);
  const title = options.title ?? `${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)} Report`;

  const sections: Array<{ heading: string; content: string }> = [];

  for (let i = 0; i < sectionCount; i++) {
    const heading = `${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)}`.replace(
      /^\w/,
      (c) => c.toUpperCase(),
    );
    const paragraphs: string[] = [];
    let words = 0;
    while (words < wordsPerSection) {
      const para = generateParagraph(rng);
      paragraphs.push(para);
      words += para.split(/\s+/).length;
    }
    sections.push({ heading, content: paragraphs.join('\n\n') });
  }

  const contentParts = [`# ${title}`, ''];
  let totalWords = 0;
  for (const section of sections) {
    contentParts.push(`## ${section.heading}`);
    contentParts.push('');
    contentParts.push(section.content);
    contentParts.push('');
    totalWords += section.content.split(/\s+/).length;
  }

  return {
    title,
    sections,
    content: contentParts.join('\n'),
    wordCount: totalWords,
  };
}

/**
 * Generate a word list with frequency counts from generated text.
 */
export function generateWordList(options: TextGeneratorOptions = {}): GeneratedWordList {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const targetWords = options.targetWordCount ?? 500;

  // Generate text and count word frequencies
  const frequencies: Record<string, number> = {};
  let totalGenerated = 0;

  while (totalGenerated < targetWords) {
    const sentence = generateSentence(rng);
    const tokens = sentence
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    for (const token of tokens) {
      frequencies[token] = (frequencies[token] ?? 0) + 1;
      totalGenerated++;
    }
  }

  // Sort by frequency descending
  const words = Object.keys(frequencies).sort(
    (a, b) => frequencies[b] - frequencies[a],
  );

  return {
    words,
    frequencies,
    totalUniqueWords: words.length,
  };
}

/**
 * Generate raw text of approximately the given word count.
 */
export function generateRawText(options: TextGeneratorOptions = {}): string {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const targetWords = options.targetWordCount ?? 1000;

  const paragraphs: string[] = [];
  let words = 0;

  while (words < targetWords) {
    const para = generateParagraph(rng);
    paragraphs.push(para);
    words += para.split(/\s+/).length;
  }

  return paragraphs.join('\n\n');
}
