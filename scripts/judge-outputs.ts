/**
 * Output-based Judge — evaluates agent output files against task.yaml criteria.
 *
 * Reads the task definition's evaluation criteria and expected output spec,
 * then programmatically verifies each check against the actual output JSON.
 * Produces ObedienceScorecard-compatible JSON files.
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
// Load task definition
// ---------------------------------------------------------------------------

const TASK_YAML_PATH = 'plugin/skills/catalog-manager/benchmarks/full/countries-cities-attractions/task.yaml';
const taskYaml: TaskYaml = parseYaml(readFileSync(TASK_YAML_PATH, 'utf-8'));

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
// Dimension evaluators
// ---------------------------------------------------------------------------

function evaluateCompleteness(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];

  // Check 1: Exactly 3 countries
  const countryCount = output.countries.length;
  const expectedCountries = ['Japan', 'Italy', 'Brazil'];
  const foundCountries = output.countries.map(c => c.name);
  const hasAllCountries = expectedCountries.every(ec =>
    foundCountries.some(fc => fc.toLowerCase().includes(ec.toLowerCase()))
  );
  results.push({
    check: checks[0] ?? 'Exactly 3 countries present',
    passed: countryCount === 3 && hasAllCountries,
    detail: `Found ${countryCount} countries: [${foundCountries.join(', ')}]. Expected: [${expectedCountries.join(', ')}]`,
  });

  // Check 2: Each country has exactly 3 cities
  const cityCounts = output.countries.map(c => c.cities.length);
  const allHave3Cities = cityCounts.every(n => n === 3);
  results.push({
    check: checks[1] ?? 'Each country has exactly 3 cities',
    passed: allHave3Cities,
    detail: `City counts per country: [${cityCounts.join(', ')}]`,
  });

  // Check 3: Each city has exactly 3 attractions
  const attractionCounts = output.countries.flatMap(c => c.cities.map(city => city.attractions.length));
  const allHave3Attractions = attractionCounts.every(n => n === 3);
  results.push({
    check: checks[2] ?? 'Each city has exactly 3 attractions',
    passed: allHave3Attractions,
    detail: `Attraction counts per city: [${attractionCounts.join(', ')}]`,
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
  // Also check for alternative formats
  const rawSummary = (output.raw as any).globalSummary ?? (output.raw as any).global_summary;
  const hasSentimentPercentage = rawSummary?.sentiment_percentage != null || rawSummary?.sentimentPercentage != null;
  results.push({
    check: checks[6] ?? 'Global summary with sentiment distribution',
    passed: hasSentimentHist || hasSentimentPercentage,
    detail: hasSentimentHist
      ? `Sentiment histogram has ${Object.keys(output.globalSummary!.sentimentHistogram!).length} categories`
      : hasSentimentPercentage ? 'Sentiment percentage distribution found' : 'No sentiment distribution found',
  });

  // Check 8: Total counts
  const totalAttractionCount = allAttractions.length;
  const totalCityCount = output.countries.reduce((s, c) => s + c.cities.length, 0);
  results.push({
    check: checks[7] ?? 'Total entity counts: 3 countries, 9 cities, 27 attractions',
    passed: countryCount === 3 && totalCityCount === 9 && totalAttractionCount === 27,
    detail: `Counts: ${countryCount} countries, ${totalCityCount} cities, ${totalAttractionCount} attractions`,
  });

  return buildDimensionResult('completeness', results, checks);
}

function evaluateOrdering(output: NormalizedOutput, checks: string[]): DimensionResult {
  const results: CheckResult[] = [];
  const expectedOrder = ['Japan', 'Italy', 'Brazil'];
  const actualOrder = output.countries.map(c => c.name);

  // Check 1: Countries in input order
  const orderCorrect = expectedOrder.every((expected, i) =>
    actualOrder[i]?.toLowerCase().includes(expected.toLowerCase())
  );
  results.push({
    check: checks[0] ?? 'Countries in input order',
    passed: orderCorrect,
    detail: `Expected order: [${expectedOrder.join(', ')}], got: [${actualOrder.join(', ')}]`,
  });

  // Check 2: Cities within each country are listed
  const allCitiesPresent = output.countries.every(c => c.cities.length > 0);
  results.push({
    check: checks[1] ?? 'Cities within each country are listed',
    passed: allCitiesPresent,
    detail: output.countries.map(c => `${c.name}: ${c.cities.map(ci => ci.name).join(', ')}`).join('; '),
  });

  // Check 3: Attractions within each city are listed
  const allAttractionsPresent = output.countries.every(c =>
    c.cities.every(city => city.attractions.length > 0)
  );
  results.push({
    check: checks[2] ?? 'Attractions within each city are listed',
    passed: allAttractionsPresent,
    detail: `${output.countries.flatMap(c => c.cities).filter(city => city.attractions.length > 0).length}/${output.countries.flatMap(c => c.cities).length} cities have attractions`,
  });

  // Check 4: Data collection precedes aggregation
  // We infer this from structure: country data objects exist AND global summary exists
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
  const separateCountries = output.countries.length === 3 && output.countries.every(c => c.name);
  results.push({
    check: checks[0] ?? 'Each country as separate unit',
    passed: separateCountries,
    detail: `${output.countries.length} distinct country objects: [${output.countries.map(c => c.name).join(', ')}]`,
  });

  // Check 2: Separate city objects within countries
  const separateCities = output.countries.every(c =>
    c.cities.length > 0 && c.cities.every(city => city.name)
  );
  results.push({
    check: checks[1] ?? 'Each city processed separately within its country',
    passed: separateCities,
    detail: output.countries.map(c => `${c.name}: [${c.cities.map(ci => ci.name).join(', ')}]`).join('; '),
  });

  // Check 3: Separate attraction objects within cities
  const separateAttractions = output.countries.every(c =>
    c.cities.every(city => city.attractions.length > 0 && city.attractions.every(a => a.name))
  );
  results.push({
    check: checks[2] ?? 'Each attraction processed separately within its city',
    passed: separateAttractions,
    detail: `${output.countries.flatMap(c => c.cities.flatMap(ci => ci.attractions)).length} distinct attraction objects`,
  });

  // Check 4: Per-attraction review data (not bulk)
  const allAttractions = output.countries.flatMap(c => c.cities.flatMap(city => city.attractions));
  const perAttractionThemes = allAttractions.every(a => a.themes.length > 0);
  // Check that themes aren't identical across all attractions (would suggest bulk processing)
  const uniqueThemeSets = new Set(allAttractions.map(a => JSON.stringify(a.themes.sort())));
  const themesDiverse = uniqueThemeSets.size > allAttractions.length * 0.5; // at least half have unique theme combos
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
  const allThemes = allAttractions.flatMap(a => a.themes);

  // Check 1: Theme histogram aggregates across ALL attractions
  const themeHist = output.globalSummary?.themeHistogram;
  const histThemeCount = themeHist ? Object.values(themeHist).reduce((s: number, v: number) => s + v, 0) : 0;
  // The histogram should reference themes from attractions across all countries
  const countriesRepresented = themeHist ? (() => {
    const themes = Object.keys(themeHist).map(t => t.toLowerCase());
    // Check if themes from different countries' attractions appear
    const japanThemes = output.countries.find(c => c.name.toLowerCase().includes('japan'))
      ?.cities.flatMap(ci => ci.attractions.flatMap(a => a.themes.map(t => t.toLowerCase()))) ?? [];
    const brazilThemes = output.countries.find(c => c.name.toLowerCase().includes('brazil'))
      ?.cities.flatMap(ci => ci.attractions.flatMap(a => a.themes.map(t => t.toLowerCase()))) ?? [];
    const hasJapan = japanThemes.some(t => themes.some(ht => ht.includes(t) || t.includes(ht)));
    const hasBrazil = brazilThemes.some(t => themes.some(ht => ht.includes(t) || t.includes(ht)));
    return hasJapan && hasBrazil;
  })() : false;
  results.push({
    check: checks[0] ?? 'Theme histogram aggregates across ALL attractions',
    passed: themeHist != null && countriesRepresented,
    detail: themeHist
      ? `Histogram has ${Object.keys(themeHist).length} themes, total count ${histThemeCount}, cross-country: ${countriesRepresented}`
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
  // Also check for percentage-based format
  const rawSummary = (output.raw as any).globalSummary ?? (output.raw as any).global_summary;
  const sentPercentage = rawSummary?.sentiment_percentage ?? rawSummary?.sentimentPercentage;
  const hasSentCoverage = sentTotal >= 27 || sentPercentage != null;
  results.push({
    check: checks[2] ?? 'Sentiment covers all 27 attractions',
    passed: hasSentCoverage,
    detail: sentHist
      ? `Sentiment histogram total: ${sentTotal} (expected 27)`
      : sentPercentage ? 'Sentiment coverage via percentage distribution' : 'No sentiment histogram',
  });

  // Check 4: Global summary includes totals
  const gs = output.globalSummary;
  const hasTotals = gs != null && (
    gs.totalCountries != null || gs.totalCities != null || gs.totalAttractions != null
  );
  const totalsCorrect = hasTotals && (
    (gs!.totalCountries === 3 || gs!.totalCountries == null)
    && (gs!.totalCities === 9 || gs!.totalCities == null)
    && (gs!.totalAttractions === 27 || gs!.totalAttractions == null)
  );
  results.push({
    check: checks[3] ?? 'Global summary includes total counts',
    passed: hasTotals,
    detail: hasTotals
      ? `Totals: ${gs!.totalCountries ?? '?'} countries, ${gs!.totalCities ?? '?'} cities, ${gs!.totalAttractions ?? '?'} attractions${totalsCorrect ? ' (correct)' : ' (some incorrect)'}`
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
