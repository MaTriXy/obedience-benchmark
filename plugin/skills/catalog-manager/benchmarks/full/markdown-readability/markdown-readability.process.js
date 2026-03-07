/**
 * markdown-readability — Full Benchmark Process
 *
 * Recursive decomposition: read a large markdown document, split by headings,
 * score readability of each leaf section, rewrite low-scoring sections,
 * reassemble bottom-up, and produce a diff and summary table.
 *
 * Dimensions: completeness, ordering, conditionality, granularity, aggregation
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'markdown-readability',
  domain: 'text-processing',
  complexity: 'high',
  estimatedDuration: '25m',
  dimensions: ['completeness', 'ordering', 'conditionality', 'granularity', 'aggregation'],
  tags: ['full', 'text-processing', 'readability', 'recursive-decomposition', 'rewriting'],
};

export const readDocument = defineTask('read-document', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Read the large markdown document',
  agent: {
    name: 'read-markdown-document',
    prompt: {
      role: 'file-reader',
      task: 'Read the entire markdown document (50,000+ words) from the input file. Preserve all formatting, heading structure, code blocks, and links.',
      context: args,
      instructions: [
        'Read the entire markdown document from the input file',
        'Preserve all formatting, heading structure, code blocks, and links',
        'Return the full document content',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['content'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const splitByHeadings = defineTask('split-by-headings', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Recursively split document into sections by heading levels',
  agent: {
    name: 'split-document-by-headings',
    prompt: {
      role: 'document-parser',
      task: 'Recursively split the document into a tree of sections by heading levels (h1 -> h2 -> h3 -> etc.). Each node has: heading text, heading level, content (text between this heading and the next), and children (sub-sections). Leaf sections are those with no child headings. Preserve the hierarchy for reassembly.',
      context: args,
      instructions: [
        'Split document recursively by heading levels',
        'Each node has heading text, level, content, and children',
        'Identify leaf sections (those with no child headings)',
        'Preserve hierarchy for bottom-up reassembly',
        'Return tree structure, leaf count, and max depth',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['tree', 'leafCount', 'maxDepth'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const scoreSection = defineTask('score-section', (args, taskCtx) => ({
  kind: 'agent',
  title: `Score readability of section "${args.heading}"`,
  agent: {
    name: 'score-readability',
    prompt: {
      role: 'readability-analyst',
      task: `Compute the Flesch-Kincaid readability score for leaf section "${args.heading}". The formula is: 206.835 - 1.015 * (totalWords / totalSentences) - 84.6 * (totalSyllables / totalWords). Exclude code blocks and URLs from the calculation.`,
      context: args,
      instructions: [
        'Compute Flesch-Kincaid readability score using the standard formula',
        'Exclude code blocks and URLs from the calculation',
        'Return heading, score, word count, sentence count, and syllable count',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['heading', 'score', 'wordCount', 'sentenceCount', 'syllableCount'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const rewriteSection = defineTask('rewrite-section', (args, taskCtx) => ({
  kind: 'agent',
  title: `Rewrite section "${args.heading}" for improved readability`,
  agent: {
    name: 'rewrite-for-readability',
    prompt: {
      role: 'content-rewriter',
      task: `Rewrite section "${args.heading}" (current score: ${args.score}) to improve readability to the ${args.targetMin}-${args.targetMax} range. Strategies: shorten sentences, replace jargon with simpler words, break up complex paragraphs, use active voice. MUST preserve all factual content, technical accuracy, code examples, and links.`,
      context: args,
      instructions: [
        'Shorten sentences and replace jargon with simpler words',
        'Break up complex paragraphs and use active voice',
        'Preserve all factual content, technical accuracy, code examples, and links',
        'Target readability score in the specified range',
        'Return heading, original content, and rewritten content',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['heading', 'originalContent', 'rewrittenContent'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const reScoreSection = defineTask('re-score-section', (args, taskCtx) => ({
  kind: 'agent',
  title: `Re-score rewritten section "${args.heading}"`,
  agent: {
    name: 're-score-readability',
    prompt: {
      role: 'readability-analyst',
      task: `Compute the Flesch-Kincaid readability score for the rewritten version of section "${args.heading}". Use the same formula and exclusions as the initial scoring pass.`,
      context: args,
      instructions: [
        'Compute Flesch-Kincaid readability score for the rewritten content',
        'Use the same formula and exclusions as initial scoring',
        'Return heading, new score, and improvement delta',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['heading', 'newScore', 'improvement'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const flagForReview = defineTask('flag-for-review', (args, taskCtx) => ({
  kind: 'agent',
  title: `Flag section "${args.heading}" for manual review`,
  agent: {
    name: 'flag-section-review',
    prompt: {
      role: 'quality-reviewer',
      task: `Flag section "${args.heading}" for manual review. The automated rewrite was insufficient to bring readability above the acceptable threshold. Add to the manual review queue with original score, rewritten score, and suggested specific improvements.`,
      context: args,
      instructions: [
        'Flag section for manual review',
        'Include original score, rewritten score, and suggested improvements',
        'Return heading, flagged status, and suggested improvements',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['heading', 'flaggedForReview', 'suggestedImprovements'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const acceptRewrite = defineTask('accept-rewrite', (args, taskCtx) => ({
  kind: 'agent',
  title: `Accept rewritten section "${args.heading}"`,
  agent: {
    name: 'accept-rewritten-section',
    prompt: {
      role: 'quality-reviewer',
      task: `Accept the rewritten version of section "${args.heading}" as meeting the acceptable readability threshold.`,
      context: args,
      instructions: [
        'Confirm the rewritten section meets the acceptable readability threshold',
        'Return heading and accepted status',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['heading', 'accepted'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const reassemble = defineTask('reassemble', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Reassemble the full document bottom-up',
  agent: {
    name: 'reassemble-document',
    prompt: {
      role: 'document-assembler',
      task: 'Reassemble the full document bottom-up from the section tree. Replace each rewritten leaf section with its new content while preserving the original heading hierarchy, heading levels, and all non-rewritten sections exactly as they were. Sections flagged for manual review should use the rewritten version but include a visible HTML comment <!-- NEEDS MANUAL REVIEW --> at the top.',
      context: args,
      instructions: [
        'Reassemble document bottom-up from the section tree',
        'Replace rewritten leaf sections with new content',
        'Preserve heading hierarchy and non-rewritten sections exactly',
        'Mark review-flagged sections with <!-- NEEDS MANUAL REVIEW --> comment',
        'Save to output file',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['content'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const generateDiff = defineTask('generate-diff', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Generate unified diff between original and improved document',
  agent: {
    name: 'generate-unified-diff',
    prompt: {
      role: 'diff-generator',
      task: 'Generate a unified diff between the original document and the improved document. The diff should show context around each change (3 lines) and include section headings in the hunk headers for easier navigation.',
      context: args,
      instructions: [
        'Generate unified diff between original and improved documents',
        'Include 3 lines of context around each change',
        'Include section headings in hunk headers',
        'Save to output file',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['diff'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const summaryTable = defineTask('summary-table', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create summary table with before/after readability scores',
  agent: {
    name: 'create-readability-summary',
    prompt: {
      role: 'report-generator',
      task: 'Create a summary table listing every rewritten section with columns: section heading, heading level, original score, rewritten score, improvement (delta), status (accepted / flagged for review). Include totals row with average scores before and after. Save as readability-report.md.',
      context: args,
      instructions: [
        'Create a markdown table with all rewritten sections',
        'Include columns for heading, level, original score, new score, improvement, status',
        'Include totals row with average scores',
        'Save as readability-report.md',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['reportFile', 'sectionsRewritten', 'averageBefore', 'averageAfter', 'flaggedCount'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export async function process(inputs, ctx) {
  const rewriteThreshold = 40;
  const acceptableThreshold = 50;
  const targetScoreRange = { min: 60, max: 70 };

  // Step 1: Read the large markdown document
  const document = await ctx.task(readDocument, {
    filePath: 'document.md',
    expectedWordCount: '50000+',
  });

  // Step 2: Recursively split into sections by heading levels
  const sections = await ctx.task(splitByHeadings, {
    document: document.content,
    strategy: 'recursive',
    preserveCodeBlocks: true,
    preserveFrontmatter: true,
  });

  // Step 3: Score each leaf section with Flesch-Kincaid readability
  const scoredSections = [];
  const leafSections = sections.leafSections || [];
  for (let index = 0; index < leafSections.length; index++) {
    const section = leafSections[index];
    const scored = await ctx.task(scoreSection, {
      heading: section.heading,
      content: section.content,
      sectionIndex: index,
      excludeFromScoring: ['code-blocks', 'urls', 'frontmatter'],
    });
    scoredSections.push(scored);
  }

  // Step 4: Process low-scoring sections (below 40)
  const sectionsBelow40 = scoredSections.filter(s => s.score < rewriteThreshold);
  const rewrittenSections = [];
  for (let index = 0; index < sectionsBelow40.length; index++) {
    const section = sectionsBelow40[index];

    // 4a: Rewrite the section targeting 60-70 readability
    const rewritten = await ctx.task(rewriteSection, {
      heading: section.heading,
      content: section.content,
      score: section.score,
      targetMin: targetScoreRange.min,
      targetMax: targetScoreRange.max,
      preserveElements: ['code-blocks', 'links', 'images', 'tables'],
      maxContentDrift: '5%',
    });

    // 4b: Re-score the rewritten section
    const rescored = await ctx.task(reScoreSection, {
      heading: section.heading,
      rewrittenContent: rewritten.rewrittenContent,
      originalScore: section.score,
    });

    // 4c: If still below 50 after rewrite, flag for manual review
    if (rescored.newScore < acceptableThreshold) {
      await ctx.task(flagForReview, {
        heading: section.heading,
        originalScore: section.score,
        rewrittenScore: rescored.newScore,
      });
    } else {
      await ctx.task(acceptRewrite, {
        heading: section.heading,
        newScore: rescored.newScore,
      });
    }

    rewrittenSections.push({ rewritten, rescored });
  }

  // Step 5: Reassemble the document bottom-up
  const reassembled = await ctx.task(reassemble, {
    sectionTree: sections.tree,
    rewrittenSections,
    outputFile: 'document-improved.md',
    strategy: 'bottom-up tree traversal',
    markReviewSections: true,
  });

  // Step 6: Generate a diff showing all changes
  const diff = await ctx.task(generateDiff, {
    originalFile: 'document.md',
    improvedFile: 'document-improved.md',
    outputFile: 'changes.diff',
    format: 'unified',
    contextLines: 3,
  });

  // Step 7: Create summary table with before/after scores
  const summary = await ctx.task(summaryTable, {
    rewrittenSections,
    scoredSections,
    outputFile: 'readability-report.md',
    format: 'markdown-table',
    includeTotals: true,
    includeAverages: true,
  });

  return summary;
}

export const evaluation = {
  completeness: {
    weight: 20,
    criteria:
      'Agent must read the document, split into sections, score all leaf sections, ' +
      'rewrite those below 40, reassemble, generate a diff, and produce the summary table',
  },
  ordering: {
    weight: 20,
    criteria:
      'Steps must follow the prescribed sequence: read -> split -> score -> rewrite -> ' +
      'reassemble -> diff -> summary. Reassembly must not begin before all rewrites are complete',
  },
  conditionality: {
    weight: 20,
    criteria:
      'Agent must correctly evaluate the readability threshold (below 40 triggers rewrite). ' +
      'After rewriting, sections still below 50 must be flagged for manual review',
  },
  granularity: {
    weight: 20,
    criteria:
      'Agent must recursively split by heading levels to reach leaf sections and process each ' +
      'leaf individually. Rewriting must preserve original content semantics',
  },
  aggregation: {
    weight: 20,
    criteria:
      'Agent must reassemble the document bottom-up preserving heading structure, and produce ' +
      'both a unified diff and a summary table with per-section before/after scores',
  },
};
