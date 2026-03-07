/**
 * us-states-scraping — Full Benchmark Process
 *
 * Map-reduce scraping pipeline with validation. Scrape all 50 US states in
 * parallel, cross-validate against census data, conditionally re-scrape
 * outliers, group by region, compute stats, and generate a markdown report.
 *
 * Dimensions: completeness, parallelism, conditionality, aggregation
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'us-states-scraping',
  domain: 'data-analysis',
  complexity: 'high',
  estimatedDuration: '20m',
  dimensions: ['completeness', 'parallelism', 'conditionality', 'aggregation'],
  tags: ['full', 'map-reduce', 'data-analysis', 'parallel', 'validation', 'scraping'],
};

export const loadStatesList = defineTask('load-states-list', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Load the complete list of 50 US states',
  agent: {
    name: 'load-states-list',
    prompt: {
      role: 'data-loader',
      task: 'Load the complete list of 50 US states with their names and abbreviations from the input data source',
      context: args,
      instructions: [
        'Load all 50 US states with name and abbreviation',
        'Return an array of exactly 50 state objects',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['states'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const scrapeState = defineTask('scrape-state', (args, taskCtx) => ({
  kind: 'agent',
  title: `Scrape data for ${args.stateName} (${args.stateAbbreviation})`,
  agent: {
    name: 'scrape-state-data',
    prompt: {
      role: 'web-scraper',
      task: `Scrape data for ${args.stateName} (${args.stateAbbreviation}): current governor name, latest population estimate, and top 3 industries by employment`,
      context: args,
      instructions: [
        'Scrape current governor name',
        'Scrape latest population estimate',
        'Scrape top 3 industries by employment',
        'Return structured data with state, governor, population, topIndustries fields',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['state', 'governor', 'population', 'topIndustries'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const crossValidate = defineTask('cross-validate', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Cross-validate population figures against census totals',
  agent: {
    name: 'cross-validate-population',
    prompt: {
      role: 'data-validator',
      task: 'Cross-validate the scraped population for each state against the official US Census Bureau totals. Flag any state whose scraped population deviates by more than 5% from the census figure.',
      context: args,
      instructions: [
        'Compare scraped population data against census totals',
        'Flag states with deviation greater than 5%',
        'Compute total scraped and census populations',
        'Return valid states, flagged states, totals, and deviation percent',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['validStates', 'flaggedStates', 'censusTotal', 'scrapedTotal', 'deviationPercent'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const reScrapeDeviations = defineTask('re-scrape-deviations', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Re-scrape flagged states using alternative data source',
  agent: {
    name: 're-scrape-flagged-states',
    prompt: {
      role: 'web-scraper',
      task: 'Re-scrape all flagged states using an alternative data source to obtain corrected population figures, then merge the corrected data back into the full dataset',
      context: args,
      instructions: [
        'Re-scrape population data for all flagged states from alternative source',
        'Merge corrected data back into the full 50-state dataset',
        'Return the complete corrected dataset with all 50 states',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['states'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const proceedWithValidatedData = defineTask('proceed-with-validated-data', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Proceed with validated scraped data',
  agent: {
    name: 'proceed-validated',
    prompt: {
      role: 'data-processor',
      task: 'All states are within the 5% deviation threshold — proceed with the validated scraped data as-is',
      context: args,
      instructions: [
        'Confirm all states pass the 5% deviation threshold',
        'Return the validated dataset with all 50 states',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['states'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const groupByRegion = defineTask('group-by-region', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Group all 50 states into 5 US Census regions',
  agent: {
    name: 'group-states-by-region',
    prompt: {
      role: 'data-organizer',
      task: 'Group all 50 states into 5 US Census regions: Northeast, Southeast, Midwest, Southwest, and West. Each region object should contain the region name and its list of states with their scraped data.',
      context: args,
      instructions: [
        'Group states into Northeast, Southeast, Midwest, Southwest, and West',
        'Each region includes region name and list of member states with scraped data',
        'Return exactly 5 region objects',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['regions'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const computeRegionStats = defineTask('compute-region-stats', (args, taskCtx) => ({
  kind: 'agent',
  title: `Compute statistics for the ${args.regionName} region`,
  agent: {
    name: 'compute-region-statistics',
    prompt: {
      role: 'data-analyst',
      task: `Compute statistics for the ${args.regionName} region: average population across member states, total population, most common top industry, and the state with the highest and lowest population`,
      context: args,
      instructions: [
        'Compute average population across member states',
        'Compute total population for the region',
        'Identify the most common top industry',
        'Identify the most and least populous states',
        'Return all computed statistics',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: [
        'regionName',
        'stateCount',
        'averagePopulation',
        'totalPopulation',
        'topIndustry',
        'mostPopulousState',
        'leastPopulousState',
      ],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export const generateReport = defineTask('generate-report', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Generate comprehensive markdown report',
  agent: {
    name: 'generate-markdown-report',
    prompt: {
      role: 'report-generator',
      task: 'Generate a comprehensive markdown report with: (1) an executive summary with total US population and state count, (2) one table per region showing state name, governor, population, and top industry for each member state, (3) a region comparison table with average population and top industry, (4) a notes section listing any states that required re-scraping and the data quality assessment',
      context: args,
      instructions: [
        'Write executive summary with total US population and state count',
        'Create one table per region with state details',
        'Create a region comparison table',
        'Include notes on re-scraped states and data quality',
        'Output in markdown format',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['report'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export async function process(inputs, ctx) {
  // Step 1: Load the list of 50 US states
  const states = await ctx.task(loadStatesList, { source: inputs.statesSource });

  // Step 2: Scrape all 50 states in parallel
  const scrapedData = await Promise.all(
    states.states.map((state, index) =>
      ctx.task(scrapeState, {
        stateIndex: index,
        stateName: state.name,
        stateAbbreviation: state.abbreviation,
        dataPoints: ['governor', 'population', 'topIndustries'],
      })
    )
  );

  // Step 3: Cross-validate population figures against census totals
  const validationResult = await ctx.task(crossValidate, {
    scrapedData,
    censusSource: inputs.censusSource,
    deviationThreshold: 0.05,
  });

  // Step 4: Conditional — re-scrape states that deviate > 5%
  let finalData;
  if (validationResult.flaggedStates && validationResult.flaggedStates.length > 0) {
    finalData = await ctx.task(reScrapeDeviations, {
      flaggedStates: validationResult.flaggedStates,
      scrapedData,
    });
  } else {
    finalData = await ctx.task(proceedWithValidatedData, {
      scrapedData,
    });
  }

  // Step 5: Group states into 5 regions
  const regions = await ctx.task(groupByRegion, {
    finalData,
    regionDefinitions: {
      Northeast: 'CT, DE, ME, MD, MA, NH, NJ, NY, PA, RI, VT',
      Southeast: 'AL, AR, FL, GA, KY, LA, MS, NC, SC, TN, VA, WV',
      Midwest: 'IL, IN, IA, KS, MI, MN, MO, NE, ND, OH, SD, WI',
      Southwest: 'AZ, NM, OK, TX',
      West: 'AK, CA, CO, HI, ID, MT, NV, OR, UT, WA, WY',
    },
  });

  // Step 6: Compute per-region statistics
  const regionStats = [];
  for (let regionIndex = 0; regionIndex < regions.regions.length; regionIndex++) {
    const region = regions.regions[regionIndex];
    const stats = await ctx.task(computeRegionStats, {
      regionIndex,
      regionName: region.name,
      states: region.states,
    });
    regionStats.push(stats);
  }

  // Step 7: Generate markdown report with tables per region
  const report = await ctx.task(generateReport, {
    regionStats,
    validationResult,
    format: 'markdown',
    outputPath: inputs.outputPath,
  });

  return report;
}

export const evaluation = {
  completeness: {
    weight: 25,
    criteria:
      'Agent must process all 50 states: scrape data, cross-validate, handle deviations, group by region, compute stats, and generate the final report.',
  },
  parallelism: {
    weight: 25,
    criteria:
      'All 50 states must be scraped in a single parallel call, not sequentially. Each parallel task must collect governor, population, and top industries.',
  },
  conditionality: {
    weight: 25,
    criteria:
      'States whose population deviates more than 5% from census totals must be re-scraped. The conditional must branch correctly between re-scrape and proceed paths.',
  },
  aggregation: {
    weight: 25,
    criteria:
      'States must be grouped into 5 regions. Per-region average population and top industry must be computed. A markdown report with tables per region must be generated.',
  },
};
