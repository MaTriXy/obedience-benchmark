/**
 * crossword-puzzle — Full Benchmark Process
 *
 * Backtracking + constraint satisfaction: generate a valid 15x15 crossword
 * puzzle. Load dictionary, generate grid skeleton with rotational symmetry,
 * fill words via backtracking (longest slot first), verify constraints,
 * fix violations, and produce final output.
 *
 * Dimensions: completeness, ordering, conditionality, errorHandling
 */

export const metadata = {
  name: 'crossword-puzzle',
  domain: 'algorithms',
  complexity: 'high',
  estimatedDuration: '35m',
  dimensions: ['completeness', 'ordering', 'conditionality', 'errorHandling'],
  tags: ['full', 'algorithms', 'backtracking', 'constraint-satisfaction', 'puzzle-generation'],
};

export async function prescribedProcess(input, ctx) {
  const gridSize = 15;
  const minWords = 40;
  const minWordLength = 3;
  const dictionarySize = 5000;

  // Error handler: backtracking exhaustion recovery
  ctx.errorHandler('backtracking-exhaustion', {
    triggerCondition:
      'No valid word can be placed in any candidate slot and all backtracking ' +
      'options for the current region have been exhausted',
    action:
      'Clear a larger region (3x3 to 5x5 area) around the problematic slot, ' +
      'removing all placed words that intersect with the cleared region, then ' +
      'retry filling from the longest cleared slot',
    maxRetries: 5,
    logAs: 'WARN: Backtracking exhausted — clearing region and retrying',
  });

  // Step 1: Load the dictionary
  const dictionary = await ctx.step('load-dictionary', {
    action:
      `Load a ${dictionarySize}-word dictionary from the word list file. Filter to ` +
      `include only words with ${minWordLength}+ letters, all uppercase, alphabetic ` +
      'characters only. Index words by length for efficient lookup during filling.',
    expected: {
      type: 'object',
      requiredFields: ['words', 'totalCount', 'byLength'],
    },
    context: {
      filePath: 'dictionary.txt',
      minLength: minWordLength,
      maxLength: gridSize,
      format: 'one-word-per-line',
      normalize: 'uppercase',
    },
  });

  // Step 2: Generate grid skeleton with black squares and rotational symmetry
  const skeleton = await ctx.step('generate-grid-skeleton', {
    action:
      `Generate a ${gridSize}x${gridSize} crossword grid skeleton. Place black squares ` +
      'such that: (1) the pattern has 180-degree rotational symmetry, (2) all white ' +
      'regions are fully connected (no isolated white areas), (3) no white run is shorter ' +
      `than ${minWordLength} cells, (4) black square density is between 15-20% of total cells. ` +
      'Output the grid as a 2D array where 1 = black square, 0 = white cell.',
    expected: {
      type: 'object',
      requiredFields: ['grid', 'blackSquareCount', 'blackSquarePercentage'],
    },
    context: {
      size: gridSize,
      symmetry: '180-degree-rotational',
      targetBlackSquarePercent: { min: 15, max: 20 },
      ensureConnectivity: true,
      minRunLength: minWordLength,
    },
  });

  // Step 3: Identify all word slots (across and down)
  const slots = await ctx.step('identify-slots', {
    action:
      'Scan the grid skeleton to identify all word slots. A slot is a maximal contiguous ' +
      `run of white cells in a row (across) or column (down) of length >= ${minWordLength}. ` +
      'For each slot record: direction (across/down), start row, start column, length, and ' +
      'list of cells. Sort slots by length descending for filling order.',
    expected: {
      type: 'object',
      requiredFields: ['slots', 'acrossCount', 'downCount', 'totalSlots'],
    },
    context: {
      minSlotLength: minWordLength,
      sortBy: 'length-descending',
      includeIntersections: true,
    },
  });

  // Step 4: Fill words using backtracking, longest slot first
  const filledGrid = await ctx.loop(
    'fill-words',
    'slotsSortedByLengthDescending',
    async (slot, index) => {
      // 4a: Select the longest unfilled slot
      const selectedSlot = await ctx.step(`select-slot-${index}`, {
        action:
          `Select the longest unfilled slot (slot #${index}). Record its direction, ` +
          'position, length, and any letters already placed by intersecting words.',
        expected: {
          type: 'object',
          requiredFields: ['slotId', 'direction', 'row', 'col', 'length', 'knownLetters'],
        },
        context: {
          slotIndex: index,
          strategy: 'longest-first',
        },
      });

      // 4b: Find valid candidate words from dictionary
      const candidates = await ctx.step(`find-candidates-${index}`, {
        action:
          'Find all valid words from the dictionary that match this slot. A word is valid ' +
          'if: (1) its length equals the slot length, (2) it matches all already-placed ' +
          'letters at intersecting positions, (3) placing it would not create invalid ' +
          'partial words in crossing slots. Rank candidates by number of future options ' +
          'they leave open in crossing slots (most constrained first).',
        expected: {
          type: 'object',
          requiredFields: ['candidates', 'candidateCount'],
        },
        context: {
          slotId: selectedSlot,
          strategy: 'constraint-propagation',
          rankBy: 'future-options-for-crossings',
        },
      });

      // 4c: Place the best candidate word
      const placement = await ctx.step(`place-word-${index}`, {
        action:
          'Place the highest-ranked candidate word into the slot. Update the grid state ' +
          'and record the placement for potential backtracking.',
        expected: {
          type: 'object',
          requiredFields: ['word', 'slotId', 'placed', 'gridState'],
        },
        context: {
          selectionStrategy: 'highest-ranked-candidate',
          recordForBacktracking: true,
        },
      });

      // 4d: If no word fits, backtrack to previous slot
      await ctx.conditional(`check-valid-${index}`, {
        condition: 'No valid candidate word exists for this slot (candidateCount === 0)',
        ifTrue: {
          action:
            'Backtrack: undo the most recent word placement(s) until a slot is found ' +
            'where an alternative candidate can be tried. Remove the previously placed ' +
            'word from the used-words set and try the next-ranked candidate.',
          expected: {
            type: 'object',
            requiredFields: ['backtrackSteps', 'newCandidateTried', 'slotsCleared'],
          },
        },
        ifFalse: {
          action: 'Placement successful. Proceed to the next slot.',
          expected: {
            type: 'object',
            requiredFields: ['success'],
          },
        },
        expectedResult: false,
      });

      return placement;
    },
  );

  // Step 5: Verify ALL constraints
  const verification = await ctx.step('verify-constraints', {
    action:
      'Verify the completed grid against all 5 constraints: ' +
      '(1) Every word in the grid must appear in the dictionary. ' +
      '(2) All words must be at least 3 letters long. ' +
      '(3) The black square pattern must have 180-degree rotational symmetry. ' +
      `(4) The grid must contain at least ${minWords} words total. ` +
      '(5) No 2-letter sequence (bigram) may appear more than 2 times across all words. ' +
      'Report each constraint as pass/fail with details on any violations.',
    expected: {
      type: 'object',
      requiredFields: [
        'allPassed',
        'dictionaryWordsCheck',
        'minLengthCheck',
        'symmetryCheck',
        'minWordCountCheck',
        'bigramRepeatCheck',
        'violations',
      ],
    },
    context: {
      constraints: [
        { id: 'dictionary-words', description: 'All words must be in the dictionary' },
        { id: 'min-length', description: `All words must be >= ${minWordLength} letters` },
        { id: 'rotational-symmetry', description: '180-degree rotational symmetry of black squares' },
        { id: 'min-word-count', description: `Grid must contain >= ${minWords} words` },
        { id: 'bigram-limit', description: 'No 2-letter sequence repeated more than 2 times' },
      ],
    },
  });

  // Step 6: If any constraint is violated, fix it
  await ctx.conditional('check-violations', {
    condition: 'Any of the 5 constraints has a violation (allPassed === false)',
    ifTrue: {
      action:
        'Constraint violations detected. Execute the repair sequence: identify the ' +
        'specific violation(s), clear the affected region of the grid, and re-fill ' +
        'the cleared region using the same backtracking approach.',
      expected: {
        type: 'object',
        requiredFields: ['violationsFound', 'repairPlan'],
      },
    },
    ifFalse: {
      action: 'All constraints pass. Proceed to output generation.',
      expected: {
        type: 'object',
        requiredFields: ['allPassed'],
      },
    },
    expectedResult: false,
  });

  // Step 6a (conditional): Identify specific violations
  const violationDetails = await ctx.step('identify-violation', {
    action:
      'For each constraint violation found, identify: which words or grid positions ' +
      'are involved, the severity (how many words are affected), and the minimal set ' +
      'of words that need to be removed to fix the issue.',
    expected: {
      type: 'object',
      requiredFields: ['violations', 'affectedWords', 'removalPlan'],
    },
    context: {
      strategy: 'minimal-disruption',
    },
  });

  // Step 6b (conditional): Clear the affected region
  const clearedGrid = await ctx.step('clear-region', {
    action:
      'Remove the identified words from the grid, clearing all their cells (except ' +
      'cells shared with valid crossing words). Update the slot state to mark these ' +
      'slots as unfilled.',
    expected: {
      type: 'object',
      requiredFields: ['clearedSlots', 'preservedIntersections', 'gridState'],
    },
    context: {
      preserveCrossings: true,
    },
  });

  // Step 6c (conditional): Re-fill the cleared region
  const refilledGrid = await ctx.step('re-fill', {
    action:
      'Re-fill the cleared slots using the same backtracking algorithm (longest first). ' +
      'Exclude previously-violating words from candidates. After filling, re-verify ' +
      'all 5 constraints to confirm the fix.',
    expected: {
      type: 'object',
      requiredFields: ['filledSlots', 'allConstraintsPassed', 'verificationReport'],
    },
    context: {
      excludePreviousViolators: true,
      reVerifyAfterFill: true,
    },
  });

  // Step 7: Generate final output
  const output = await ctx.step('generate-output', {
    action:
      'Produce the final crossword puzzle output consisting of three parts: ' +
      '(1) The completed 15x15 grid displayed as a formatted text grid with black ' +
      'squares shown as "#" and letters in their cells, with row/column numbering. ' +
      '(2) A numbered clue list organized by Across and Down, where each clue ' +
      'references the grid number, direction, and the answer word. ' +
      '(3) A constraint verification report showing pass/fail for each of the 5 ' +
      'constraints with details. Save all output to crossword-output.txt.',
    expected: {
      type: 'object',
      requiredFields: [
        'gridDisplay',
        'acrossClues',
        'downClues',
        'constraintReport',
        'totalWords',
        'outputFile',
      ],
    },
    context: {
      outputFile: 'crossword-output.txt',
      gridFormat: 'text-with-numbering',
      blackSquareChar: '#',
      includeAnswerKey: true,
    },
  });

  return output;
}

export const evaluation = {
  completeness: {
    weight: 25,
    criteria:
      'Agent must produce a fully filled 15x15 grid, a numbered clue list (across and down), ' +
      'and a constraint verification report. All 5 constraints must be checked',
  },
  ordering: {
    weight: 25,
    criteria:
      'Steps must follow the prescribed sequence: load dictionary -> generate skeleton -> ' +
      'identify slots -> fill words -> verify constraints -> fix violations -> generate output. ' +
      'Filling must process longest slots first',
  },
  conditionality: {
    weight: 25,
    criteria:
      'Agent must correctly evaluate constraint violations and branch to the fix path only ' +
      'when violations exist. Backtracking must trigger when no valid word fits a slot',
  },
  errorHandling: {
    weight: 25,
    criteria:
      'On backtracking exhaustion (no valid word for any candidate), the agent must clear a ' +
      'larger region around the problematic slot and retry rather than failing entirely',
  },
};
