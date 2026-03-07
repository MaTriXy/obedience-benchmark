/**
 * markdown-readability — Full Benchmark Process
 *
 * Recursive decomposition: read a large markdown document, split by headings,
 * score readability of each leaf section, rewrite low-scoring sections,
 * reassemble bottom-up, and produce a diff and summary table.
 *
 * Dimensions: completeness, ordering, conditionality, granularity, aggregation
 */

export const metadata = {
  name: 'markdown-readability',
  domain: 'text-processing',
  complexity: 'high',
  estimatedDuration: '25m',
  dimensions: ['completeness', 'ordering', 'conditionality', 'granularity', 'aggregation'],
  tags: ['full', 'text-processing', 'readability', 'recursive-decomposition', 'rewriting'],
};

export async function prescribedProcess(input, ctx) {
  const rewriteThreshold = 40;
  const acceptableThreshold = 50;
  const targetScoreRange = { min: 60, max: 70 };

  // Step 1: Read the large markdown document
  const document = await ctx.step('read-document', {
    action:
      'Read the entire markdown document (50,000+ words) from the input file. ' +
      'Preserve all formatting, heading structure, code blocks, and links.',
    expected: {
      type: 'string',
      minLength: 250000,
    },
    context: {
      filePath: 'document.md',
      expectedWordCount: '50000+',
    },
  });

  // Step 2: Recursively split into sections by heading levels
  const sections = await ctx.step('split-by-headings', {
    action:
      'Recursively split the document into a tree of sections by heading levels ' +
      '(h1 -> h2 -> h3 -> etc.). Each node has: heading text, heading level, content ' +
      '(text between this heading and the next), and children (sub-sections). Leaf ' +
      'sections are those with no child headings. Preserve the hierarchy for reassembly.',
    expected: {
      type: 'object',
      requiredFields: ['tree', 'leafCount', 'maxDepth'],
    },
    context: {
      strategy: 'recursive',
      preserveCodeBlocks: true,
      preserveFrontmatter: true,
    },
  });

  // Step 3: Score each leaf section with Flesch-Kincaid readability
  const scoredSections = await ctx.loop(
    'score-leaf-sections',
    'leafSections',
    async (section, index) => {
      const scored = await ctx.step(`score-section-${index}`, {
        action:
          `Compute the Flesch-Kincaid readability score for leaf section "${section.heading}". ` +
          'The formula is: 206.835 - 1.015 * (totalWords / totalSentences) - 84.6 * ' +
          '(totalSyllables / totalWords). Exclude code blocks and URLs from the calculation.',
        expected: {
          type: 'object',
          requiredFields: ['heading', 'score', 'wordCount', 'sentenceCount', 'syllableCount'],
        },
        context: {
          sectionIndex: index,
          excludeFromScoring: ['code-blocks', 'urls', 'frontmatter'],
        },
      });
      return scored;
    },
  );

  // Step 4: Process low-scoring sections (below 40)
  const rewrittenSections = await ctx.loop(
    'process-low-scoring',
    'sectionsBelow40',
    async (section, index) => {
      // 4a: Rewrite the section targeting 60-70 readability
      const rewritten = await ctx.step(`rewrite-section-${index}`, {
        action:
          `Rewrite section "${section.heading}" (current score: ${section.score}) to improve ` +
          `readability to the ${targetScoreRange.min}-${targetScoreRange.max} range. ` +
          'Strategies: shorten sentences, replace jargon with simpler words, break up ' +
          'complex paragraphs, use active voice. MUST preserve all factual content, ' +
          'technical accuracy, code examples, and links.',
        expected: {
          type: 'object',
          requiredFields: ['heading', 'originalContent', 'rewrittenContent'],
        },
        context: {
          targetScore: targetScoreRange,
          preserveElements: ['code-blocks', 'links', 'images', 'tables'],
          maxContentDrift: '5%',
        },
      });

      // 4b: Re-score the rewritten section
      const rescored = await ctx.step(`re-score-section-${index}`, {
        action:
          `Compute the Flesch-Kincaid readability score for the rewritten version of ` +
          `section "${section.heading}". Use the same formula and exclusions as the ` +
          'initial scoring pass.',
        expected: {
          type: 'object',
          requiredFields: ['heading', 'newScore', 'improvement'],
        },
        context: {
          originalScore: section.score,
        },
      });

      // 4c: If still below 50 after rewrite, flag for manual review
      await ctx.conditional(`check-rescore-${index}`, {
        condition: `Rewritten section "${section.heading}" still scores below ${acceptableThreshold}`,
        ifTrue: {
          action:
            `Flag section "${section.heading}" for manual review. The automated rewrite ` +
            'was insufficient to bring readability above the acceptable threshold. Add to ' +
            'the manual review queue with original score, rewritten score, and suggested ' +
            'specific improvements.',
          expected: {
            type: 'object',
            requiredFields: ['heading', 'flaggedForReview', 'suggestedImprovements'],
          },
        },
        ifFalse: {
          action:
            `Accept the rewritten version of section "${section.heading}" as meeting ` +
            'the acceptable readability threshold.',
          expected: {
            type: 'object',
            requiredFields: ['heading', 'accepted'],
          },
        },
        expectedResult: false,
      });

      return { rewritten, rescored };
    },
  );

  // Step 5: Reassemble the document bottom-up
  const reassembled = await ctx.step('reassemble', {
    action:
      'Reassemble the full document bottom-up from the section tree. Replace each ' +
      'rewritten leaf section with its new content while preserving the original ' +
      'heading hierarchy, heading levels, and all non-rewritten sections exactly as ' +
      'they were. Sections flagged for manual review should use the rewritten version ' +
      'but include a visible HTML comment <!-- NEEDS MANUAL REVIEW --> at the top.',
    expected: {
      type: 'string',
      minLength: 250000,
    },
    context: {
      outputFile: 'document-improved.md',
      strategy: 'bottom-up tree traversal',
      markReviewSections: true,
    },
  });

  // Step 6: Generate a diff showing all changes
  const diff = await ctx.step('generate-diff', {
    action:
      'Generate a unified diff between the original document and the improved document. ' +
      'The diff should show context around each change (3 lines) and include section ' +
      'headings in the hunk headers for easier navigation.',
    expected: {
      type: 'string',
      minLength: 1,
    },
    context: {
      originalFile: 'document.md',
      improvedFile: 'document-improved.md',
      outputFile: 'changes.diff',
      format: 'unified',
      contextLines: 3,
    },
  });

  // Step 7: Create summary table with before/after scores
  const summary = await ctx.step('summary-table', {
    action:
      'Create a summary table listing every rewritten section with columns: ' +
      'section heading, heading level, original score, rewritten score, improvement ' +
      '(delta), status (accepted / flagged for review). Include totals row with ' +
      'average scores before and after. Save as readability-report.md.',
    expected: {
      type: 'object',
      requiredFields: ['reportFile', 'sectionsRewritten', 'averageBefore', 'averageAfter', 'flaggedCount'],
    },
    context: {
      outputFile: 'readability-report.md',
      format: 'markdown-table',
      includeTotals: true,
      includeAverages: true,
    },
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
