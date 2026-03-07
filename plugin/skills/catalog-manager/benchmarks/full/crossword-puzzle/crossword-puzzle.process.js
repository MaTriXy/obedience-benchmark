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

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'crossword-puzzle',
  domain: 'algorithms',
  complexity: 'high',
  estimatedDuration: '35m',
  dimensions: ['completeness', 'ordering', 'conditionality', 'errorHandling'],
  tags: ['full', 'algorithms', 'backtracking', 'constraint-satisfaction', 'puzzle-generation'],
};

export const errorHandlers = [
  {
    id: 'backtracking-exhaustion',
    triggerCondition:
      'No valid word can be placed in any candidate slot and all backtracking ' +
      'options for the current region have been exhausted',
    action:
      'Clear a larger region (3x3 to 5x5 area) around the problematic slot, ' +
      'removing all placed words that intersect with the cleared region, then ' +
      'retry filling from the longest cleared slot',
    maxRetries: 5,
    logAs: 'WARN: Backtracking exhausted — clearing region and retrying',
  },
];

export const loadDictionary = defineTask('load-dictionary', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Load and index the dictionary',
  agent: {
    name: 'load-word-dictionary',
    prompt: {
      role: 'data-loader',
      task: `Load a ${args.dictionarySize}-word dictionary from the word list file. Filter to include only words with ${args.minLength}+ letters, all uppercase, alphabetic characters only. Index words by length for efficient lookup during filling.`,
      context: args,
      instructions: [
        'Load dictionary from the word list file',
        `Filter to words with ${args.minLength}+ letters`,
        'Normalize to uppercase, alphabetic characters only',
        'Index words by length for efficient lookup',
        'Return words, total count, and by-length index',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['words', 'totalCount', 'byLength'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const generateGridSkeleton = defineTask('generate-grid-skeleton', (args, taskCtx) => ({
  kind: 'agent',
  title: `Generate ${args.size}x${args.size} crossword grid skeleton`,
  agent: {
    name: 'generate-crossword-skeleton',
    prompt: {
      role: 'grid-generator',
      task: `Generate a ${args.size}x${args.size} crossword grid skeleton. Place black squares such that: (1) the pattern has 180-degree rotational symmetry, (2) all white regions are fully connected (no isolated white areas), (3) no white run is shorter than ${args.minRunLength} cells, (4) black square density is between 15-20% of total cells. Output the grid as a 2D array where 1 = black square, 0 = white cell.`,
      context: args,
      instructions: [
        'Generate grid with 180-degree rotational symmetry',
        'Ensure all white regions are fully connected',
        `Ensure no white run is shorter than ${args.minRunLength} cells`,
        'Target 15-20% black square density',
        'Output as 2D array (1 = black, 0 = white)',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['grid', 'blackSquareCount', 'blackSquarePercentage'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const identifySlots = defineTask('identify-slots', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Identify all word slots (across and down)',
  agent: {
    name: 'identify-word-slots',
    prompt: {
      role: 'grid-analyzer',
      task: `Scan the grid skeleton to identify all word slots. A slot is a maximal contiguous run of white cells in a row (across) or column (down) of length >= ${args.minSlotLength}. For each slot record: direction (across/down), start row, start column, length, and list of cells. Sort slots by length descending for filling order.`,
      context: args,
      instructions: [
        'Scan grid for all across and down word slots',
        `Filter to slots of length >= ${args.minSlotLength}`,
        'Record direction, position, length, and cells for each slot',
        'Sort slots by length descending',
        'Include intersection information',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['slots', 'acrossCount', 'downCount', 'totalSlots'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const selectSlot = defineTask('select-slot', (args, taskCtx) => ({
  kind: 'agent',
  title: `Select longest unfilled slot #${args.slotIndex}`,
  agent: {
    name: 'select-word-slot',
    prompt: {
      role: 'slot-selector',
      task: `Select the longest unfilled slot (slot #${args.slotIndex}). Record its direction, position, length, and any letters already placed by intersecting words.`,
      context: args,
      instructions: [
        'Select the longest unfilled slot',
        'Record direction, position, and length',
        'Identify letters already placed by intersecting words',
        'Return slot details with known letters',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['slotId', 'direction', 'row', 'col', 'length', 'knownLetters'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const findCandidates = defineTask('find-candidates', (args, taskCtx) => ({
  kind: 'agent',
  title: `Find valid candidate words for slot #${args.slotIndex}`,
  agent: {
    name: 'find-candidate-words',
    prompt: {
      role: 'word-finder',
      task: 'Find all valid words from the dictionary that match this slot. A word is valid if: (1) its length equals the slot length, (2) it matches all already-placed letters at intersecting positions, (3) placing it would not create invalid partial words in crossing slots. Rank candidates by number of future options they leave open in crossing slots (most constrained first).',
      context: args,
      instructions: [
        'Find all words matching the slot length',
        'Filter by already-placed letters at intersections',
        'Check that placement does not create invalid crossing words',
        'Rank by future options for crossing slots',
        'Return candidates and count',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['candidates', 'candidateCount'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const placeWord = defineTask('place-word', (args, taskCtx) => ({
  kind: 'agent',
  title: `Place best candidate word in slot #${args.slotIndex}`,
  agent: {
    name: 'place-crossword-word',
    prompt: {
      role: 'word-placer',
      task: 'Place the highest-ranked candidate word into the slot. Update the grid state and record the placement for potential backtracking.',
      context: args,
      instructions: [
        'Place the highest-ranked candidate into the slot',
        'Update grid state with the placed letters',
        'Record placement for potential backtracking',
        'Return word, slot ID, placement status, and grid state',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['word', 'slotId', 'placed', 'gridState'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const backtrackSlot = defineTask('backtrack-slot', (args, taskCtx) => ({
  kind: 'agent',
  title: `Backtrack from slot #${args.slotIndex}`,
  agent: {
    name: 'backtrack-word-placement',
    prompt: {
      role: 'backtracker',
      task: 'Backtrack: undo the most recent word placement(s) until a slot is found where an alternative candidate can be tried. Remove the previously placed word from the used-words set and try the next-ranked candidate.',
      context: args,
      instructions: [
        'Undo the most recent word placements',
        'Find a slot where an alternative candidate can be tried',
        'Remove previously placed word from used-words set',
        'Try the next-ranked candidate',
        'Return backtrack steps, new candidate, and cleared slots',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['backtrackSteps', 'newCandidateTried', 'slotsCleared'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const placementSuccess = defineTask('placement-success', (args, taskCtx) => ({
  kind: 'agent',
  title: `Confirm successful placement for slot #${args.slotIndex}`,
  agent: {
    name: 'confirm-placement',
    prompt: {
      role: 'placement-verifier',
      task: 'Placement successful. Proceed to the next slot.',
      context: args,
      instructions: [
        'Confirm the word was placed successfully',
        'Return success status',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['success'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const verifyConstraints = defineTask('verify-constraints', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Verify all 5 crossword constraints',
  agent: {
    name: 'verify-crossword-constraints',
    prompt: {
      role: 'constraint-verifier',
      task: 'Verify the completed grid against all 5 constraints: (1) Every word in the grid must appear in the dictionary. (2) All words must be at least 3 letters long. (3) The black square pattern must have 180-degree rotational symmetry. (4) The grid must contain at least 40 words total. (5) No 2-letter sequence (bigram) may appear more than 2 times across all words. Report each constraint as pass/fail with details on any violations.',
      context: args,
      instructions: [
        'Check all words are in the dictionary',
        'Check all words are at least 3 letters long',
        'Check 180-degree rotational symmetry of black squares',
        'Check grid contains at least 40 words total',
        'Check no bigram appears more than 2 times',
        'Report pass/fail for each constraint with violation details',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: [
        'allPassed',
        'dictionaryWordsCheck',
        'minLengthCheck',
        'symmetryCheck',
        'minWordCountCheck',
        'bigramRepeatCheck',
        'violations',
      ],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const repairViolations = defineTask('repair-violations', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Repair constraint violations',
  agent: {
    name: 'repair-grid-violations',
    prompt: {
      role: 'constraint-repairer',
      task: 'Constraint violations detected. Execute the repair sequence: identify the specific violation(s), clear the affected region of the grid, and re-fill the cleared region using the same backtracking approach.',
      context: args,
      instructions: [
        'Identify the specific constraint violations',
        'Determine the affected grid region',
        'Clear the affected region',
        'Re-fill using backtracking',
        'Return violations found and repair plan',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['violationsFound', 'repairPlan'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const allConstraintsPass = defineTask('all-constraints-pass', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Confirm all constraints pass',
  agent: {
    name: 'confirm-constraints-pass',
    prompt: {
      role: 'constraint-verifier',
      task: 'All constraints pass. Proceed to output generation.',
      context: args,
      instructions: [
        'Confirm all 5 constraints pass',
        'Return allPassed confirmation',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['allPassed'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const identifyViolation = defineTask('identify-violation', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Identify specific constraint violations',
  agent: {
    name: 'identify-constraint-violations',
    prompt: {
      role: 'violation-analyzer',
      task: 'For each constraint violation found, identify: which words or grid positions are involved, the severity (how many words are affected), and the minimal set of words that need to be removed to fix the issue.',
      context: args,
      instructions: [
        'Identify which words or positions are involved in each violation',
        'Assess severity of each violation',
        'Determine minimal set of words to remove for each fix',
        'Return violations, affected words, and removal plan',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['violations', 'affectedWords', 'removalPlan'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const clearRegion = defineTask('clear-region', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Clear affected grid region',
  agent: {
    name: 'clear-grid-region',
    prompt: {
      role: 'grid-editor',
      task: 'Remove the identified words from the grid, clearing all their cells (except cells shared with valid crossing words). Update the slot state to mark these slots as unfilled.',
      context: args,
      instructions: [
        'Remove identified words from the grid',
        'Preserve cells shared with valid crossing words',
        'Update slot state to mark cleared slots as unfilled',
        'Return cleared slots, preserved intersections, and grid state',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['clearedSlots', 'preservedIntersections', 'gridState'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const reFill = defineTask('re-fill', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Re-fill cleared grid region',
  agent: {
    name: 're-fill-grid-region',
    prompt: {
      role: 'grid-filler',
      task: 'Re-fill the cleared slots using the same backtracking algorithm (longest first). Exclude previously-violating words from candidates. After filling, re-verify all 5 constraints to confirm the fix.',
      context: args,
      instructions: [
        'Re-fill cleared slots using backtracking (longest first)',
        'Exclude previously-violating words from candidates',
        'Re-verify all 5 constraints after filling',
        'Return filled slots, constraint pass status, and verification report',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['filledSlots', 'allConstraintsPassed', 'verificationReport'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const generateOutput = defineTask('generate-output', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Generate final crossword puzzle output',
  agent: {
    name: 'generate-crossword-output',
    prompt: {
      role: 'output-generator',
      task: 'Produce the final crossword puzzle output consisting of three parts: (1) The completed 15x15 grid displayed as a formatted text grid with black squares shown as "#" and letters in their cells, with row/column numbering. (2) A numbered clue list organized by Across and Down, where each clue references the grid number, direction, and the answer word. (3) A constraint verification report showing pass/fail for each of the 5 constraints with details. Save all output to crossword-output.txt.',
      context: args,
      instructions: [
        'Format the 15x15 grid with "#" for black squares and row/column numbering',
        'Generate numbered clue list organized by Across and Down',
        'Include constraint verification report with pass/fail for each constraint',
        'Save all output to crossword-output.txt',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: [
        'gridDisplay',
        'acrossClues',
        'downClues',
        'constraintReport',
        'totalWords',
        'outputFile',
      ],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export async function process(inputs, ctx) {
  const gridSize = 15;
  const minWords = 40;
  const minWordLength = 3;
  const dictionarySize = 5000;

  // Step 1: Load the dictionary
  const dictionary = await ctx.task(loadDictionary, {
    filePath: 'dictionary.txt',
    dictionarySize,
    minLength: minWordLength,
    maxLength: gridSize,
    format: 'one-word-per-line',
    normalize: 'uppercase',
  });

  // Step 2: Generate grid skeleton with black squares and rotational symmetry
  const skeleton = await ctx.task(generateGridSkeleton, {
    size: gridSize,
    symmetry: '180-degree-rotational',
    targetBlackSquarePercent: { min: 15, max: 20 },
    ensureConnectivity: true,
    minRunLength: minWordLength,
  });

  // Step 3: Identify all word slots (across and down)
  const slots = await ctx.task(identifySlots, {
    grid: skeleton.grid,
    minSlotLength: minWordLength,
    sortBy: 'length-descending',
    includeIntersections: true,
  });

  // Step 4: Fill words using backtracking, longest slot first
  const filledPlacements = [];
  const slotsList = slots.slots || [];
  for (let index = 0; index < slotsList.length; index++) {
    // 4a: Select the longest unfilled slot
    const selectedSlot = await ctx.task(selectSlot, {
      slotIndex: index,
      strategy: 'longest-first',
    });

    // 4b: Find valid candidate words from dictionary
    const candidates = await ctx.task(findCandidates, {
      slotIndex: index,
      slotId: selectedSlot,
      strategy: 'constraint-propagation',
      rankBy: 'future-options-for-crossings',
    });

    // 4c: Place the best candidate word
    const placement = await ctx.task(placeWord, {
      slotIndex: index,
      candidates,
      selectionStrategy: 'highest-ranked-candidate',
      recordForBacktracking: true,
    });

    // 4d: If no word fits, backtrack to previous slot
    if (candidates.candidateCount === 0) {
      await ctx.task(backtrackSlot, {
        slotIndex: index,
      });
    } else {
      await ctx.task(placementSuccess, {
        slotIndex: index,
      });
    }

    filledPlacements.push(placement);
  }

  // Step 5: Verify ALL constraints
  const verification = await ctx.task(verifyConstraints, {
    grid: skeleton.grid,
    filledPlacements,
    constraints: [
      { id: 'dictionary-words', description: 'All words must be in the dictionary' },
      { id: 'min-length', description: `All words must be >= ${minWordLength} letters` },
      { id: 'rotational-symmetry', description: '180-degree rotational symmetry of black squares' },
      { id: 'min-word-count', description: `Grid must contain >= ${minWords} words` },
      { id: 'bigram-limit', description: 'No 2-letter sequence repeated more than 2 times' },
    ],
  });

  // Step 6: If any constraint is violated, fix it
  if (!verification.allPassed) {
    await ctx.task(repairViolations, { verification });

    // Step 6a: Identify specific violations
    const violationDetails = await ctx.task(identifyViolation, {
      verification,
      strategy: 'minimal-disruption',
    });

    // Step 6b: Clear the affected region
    const clearedGrid = await ctx.task(clearRegion, {
      violationDetails,
      preserveCrossings: true,
    });

    // Step 6c: Re-fill the cleared region
    const refilledGrid = await ctx.task(reFill, {
      clearedGrid,
      excludePreviousViolators: true,
      reVerifyAfterFill: true,
    });
  } else {
    await ctx.task(allConstraintsPass, { verification });
  }

  // Step 7: Generate final output
  const output = await ctx.task(generateOutput, {
    outputFile: 'crossword-output.txt',
    gridFormat: 'text-with-numbering',
    blackSquareChar: '#',
    includeAnswerKey: true,
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
