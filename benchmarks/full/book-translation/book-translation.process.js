/**
 * book-translation — Full Benchmark Process
 *
 * Map-reduce translation pipeline. Split a book into chapters and chunks,
 * analyze context at book and chapter level, translate chunks in parallel,
 * combine, and verify cross-chapter consistency.
 *
 * Dimensions: completeness, ordering, parallelism, granularity, aggregation
 */

export const metadata = {
  name: 'book-translation',
  domain: 'translation',
  complexity: 'high',
  estimatedDuration: '30m',
  dimensions: ['completeness', 'ordering', 'parallelism', 'granularity', 'aggregation'],
  tags: ['full', 'map-reduce', 'translation', 'parallel', 'nested-loop'],
};

export async function prescribedProcess(input, ctx) {
  // Step 1: Read the source book
  const book = await ctx.step('read-book', {
    action: 'Read the entire source book from the input file',
    expected: { type: 'string', minLength: 1 },
    context: { filePath: input.bookPath, sourceLanguage: input.sourceLanguage },
  });

  // Step 2: Split the book into chapters
  const chapters = await ctx.step('split-chapters', {
    action: 'Split the book text into an ordered array of chapters, preserving chapter titles and boundaries',
    expected: { type: 'array', minLength: 1 },
    context: { splitStrategy: 'by-chapter-heading' },
  });

  // Step 3: Analyze book-level context (style, tone, terminology glossary)
  const bookContext = await ctx.step('analyze-context', {
    action: 'Analyze the full book to extract style guide, tone profile, recurring terminology, and character names that must remain consistent across all translations',
    expected: {
      type: 'object',
      requiredFields: ['style', 'tone', 'glossary', 'characterNames'],
    },
    context: { targetLanguage: input.targetLanguage },
  });

  // Step 4: For each chapter, analyze chapter-specific context
  const chapterContexts = await ctx.loop('analyze-chapter-context', chapters, async (chapter, chapterIndex) => {
    const chapterCtx = await ctx.step(`analyze-chapter-${chapterIndex}-context`, {
      action: `Analyze chapter ${chapterIndex} to extract chapter-specific themes, new vocabulary, and narrative tone shifts relative to the book-level context`,
      expected: {
        type: 'object',
        requiredFields: ['themes', 'localTerminology', 'toneShift'],
      },
      context: {
        chapterIndex,
        chapterTitle: chapter.title,
        bookContext,
      },
    });
    return chapterCtx;
  });

  // Step 5 & 6: For each chapter, split into chunks and translate chunks in parallel
  const allTranslatedChapters = await ctx.loop('translate-chapters', chapters, async (chapter, chapterIndex) => {
    // Split chapter into translatable chunks
    const chunks = await ctx.step(`split-chapter-${chapterIndex}-chunks`, {
      action: `Split chapter ${chapterIndex} into chunks of approximately 500 words each, breaking at paragraph boundaries`,
      expected: { type: 'array', minLength: 1 },
      context: {
        chapterIndex,
        maxChunkSize: 500,
        splitStrategy: 'paragraph-boundary',
      },
    });

    // Translate all chunks of this chapter in parallel
    const parallelTranslations = chunks.map((chunk, chunkIndex) => ({
      action: `Translate chunk ${chunkIndex} of chapter ${chapterIndex} from ${input.sourceLanguage} to ${input.targetLanguage}, respecting the book-level glossary and chapter-level context`,
      expected: { type: 'string', minLength: 1 },
      context: {
        chapterIndex,
        chunkIndex,
        bookContext,
        chapterContext: chapterContexts[chapterIndex],
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
      },
    }));

    const translatedChunks = await ctx.parallel(`translate-chapter-${chapterIndex}-chunks`, parallelTranslations);

    return translatedChunks;
  });

  // Step 7: Combine all translated chunks into the final book
  const combinedBook = await ctx.step('combine-translations', {
    action: 'Combine all translated chunks back into a single coherent book, restoring chapter boundaries, headings, and formatting',
    expected: { type: 'string', minLength: 1 },
    context: {
      totalChapters: chapters.length,
      targetLanguage: input.targetLanguage,
    },
  });

  // Step 8: Cross-chunk / cross-chapter consistency check
  const consistencyReport = await ctx.step('consistency-check', {
    action: 'Verify translation consistency across all chapters: check that glossary terms are translated uniformly, character names are consistent, tone is coherent, and no chunks were dropped or duplicated',
    expected: {
      type: 'object',
      requiredFields: ['isConsistent', 'issues', 'glossaryCompliance', 'coveragePercent'],
    },
    context: {
      bookContext,
      chapterContexts,
      targetLanguage: input.targetLanguage,
    },
  });

  // Step 9: Write the final translated book
  const finalOutput = await ctx.step('final-output', {
    action: 'Write the final translated book to the output file, including a metadata header with source/target languages, translation date, and consistency report summary',
    expected: { type: 'string' },
    context: {
      outputPath: input.outputPath,
      consistencyReport,
    },
  });

  return finalOutput;
}

export const evaluation = {
  completeness: {
    weight: 25,
    criteria:
      'Agent must execute every stage: read book, split chapters, analyze book-level context, analyze per-chapter context, translate every chunk, combine translations, run consistency check, and produce final output.',
  },
  ordering: {
    weight: 20,
    criteria:
      'Context analysis must precede translation. Chunk translations must precede combination. Combination must precede the consistency check.',
  },
  parallelism: {
    weight: 20,
    criteria:
      'Chunks within the same chapter must be translated in parallel, not sequentially. The parallel call should contain all chunks of a chapter.',
  },
  granularity: {
    weight: 20,
    criteria:
      'The book must be split into chapters, and each chapter into chunks. Every chunk must be individually translated with iteration metadata (chapter index, chunk index).',
  },
  aggregation: {
    weight: 15,
    criteria:
      'All translated chunks must be recombined into a single coherent book. The consistency check must compare terminology and style across all chapters.',
  },
};
