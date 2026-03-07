/**
 * countries-cities-attractions — Full Benchmark Process
 *
 * Deep-iteration data-analysis pipeline. Three levels of nested loops:
 * countries -> cities -> attractions -> reviews. Followed by histogram
 * creation and per-country report generation.
 *
 * Dimensions: completeness, ordering, granularity, aggregation
 */

export const metadata = {
  name: 'countries-cities-attractions',
  domain: 'data-analysis',
  complexity: 'high',
  estimatedDuration: '25m',
  dimensions: ['completeness', 'ordering', 'granularity', 'aggregation'],
  tags: ['full', 'deep-iteration', 'data-analysis', 'nested-loop'],
};

export async function prescribedProcess(input, ctx) {
  // Step 1: Load list of all countries
  const countries = await ctx.step('load-countries', {
    action: 'Load the complete list of countries to analyze from the input data source',
    expected: { type: 'array', minLength: 1 },
    context: { source: input.countriesSource },
  });

  // Step 2: Process each country with nested loops
  const allCountryData = await ctx.loop('process-countries', countries, async (country, countryIndex) => {
    // 2a: Get top 3 cities by population for this country
    const cities = await ctx.step(`get-cities-${countryIndex}`, {
      action: `Retrieve the top 3 cities by population for ${country.name}`,
      expected: { type: 'array', minLength: 1, maxLength: 3 },
      context: {
        countryIndex,
        countryName: country.name,
        sortBy: 'population',
        limit: 3,
      },
    });

    // 2b: Process each city
    const cityData = await ctx.loop(`process-cities-${countryIndex}`, cities, async (city, cityIndex) => {
      // Get top 3 tourist attractions for this city
      const attractions = await ctx.step(`get-attractions-${countryIndex}-${cityIndex}`, {
        action: `Retrieve the top 3 tourist attractions for ${city.name}, ${country.name}`,
        expected: { type: 'array', minLength: 1, maxLength: 3 },
        context: {
          countryIndex,
          cityIndex,
          cityName: city.name,
          countryName: country.name,
          limit: 3,
        },
      });

      // Process each attraction
      const attractionData = await ctx.loop(
        `process-attractions-${countryIndex}-${cityIndex}`,
        attractions,
        async (attraction, attractionIndex) => {
          // Get reviews for this attraction
          const reviews = await ctx.step(
            `get-reviews-${countryIndex}-${cityIndex}-${attractionIndex}`,
            {
              action: `Fetch the top reviews for "${attraction.name}" in ${city.name}, ${country.name}`,
              expected: { type: 'array', minLength: 1 },
              context: {
                countryIndex,
                cityIndex,
                attractionIndex,
                attractionName: attraction.name,
                cityName: city.name,
                countryName: country.name,
              },
            },
          );

          return { attraction: attraction.name, reviews };
        },
      );

      return { city: city.name, population: city.population, attractions: attractionData };
    });

    return { country: country.name, cities: cityData };
  });

  // Step 3: Create histogram of review themes and sentiments
  const histogram = await ctx.step('create-histogram', {
    action: 'Analyze all collected reviews across every country, city, and attraction to create a histogram of review themes (e.g., food, architecture, nature, nightlife) and sentiment distribution (positive, neutral, negative)',
    expected: {
      type: 'object',
      requiredFields: ['themes', 'sentiments', 'totalReviews'],
    },
    context: {
      allCountryData,
      aggregation: 'themes-and-sentiments',
    },
  });

  // Step 4: Generate summary report per country
  const report = await ctx.step('generate-report', {
    action: 'Generate a structured summary report for each country including: country name, top cities with populations, attractions per city, review sentiment breakdown, and top themes. Include a global summary section with the histogram data.',
    expected: {
      type: 'object',
      requiredFields: ['countryReports', 'globalSummary'],
    },
    context: {
      allCountryData,
      histogram,
      format: 'structured-json',
    },
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
