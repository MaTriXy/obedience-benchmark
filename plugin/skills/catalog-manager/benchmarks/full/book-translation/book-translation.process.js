/**
 * book-translation — Full Benchmark Process
 *
 * Map-reduce translation pipeline. Split a book into chapters and chunks,
 * analyze context at book and chapter level, translate chunks in parallel,
 * combine, and verify cross-chapter consistency.
 *
 * Dimensions: completeness, ordering, parallelism, granularity, aggregation
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'book-translation',
  domain: 'translation',
  complexity: 'high',
  estimatedDuration: '30m',
  dimensions: ['completeness', 'ordering', 'parallelism', 'granularity', 'aggregation'],
  tags: ['full', 'map-reduce', 'translation', 'parallel', 'nested-loop'],
};

const readBookTask = defineTask('read-book', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Read the source book',
  agent: {
    name: 'read-source-book',
    prompt: {
      role: 'Book reader',
      task: 'Read the entire source book from the input file',
      context: args,
      instructions: [
        'Read the complete contents of the book at the given file path.',
        'Return the full text as a string.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['text'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const splitChaptersTask = defineTask('split-chapters', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Split book into chapters',
  agent: {
    name: 'split-chapters',
    prompt: {
      role: 'Text splitter',
      task: 'Split the book text into an ordered array of chapters, preserving chapter titles and boundaries',
      context: args,
      instructions: [
        'Identify chapter boundaries using chapter headings.',
        'Return an ordered array of chapter objects.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['chapters'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const analyzeContextTask = defineTask('analyze-context', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Analyze book-level context',
  agent: {
    name: 'analyze-book-context',
    prompt: {
      role: 'Literary analyst',
      task: 'Analyze the full book to extract style guide, tone profile, recurring terminology, and character names that must remain consistent across all translations',
      context: args,
      instructions: [
        'Extract the writing style, tone, glossary of recurring terms, and character names.',
        'These will be used to ensure consistency across chapter translations.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['style', 'tone', 'glossary', 'characterNames'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const analyzeChapterContextTask = defineTask('analyze-chapter-context', (args, taskCtx) => ({
  kind: 'agent',
  title: `Analyze chapter ${args.chapterIndex} context`,
  agent: {
    name: 'analyze-chapter-context',
    prompt: {
      role: 'Chapter analyst',
      task: `Analyze chapter ${args.chapterIndex} to extract chapter-specific themes, new vocabulary, and narrative tone shifts relative to the book-level context`,
      context: args,
      instructions: [
        'Identify themes, local terminology, and any tone shifts specific to this chapter.',
        'Compare against the book-level context provided.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['themes', 'localTerminology', 'toneShift'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const splitChapterChunksTask = defineTask('split-chapter-chunks', (args, taskCtx) => ({
  kind: 'agent',
  title: `Split chapter ${args.chapterIndex} into chunks`,
  agent: {
    name: 'split-chapter-chunks',
    prompt: {
      role: 'Text chunker',
      task: `Split chapter ${args.chapterIndex} into chunks of approximately 500 words each, breaking at paragraph boundaries`,
      context: args,
      instructions: [
        'Break the chapter into chunks of roughly 500 words.',
        'Always break at paragraph boundaries.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['chunks'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const translateChunkTask = defineTask('translate-chunk', (args, taskCtx) => ({
  kind: 'agent',
  title: `Translate chunk ${args.chunkIndex} of chapter ${args.chapterIndex}`,
  agent: {
    name: 'translate-chunk',
    prompt: {
      role: 'Translator',
      task: `Translate chunk ${args.chunkIndex} of chapter ${args.chapterIndex} from ${args.sourceLanguage} to ${args.targetLanguage}, respecting the book-level glossary and chapter-level context`,
      context: args,
      instructions: [
        'Translate the chunk faithfully, preserving meaning and tone.',
        'Use the book-level glossary and chapter-level context for consistency.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['translatedText'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const combineTranslationsTask = defineTask('combine-translations', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Combine all translated chunks',
  agent: {
    name: 'combine-translations',
    prompt: {
      role: 'Book assembler',
      task: 'Combine all translated chunks back into a single coherent book, restoring chapter boundaries, headings, and formatting',
      context: args,
      instructions: [
        'Reassemble the translated chunks into a complete book.',
        'Restore chapter boundaries, headings, and formatting.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['combinedText'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const consistencyCheckTask = defineTask('consistency-check', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Verify translation consistency',
  agent: {
    name: 'consistency-checker',
    prompt: {
      role: 'Quality assurance reviewer',
      task: 'Verify translation consistency across all chapters: check that glossary terms are translated uniformly, character names are consistent, tone is coherent, and no chunks were dropped or duplicated',
      context: args,
      instructions: [
        'Check glossary term consistency across all chapters.',
        'Verify character name consistency.',
        'Ensure tone coherence and no missing or duplicated chunks.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['isConsistent', 'issues', 'glossaryCompliance', 'coveragePercent'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const finalOutputTask = defineTask('final-output', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Write final translated book',
  agent: {
    name: 'write-final-output',
    prompt: {
      role: 'Output writer',
      task: 'Write the final translated book to the output file, including a metadata header with source/target languages, translation date, and consistency report summary',
      context: args,
      instructions: [
        'Write the translated book to the output path.',
        'Include a metadata header with language info, date, and consistency summary.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['outputPath'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export async function process(inputs, ctx) {
  // Step 1: Read the source book
  const book = await ctx.task(readBookTask, {
    filePath: inputs.bookPath,
    sourceLanguage: inputs.sourceLanguage,
  });

  // Step 2: Split the book into chapters
  const chapters = await ctx.task(splitChaptersTask, {
    splitStrategy: 'by-chapter-heading',
  });

  // Step 3: Analyze book-level context (style, tone, terminology glossary)
  const bookContext = await ctx.task(analyzeContextTask, {
    targetLanguage: inputs.targetLanguage,
  });

  // Step 4: For each chapter, analyze chapter-specific context
  const chapterContexts = [];
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const chapter = chapters[chapterIndex];
    const chapterCtx = await ctx.task(analyzeChapterContextTask, {
      chapterIndex,
      chapterTitle: chapter.title,
      bookContext,
    });
    chapterContexts.push(chapterCtx);
  }

  // Step 5 & 6: For each chapter, split into chunks and translate chunks in parallel
  const allTranslatedChapters = [];
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const chapter = chapters[chapterIndex];

    // Split chapter into translatable chunks
    const chunks = await ctx.task(splitChapterChunksTask, {
      chapterIndex,
      maxChunkSize: 500,
      splitStrategy: 'paragraph-boundary',
    });

    // Translate all chunks of this chapter in parallel
    const translatedChunks = await Promise.all(
      chunks.map((chunk, chunkIndex) =>
        ctx.task(translateChunkTask, {
          chapterIndex,
          chunkIndex,
          bookContext,
          chapterContext: chapterContexts[chapterIndex],
          sourceLanguage: inputs.sourceLanguage,
          targetLanguage: inputs.targetLanguage,
        }),
      ),
    );

    allTranslatedChapters.push(translatedChunks);
  }

  // Step 7: Combine all translated chunks into the final book
  const combinedBook = await ctx.task(combineTranslationsTask, {
    totalChapters: chapters.length,
    targetLanguage: inputs.targetLanguage,
  });

  // Step 8: Cross-chunk / cross-chapter consistency check
  const consistencyReport = await ctx.task(consistencyCheckTask, {
    bookContext,
    chapterContexts,
    targetLanguage: inputs.targetLanguage,
  });

  // Step 9: Write the final translated book
  const finalOutput = await ctx.task(finalOutputTask, {
    outputPath: inputs.outputPath,
    consistencyReport,
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
