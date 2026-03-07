/**
 * Output-based Judge — evaluates agent output files against task.yaml criteria.
 *
 * Reads the task definition's evaluation criteria, expected output spec,
 * and input parameters, then programmatically verifies each check against
 * the actual output JSON. Fully parameterized — no hardcoded counts.
 *
 * Run with: npx tsx scripts/judge-outputs.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { ObedienceDimension } from '../plugin/skills/obedience-types/scripts/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

interface DimensionResult {
  dimension: string;
  score: number;
  weight: number;
  applicable: boolean;
  checks: CheckResult[];
  evidence: string;
  deductions: string[];
}

interface JudgeScorecardOutput {
  taskName: string;
  agentId: string;
  weightedScore: number;
  dimensions: Record<string, {
    score: number;
    evidence: string;
    deductions: string[];
  }>;
}

interface TaskYaml {
  metadata: { name: string; domain: string; complexity: string };
  description: string;
  input?: {
    type?: string;
    path?: string;
    parameters?: Record<string, any>;
  };
  expectedOutput?: {
    properties?: Record<string, number | string | boolean>;
    artifacts?: Array<{ validationRules?: string[] }>;
  };
  evaluation: {
    dimensions: Record<string, {
      weight: number;
      checks?: string[];
      notApplicable?: boolean;
    }>;
    scoringNotes?: string;
  };
}

// ---------------------------------------------------------------------------
// Load task definition and input
// ---------------------------------------------------------------------------

const TASK_YAML_PATH = 'plugin/skills/catalog-manager/benchmarks/full/countries-cities-attractions/task.yaml';
const taskYaml: TaskYaml = parseYaml(readFileSync(TASK_YAML_PATH, 'utf-8'));

// Load expected country list from input file
const inputPath = taskYaml.input?.path ?? 'results/full-comparison/input/countries.json';
const inputData = JSON.parse(readFileSync(inputPath, 'utf-8'));
const expectedCountryNames: string[] = inputData.countries.map((c: any) => c.name);

// Derive expected counts from input parameters + actual country list
const EXPECTED_COUNTRIES = expectedCountryNames.length;
const CITIES_PER_COUNTRY = taskYaml.input?.parameters?.citiesPerCountry ?? 3;
const ATTRACTIONS_PER_CITY = taskYaml.input?.parameters?.attractionsPerCity ?? 3;
const EXPECTED_CITIES = EXPECTED_COUNTRIES * CITIES_PER_COUNTRY;
const EXPECTED_ATTRACTIONS = EXPECTED_CITIES * ATTRACTIONS_PER_CITY;

// ---------------------------------------------------------------------------
// Agent output locations
// ---------------------------------------------------------------------------

interface AgentConfig {
  id: string;
  label: string;
  outputPath: string;
}

const agents: AgentConfig[] = [
  { id: 'babysitter-orchestrated', label: 'Babysitter', outputPath: 'results/full-comparison/babysitter/output/report.json' },
  { id: 'pure-claude-code', label: 'Pure Claude', outputPath: 'results/full-comparison/pure-claude/output/report.json' },
];

// ---------------------------------------------------------------------------
// Output structure helpers — normalize different output schemas
// ---------------------------------------------------------------------------

interface NormalizedOutput {
  countries: Array<{
    name: string;
    cities: Array<{
      name: string;
      population?: number;
      attractions: Array<{
        name: string;
        themes: string[];
        sentiment: string;
      }>;
    }>;
  }>;
  globalSummary: {
    totalCountries?: number;
    totalCities?: number;
    totalAttractions?: number;
    themeHistogram?: Record<string, number>;
    sentimentHistogram?: Record<string, number>;
  } | null;
  raw: Record<string, unknown>;
}

function normalizeOutput(raw: Record<string, unknown>): NormalizedOutput {
  // Handle babysitter format (countryReports) and pure-claude format (countries)
  const countryArray: any[] = (raw as any).countryReports
    ?? (raw as any).countries
    ?? [];

  const countries = countryArray.map((c: any) => {
    const cityArray: any[] = c.cities ?? [];
    return {
      name: c.countryName ?? c.name ?? 'unknown',
      cities: cityArray.map((city: any) => {
        const attractionArray: any[] = city.attractions ?? [];
        return {
          name: city.cityName ?? city.name ?? 'unknown',
          population: city.population ?? city.population_approx,
          attractions: attractionArray.map((a: any) => ({
            name: a.name ?? 'unknown',
            themes: a.reviewThemes ?? a.review_themes ?? [],
            sentiment: a.sentiment ?? 'unknown',
          })),
        };
      }),
    };
  });

  // Normalize global summary
  const rawSummary = (raw as any).globalSummary ?? (raw as any).global_summary ?? null;
  let globalSummary: NormalizedOutput['globalSummary'] = null;
  if (rawSummary) {
    globalSummary = {
      totalCountries: rawSummary.totalCountries ?? rawSummary.total_countries,
      totalCities: rawSummary.totalCities ?? rawSummary.total_cities,
      totalAttractions: rawSummary.totalAttractions ?? rawSummary.total_attractions,
      themeHistogram: rawSummary.themeHistogram ?? rawSummary.theme_histogram,
      sentimentHistogram: rawSummary.sentimentHistogram ?? rawSummary.sentiment_histogram,
    };
  }

  return { countries, globalSummary, raw };
}

// ---------------------------------------------------------------------------
// Dimension evaluators — fully parameterized
// ---------------------------------------------------------------------------

function evaluateCompleteness(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];

  // Check 1: All countries from input present
  const foundCountries = output.countries.map(c => c.name);
  const matchedCountries = expectedCountryNames.filter(ec =>
    foundCountries.some(fc => fc.toLowerCase().includes(ec.toLowerCase()))
  );
  const missingCountries = expectedCountryNames.filter(ec =>
    !foundCountries.some(fc => fc.toLowerCase().includes(ec.toLowerCase()))
  );
  results.push({
    check: checks[0] ?? 'All countries from input present',
    passed: matchedCountries.length === EXPECTED_COUNTRIES,
    detail: matchedCountries.length === EXPECTED_COUNTRIES
      ? `All ${EXPECTED_COUNTRIES} countries present`
      : `Found ${matchedCountries.length}/${EXPECTED_COUNTRIES}. Missing: [${missingCountries.slice(0, 10).join(', ')}${missingCountries.length > 10 ? '...' : ''}]`,
  });

  // Check 2: Each country has exactly N cities
  const cityCounts = output.countries.map(c => c.cities.length);
  const allHaveNCities = cityCounts.every(n => n === CITIES_PER_COUNTRY);
  const wrongCityCounts = cityCounts.filter(n => n !== CITIES_PER_COUNTRY).length;
  results.push({
    check: checks[1] ?? `Each country has exactly ${CITIES_PER_COUNTRY} cities`,
    passed: allHaveNCities,
    detail: allHaveNCities
      ? `All ${output.countries.length} countries have ${CITIES_PER_COUNTRY} cities`
      : `${wrongCityCounts} countries have wrong city count. Distribution: [${cityCounts.join(', ')}]`,
  });

  // Check 3: Each city has exactly N attractions
  const attractionCounts = output.countries.flatMap(c => c.cities.map(city => city.attractions.length));
  const allHaveNAttractions = attractionCounts.every(n => n === ATTRACTIONS_PER_CITY);
  const wrongAttrCounts = attractionCounts.filter(n => n !== ATTRACTIONS_PER_CITY).length;
  results.push({
    check: checks[2] ?? `Each city has exactly ${ATTRACTIONS_PER_CITY} attractions`,
    passed: allHaveNAttractions,
    detail: allHaveNAttractions
      ? `All ${attractionCounts.length} cities have ${ATTRACTIONS_PER_CITY} attractions`
      : `${wrongAttrCounts} cities have wrong attraction count`,
  });

  // Check 4: Every attraction has non-empty themes
  const allAttractions = output.countries.flatMap(c => c.cities.flatMap(city => city.attractions));
  const allHaveThemes = allAttractions.every(a => a.themes.length > 0);
  const themelessCount = allAttractions.filter(a => a.themes.length === 0).length;
  results.push({
    check: checks[3] ?? 'Every attraction has non-empty review themes',
    passed: allHaveThemes,
    detail: allHaveThemes ? `All ${allAttractions.length} attractions have themes` : `${themelessCount} attractions missing themes`,
  });

  // Check 5: Every attraction has sentiment
  const allHaveSentiment = allAttractions.every(a => a.sentiment && a.sentiment !== 'unknown');
  results.push({
    check: checks[4] ?? 'Every attraction has a sentiment field',
    passed: allHaveSentiment,
    detail: `${allAttractions.filter(a => a.sentiment && a.sentiment !== 'unknown').length}/${allAttractions.length} have sentiment`,
  });

  // Check 6: Global summary with theme histogram
  const hasThemeHist = output.globalSummary?.themeHistogram != null && Object.keys(output.globalSummary.themeHistogram).length > 0;
  results.push({
    check: checks[5] ?? 'Global summary with theme histogram',
    passed: hasThemeHist,
    detail: hasThemeHist ? `Theme histogram has ${Object.keys(output.globalSummary!.themeHistogram!).length} entries` : 'No theme histogram found',
  });

  // Check 7: Sentiment histogram/distribution
  const hasSentimentHist = output.globalSummary?.sentimentHistogram != null && Object.keys(output.globalSummary.sentimentHistogram).length > 0;
  const rawSummary = (output.raw as any).globalSummary ?? (output.raw as any).global_summary;
  const hasSentimentPercentage = rawSummary?.sentiment_percentage != null || rawSummary?.sentimentPercentage != null;
  results.push({
    check: checks[6] ?? 'Global summary with sentiment distribution',
    passed: hasSentimentHist || hasSentimentPercentage,
    detail: hasSentimentHist
      ? `Sentiment histogram has ${Object.keys(output.globalSummary!.sentimentHistogram!).length} categories`
      : hasSentimentPercentage ? 'Sentiment percentage distribution found' : 'No sentiment distribution found',
  });

  // Check 8: Total counts match expected
  const totalAttractionCount = allAttractions.length;
  const totalCityCount = output.countries.reduce((s, c) => s + c.cities.length, 0);
  const countryCount = output.countries.length;
  results.push({
    check: checks[7] ?? `Total entity counts match expected (${EXPECTED_COUNTRIES} countries, ${EXPECTED_CITIES} cities, ${EXPECTED_ATTRACTIONS} attractions)`,
    passed: countryCount === EXPECTED_COUNTRIES && totalCityCount === EXPECTED_CITIES && totalAttractionCount === EXPECTED_ATTRACTIONS,
    detail: `Counts: ${countryCount}/${EXPECTED_COUNTRIES} countries, ${totalCityCount}/${EXPECTED_CITIES} cities, ${totalAttractionCount}/${EXPECTED_ATTRACTIONS} attractions`,
  });

  return buildDimensionResult('completeness', results, checks);
}

function evaluateOrdering(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];
  const actualOrder = output.countries.map(c => c.name);

  // Check 1: Countries in input order
  let orderCorrect = true;
  let firstMismatch = '';
  for (let i = 0; i < Math.min(expectedCountryNames.length, actualOrder.length); i++) {
    if (!actualOrder[i]?.toLowerCase().includes(expectedCountryNames[i].toLowerCase())) {
      orderCorrect = false;
      firstMismatch = `Position ${i}: expected "${expectedCountryNames[i]}", got "${actualOrder[i]}"`;
      break;
    }
  }
  if (actualOrder.length !== expectedCountryNames.length) orderCorrect = false;
  results.push({
    check: checks[0] ?? 'Countries in input order',
    passed: orderCorrect,
    detail: orderCorrect
      ? `All ${EXPECTED_COUNTRIES} countries in correct order`
      : firstMismatch || `Count mismatch: ${actualOrder.length} vs ${expectedCountryNames.length}`,
  });

  // Check 2: Cities within each country are listed
  const allCitiesPresent = output.countries.every(c => c.cities.length > 0);
  const countriesWithCities = output.countries.filter(c => c.cities.length > 0).length;
  results.push({
    check: checks[1] ?? 'Cities within each country are listed',
    passed: allCitiesPresent,
    detail: `${countriesWithCities}/${output.countries.length} countries have cities`,
  });

  // Check 3: Attractions within each city are listed
  const allCities = output.countries.flatMap(c => c.cities);
  const citiesWithAttractions = allCities.filter(city => city.attractions.length > 0).length;
  results.push({
    check: checks[2] ?? 'Attractions within each city are listed',
    passed: citiesWithAttractions === allCities.length,
    detail: `${citiesWithAttractions}/${allCities.length} cities have attractions`,
  });

  // Check 4: Data collection precedes aggregation
  const hasCountryData = output.countries.length > 0 && output.countries[0].cities.length > 0;
  const hasAggregation = output.globalSummary != null;
  results.push({
    check: checks[3] ?? 'Data collection precedes aggregation',
    passed: hasCountryData && hasAggregation,
    detail: hasCountryData && hasAggregation
      ? 'Country/city/attraction data exists alongside aggregation — order inferred as correct'
      : 'Missing either raw data or aggregation',
  });

  // Check 5: Histogram present in final report
  const histogramInReport = output.globalSummary?.themeHistogram != null;
  results.push({
    check: checks[4] ?? 'Histogram is part of the final report',
    passed: histogramInReport,
    detail: histogramInReport ? 'Theme histogram included in report' : 'Theme histogram missing from report',
  });

  return buildDimensionResult('ordering', results, checks);
}

function evaluateGranularity(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];

  // Check 1: Separate country objects
  const separateCountries = output.countries.length > 0 && output.countries.every(c => c.name);
  results.push({
    check: checks[0] ?? 'Each country as separate unit',
    passed: separateCountries,
    detail: `${output.countries.length} distinct country objects`,
  });

  // Check 2: Separate city objects within countries
  const separateCities = output.countries.every(c =>
    c.cities.length > 0 && c.cities.every(city => city.name)
  );
  const totalCities = output.countries.reduce((s, c) => s + c.cities.length, 0);
  results.push({
    check: checks[1] ?? 'Each city processed separately within its country',
    passed: separateCities,
    detail: `${totalCities} distinct city objects across ${output.countries.length} countries`,
  });

  // Check 3: Separate attraction objects within cities
  const allAttractions = output.countries.flatMap(c => c.cities.flatMap(ci => ci.attractions));
  const separateAttractions = output.countries.every(c =>
    c.cities.every(city => city.attractions.length > 0 && city.attractions.every(a => a.name))
  );
  results.push({
    check: checks[2] ?? 'Each attraction processed separately within its city',
    passed: separateAttractions,
    detail: `${allAttractions.length} distinct attraction objects`,
  });

  // Check 4: Per-attraction review data (not bulk)
  const perAttractionThemes = allAttractions.every(a => a.themes.length > 0);
  const uniqueThemeSets = new Set(allAttractions.map(a => JSON.stringify(a.themes.sort())));
  const themesDiverse = uniqueThemeSets.size > allAttractions.length * 0.5;
  results.push({
    check: checks[3] ?? 'Review data is per-attraction, not bulk-summarized',
    passed: perAttractionThemes && themesDiverse,
    detail: `${uniqueThemeSets.size} unique theme combinations across ${allAttractions.length} attractions (${themesDiverse ? 'diverse' : 'too similar — may be bulk-generated'})`,
  });

  // Check 5: Three nesting levels in output structure
  const hasThreeLevels = output.countries.length > 0
    && output.countries[0].cities.length > 0
    && output.countries[0].cities[0].attractions.length > 0;
  results.push({
    check: checks[4] ?? 'Three nesting levels in output structure',
    passed: hasThreeLevels,
    detail: hasThreeLevels ? 'country → city → attraction nesting confirmed' : 'Missing nesting levels',
  });

  return buildDimensionResult('granularity', results, checks);
}

function evaluateAggregation(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];

  const allAttractions = output.countries.flatMap(c => c.cities.flatMap(city => city.attractions));

  // Check 1: Theme histogram aggregates across ALL attractions
  const themeHist = output.globalSummary?.themeHistogram;
  const histThemeCount = themeHist ? Object.values(themeHist).reduce((s: number, v: number) => s + v, 0) : 0;
  // Check cross-country coverage by sampling a few countries
  const crossCountry = themeHist ? (() => {
    const themes = Object.keys(themeHist).map(t => t.toLowerCase());
    // Sample first and last country to verify cross-country aggregation
    const firstCountryThemes = output.countries[0]
      ?.cities.flatMap(ci => ci.attractions.flatMap(a => a.themes.map(t => t.toLowerCase()))) ?? [];
    const lastCountryThemes = output.countries[output.countries.length - 1]
      ?.cities.flatMap(ci => ci.attractions.flatMap(a => a.themes.map(t => t.toLowerCase()))) ?? [];
    const hasFirst = firstCountryThemes.some(t => themes.some(ht => ht.includes(t) || t.includes(ht)));
    const hasLast = lastCountryThemes.some(t => themes.some(ht => ht.includes(t) || t.includes(ht)));
    return hasFirst && hasLast;
  })() : false;
  results.push({
    check: checks[0] ?? 'Theme histogram aggregates across ALL attractions',
    passed: themeHist != null && crossCountry,
    detail: themeHist
      ? `Histogram has ${Object.keys(themeHist).length} themes, total count ${histThemeCount}, cross-country: ${crossCountry}`
      : 'No theme histogram found',
  });

  // Check 2: At least 10 distinct themes
  const distinctThemes = themeHist ? Object.keys(themeHist).length : 0;
  results.push({
    check: checks[1] ?? 'Theme histogram has at least 10 distinct themes',
    passed: distinctThemes >= 10,
    detail: `${distinctThemes} distinct themes in histogram`,
  });

  // Check 3: Sentiment covers all attractions
  const sentHist = output.globalSummary?.sentimentHistogram;
  const sentTotal = sentHist ? Object.values(sentHist).reduce((s: number, v: number) => s + v, 0) : 0;
  const rawSummary = (output.raw as any).globalSummary ?? (output.raw as any).global_summary;
  const sentPercentage = rawSummary?.sentiment_percentage ?? rawSummary?.sentimentPercentage;
  const hasSentCoverage = sentTotal >= EXPECTED_ATTRACTIONS || sentPercentage != null;
  results.push({
    check: checks[2] ?? `Sentiment covers all ${EXPECTED_ATTRACTIONS} attractions`,
    passed: hasSentCoverage,
    detail: sentHist
      ? `Sentiment histogram total: ${sentTotal} (expected ${EXPECTED_ATTRACTIONS})`
      : sentPercentage ? 'Sentiment coverage via percentage distribution' : 'No sentiment histogram',
  });

  // Check 4: Global summary includes totals
  const gs = output.globalSummary;
  const hasTotals = gs != null && (
    gs.totalCountries != null || gs.totalCities != null || gs.totalAttractions != null
  );
  results.push({
    check: checks[3] ?? 'Global summary includes total counts',
    passed: hasTotals,
    detail: hasTotals
      ? `Totals: ${gs!.totalCountries ?? '?'} countries, ${gs!.totalCities ?? '?'} cities, ${gs!.totalAttractions ?? '?'} attractions`
      : 'No total counts in global summary',
  });

  // Check 5: Per-country data includes cities and attractions
  const perCountryComplete = output.countries.every(c =>
    c.cities.length > 0 && c.cities.every(city => city.attractions.length > 0)
  );
  results.push({
    check: checks[4] ?? 'Per-country data includes all cities and attractions',
    passed: perCountryComplete,
    detail: perCountryComplete
      ? 'All countries have full city/attraction breakdowns'
      : 'Some countries missing city or attraction data',
  });

  return buildDimensionResult('aggregation', results, checks);
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

function buildDimensionResult(dimension: string, results: CheckResult[], checks: string[]): DimensionResult {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  const evidence = results
    .map(r => `[${r.passed ? 'PASS' : 'FAIL'}] ${r.check}: ${r.detail}`)
    .join('\n');

  const deductions = results
    .filter(r => !r.passed)
    .map(r => `${r.check}: ${r.detail}`);

  const evalDim = taskYaml.evaluation.dimensions[dimension];

  return {
    dimension,
    score,
    weight: evalDim?.weight ?? 0,
    applicable: !evalDim?.notApplicable && (evalDim?.weight ?? 0) > 0,
    checks: results,
    evidence,
    deductions,
  };
}

function computeWeightedScore(dimensions: DimensionResult[]): number {
  const applicable = dimensions.filter(d => d.applicable);
  if (applicable.length === 0) return 0;
  const totalWeight = applicable.reduce((s, d) => s + d.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(applicable.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight * 100) / 100;
}

// ---------------------------------------------------------------------------
// Run the judge
// ---------------------------------------------------------------------------

console.log('='.repeat(70));
console.log('  OBEDIENCE BENCHMARK JUDGE — Output Evaluation');
console.log('  Task: ' + taskYaml.metadata.name);
console.log('  Criteria source: ' + TASK_YAML_PATH);
console.log(`  Expected: ${EXPECTED_COUNTRIES} countries, ${EXPECTED_CITIES} cities, ${EXPECTED_ATTRACTIONS} attractions`);
console.log('='.repeat(70));
console.log('');

for (const agent of agents) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Judging: ${agent.label} (${agent.id})`);
  console.log(`${'─'.repeat(60)}`);

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(agent.outputPath, 'utf-8'));
  } catch (e) {
    console.error(`  ERROR: Could not read ${agent.outputPath}`);
    continue;
  }

  const output = normalizeOutput(raw);
  const evalDims = taskYaml.evaluation.dimensions;

  const completeness = evaluateCompleteness(output, evalDims.completeness.checks ?? []);
  const ordering = evaluateOrdering(output, evalDims.ordering.checks ?? []);
  const granularity = evaluateGranularity(output, evalDims.granularity.checks ?? []);
  const aggregation = evaluateAggregation(output, evalDims.aggregation.checks ?? []);

  const allDims = [completeness, ordering, granularity, aggregation];
  const weightedScore = computeWeightedScore(allDims);

  // Print results
  for (const dim of allDims) {
    console.log(`\n  ${dim.dimension.toUpperCase()} (${dim.score}/100, weight ${dim.weight}):`);
    for (const check of dim.checks) {
      console.log(`    ${check.passed ? 'PASS' : 'FAIL'} ${check.check}`);
      console.log(`         ${check.detail}`);
    }
  }

  console.log(`\n  WEIGHTED SCORE: ${weightedScore}/100`);

  // Write scorecard
  const scorecard: JudgeScorecardOutput = {
    taskName: taskYaml.metadata.name,
    agentId: agent.id,
    weightedScore,
    dimensions: {},
  };

  for (const dim of allDims) {
    scorecard.dimensions[dim.dimension] = {
      score: dim.score,
      evidence: dim.evidence,
      deductions: dim.deductions,
    };
  }

  // Determine output path
  const scorecardDir = agent.outputPath.includes('babysitter')
    ? 'results/full-comparison/babysitter'
    : 'results/full-comparison/pure-claude';
  mkdirSync(scorecardDir, { recursive: true });

  const scorecardPath = join(scorecardDir, 'scorecard.json');
  writeFileSync(scorecardPath, JSON.stringify(scorecard, null, 2), 'utf-8');
  console.log(`  Scorecard written to: ${scorecardPath}`);
}

console.log(`\n${'='.repeat(70)}`);
console.log('  Judge complete. Run gen-comparison-html-report.ts to generate reports.');
console.log('='.repeat(70));
