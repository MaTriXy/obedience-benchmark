/**
 * countries-cities-attractions — Full Benchmark Process
 *
 * Deep-iteration data-analysis pipeline. Three levels of nested loops:
 * countries -> cities -> attractions -> reviews. Followed by histogram
 * creation and per-country report generation.
 *
 * Dimensions: completeness, ordering, granularity, aggregation
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export const metadata = {
  name: 'countries-cities-attractions',
  domain: 'data-analysis',
  complexity: 'high',
  estimatedDuration: '25m',
  dimensions: ['completeness', 'ordering', 'granularity', 'aggregation'],
  tags: ['full', 'deep-iteration', 'data-analysis', 'nested-loop'],
};

const loadCountriesTask = defineTask('load-countries', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Load the list of countries',
  agent: {
    name: 'load-countries',
    prompt: {
      role: 'Data loader',
      task: 'Load the complete list of countries to analyze from the input data source',
      context: args,
      instructions: [
        'Load all countries from the provided data source.',
        'Return them as an array.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['countries'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const getCitiesTask = defineTask('get-cities', (args, taskCtx) => ({
  kind: 'agent',
  title: `Get top cities for country ${args.countryIndex}`,
  agent: {
    name: 'get-cities-by-population',
    prompt: {
      role: 'Data retriever',
      task: `Retrieve the top 3 cities by population for ${args.countryName}`,
      context: args,
      instructions: [
        'Find the top 3 cities by population for the given country.',
        'Return them sorted by population descending.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['cities'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const getAttractionsTask = defineTask('get-attractions', (args, taskCtx) => ({
  kind: 'agent',
  title: `Get attractions for city ${args.cityIndex} in country ${args.countryIndex}`,
  agent: {
    name: 'get-tourist-attractions',
    prompt: {
      role: 'Data retriever',
      task: `Retrieve the top 3 tourist attractions for ${args.cityName}, ${args.countryName}`,
      context: args,
      instructions: [
        'Find the top 3 tourist attractions for the given city.',
        'Return them as an array.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['attractions'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const getReviewsTask = defineTask('get-reviews', (args, taskCtx) => ({
  kind: 'agent',
  title: `Get reviews for attraction ${args.attractionIndex} in city ${args.cityIndex}, country ${args.countryIndex}`,
  agent: {
    name: 'get-attraction-reviews',
    prompt: {
      role: 'Data retriever',
      task: `Fetch the top reviews for "${args.attractionName}" in ${args.cityName}, ${args.countryName}`,
      context: args,
      instructions: [
        'Fetch the top reviews for the given attraction.',
        'Return them as an array.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['reviews'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const createHistogramTask = defineTask('create-histogram', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Create review themes and sentiment histogram',
  agent: {
    name: 'create-review-histogram',
    prompt: {
      role: 'Data analyst',
      task: 'Analyze all collected reviews across every country, city, and attraction to create a histogram of review themes (e.g., food, architecture, nature, nightlife) and sentiment distribution (positive, neutral, negative)',
      context: args,
      instructions: [
        'Aggregate all reviews across all countries, cities, and attractions.',
        'Create a histogram of themes and sentiment distribution.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['themes', 'sentiments', 'totalReviews'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

const generateReportTask = defineTask('generate-report', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Generate summary report',
  agent: {
    name: 'generate-summary-report',
    prompt: {
      role: 'Report generator',
      task: 'Generate a structured summary report for each country including: country name, top cities with populations, attractions per city, review sentiment breakdown, and top themes. Include a global summary section with the histogram data.',
      context: args,
      instructions: [
        'Create a per-country report with cities, attractions, and review summaries.',
        'Include a global summary section with histogram data.',
      ],
      outputFormat: 'JSON',
    },
    outputSchema: {
      type: 'object',
      required: ['countryReports', 'globalSummary'],
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`,
  },
}));

export async function process(inputs, ctx) {
  // Step 1: Load list of all countries
  const countries = await ctx.task(loadCountriesTask, {
    source: inputs.countriesSource,
  });

  // Step 2: Process each country with nested loops
  const allCountryData = [];
  for (let countryIndex = 0; countryIndex < countries.length; countryIndex++) {
    const country = countries[countryIndex];

    // 2a: Get top 3 cities by population for this country
    const cities = await ctx.task(getCitiesTask, {
      countryIndex,
      countryName: country.name,
      sortBy: 'population',
      limit: 3,
    });

    // 2b: Process each city
    const cityData = [];
    for (let cityIndex = 0; cityIndex < cities.length; cityIndex++) {
      const city = cities[cityIndex];

      // Get top 3 tourist attractions for this city
      const attractions = await ctx.task(getAttractionsTask, {
        countryIndex,
        cityIndex,
        cityName: city.name,
        countryName: country.name,
        limit: 3,
      });

      // Process each attraction
      const attractionData = [];
      for (let attractionIndex = 0; attractionIndex < attractions.length; attractionIndex++) {
        const attraction = attractions[attractionIndex];

        // Get reviews for this attraction
        const reviews = await ctx.task(getReviewsTask, {
          countryIndex,
          cityIndex,
          attractionIndex,
          attractionName: attraction.name,
          cityName: city.name,
          countryName: country.name,
        });

        attractionData.push({ attraction: attraction.name, reviews });
      }

      cityData.push({ city: city.name, population: city.population, attractions: attractionData });
    }

    allCountryData.push({ country: country.name, cities: cityData });
  }

  // Step 3: Create histogram of review themes and sentiments
  const histogram = await ctx.task(createHistogramTask, {
    allCountryData,
    aggregation: 'themes-and-sentiments',
  });

  // Step 4: Generate summary report per country
  const report = await ctx.task(generateReportTask, {
    allCountryData,
    histogram,
    format: 'structured-json',
  });

  return report;
}

export const evaluation = {
  completeness: {
    weight: 30,
    criteria:
      'Agent must process every country, every city within each country, every attraction within each city, and every review within each attraction. No entity may be skipped.',
  },
  ordering: {
    weight: 20,
    criteria:
      'Data retrieval must proceed top-down: countries -> cities -> attractions -> reviews. The histogram and report steps must follow data collection.',
  },
  granularity: {
    weight: 25,
    criteria:
      'Three levels of nesting must be present: country loop containing city loop containing attraction loop. Each level must use distinct step IDs with iteration metadata.',
  },
  aggregation: {
    weight: 25,
    criteria:
      'Reviews must be aggregated into a sentiment histogram. Per-country summary reports must be generated combining city and attraction data.',
  },
};
