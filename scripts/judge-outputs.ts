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
  durationMs?: number;
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

const inputPath = taskYaml.input?.path ?? 'results/full-comparison/input/countries.json';
const inputData = JSON.parse(readFileSync(inputPath, 'utf-8'));
const expectedCountryNames: string[] = inputData.countries.map((c: any) => c.name);

const EXPECTED_COUNTRIES = expectedCountryNames.length;
const CITIES_PER_COUNTRY = taskYaml.input?.parameters?.citiesPerCountry ?? 3;
const ATTRACTIONS_PER_CITY = taskYaml.input?.parameters?.attractionsPerCity ?? 3;
const EXPECTED_CITIES = EXPECTED_COUNTRIES * CITIES_PER_COUNTRY;
const EXPECTED_ATTRACTIONS = EXPECTED_CITIES * ATTRACTIONS_PER_CITY;

// Continent mapping for validation
const CONTINENT_MAP: Record<string, string> = {
  'Japan': 'Asia', 'South Korea': 'Asia', 'China': 'Asia', 'India': 'Asia',
  'Thailand': 'Asia', 'Vietnam': 'Asia', 'Indonesia': 'Asia', 'Malaysia': 'Asia',
  'Philippines': 'Asia', 'Singapore': 'Asia', 'Israel': 'Asia',
  'United Arab Emirates': 'Asia', 'Turkey': 'Asia',
  'Italy': 'Europe', 'France': 'Europe', 'Germany': 'Europe',
  'United Kingdom': 'Europe', 'Spain': 'Europe', 'Portugal': 'Europe',
  'Netherlands': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe',
  'Sweden': 'Europe', 'Norway': 'Europe', 'Denmark': 'Europe',
  'Poland': 'Europe', 'Czech Republic': 'Europe', 'Ireland': 'Europe',
  'Greece': 'Europe', 'Croatia': 'Europe', 'Hungary': 'Europe',
  'Romania': 'Europe', 'Iceland': 'Europe', 'Finland': 'Europe', 'Russia': 'Europe',
  'Brazil': 'South America', 'Argentina': 'South America', 'Colombia': 'South America',
  'Peru': 'South America', 'Chile': 'South America',
  'United States': 'North America', 'Mexico': 'North America', 'Canada': 'North America',
  'Australia': 'Oceania', 'New Zealand': 'Oceania',
  'Egypt': 'Africa', 'South Africa': 'Africa', 'Morocco': 'Africa',
  'Kenya': 'Africa', 'Tanzania': 'Africa',
};

// ---------------------------------------------------------------------------
// Agent output locations
// ---------------------------------------------------------------------------

interface AgentConfig {
  id: string;
  label: string;
  outputPath: string;
  timingPath?: string;
}

const agents: AgentConfig[] = [
  { id: 'babysitter-orchestrated', label: 'Babysitter', outputPath: 'results/full-comparison/babysitter/output/report.json', timingPath: 'results/full-comparison/babysitter/timing.json' },
  { id: 'pure-claude-code', label: 'Pure Claude', outputPath: 'results/full-comparison/pure-claude/output/report.json', timingPath: 'results/full-comparison/pure-claude/timing.json' },
];

// ---------------------------------------------------------------------------
// Output structure helpers — normalize different output schemas
// ---------------------------------------------------------------------------

interface NormalizedAttraction {
  name: string;
  themes: string[];
  sentiment: string;
  estimatedVisitHours: number | null;
  priceRange: string | null;
}

interface NormalizedCity {
  name: string;
  population?: number;
  attractions: NormalizedAttraction[];
  citySummary: { topThemes: string[] | null; dominantSentiment: string | null } | null;
}

interface NormalizedCountry {
  name: string;
  cities: NormalizedCity[];
  countrySummary: { topThemes: string[] | null; dominantSentiment: string | null; totalAttractions: number | null } | null;
}

interface NormalizedOutput {
  countries: NormalizedCountry[];
  globalSummary: {
    totalCountries?: number;
    totalCities?: number;
    totalAttractions?: number;
    themeHistogram?: Record<string, number>;
    sentimentHistogram?: Record<string, number>;
    continentBreakdown?: Record<string, any>;
  } | null;
  raw: Record<string, unknown>;
}

function normalizeOutput(raw: Record<string, unknown>): NormalizedOutput {
  const countryArray: any[] = (raw as any).countryReports ?? (raw as any).countries ?? [];

  const countries: NormalizedCountry[] = countryArray.map((c: any) => {
    const cityArray: any[] = c.cities ?? [];
    const cities: NormalizedCity[] = cityArray.map((city: any) => {
      const attractionArray: any[] = city.attractions ?? [];
      const attractions: NormalizedAttraction[] = attractionArray.map((a: any) => ({
        name: a.name ?? 'unknown',
        themes: a.reviewThemes ?? a.review_themes ?? [],
        sentiment: a.sentiment ?? 'unknown',
        estimatedVisitHours: a.estimatedVisitHours ?? a.estimated_visit_hours ?? null,
        priceRange: a.priceRange ?? a.price_range ?? null,
      }));

      const rawSummary = city.citySummary ?? city.city_summary ?? null;
      const citySummary = rawSummary ? {
        topThemes: rawSummary.topThemes ?? rawSummary.top_themes ?? null,
        dominantSentiment: rawSummary.dominantSentiment ?? rawSummary.dominant_sentiment ?? null,
      } : null;

      return {
        name: city.cityName ?? city.name ?? 'unknown',
        population: city.population ?? city.population_approx,
        attractions,
        citySummary,
      };
    });

    const rawCSummary = c.countrySummary ?? c.country_summary ?? null;
    const countrySummary = rawCSummary ? {
      topThemes: rawCSummary.topThemes ?? rawCSummary.top_themes ?? null,
      dominantSentiment: rawCSummary.dominantSentiment ?? rawCSummary.dominant_sentiment ?? null,
      totalAttractions: rawCSummary.totalAttractions ?? rawCSummary.total_attractions ?? null,
    } : null;

    return {
      name: c.countryName ?? c.name ?? 'unknown',
      cities,
      countrySummary,
    };
  });

  const rawSummary = (raw as any).globalSummary ?? (raw as any).global_summary ?? null;
  let globalSummary: NormalizedOutput['globalSummary'] = null;
  if (rawSummary) {
    globalSummary = {
      totalCountries: rawSummary.totalCountries ?? rawSummary.total_countries,
      totalCities: rawSummary.totalCities ?? rawSummary.total_cities,
      totalAttractions: rawSummary.totalAttractions ?? rawSummary.total_attractions,
      themeHistogram: rawSummary.themeHistogram ?? rawSummary.theme_histogram,
      sentimentHistogram: rawSummary.sentimentHistogram ?? rawSummary.sentiment_histogram
        ?? rawSummary.sentimentDistribution ?? rawSummary.sentiment_distribution,
      continentBreakdown: rawSummary.continentBreakdown ?? rawSummary.continent_breakdown,
    };
  }

  return { countries, globalSummary, raw };
}

// ---------------------------------------------------------------------------
// Dimension evaluators
// ---------------------------------------------------------------------------

function evaluateCompleteness(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];

  // Check 1: All countries present
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
      : `Found ${matchedCountries.length}/${EXPECTED_COUNTRIES}. Missing: [${missingCountries.slice(0, 10).join(', ')}${missingCountries.length > 10 ? `... +${missingCountries.length - 10} more` : ''}]`,
  });

  // Check 2: Each country has exactly N cities
  const cityCounts = output.countries.map(c => c.cities.length);
  const allHaveNCities = cityCounts.every(n => n === CITIES_PER_COUNTRY);
  const wrongCityCounts = output.countries.filter(c => c.cities.length !== CITIES_PER_COUNTRY);
  results.push({
    check: checks[1] ?? `Each country has exactly ${CITIES_PER_COUNTRY} cities`,
    passed: allHaveNCities,
    detail: allHaveNCities
      ? `All ${output.countries.length} countries have ${CITIES_PER_COUNTRY} cities`
      : `${wrongCityCounts.length} countries have wrong city count: ${wrongCityCounts.slice(0, 5).map(c => `${c.name}(${c.cities.length})`).join(', ')}`,
  });

  // Check 3: Each city has exactly N attractions
  const allCities = output.countries.flatMap(c => c.cities);
  const wrongAttrCities = allCities.filter(city => city.attractions.length !== ATTRACTIONS_PER_CITY);
  results.push({
    check: checks[2] ?? `Each city has exactly ${ATTRACTIONS_PER_CITY} attractions`,
    passed: wrongAttrCities.length === 0,
    detail: wrongAttrCities.length === 0
      ? `All ${allCities.length} cities have ${ATTRACTIONS_PER_CITY} attractions`
      : `${wrongAttrCities.length} cities have wrong count: ${wrongAttrCities.slice(0, 5).map(c => `${c.name}(${c.attractions.length})`).join(', ')}`,
  });

  // Check 4: Every attraction has non-empty themes
  const allAttractions = output.countries.flatMap(c => c.cities.flatMap(city => city.attractions));
  const themelessCount = allAttractions.filter(a => a.themes.length === 0).length;
  results.push({
    check: checks[3] ?? 'Every attraction has non-empty review themes',
    passed: themelessCount === 0,
    detail: themelessCount === 0
      ? `All ${allAttractions.length} attractions have themes`
      : `${themelessCount} attractions missing themes`,
  });

  // Check 5: Every attraction has sentiment
  const noSentiment = allAttractions.filter(a => !a.sentiment || a.sentiment === 'unknown').length;
  results.push({
    check: checks[4] ?? 'Every attraction has a sentiment field',
    passed: noSentiment === 0,
    detail: `${allAttractions.length - noSentiment}/${allAttractions.length} have sentiment`,
  });

  // Check 6: Every attraction has estimatedVisitHours
  const noVisitHours = allAttractions.filter(a => a.estimatedVisitHours == null || typeof a.estimatedVisitHours !== 'number').length;
  results.push({
    check: checks[5] ?? 'Every attraction has estimatedVisitHours',
    passed: noVisitHours === 0,
    detail: noVisitHours === 0
      ? `All ${allAttractions.length} attractions have estimatedVisitHours`
      : `${noVisitHours} attractions missing estimatedVisitHours`,
  });

  // Check 7: Every attraction has priceRange
  const noPriceRange = allAttractions.filter(a => !a.priceRange).length;
  results.push({
    check: checks[6] ?? 'Every attraction has priceRange',
    passed: noPriceRange === 0,
    detail: noPriceRange === 0
      ? `All ${allAttractions.length} attractions have priceRange`
      : `${noPriceRange} attractions missing priceRange`,
  });

  // Check 8: Every city has a citySummary
  const noCitySummary = allCities.filter(city =>
    !city.citySummary || !city.citySummary.topThemes || !city.citySummary.dominantSentiment
  ).length;
  results.push({
    check: checks[7] ?? 'Every city has a citySummary with topThemes and dominantSentiment',
    passed: noCitySummary === 0,
    detail: noCitySummary === 0
      ? `All ${allCities.length} cities have complete citySummary`
      : `${noCitySummary}/${allCities.length} cities missing or incomplete citySummary`,
  });

  // Check 9: Every country has a countrySummary
  const noCountrySummary = output.countries.filter(c =>
    !c.countrySummary || !c.countrySummary.topThemes || !c.countrySummary.dominantSentiment || c.countrySummary.totalAttractions == null
  ).length;
  results.push({
    check: checks[8] ?? 'Every country has a countrySummary',
    passed: noCountrySummary === 0,
    detail: noCountrySummary === 0
      ? `All ${output.countries.length} countries have complete countrySummary`
      : `${noCountrySummary}/${output.countries.length} countries missing or incomplete countrySummary`,
  });

  // Check 10: Global summary with theme histogram, sentiment distribution, continent breakdown
  const gs = output.globalSummary;
  const hasThemeHist = gs?.themeHistogram != null && Object.keys(gs.themeHistogram).length > 0;
  const hasSentDist = gs?.sentimentHistogram != null && Object.keys(gs.sentimentHistogram).length > 0;
  const hasContinentBreakdown = gs?.continentBreakdown != null && Object.keys(gs.continentBreakdown).length > 0;
  const allThreePresent = hasThemeHist && hasSentDist && hasContinentBreakdown;
  results.push({
    check: checks[9] ?? 'Global summary with theme histogram, sentiment distribution, continent breakdown',
    passed: allThreePresent,
    detail: `themeHistogram: ${hasThemeHist ? 'yes' : 'MISSING'}, sentimentDistribution: ${hasSentDist ? 'yes' : 'MISSING'}, continentBreakdown: ${hasContinentBreakdown ? 'yes' : 'MISSING'}`,
  });

  // Check 11: Total entity counts
  const countryCount = output.countries.length;
  const totalCityCount = output.countries.reduce((s, c) => s + c.cities.length, 0);
  const totalAttractionCount = allAttractions.length;
  const countsCorrect = countryCount === EXPECTED_COUNTRIES && totalCityCount === EXPECTED_CITIES && totalAttractionCount === EXPECTED_ATTRACTIONS;
  results.push({
    check: checks[10] ?? `Total entity counts match expected`,
    passed: countsCorrect,
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

  // Check 2: Cities within each country
  const allCitiesPresent = output.countries.every(c => c.cities.length > 0);
  results.push({
    check: checks[1] ?? 'Cities within each country are listed',
    passed: allCitiesPresent,
    detail: `${output.countries.filter(c => c.cities.length > 0).length}/${output.countries.length} countries have cities`,
  });

  // Check 3: Attractions within each city
  const allCities = output.countries.flatMap(c => c.cities);
  const citiesWithAttractions = allCities.filter(city => city.attractions.length > 0).length;
  results.push({
    check: checks[2] ?? 'Attractions within each city are listed',
    passed: citiesWithAttractions === allCities.length,
    detail: `${citiesWithAttractions}/${allCities.length} cities have attractions`,
  });

  // Check 4: Data collection precedes aggregation
  const hasData = output.countries.length > 0 && output.countries[0].cities.length > 0;
  const hasAgg = output.globalSummary != null;
  results.push({
    check: checks[3] ?? 'Data collection precedes aggregation',
    passed: hasData && hasAgg,
    detail: hasData && hasAgg
      ? 'Country/city/attraction data exists alongside aggregation — order inferred as correct'
      : 'Missing either raw data or aggregation',
  });

  // Check 5: Histogram in final report
  const histInReport = output.globalSummary?.themeHistogram != null;
  results.push({
    check: checks[4] ?? 'Histogram is part of the final report',
    passed: histInReport,
    detail: histInReport ? 'Theme histogram included in report' : 'Theme histogram missing from report',
  });

  return buildDimensionResult('ordering', results, checks);
}

function evaluateGranularity(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];

  // Check 1: Separate country objects
  results.push({
    check: checks[0] ?? 'Each country as separate unit',
    passed: output.countries.length > 0 && output.countries.every(c => c.name),
    detail: `${output.countries.length} distinct country objects`,
  });

  // Check 2: Separate city objects
  const totalCities = output.countries.reduce((s, c) => s + c.cities.length, 0);
  const separateCities = output.countries.every(c => c.cities.every(city => city.name));
  results.push({
    check: checks[1] ?? 'Each city processed separately',
    passed: separateCities,
    detail: `${totalCities} distinct city objects across ${output.countries.length} countries`,
  });

  // Check 3: Separate attraction objects
  const allAttractions = output.countries.flatMap(c => c.cities.flatMap(ci => ci.attractions));
  const separateAttractions = output.countries.every(c =>
    c.cities.every(city => city.attractions.every(a => a.name))
  );
  results.push({
    check: checks[2] ?? 'Each attraction processed separately',
    passed: separateAttractions,
    detail: `${allAttractions.length} distinct attraction objects`,
  });

  // Check 4: Per-attraction themes (not identical within a city)
  let citiesWithIdenticalThemes = 0;
  const totalCityCount = output.countries.reduce((s, c) => s + c.cities.length, 0);
  for (const country of output.countries) {
    for (const city of country.cities) {
      const themeSets = city.attractions.map(a => JSON.stringify(a.themes.sort()));
      if (new Set(themeSets).size === 1 && city.attractions.length > 1) {
        citiesWithIdenticalThemes++;
      }
    }
  }
  results.push({
    check: checks[3] ?? 'Review data is per-attraction',
    passed: citiesWithIdenticalThemes < totalCityCount * 0.1,
    detail: citiesWithIdenticalThemes === 0
      ? `All attractions have per-attraction themes (0/${totalCityCount} cities with identical themes)`
      : `${citiesWithIdenticalThemes}/${totalCityCount} cities have identical themes across attractions`,
  });

  // Check 5: City summaries are per-city (not shared)
  const allCities = output.countries.flatMap(c => c.cities);
  const citySummaryStrings = allCities
    .filter(c => c.citySummary)
    .map(c => JSON.stringify(c.citySummary));
  const uniqueCitySummaries = new Set(citySummaryStrings).size;
  const citySummariesDistinct = citySummaryStrings.length === 0 || uniqueCitySummaries > citySummaryStrings.length * 0.5;
  results.push({
    check: checks[4] ?? 'City summaries are per-city',
    passed: citySummariesDistinct,
    detail: `${uniqueCitySummaries} unique city summaries out of ${citySummaryStrings.length}`,
  });

  // Check 6: Country summaries are per-country (not shared)
  const countrySummaryStrings = output.countries
    .filter(c => c.countrySummary)
    .map(c => JSON.stringify(c.countrySummary));
  const uniqueCountrySummaries = new Set(countrySummaryStrings).size;
  const countrySummariesDistinct = countrySummaryStrings.length === 0 || uniqueCountrySummaries > countrySummaryStrings.length * 0.5;
  results.push({
    check: checks[5] ?? 'Country summaries are per-country',
    passed: countrySummariesDistinct,
    detail: `${uniqueCountrySummaries} unique country summaries out of ${countrySummaryStrings.length}`,
  });

  return buildDimensionResult('granularity', results, checks);
}

function evaluateAggregation(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];
  const allAttractions = output.countries.flatMap(c => c.cities.flatMap(city => city.attractions));

  // Check 1: Theme histogram cross-country
  const themeHist = output.globalSummary?.themeHistogram;
  const histTotal = themeHist ? Object.values(themeHist).reduce((s: number, v: number) => s + v, 0) : 0;
  const crossCountry = themeHist ? (() => {
    const themes = Object.keys(themeHist).map(t => t.toLowerCase());
    const firstThemes = output.countries[0]
      ?.cities.flatMap(ci => ci.attractions.flatMap(a => a.themes.map(t => t.toLowerCase()))) ?? [];
    const lastThemes = output.countries[output.countries.length - 1]
      ?.cities.flatMap(ci => ci.attractions.flatMap(a => a.themes.map(t => t.toLowerCase()))) ?? [];
    return firstThemes.some(t => themes.some(ht => ht.includes(t) || t.includes(ht)))
      && lastThemes.some(t => themes.some(ht => ht.includes(t) || t.includes(ht)));
  })() : false;
  results.push({
    check: checks[0] ?? 'Theme histogram aggregates across ALL attractions',
    passed: themeHist != null && crossCountry,
    detail: themeHist
      ? `Histogram has ${Object.keys(themeHist).length} themes, total count ${histTotal}, cross-country: ${crossCountry}`
      : 'No theme histogram found',
  });

  // Check 2: At least 20 distinct themes
  const distinctThemes = themeHist ? Object.keys(themeHist).length : 0;
  results.push({
    check: checks[1] ?? 'Theme histogram has at least 20 distinct themes',
    passed: distinctThemes >= 20,
    detail: `${distinctThemes} distinct themes in histogram`,
  });

  // Check 3: Sentiment covers all attractions
  const sentHist = output.globalSummary?.sentimentHistogram;
  const sentTotal = sentHist ? Object.values(sentHist).reduce((s: number, v: number) => s + v, 0) : 0;
  results.push({
    check: checks[2] ?? `Sentiment distribution covers all ${EXPECTED_ATTRACTIONS} attractions`,
    passed: sentTotal >= EXPECTED_ATTRACTIONS,
    detail: `Sentiment total: ${sentTotal} (expected ${EXPECTED_ATTRACTIONS})`,
  });

  // Check 4: Global summary totals
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

  // Check 5: Continent breakdown
  const continentBreakdown = output.globalSummary?.continentBreakdown;
  const hasContinents = continentBreakdown != null && Object.keys(continentBreakdown).length >= 4;
  results.push({
    check: checks[4] ?? 'Continent breakdown groups countries by continent',
    passed: hasContinents,
    detail: hasContinents
      ? `Continent breakdown has ${Object.keys(continentBreakdown!).length} continents: [${Object.keys(continentBreakdown!).join(', ')}]`
      : continentBreakdown
        ? `Only ${Object.keys(continentBreakdown).length} continents found`
        : 'No continent breakdown found',
  });

  // Check 6: Per-country data complete
  const perCountryComplete = output.countries.every(c =>
    c.cities.length > 0 && c.cities.every(city => city.attractions.length > 0)
  );
  results.push({
    check: checks[5] ?? 'Per-country data includes all cities and attractions',
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

  // Read timing data if available
  let durationMs: number | undefined;
  if (agent.timingPath) {
    try {
      const timing = JSON.parse(readFileSync(agent.timingPath, 'utf-8'));
      durationMs = timing.durationMs;
      console.log(`  Duration: ${(durationMs! / 1000).toFixed(1)}s (${(durationMs! / 60000).toFixed(1)}m)`);
    } catch {
      // timing.json not found — leave undefined
    }
  }

  // Write scorecard
  const scorecard: JudgeScorecardOutput = {
    taskName: taskYaml.metadata.name,
    agentId: agent.id,
    weightedScore,
    durationMs,
    dimensions: {},
  };

  for (const dim of allDims) {
    scorecard.dimensions[dim.dimension] = {
      score: dim.score,
      evidence: dim.evidence,
      deductions: dim.deductions,
    };
  }

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
