/**
 * us-states-scraping — Full Benchmark Process
 *
 * Map-reduce scraping pipeline with validation. Scrape all 50 US states in
 * parallel, cross-validate against census data, conditionally re-scrape
 * outliers, group by region, compute stats, and generate a markdown report.
 *
 * Dimensions: completeness, parallelism, conditionality, aggregation
 */

export const metadata = {
  name: 'us-states-scraping',
  domain: 'data-analysis',
  complexity: 'high',
  estimatedDuration: '20m',
  dimensions: ['completeness', 'parallelism', 'conditionality', 'aggregation'],
  tags: ['full', 'map-reduce', 'data-analysis', 'parallel', 'validation', 'scraping'],
};

export async function prescribedProcess(input, ctx) {
  // Step 1: Load the list of 50 US states
  const states = await ctx.step('load-states-list', {
    action: 'Load the complete list of 50 US states with their names and abbreviations from the input data source',
    expected: { type: 'array', minLength: 50, maxLength: 50 },
    context: { source: input.statesSource },
  });

  // Step 2: Scrape all 50 states in parallel
  const scrapeTasks = states.map((state, index) => ({
    action: `Scrape data for ${state.name} (${state.abbreviation}): current governor name, latest population estimate, and top 3 industries by employment`,
    expected: {
      type: 'object',
      requiredFields: ['state', 'governor', 'population', 'topIndustries'],
    },
    context: {
      stateIndex: index,
      stateName: state.name,
      stateAbbreviation: state.abbreviation,
      dataPoints: ['governor', 'population', 'topIndustries'],
    },
  }));

  const scrapedData = await ctx.parallel('scrape-all-states', scrapeTasks);

  // Step 3: Cross-validate population figures against census totals
  const validationResult = await ctx.step('cross-validate', {
    action: 'Cross-validate the scraped population for each state against the official US Census Bureau totals. Flag any state whose scraped population deviates by more than 5% from the census figure.',
    expected: {
      type: 'object',
      requiredFields: ['validStates', 'flaggedStates', 'censusTotal', 'scrapedTotal', 'deviationPercent'],
    },
    context: {
      scrapedData,
      censusSource: input.censusSource,
      deviationThreshold: 0.05,
    },
  });

  // Step 4: Conditional — re-scrape states that deviate > 5%
  const finalData = await ctx.conditional('check-deviations', {
    condition: 'One or more states have a population deviation greater than 5% from census totals',
    ifTrue: {
      action: 'Re-scrape all flagged states using an alternative data source to obtain corrected population figures, then merge the corrected data back into the full dataset',
      expected: {
        type: 'array',
        minLength: 50,
        maxLength: 50,
      },
    },
    ifFalse: {
      action: 'All states are within the 5% deviation threshold — proceed with the validated scraped data as-is',
      expected: {
        type: 'array',
        minLength: 50,
        maxLength: 50,
      },
    },
    expectedResult: true,
  });

  // Step 5: Group states into 5 regions
  const regions = await ctx.step('group-by-region', {
    action: 'Group all 50 states into 5 US Census regions: Northeast, Southeast, Midwest, Southwest, and West. Each region object should contain the region name and its list of states with their scraped data.',
    expected: {
      type: 'array',
      minLength: 5,
      maxLength: 5,
    },
    context: {
      regionDefinitions: {
        Northeast: 'CT, DE, ME, MD, MA, NH, NJ, NY, PA, RI, VT',
        Southeast: 'AL, AR, FL, GA, KY, LA, MS, NC, SC, TN, VA, WV',
        Midwest: 'IL, IN, IA, KS, MI, MN, MO, NE, ND, OH, SD, WI',
        Southwest: 'AZ, NM, OK, TX',
        West: 'AK, CA, CO, HI, ID, MT, NV, OR, UT, WA, WY',
      },
    },
  });

  // Step 6: Compute per-region statistics
  const regionStats = await ctx.loop('compute-region-stats', regions, async (region, regionIndex) => {
    const stats = await ctx.step(`compute-stats-${regionIndex}`, {
      action: `Compute statistics for the ${region.name} region: average population across member states, total population, most common top industry, and the state with the highest and lowest population`,
      expected: {
        type: 'object',
        requiredFields: [
          'regionName',
          'stateCount',
          'averagePopulation',
          'totalPopulation',
          'topIndustry',
          'mostPopulousState',
          'leastPopulousState',
        ],
      },
      context: {
        regionIndex,
        regionName: region.name,
        states: region.states,
      },
    });

    return stats;
  });

  // Step 7: Generate markdown report with tables per region
  const report = await ctx.step('generate-report', {
    action: 'Generate a comprehensive markdown report with: (1) an executive summary with total US population and state count, (2) one table per region showing state name, governor, population, and top industry for each member state, (3) a region comparison table with average population and top industry, (4) a notes section listing any states that required re-scraping and the data quality assessment',
    expected: { type: 'string', minLength: 1 },
    context: {
      regionStats,
      validationResult,
      format: 'markdown',
      outputPath: input.outputPath,
    },
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
