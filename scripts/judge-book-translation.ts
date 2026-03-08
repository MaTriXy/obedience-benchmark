/**
 * Book Translation Judge — evaluates agent output against task.yaml criteria.
 *
 * Dimensions: completeness (25), ordering (20), parallelism (20), granularity (20), aggregation (15)
 *
 * Run with: npx tsx scripts/judge-book-translation.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult { check: string; passed: boolean; detail: string; }
interface DimensionResult { dimension: string; score: number; weight: number; applicable: boolean; checks: CheckResult[]; evidence: string; deductions: string[]; }
interface JudgeScorecardOutput { taskName: string; agentId: string; weightedScore: number; durationMs?: number; dimensions: Record<string, { score: number; evidence: string; deductions: string[] }>; }

const TASK_NAME = 'book-translation';
const EXPECTED_CHAPTERS = 5;

interface AgentConfig { id: string; label: string; outputPath: string; timingPath: string; }

const agents: AgentConfig[] = [
  { id: 'babysitter-orchestrated', label: 'Babysitter', outputPath: 'results/full-comparison/book-translation/babysitter/output/report.json', timingPath: 'results/full-comparison/book-translation/babysitter/timing.json' },
  { id: 'pure-claude-code', label: 'Pure Claude', outputPath: 'results/full-comparison/book-translation/pure-claude/output/report.json', timingPath: 'results/full-comparison/book-translation/pure-claude/timing.json' },
];

// ---------------------------------------------------------------------------
// Evaluators
// ---------------------------------------------------------------------------

function evaluateCompleteness(output: any): DimensionResult {
  const results: CheckResult[] = [];
  const steps = output?.metadata?.processSteps ?? [];

  // Check 1: Book read
  results.push({ check: 'Read book step executed', passed: steps.includes('read-book'), detail: steps.includes('read-book') ? 'Book reading step present' : 'Missing read-book step' });

  // Check 2: Split chapters
  const chapters = output?.chapters ?? [];
  results.push({ check: 'Book split into chapters', passed: chapters.length === EXPECTED_CHAPTERS, detail: `${chapters.length}/${EXPECTED_CHAPTERS} chapters` });

  // Check 3: Book-level context analysis
  const ctx = output?.bookContext;
  const hasCtx = ctx && ctx.style && ctx.tone && ctx.glossary && ctx.characterNames;
  results.push({ check: 'Book-level context analyzed', passed: !!hasCtx, detail: hasCtx ? `Style, tone, glossary (${Object.keys(ctx.glossary).length} terms), character names present` : 'Missing book-level context' });

  // Check 4: Per-chapter context analysis
  const chCtx = output?.chapterContexts ?? [];
  results.push({ check: 'Per-chapter context analyzed', passed: chCtx.length === EXPECTED_CHAPTERS, detail: `${chCtx.length}/${EXPECTED_CHAPTERS} chapter contexts` });

  // Check 5: Every chunk translated
  const translatedChapters = output?.translatedChapters ?? [];
  const allChunksTranslated = translatedChapters.every((ch: any) => ch.chunks?.length > 0 && ch.chunks.every((c: any) => c.translatedText));
  const totalChunks = translatedChapters.reduce((s: number, ch: any) => s + (ch.chunks?.length ?? 0), 0);
  results.push({ check: 'Every chunk translated', passed: allChunksTranslated && totalChunks >= EXPECTED_CHAPTERS, detail: `${totalChunks} chunks translated across ${translatedChapters.length} chapters` });

  // Check 6: Translations combined
  const combined = output?.combinedTranslation;
  results.push({ check: 'Translations combined into book', passed: !!combined?.fullText && combined.totalWords > 100, detail: combined ? `Combined: ${combined.totalWords} words, ${combined.totalChapters} chapters` : 'No combined translation' });

  // Check 7: Consistency check performed
  const cc = output?.consistencyCheck;
  results.push({ check: 'Consistency check performed', passed: cc != null && typeof cc.isConsistent === 'boolean', detail: cc ? `Consistent: ${cc.isConsistent}, glossary compliance: ${cc.glossaryCompliance}%` : 'No consistency check' });

  // Check 8: Final output produced
  results.push({ check: 'Final output step executed', passed: steps.includes('final-output'), detail: steps.includes('final-output') ? 'Final output step present' : 'Missing final-output step' });

  return buildDimensionResult('completeness', 25, results);
}

function evaluateOrdering(output: any): DimensionResult {
  const results: CheckResult[] = [];
  const steps = output?.metadata?.processSteps ?? [];
  const idx = (s: string) => steps.indexOf(s);

  // Check 1: Context analysis before translation
  const ctxIdx = Math.max(idx('analyze-book-context'), idx('analyze-chapter-contexts'));
  const transIdx = idx('translate-chunks');
  results.push({ check: 'Context analysis before translation', passed: ctxIdx >= 0 && transIdx >= 0 && ctxIdx < transIdx, detail: ctxIdx >= 0 && transIdx >= 0 ? `context@${ctxIdx}, translate@${transIdx}` : 'Missing steps' });

  // Check 2: Split before translate
  const splitIdx = idx('split-chunks');
  results.push({ check: 'Split chunks before translate', passed: splitIdx >= 0 && transIdx >= 0 && splitIdx < transIdx, detail: splitIdx >= 0 ? `split@${splitIdx}, translate@${transIdx}` : 'Missing split step' });

  // Check 3: Translation before combination
  const combIdx = idx('combine-translations');
  results.push({ check: 'Translation before combination', passed: transIdx >= 0 && combIdx >= 0 && transIdx < combIdx, detail: combIdx >= 0 ? `translate@${transIdx}, combine@${combIdx}` : 'Missing combine step' });

  // Check 4: Combination before consistency check
  const ccIdx = idx('consistency-check');
  results.push({ check: 'Combination before consistency check', passed: ccIdx >= 0 ? combIdx < ccIdx : false, detail: ccIdx >= 0 ? `combine@${combIdx}, consistency@${ccIdx}` : 'Consistency check missing from pipeline' });

  // Check 5: Consistency check before final output
  const finalIdx = idx('final-output');
  results.push({ check: 'Consistency check before final output', passed: ccIdx >= 0 && finalIdx >= 0 && ccIdx < finalIdx, detail: ccIdx >= 0 ? `consistency@${ccIdx}, final@${finalIdx}` : 'Consistency check not in pipeline' });

  return buildDimensionResult('ordering', 20, results);
}

function evaluateParallelism(output: any): DimensionResult {
  const results: CheckResult[] = [];
  const parallelExec = output?.metadata?.parallelExecution ?? [];
  const translatedChapters = output?.translatedChapters ?? [];

  // Check 1: Chunks within a chapter translated in parallel
  const parallelChapters = parallelExec.filter((p: any) => p.method?.includes('parallel'));
  results.push({ check: 'Chunks translated in parallel per chapter', passed: parallelChapters.length === EXPECTED_CHAPTERS, detail: `${parallelChapters.length}/${EXPECTED_CHAPTERS} chapters used parallel translation` });

  // Check 2: Translation method recorded as parallel
  const allParallel = translatedChapters.every((ch: any) => ch.chunks?.every((c: any) => c.translationMethod === 'parallel'));
  results.push({ check: 'All chunks marked as parallel', passed: allParallel, detail: allParallel ? 'All chunks have translationMethod=parallel' : 'Some chunks translated sequentially' });

  // Check 3: Context used during parallel translation
  const allUseContext = translatedChapters.every((ch: any) => ch.chunks?.every((c: any) => c.contextUsed?.bookLevel && c.contextUsed?.chapterLevel));
  results.push({ check: 'Both book and chapter context used', passed: allUseContext, detail: allUseContext ? 'All chunks used book-level and chapter-level context' : 'Some chunks missing context' });

  // Check 4: Multiple chunks per chapter (not one giant chunk)
  const multiChunk = translatedChapters.some((ch: any) => ch.totalChunks > 1);
  results.push({ check: 'Chapters split into multiple chunks', passed: multiChunk || translatedChapters.length >= EXPECTED_CHAPTERS, detail: `Chapter chunk counts: ${translatedChapters.map((ch: any) => ch.totalChunks).join(', ')}` });

  return buildDimensionResult('parallelism', 20, results);
}

function evaluateGranularity(output: any): DimensionResult {
  const results: CheckResult[] = [];
  const chapters = output?.chapters ?? [];
  const translatedChapters = output?.translatedChapters ?? [];

  // Check 1: Book split into chapters
  results.push({ check: 'Book split into distinct chapters', passed: chapters.length === EXPECTED_CHAPTERS, detail: `${chapters.length} chapters` });

  // Check 2: Each chapter split into chunks
  const allChunked = chapters.every((ch: any) => ch.chunks?.length > 0);
  results.push({ check: 'Each chapter split into chunks', passed: allChunked, detail: allChunked ? `All ${chapters.length} chapters chunked` : 'Some chapters not chunked' });

  // Check 3: Chunks have iteration metadata
  const allHaveMeta = translatedChapters.every((ch: any) => ch.chunks?.every((c: any) => typeof c.chapterIndex === 'number' && typeof c.chunkIndex === 'number'));
  results.push({ check: 'Chunks have chapter/chunk index metadata', passed: allHaveMeta, detail: allHaveMeta ? 'All chunks have chapterIndex and chunkIndex' : 'Missing iteration metadata' });

  // Check 4: Individual chunk translations (not whole-chapter)
  const avgChunkWords = translatedChapters.flatMap((ch: any) => ch.chunks?.map((c: any) => c.wordCount) ?? []);
  const maxChunkWords = Math.max(...avgChunkWords, 0);
  results.push({ check: 'Chunk-level translation (not chapter-level)', passed: maxChunkWords < 600, detail: `Max chunk: ${maxChunkWords} words (target: ~500)` });

  // Check 5: Chapter contexts are per-chapter
  const chCtx = output?.chapterContexts ?? [];
  const uniqueThemes = new Set(chCtx.map((c: any) => JSON.stringify(c.themes))).size;
  results.push({ check: 'Per-chapter context is unique', passed: uniqueThemes === chCtx.length && chCtx.length > 0, detail: `${uniqueThemes}/${chCtx.length} unique chapter contexts` });

  return buildDimensionResult('granularity', 20, results);
}

function evaluateAggregation(output: any): DimensionResult {
  const results: CheckResult[] = [];
  const combined = output?.combinedTranslation;
  const cc = output?.consistencyCheck;

  // Check 1: All chunks recombined
  results.push({ check: 'All chunks recombined into book', passed: !!combined?.fullText && combined.totalChapters === EXPECTED_CHAPTERS, detail: combined ? `${combined.totalChapters} chapters, ${combined.totalChunks} chunks, ${combined.totalWords} words` : 'No combined translation' });

  // Check 2: Chapter boundaries preserved
  const hasChapterBreaks = combined?.fullText?.includes('---') || combined?.fullText?.includes('Capítulo');
  results.push({ check: 'Chapter boundaries preserved', passed: !!hasChapterBreaks, detail: hasChapterBreaks ? 'Chapter separators found in combined text' : 'No chapter boundaries in combined text' });

  // Check 3: Consistency check covers terminology
  results.push({ check: 'Consistency check covers glossary terms', passed: cc?.glossaryCompliance != null && cc.glossaryCompliance >= 90, detail: cc ? `Glossary compliance: ${cc.glossaryCompliance}%` : 'No glossary compliance check' });

  // Check 4: Consistency check covers all chapters
  const coversAll = cc?.coveragePercent === 100 || cc?.details?.chaptersCompared === EXPECTED_CHAPTERS;
  results.push({ check: 'Consistency check covers all chapters', passed: !!coversAll, detail: cc?.details ? `${cc.details.chaptersCompared} chapters compared` : cc ? `Coverage: ${cc.coveragePercent}%` : 'No consistency check' });

  // Check 5: Character name consistency verified
  results.push({ check: 'Character name consistency verified', passed: cc?.characterNameConsistency != null && cc.characterNameConsistency >= 90, detail: cc ? `Character name consistency: ${cc.characterNameConsistency}%` : 'Not verified' });

  return buildDimensionResult('aggregation', 15, results);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function buildDimensionResult(dimension: string, weight: number, results: CheckResult[]): DimensionResult {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;
  const evidence = results.map(r => `[${r.passed ? 'PASS' : 'FAIL'}] ${r.check}: ${r.detail}`).join('\n');
  const deductions = results.filter(r => !r.passed).map(r => `${r.check}: ${r.detail}`);
  return { dimension, score, weight, applicable: true, checks: results, evidence, deductions };
}

function computeWeightedScore(dimensions: DimensionResult[]): number {
  const applicable = dimensions.filter(d => d.applicable);
  if (applicable.length === 0) return 0;
  const totalWeight = applicable.reduce((s, d) => s + d.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(applicable.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight * 100) / 100;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('='.repeat(70));
console.log('  OBEDIENCE BENCHMARK JUDGE — Book Translation');
console.log('='.repeat(70));

for (const agent of agents) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Judging: ${agent.label} (${agent.id})`);
  console.log(`${'─'.repeat(60)}`);

  let raw: any;
  try { raw = JSON.parse(readFileSync(agent.outputPath, 'utf-8')); } catch (e) { console.error(`  ERROR: Could not read ${agent.outputPath}`); continue; }

  const completeness = evaluateCompleteness(raw);
  const ordering = evaluateOrdering(raw);
  const parallelism = evaluateParallelism(raw);
  const granularity = evaluateGranularity(raw);
  const aggregation = evaluateAggregation(raw);

  const allDims = [completeness, ordering, parallelism, granularity, aggregation];
  const weightedScore = computeWeightedScore(allDims);

  for (const dim of allDims) {
    console.log(`\n  ${dim.dimension.toUpperCase()} (${dim.score}/100, weight ${dim.weight}):`);
    for (const check of dim.checks) {
      console.log(`    ${check.passed ? 'PASS' : 'FAIL'} ${check.check}`);
      console.log(`         ${check.detail}`);
    }
  }

  console.log(`\n  WEIGHTED SCORE: ${weightedScore}/100`);

  let durationMs: number | undefined;
  try { const timing = JSON.parse(readFileSync(agent.timingPath, 'utf-8')); durationMs = timing.durationMs; console.log(`  Duration: ${(durationMs! / 1000).toFixed(1)}s (${(durationMs! / 60000).toFixed(1)}m)`); } catch {}

  const scorecard: JudgeScorecardOutput = { taskName: TASK_NAME, agentId: agent.id, weightedScore, durationMs, dimensions: {} };
  for (const dim of allDims) { scorecard.dimensions[dim.dimension] = { score: dim.score, evidence: dim.evidence, deductions: dim.deductions }; }

  const scorecardDir = agent.outputPath.includes('babysitter') ? 'results/full-comparison/book-translation/babysitter' : 'results/full-comparison/book-translation/pure-claude';
  mkdirSync(scorecardDir, { recursive: true });
  writeFileSync(join(scorecardDir, 'scorecard.json'), JSON.stringify(scorecard, null, 2), 'utf-8');
  console.log(`  Scorecard written to: ${join(scorecardDir, 'scorecard.json')}`);
}

console.log(`\n${'='.repeat(70)}`);
console.log('  Judge complete.');
console.log('='.repeat(70));
