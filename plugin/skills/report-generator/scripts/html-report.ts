/**
 * HTML Report Generator — Arwes-inspired sci-fi benchmark report
 *
 * Produces self-contained HTML files with:
 * - Dark sci-fi theme (Arwes-style cyan/teal glowing frames)
 * - Animated score bars, radar charts, and data panels
 * - Sound effects on hover/click via Web Audio API
 * - Typing animations and scan-line effects
 * - Task overview, judge evidence, agent output comparison
 * - Multi-task aggregate index pages
 * - Fully standalone (no external dependencies at runtime)
 */

import type {
  ObedienceDimension,
  ObedienceScorecard,
  DimensionScore,
  BenchmarkReport,
} from '../../obedience-types/scripts/types.js';
import { ALL_DIMENSIONS } from '../../obedience-types/scripts/types.js';

// ---------------------------------------------------------------------------
// Public API — Options
// ---------------------------------------------------------------------------

export interface HtmlReportOptions {
  /** Baseline report to compare against (shown as "Baseline") */
  compareWith?: BenchmarkReport;
  /** Override report title */
  title?: string;
  /** Task descriptions keyed by taskName */
  taskDescriptions?: Record<string, string>;
  /** Prescribed process steps per task (taskName -> ordered step labels) */
  prescribedSteps?: Record<string, string[]>;
  /** Primary agent's actual output samples per task (taskName -> parsed JSON) */
  agentOutputSamples?: Record<string, unknown>;
  /** Baseline agent's actual output samples per task (taskName -> parsed JSON) */
  baselineOutputSamples?: Record<string, unknown>;
  /** Evaluation criteria per task -> per dimension */
  evaluationCriteria?: Record<string, Record<string, { weight: number; criteria: string }>>;
}

export interface IndexEntry {
  taskName: string;
  domain: string;
  complexity: string;
  primaryScore: number;
  baselineScore?: number;
  delta?: number;
  reportUrl: string;
}

export interface IndexOptions {
  title?: string;
  primaryAgentId: string;
  baselineAgentId?: string;
  overallPrimaryScore: number;
  overallBaselineScore?: number;
  generatedAt?: string;
}

// ---------------------------------------------------------------------------
// Public API — Single-task comparison report
// ---------------------------------------------------------------------------

export function renderHtmlReport(
  report: BenchmarkReport,
  options: HtmlReportOptions = {},
): string {
  const compare = options.compareWith;
  const title = options.title ?? report.title;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
${CSS}
</head>
<body>
<div id="scanline"></div>
<div id="app">

  ${renderHeader(report, title)}
  ${renderOverallScore(report, compare)}
  ${renderTaskOverview(report, options)}
  ${renderDimensionRadar(report, compare)}
  ${renderDimensionBars(report, compare)}
  ${renderJudgeEvidence(report, compare)}
  ${renderAgentOutputComparison(report, options)}
  ${renderTaskCards(report)}
  ${compare ? renderComparisonTable(report, compare) : ''}
  ${renderLeaderboard(report, compare)}
  ${renderFooter(report)}

</div>
${SCRIPT}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API — Multi-task aggregate index page
// ---------------------------------------------------------------------------

export function renderIndexHtml(
  entries: IndexEntry[],
  options: IndexOptions,
): string {
  const title = options.title ?? 'Obedience Benchmark — Aggregate Report';
  const hasBaseline = options.baselineAgentId != null;
  const overallDelta = options.overallBaselineScore != null
    ? options.overallPrimaryScore - options.overallBaselineScore
    : null;

  const taskCards = entries.map((entry, i) => {
    const deltaHtml = entry.delta != null
      ? `<span class="delta ${entry.delta >= 0 ? 'positive' : 'negative'}">${entry.delta >= 0 ? '+' : ''}${entry.delta}</span>`
      : '';
    return `
      <a href="${esc(entry.reportUrl)}" class="index-card fade-in" data-delay="${300 + i * 100}">
        <div class="frame frame-task">
          <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
          <div class="frame-corner bl"></div><div class="frame-corner br"></div>
          <div class="index-card-header">
            <h3>${esc(entry.taskName)}</h3>
            <div class="task-meta">
              <span class="tag">${esc(entry.domain)}</span>
              <span class="tag complexity-${entry.complexity}">${entry.complexity}</span>
            </div>
          </div>
          <div class="index-card-scores">
            <div class="index-score-primary">
              <span class="score-number-static ${scoreClass(entry.primaryScore)}">${entry.primaryScore}</span>
              <span class="score-agent-label">${esc(options.primaryAgentId)}</span>
            </div>
            ${entry.baselineScore != null ? `
            <div class="index-score-baseline">
              <span class="score-number-static ${scoreClass(entry.baselineScore)}">${entry.baselineScore}</span>
              <span class="score-agent-label">${esc(options.baselineAgentId ?? 'baseline')}</span>
            </div>` : ''}
            ${deltaHtml}
          </div>
          <div class="index-card-link">VIEW DETAILS &rarr;</div>
        </div>
      </a>`;
  }).join('');

  const summaryRows = entries.map(e => {
    const d = e.delta;
    const deltaCell = d != null
      ? `<td class="delta ${d >= 0 ? 'positive' : 'negative'}">${d >= 0 ? '+' : ''}${d}</td>`
      : '<td>-</td>';
    return `<tr>
      <td><a href="${esc(e.reportUrl)}">${esc(e.taskName)}</a></td>
      <td class="tag">${esc(e.domain)}</td>
      <td class="tag complexity-${e.complexity}">${e.complexity}</td>
      <td class="${scoreClass(e.primaryScore)}">${e.primaryScore}</td>
      ${hasBaseline ? `<td class="${scoreClass(e.baselineScore ?? 0)}">${e.baselineScore ?? '-'}</td>` : ''}
      ${hasBaseline ? deltaCell : ''}
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
${CSS}
</head>
<body>
<div id="scanline"></div>
<div id="app">

  <header class="arwes-header">
    <div class="frame frame-header">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <div class="header-content">
        <h1 class="typing" data-text="${esc(title)}"></h1>
        <div class="header-meta">
          <span class="tag">PRIMARY: ${esc(options.primaryAgentId)}</span>
          ${hasBaseline ? `<span class="tag">BASELINE: ${esc(options.baselineAgentId!)}</span>` : ''}
          <span class="tag">TASKS: ${entries.length}</span>
          <span class="tag">DATE: ${esc((options.generatedAt ?? new Date().toISOString()).split('T')[0])}</span>
        </div>
      </div>
    </div>
  </header>

  <section class="panel fade-in" data-delay="200">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <div class="panel-content score-hero">
        <div class="score-ring" data-score="${options.overallPrimaryScore}">
          <svg viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" class="ring-bg"/>
            <circle cx="100" cy="100" r="90" class="ring-fill"
              stroke-dasharray="${(options.overallPrimaryScore / 100) * 565.48} 565.48"
              stroke-dashoffset="0"/>
          </svg>
          <div class="score-value">
            <span class="score-number" data-target="${options.overallPrimaryScore}">0</span>
            <span class="score-label">AGGREGATE</span>
            ${overallDelta != null ? `<span class="delta ${overallDelta >= 0 ? 'positive' : 'negative'}">${overallDelta >= 0 ? '+' : ''}${overallDelta}</span>` : ''}
          </div>
        </div>
        <div class="score-stats">
          <div class="stat"><span class="stat-val">${entries.length}</span><span class="stat-label">TASKS</span></div>
          <div class="stat"><span class="stat-val">${entries.filter(e => e.primaryScore >= 80).length}</span><span class="stat-label">PASSING (80+)</span></div>
          <div class="stat"><span class="stat-val">${entries.filter(e => e.primaryScore < 50).length}</span><span class="stat-label">FAILING (&lt;50)</span></div>
          <div class="stat"><span class="stat-val">${Math.round(entries.reduce((s, e) => s + e.primaryScore, 0) / entries.length)}</span><span class="stat-label">AVG SCORE</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="panel fade-in" data-delay="300">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">TASK SUMMARY</h2>
      <div class="panel-content">
        <table class="compare-table">
          <thead><tr>
            <th>Task</th><th>Domain</th><th>Complexity</th>
            <th>${esc(options.primaryAgentId)}</th>
            ${hasBaseline ? `<th>${esc(options.baselineAgentId!)}</th><th>Delta</th>` : ''}
          </tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="panel fade-in" data-delay="400">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">INDIVIDUAL TASK REPORTS</h2>
      <div class="panel-content task-grid">${taskCards}</div>
    </div>
  </section>

  ${renderFooterStatic(options.generatedAt)}

</div>
${SCRIPT}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTML Section Renderers
// ---------------------------------------------------------------------------

function renderHeader(report: BenchmarkReport, title: string): string {
  return `
  <header class="arwes-header">
    <div class="frame frame-header">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <div class="header-content">
        <h1 class="typing" data-text="${esc(title)}"></h1>
        <div class="header-meta">
          <span class="tag">AGENT: ${esc(report.agentId)}</span>
          <span class="tag">RUN: ${esc(report.runId)}</span>
          <span class="tag">DATE: ${esc(report.generatedAt.split('T')[0])}</span>
        </div>
      </div>
    </div>
  </header>`;
}

function renderOverallScore(report: BenchmarkReport, compare?: BenchmarkReport): string {
  const score = report.summary.overallScore;
  const delta = compare ? score - compare.summary.overallScore : 0;
  const deltaHtml = compare
    ? `<span class="delta ${delta >= 0 ? 'positive' : 'negative'}">${delta >= 0 ? '+' : ''}${delta}</span>`
    : '';

  return `
  <section class="panel fade-in" data-delay="200">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <div class="panel-content score-hero">
        <div class="score-ring" data-score="${score}">
          <svg viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" class="ring-bg"/>
            <circle cx="100" cy="100" r="90" class="ring-fill"
              stroke-dasharray="${(score / 100) * 565.48} 565.48"
              stroke-dashoffset="0"/>
          </svg>
          <div class="score-value">
            <span class="score-number" data-target="${score}">0</span>
            <span class="score-label">OVERALL</span>
            ${deltaHtml}
          </div>
        </div>
        <div class="score-stats">
          <div class="stat"><span class="stat-val">${report.summary.tasksCompleted}</span><span class="stat-label">COMPLETED</span></div>
          <div class="stat"><span class="stat-val">${report.summary.tasksFailed}</span><span class="stat-label">FAILED</span></div>
          <div class="stat"><span class="stat-val">${formatDim(report.summary.strongestDimension)}</span><span class="stat-label">STRONGEST</span></div>
          <div class="stat"><span class="stat-val">${formatDim(report.summary.weakestDimension)}</span><span class="stat-label">WEAKEST</span></div>
        </div>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// NEW: Task Overview — description, domain, complexity, evaluation criteria
// ---------------------------------------------------------------------------

function renderTaskOverview(report: BenchmarkReport, options: HtmlReportOptions): string {
  const tasks = report.taskDetails;
  if (tasks.length === 0) return '';

  const sections = tasks.map((task, i) => {
    const desc = options.taskDescriptions?.[task.taskName];
    const steps = options.prescribedSteps?.[task.taskName];
    const criteria = options.evaluationCriteria?.[task.taskName];

    const descHtml = desc
      ? `<div class="overview-description"><p>${esc(desc)}</p></div>`
      : '';

    const stepsHtml = steps && steps.length > 0
      ? `<div class="overview-steps">
          <h4>PRESCRIBED PROCESS</h4>
          <ol class="process-step-list">${steps.map((s, j) => `<li><span class="step-num">${String(j + 1).padStart(2, '0')}</span> ${esc(s)}</li>`).join('')}</ol>
        </div>`
      : '';

    const criteriaHtml = criteria
      ? `<div class="overview-criteria">
          <h4>EVALUATION CRITERIA</h4>
          <table class="criteria-table">
            <thead><tr><th>Dimension</th><th>Weight</th><th>Criteria</th></tr></thead>
            <tbody>${Object.entries(criteria).map(([dim, c]) =>
              `<tr><td>${formatDim(dim as ObedienceDimension)}</td><td>${Math.round(c.weight * 100)}%</td><td>${esc(c.criteria)}</td></tr>`
            ).join('')}</tbody>
          </table>
        </div>`
      : '';

    // Metadata row
    const metaHtml = `
      <div class="overview-meta">
        <div class="meta-item"><span class="meta-key">TASK</span><span class="meta-val">${esc(task.taskName)}</span></div>
        <div class="meta-item"><span class="meta-key">DOMAIN</span><span class="meta-val tag">${esc(task.domain)}</span></div>
        <div class="meta-item"><span class="meta-key">COMPLEXITY</span><span class="meta-val tag complexity-${task.complexity}">${task.complexity}</span></div>
        <div class="meta-item"><span class="meta-key">SCORE</span><span class="meta-val ${scoreClass(task.scorecard.weightedScore)}">${task.scorecard.weightedScore}/100</span></div>
        <div class="meta-item"><span class="meta-key">APPLICABLE DIMS</span><span class="meta-val">${ALL_DIMENSIONS.filter(d => task.scorecard.dimensions[d].applicable).map(d => formatDim(d)).join(', ')}</span></div>
      </div>`;

    return `
      <div class="task-overview-block fade-in" data-delay="${280 + i * 80}">
        ${metaHtml}
        ${descHtml}
        ${stepsHtml}
        ${criteriaHtml}
      </div>`;
  }).join('<hr class="section-divider">');

  return `
  <section class="panel fade-in" data-delay="250">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">TASK OVERVIEW</h2>
      <div class="panel-content">${sections}</div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Dimension Radar (unchanged logic, minor style tweak)
// ---------------------------------------------------------------------------

function getApplicableDims(report: BenchmarkReport, compare?: BenchmarkReport): ObedienceDimension[] {
  return ALL_DIMENSIONS.filter(d => {
    const applicable = report.taskDetails.some(t => t.scorecard.dimensions[d].applicable);
    const cmpApplicable = compare?.taskDetails.some(t => t.scorecard.dimensions[d].applicable);
    return applicable || cmpApplicable;
  });
}

function renderDimensionRadar(report: BenchmarkReport, compare?: BenchmarkReport): string {
  const dims = getApplicableDims(report, compare);
  const n = dims.length;
  const cx = 170, cy = 170, r = 120;

  function polyPoints(scores: Record<string, { averageScore: number }>): string {
    return dims.map((d, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const val = (scores[d]?.averageScore ?? 0) / 100;
      const x = cx + r * val * Math.cos(angle);
      const y = cy + r * val * Math.sin(angle);
      return `${x},${y}`;
    }).join(' ');
  }

  const labels = dims.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lx = cx + (r + 25) * Math.cos(angle);
    const ly = cy + (r + 25) * Math.sin(angle);
    const anchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
    return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="radar-label">${formatDim(d as ObedienceDimension)}</text>`;
  }).join('\n');

  const gridLines = [0.2, 0.4, 0.6, 0.8, 1.0].map(pct => {
    const pts = dims.map((_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return `${cx + r * pct * Math.cos(angle)},${cy + r * pct * Math.sin(angle)}`;
    }).join(' ');
    return `<polygon points="${pts}" class="radar-grid"/>`;
  }).join('\n');

  const axisLines = dims.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(angle)}" y2="${cy + r * Math.sin(angle)}" class="radar-axis"/>`;
  }).join('\n');

  const comparePolygon = compare
    ? `<polygon points="${polyPoints(compare.dimensionAnalysis)}" class="radar-polygon compare"/>`
    : '';

  return `
  <section class="panel fade-in" data-delay="400">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">DIMENSION RADAR</h2>
      <div class="panel-content radar-container">
        <svg viewBox="0 0 340 340" class="radar-svg">
          ${gridLines}
          ${axisLines}
          ${comparePolygon}
          <polygon points="${polyPoints(report.dimensionAnalysis)}" class="radar-polygon primary"/>
          ${labels}
        </svg>
        ${compare ? '<div class="radar-legend"><span class="legend-primary">Current</span><span class="legend-compare">Baseline</span></div>' : ''}
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Dimension Bars — now with evidence text
// ---------------------------------------------------------------------------

function renderDimensionBars(report: BenchmarkReport, compare?: BenchmarkReport): string {
  const applicableDims = getApplicableDims(report, compare);
  const bars = applicableDims.map((dim, i) => {
    const avg = report.dimensionAnalysis[dim].averageScore;
    const cmpAvg = compare ? compare.dimensionAnalysis[dim].averageScore : null;
    const delta = cmpAvg !== null ? avg - cmpAvg : 0;
    const issues = report.dimensionAnalysis[dim].commonIssues;

    return `
      <div class="dim-bar fade-in" data-delay="${500 + i * 100}">
        <div class="dim-bar-header">
          <span class="dim-name">${formatDim(dim)}</span>
          <span class="dim-full-name">${formatDimFull(dim)}</span>
          <span class="dim-score">${avg}<span class="dim-max">/100</span></span>
          ${cmpAvg !== null ? `<span class="delta ${delta >= 0 ? 'positive' : 'negative'}">${delta >= 0 ? '+' : ''}${delta}</span>` : ''}
        </div>
        <div class="bar-track">
          <div class="bar-fill ${scoreClass(avg)}" style="--target-width: ${avg}%" data-width="${avg}"></div>
          ${cmpAvg !== null ? `<div class="bar-fill compare" style="--target-width: ${cmpAvg}%" data-width="${cmpAvg}"></div>` : ''}
        </div>
        ${issues.length > 0 ? `<div class="dim-issues">${issues.map(iss => `<span class="issue-tag">${esc(iss)}</span>`).join('')}</div>` : ''}
      </div>`;
  }).join('');

  return `
  <section class="panel fade-in" data-delay="500">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">DIMENSION SCORES</h2>
      <div class="panel-content">${bars}</div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// NEW: Judge Evidence — full evidence text per dimension for both agents
// ---------------------------------------------------------------------------

function renderJudgeEvidence(report: BenchmarkReport, compare?: BenchmarkReport): string {
  const hasEvidence = report.taskDetails.some(t =>
    ALL_DIMENSIONS.some(d => {
      const ds = t.scorecard.dimensions[d];
      return ds.applicable && (ds.evidence.length > 0 || ds.deductions.length > 0);
    })
  );
  if (!hasEvidence) return '';

  const taskSections = report.taskDetails.map((task, ti) => {
    const cmpTask = compare?.taskDetails.find(t => t.taskName === task.taskName);

    const dimRows = ALL_DIMENSIONS
      .filter(d => task.scorecard.dimensions[d].applicable)
      .map((dim, di) => {
        const ds = task.scorecard.dimensions[dim];
        const cds = cmpTask?.scorecard.dimensions[dim];

        const primaryEvidence = ds.evidence.length > 0
          ? ds.evidence.map(e => `<p class="evidence-text">${esc(e)}</p>`).join('')
          : '<p class="evidence-text muted">No evidence recorded</p>';

        const primaryDeductions = ds.deductions.length > 0
          ? `<div class="evidence-deductions">
              ${ds.deductions.map(d => `<div class="deduction-item"><span class="ded-pts">-${d.points}</span> ${esc(d.reason)}</div>`).join('')}
            </div>`
          : '';

        const baselineEvidence = cds && cds.evidence.length > 0
          ? cds.evidence.map(e => `<p class="evidence-text">${esc(e)}</p>`).join('')
          : '';

        const baselineDeductions = cds && cds.deductions.length > 0
          ? `<div class="evidence-deductions">
              ${cds.deductions.map(d => `<div class="deduction-item"><span class="ded-pts">-${d.points}</span> ${esc(d.reason)}</div>`).join('')}
            </div>`
          : '';

        const baselineBlock = compare && cds
          ? `<div class="evidence-agent-block baseline">
              <div class="evidence-agent-header">
                <span class="evidence-agent-label">BASELINE</span>
                <span class="evidence-agent-id">${esc(compare.agentId)}</span>
                <span class="${scoreClass(cds.score)}">${cds.score}/100</span>
              </div>
              ${baselineEvidence}
              ${baselineDeductions}
            </div>`
          : '';

        const deltaVal = cds ? ds.score - cds.score : null;
        const deltaBadge = deltaVal != null
          ? `<span class="delta ${deltaVal >= 0 ? 'positive' : 'negative'}">${deltaVal >= 0 ? '+' : ''}${deltaVal}</span>`
          : '';

        return `
          <div class="evidence-dim-block fade-in" data-delay="${600 + ti * 200 + di * 60}">
            <div class="evidence-dim-header">
              <span class="evidence-dim-name">${formatDim(dim)}</span>
              <span class="evidence-dim-full">${formatDimFull(dim)}</span>
              ${deltaBadge}
            </div>
            <div class="evidence-agents-row">
              <div class="evidence-agent-block primary">
                <div class="evidence-agent-header">
                  <span class="evidence-agent-label">PRIMARY</span>
                  <span class="evidence-agent-id">${esc(report.agentId)}</span>
                  <span class="${scoreClass(ds.score)}">${ds.score}/100</span>
                </div>
                ${primaryEvidence}
                ${primaryDeductions}
              </div>
              ${baselineBlock}
            </div>
          </div>`;
      }).join('');

    return `
      <div class="evidence-task-section">
        <h3 class="evidence-task-title">${esc(task.taskName)}</h3>
        ${dimRows}
      </div>`;
  }).join('');

  return `
  <section class="panel fade-in" data-delay="600">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">JUDGE EVIDENCE &amp; ANALYSIS</h2>
      <div class="panel-content">${taskSections}</div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// NEW: Agent Output Comparison — side-by-side output snippets
// ---------------------------------------------------------------------------

function renderAgentOutputComparison(report: BenchmarkReport, options: HtmlReportOptions): string {
  const primarySamples = options.agentOutputSamples;
  const baselineSamples = options.baselineOutputSamples;
  if (!primarySamples && !baselineSamples) return '';

  const compare = options.compareWith;

  const taskSections = report.taskDetails.map((task, i) => {
    const primaryOutput = primarySamples?.[task.taskName];
    const baselineOutput = baselineSamples?.[task.taskName];
    if (!primaryOutput && !baselineOutput) return '';

    const primaryJson = primaryOutput ? truncateJson(primaryOutput, 60) : null;
    const baselineJson = baselineOutput ? truncateJson(baselineOutput, 60) : null;

    // Extract key structural differences
    const structureDiff = compareStructure(primaryOutput, baselineOutput);

    return `
      <div class="output-task-section fade-in" data-delay="${700 + i * 150}">
        <h3 class="output-task-title">${esc(task.taskName)} — Agent Outputs</h3>
        ${structureDiff ? `<div class="structure-diff"><h4>STRUCTURAL DIFFERENCES</h4>${structureDiff}</div>` : ''}
        <div class="output-columns">
          ${primaryJson ? `
          <div class="output-column primary-col">
            <div class="output-col-header">
              <span class="output-agent-label">PRIMARY</span>
              <span class="output-agent-id">${esc(report.agentId)}</span>
            </div>
            <pre class="output-json"><code>${esc(primaryJson)}</code></pre>
          </div>` : ''}
          ${baselineJson && compare ? `
          <div class="output-column baseline-col">
            <div class="output-col-header">
              <span class="output-agent-label">BASELINE</span>
              <span class="output-agent-id">${esc(compare.agentId)}</span>
            </div>
            <pre class="output-json"><code>${esc(baselineJson)}</code></pre>
          </div>` : ''}
        </div>
      </div>`;
  }).join('');

  if (!taskSections.replace(/\s/g, '')) return '';

  return `
  <section class="panel fade-in" data-delay="700">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">AGENT OUTPUT COMPARISON</h2>
      <div class="panel-content">${taskSections}</div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Task Cards — enhanced with more detail
// ---------------------------------------------------------------------------

function renderTaskCards(report: BenchmarkReport): string {
  const cards = report.taskDetails.map((task, i) => {
    const sc = task.scorecard;
    const dimRows = ALL_DIMENSIONS
      .filter(d => sc.dimensions[d].applicable)
      .map(d => {
        const ds = sc.dimensions[d];
        return `<tr>
          <td>${formatDim(d)}</td>
          <td><div class="mini-bar"><div class="mini-fill ${scoreClass(ds.score)}" style="width:${ds.score}%"></div></div></td>
          <td class="score-cell">${ds.score}</td>
          <td class="weight-cell">${Math.round(ds.weight * 100)}%</td>
        </tr>`;
      }).join('');

    const evidenceHtml = ALL_DIMENSIONS
      .filter(d => sc.dimensions[d].applicable && sc.dimensions[d].deductions.length > 0)
      .map(d => {
        const ds = sc.dimensions[d];
        return ds.deductions.map(ded =>
          `<div class="deduction"><span class="ded-dim">${formatDim(d)}</span> <span class="ded-reason">${esc(ded.reason)}</span> <span class="ded-pts">-${ded.points}</span></div>`
        ).join('');
      }).join('');

    // Metadata section
    const metaDetails = `
      <div class="task-card-meta">
        <span class="meta-item-inline"><b>Process Steps:</b> ${sc.metadata.processStepCount}</span>
        <span class="meta-item-inline"><b>Observed Steps:</b> ${sc.metadata.observedStepCount}</span>
        <span class="meta-item-inline"><b>Log Events:</b> ${sc.metadata.logEventCount}</span>
        <span class="meta-item-inline"><b>Judge Version:</b> ${sc.metadata.judgeVersion}</span>
      </div>`;

    return `
      <div class="task-card fade-in" data-delay="${800 + i * 150}">
        <div class="frame frame-task">
          <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
          <div class="frame-corner bl"></div><div class="frame-corner br"></div>
          <div class="task-header">
            <h3>${esc(sc.taskName)}</h3>
            <div class="task-meta">
              <span class="tag">${esc(task.domain)}</span>
              <span class="tag complexity-${task.complexity}">${task.complexity}</span>
            </div>
            <div class="task-score ${scoreClass(sc.weightedScore)}">${sc.weightedScore.toFixed(1)}</div>
          </div>
          ${metaDetails}
          <table class="dim-table">
            <thead><tr><th>Dimension</th><th>Score</th><th></th><th>Weight</th></tr></thead>
            <tbody>${dimRows}</tbody>
          </table>
          ${task.highlights.length > 0 ? `<div class="highlights">${task.highlights.map(h => `<span class="highlight-tag">${esc(h)}</span>`).join('')}</div>` : ''}
          ${evidenceHtml ? `<div class="evidence-section"><h4>Deductions</h4>${evidenceHtml}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
  <section class="panel fade-in" data-delay="800">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">TASK RESULTS</h2>
      <div class="panel-content task-grid">${cards}</div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Comparison Table — enhanced with evidence excerpts
// ---------------------------------------------------------------------------

function renderComparisonTable(report: BenchmarkReport, compare: BenchmarkReport): string {
  const applicableDims = getApplicableDims(report, compare);
  const rows = applicableDims.map(d => {
    const a = report.dimensionAnalysis[d].averageScore;
    const b = compare.dimensionAnalysis[d].averageScore;
    const delta = a - b;

    // Gather one-line evidence excerpts
    const primaryIssues = report.dimensionAnalysis[d].commonIssues;
    const baselineIssues = compare.dimensionAnalysis[d].commonIssues;
    const primaryNote = primaryIssues.length > 0 ? primaryIssues[0] : '';
    const baselineNote = baselineIssues.length > 0 ? baselineIssues[0] : '';

    return `<tr>
      <td>${formatDim(d)}</td>
      <td class="${scoreClass(a)}">${a}</td>
      <td class="${scoreClass(b)}">${b}</td>
      <td class="delta ${delta >= 0 ? 'positive' : 'negative'}">${delta >= 0 ? '+' : ''}${delta}</td>
      <td class="evidence-cell">${esc(primaryNote)}</td>
      <td class="evidence-cell">${esc(baselineNote)}</td>
    </tr>`;
  }).join('');

  return `
  <section class="panel fade-in" data-delay="1000">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">HEAD-TO-HEAD COMPARISON</h2>
      <div class="panel-content">
        <table class="compare-table compare-table-wide">
          <thead><tr>
            <th>Dimension</th>
            <th>${esc(report.agentId)}</th>
            <th>${esc(compare.agentId)}</th>
            <th>Delta</th>
            <th>Primary Notes</th>
            <th>Baseline Notes</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Leaderboard — now includes both agents when comparing
// ---------------------------------------------------------------------------

function renderLeaderboard(report: BenchmarkReport, compare?: BenchmarkReport): string {
  const entries: { agentId: string; score: number; strongest: ObedienceDimension; weakest: ObedienceDimension; isCurrent: boolean }[] = [];

  entries.push({
    agentId: report.agentId,
    score: report.summary.overallScore,
    strongest: report.summary.strongestDimension,
    weakest: report.summary.weakestDimension,
    isCurrent: true,
  });

  if (compare) {
    entries.push({
      agentId: compare.agentId,
      score: compare.summary.overallScore,
      strongest: compare.summary.strongestDimension,
      weakest: compare.summary.weakestDimension,
      isCurrent: false,
    });
  }

  entries.sort((a, b) => b.score - a.score);

  const rows = entries.map((e, i) => `
    <tr class="${e.isCurrent ? 'current-agent' : ''}">
      <td>${i + 1}</td>
      <td>${esc(e.agentId)}</td>
      <td class="${scoreClass(e.score)}">${e.score}</td>
      <td>${formatDim(e.strongest)}</td>
      <td>${formatDim(e.weakest)}</td>
    </tr>`).join('');

  return `
  <section class="panel fade-in" data-delay="1200">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <h2 class="panel-title">LEADERBOARD</h2>
      <div class="panel-content">
        <table class="leaderboard-table">
          <thead><tr><th>#</th><th>Agent</th><th>Score</th><th>Best</th><th>Worst</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}

function renderFooter(report: BenchmarkReport): string {
  return `
  <footer class="arwes-footer fade-in" data-delay="1400">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <p>Obedience Benchmark v1.0 &mdash; Process fidelity is the primary metric</p>
      <p class="footer-sub">Generated ${esc(report.generatedAt)}</p>
    </div>
  </footer>`;
}

function renderFooterStatic(generatedAt?: string): string {
  return `
  <footer class="arwes-footer fade-in" data-delay="1400">
    <div class="frame">
      <div class="frame-corner tl"></div><div class="frame-corner tr"></div>
      <div class="frame-corner bl"></div><div class="frame-corner br"></div>
      <p>Obedience Benchmark v1.0 &mdash; Process fidelity is the primary metric</p>
      <p class="footer-sub">Generated ${esc(generatedAt ?? new Date().toISOString())}</p>
    </div>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDim(dim: ObedienceDimension | string): string {
  const map: Record<string, string> = {
    completeness: 'CMPLT', ordering: 'ORDER', conditionality: 'COND',
    parallelism: 'PARLL', granularity: 'GRAN', aggregation: 'AGGR', errorHandling: 'ERR-H',
  };
  return map[dim] ?? dim.toUpperCase();
}

function formatDimFull(dim: ObedienceDimension | string): string {
  const map: Record<string, string> = {
    completeness: 'Completeness', ordering: 'Ordering', conditionality: 'Conditionality',
    parallelism: 'Parallelism', granularity: 'Granularity', aggregation: 'Aggregation',
    errorHandling: 'Error Handling',
  };
  return map[dim] ?? dim;
}

function scoreClass(score: number): string {
  if (score >= 90) return 'score-excellent';
  if (score >= 70) return 'score-good';
  if (score >= 50) return 'score-fair';
  return 'score-poor';
}

/** Truncate a JSON object to at most `maxLines` lines for display */
function truncateJson(obj: unknown, maxLines: number): string {
  const full = JSON.stringify(obj, null, 2);
  const lines = full.split('\n');
  if (lines.length <= maxLines) return full;
  const head = lines.slice(0, Math.floor(maxLines * 0.6));
  const tail = lines.slice(-Math.floor(maxLines * 0.25));
  return [...head, `  // ... ${lines.length - head.length - tail.length} lines omitted ...`, ...tail].join('\n');
}

/** Compare two output objects and describe structural differences */
function compareStructure(primary: unknown, baseline: unknown): string {
  if (!primary || !baseline) return '';
  if (typeof primary !== 'object' || typeof baseline !== 'object') return '';

  const diffs: string[] = [];

  const pKeys = Object.keys(primary as Record<string, unknown>);
  const bKeys = Object.keys(baseline as Record<string, unknown>);

  const onlyInPrimary = pKeys.filter(k => !bKeys.includes(k));
  const onlyInBaseline = bKeys.filter(k => !pKeys.includes(k));
  const shared = pKeys.filter(k => bKeys.includes(k));

  if (onlyInPrimary.length > 0) {
    diffs.push(`<div class="diff-item primary-only"><span class="diff-label">Only in primary:</span> <code>${onlyInPrimary.map(esc).join(', ')}</code></div>`);
  }
  if (onlyInBaseline.length > 0) {
    diffs.push(`<div class="diff-item baseline-only"><span class="diff-label">Only in baseline:</span> <code>${onlyInBaseline.map(esc).join(', ')}</code></div>`);
  }

  // Check array lengths for shared keys
  for (const k of shared) {
    const pv = (primary as Record<string, unknown>)[k];
    const bv = (baseline as Record<string, unknown>)[k];
    if (Array.isArray(pv) && Array.isArray(bv) && pv.length !== bv.length) {
      diffs.push(`<div class="diff-item length-diff"><span class="diff-label">${esc(k)}:</span> primary has ${pv.length} items, baseline has ${bv.length} items</div>`);
    }
  }

  if (diffs.length === 0) {
    diffs.push(`<div class="diff-item same"><span class="diff-label">Top-level keys:</span> ${pKeys.length} keys in both (${shared.length} shared)</div>`);
  }

  return diffs.join('');
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `<style>
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

:root {
  --bg: #020810;
  --bg2: #061018;
  --cyan: #00f0ff;
  --cyan-dim: rgba(0,240,255,0.15);
  --cyan-glow: rgba(0,240,255,0.4);
  --teal: #00d4aa;
  --magenta: #ff00aa;
  --amber: #ffbb00;
  --red: #ff3355;
  --text: #b0d4e8;
  --text-bright: #e0f4ff;
  --mono: 'Share Tech Mono', monospace;
  --display: 'Orbitron', sans-serif;
}

* { margin:0; padding:0; box-sizing:border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--mono);
  min-height: 100vh;
  overflow-x: hidden;
}

#scanline {
  position: fixed; top:0; left:0; width:100%; height:100%;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.015) 2px, rgba(0,240,255,0.015) 4px);
  pointer-events: none; z-index: 9999;
  animation: scanMove 8s linear infinite;
}
@keyframes scanMove { 0%{transform:translateY(0)} 100%{transform:translateY(4px)} }

#app { max-width: 1200px; margin: 0 auto; padding: 20px; }

/* Arwes-style frame */
.frame {
  position: relative;
  border: 1px solid var(--cyan-dim);
  background: linear-gradient(135deg, rgba(0,240,255,0.03), rgba(0,20,40,0.8));
  padding: 24px;
  margin-bottom: 24px;
  clip-path: polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px));
  transition: border-color 0.3s, box-shadow 0.3s;
}
.frame:hover {
  border-color: var(--cyan);
  box-shadow: 0 0 20px var(--cyan-dim), inset 0 0 20px rgba(0,240,255,0.05);
}
.frame-corner {
  position: absolute; width: 12px; height: 12px;
  border: 2px solid var(--cyan);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.frame:hover .frame-corner { box-shadow: 0 0 8px var(--cyan-glow); }
.frame-corner.tl { top:-1px; left:-1px; border-right:none; border-bottom:none; }
.frame-corner.tr { top:-1px; right:-1px; border-left:none; border-bottom:none; }
.frame-corner.bl { bottom:-1px; left:-1px; border-right:none; border-top:none; }
.frame-corner.br { bottom:-1px; right:-1px; border-left:none; border-top:none; }

/* Header */
.arwes-header { margin-bottom: 32px; }
.frame-header { text-align: center; padding: 40px 24px; }
h1 {
  font-family: var(--display);
  font-size: 1.8rem;
  color: var(--cyan);
  text-shadow: 0 0 20px var(--cyan-glow), 0 0 40px rgba(0,240,255,0.15);
  letter-spacing: 4px;
  min-height: 2.2em;
}
.header-meta { margin-top: 16px; display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.tag {
  display: inline-block;
  padding: 4px 12px;
  border: 1px solid var(--cyan-dim);
  font-size: 0.75rem;
  color: var(--cyan);
  letter-spacing: 2px;
  clip-path: polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px));
}

/* Score ring */
.score-hero { display: flex; align-items: center; gap: 48px; justify-content: center; flex-wrap: wrap; }
.score-ring { position: relative; width: 200px; height: 200px; }
.score-ring svg { transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: var(--cyan-dim); stroke-width: 6; }
.ring-fill {
  fill: none; stroke: var(--cyan); stroke-width: 6;
  stroke-linecap: round;
  filter: drop-shadow(0 0 6px var(--cyan-glow));
  transition: stroke-dasharray 2s ease-out;
}
.score-value {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  text-align: center;
}
.score-number {
  display: block;
  font-family: var(--display);
  font-size: 3rem; font-weight: 900;
  color: var(--text-bright);
  text-shadow: 0 0 10px var(--cyan-glow);
}
.score-number-static {
  font-family: var(--display);
  font-size: 2rem; font-weight: 900;
}
.score-label { font-size: 0.7rem; letter-spacing: 3px; color: var(--cyan); }
.score-agent-label { display: block; font-size: 0.6rem; letter-spacing: 1px; color: var(--text); opacity: 0.6; margin-top: 4px; }
.score-stats { display: flex; flex-direction: column; gap: 16px; }
.stat { text-align: center; }
.stat-val { display: block; font-family: var(--display); font-size: 1.1rem; color: var(--text-bright); }
.stat-label { font-size: 0.65rem; letter-spacing: 2px; color: var(--cyan); opacity: 0.7; }

/* Delta badges */
.delta { font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; font-weight: bold; }
.delta.positive { background: rgba(0,212,170,0.2); color: var(--teal); }
.delta.negative { background: rgba(255,51,85,0.2); color: var(--red); }

/* Radar chart */
.radar-container { display: flex; justify-content: center; align-items: center; flex-direction: column; }
.radar-svg { width: 340px; height: 340px; }
.radar-grid { fill: none; stroke: rgba(0,240,255,0.1); stroke-width: 0.5; }
.radar-axis { stroke: rgba(0,240,255,0.15); stroke-width: 0.5; }
.radar-polygon.primary {
  fill: rgba(0,240,255,0.12); stroke: var(--cyan); stroke-width: 2;
  filter: drop-shadow(0 0 4px var(--cyan-glow));
  animation: radarPulse 3s ease-in-out infinite;
}
.radar-polygon.compare { fill: rgba(255,0,170,0.08); stroke: var(--magenta); stroke-width: 1.5; stroke-dasharray: 6 3; }
.radar-label { fill: var(--text); font-size: 10px; font-family: var(--mono); }
@keyframes radarPulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
.radar-legend { margin-top: 12px; display: flex; gap: 24px; font-size: 0.75rem; }
.legend-primary::before { content:''; display:inline-block; width:16px; height:3px; background:var(--cyan); margin-right:8px; vertical-align:middle; }
.legend-compare::before { content:''; display:inline-block; width:16px; height:3px; background:var(--magenta); margin-right:8px; vertical-align:middle; border-top:1px dashed var(--magenta); }

/* Panel titles */
.panel-title {
  font-family: var(--display); font-size: 0.85rem; letter-spacing: 4px;
  color: var(--cyan); margin-bottom: 20px;
  padding-bottom: 8px; border-bottom: 1px solid var(--cyan-dim);
}

/* Dimension bars */
.dim-bar { margin-bottom: 16px; }
.dim-bar-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; }
.dim-name { font-size: 0.8rem; color: var(--text-bright); letter-spacing: 1px; min-width: 60px; }
.dim-full-name { font-size: 0.65rem; color: var(--text); opacity: 0.5; }
.dim-score { font-family: var(--display); font-size: 1rem; color: var(--text-bright); margin-left: auto; }
.dim-max { font-size: 0.65rem; color: var(--text); opacity: 0.5; }
.bar-track {
  position: relative; height: 8px;
  background: rgba(0,240,255,0.06);
  border: 1px solid rgba(0,240,255,0.1);
  overflow: hidden;
}
.bar-fill {
  position: absolute; top: 0; left: 0; height: 100%;
  width: 0; transition: width 1.5s ease-out;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
  box-shadow: 0 0 8px var(--cyan-glow);
}
.bar-fill.compare { background: var(--magenta); opacity: 0.4; z-index: 0; }
.bar-fill.score-excellent { background: linear-gradient(90deg, var(--cyan), var(--teal)); }
.bar-fill.score-good { background: linear-gradient(90deg, var(--teal), var(--amber)); }
.bar-fill.score-fair { background: linear-gradient(90deg, var(--amber), #ff8800); }
.bar-fill.score-poor { background: linear-gradient(90deg, var(--red), #ff6644); }
.dim-issues { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 6px; }
.issue-tag { font-size: 0.65rem; padding: 2px 8px; background: rgba(255,51,85,0.1); border: 1px solid rgba(255,51,85,0.3); color: var(--red); }

/* Task Overview */
.task-overview-block { margin-bottom: 20px; }
.overview-meta { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px; }
.meta-item { display: flex; flex-direction: column; gap: 2px; }
.meta-key { font-size: 0.6rem; letter-spacing: 2px; color: var(--cyan); opacity: 0.7; }
.meta-val { font-size: 0.85rem; color: var(--text-bright); }
.overview-description { margin: 12px 0; padding: 12px; border-left: 3px solid var(--cyan-dim); background: rgba(0,240,255,0.02); }
.overview-description p { font-size: 0.8rem; line-height: 1.6; }
.overview-steps { margin: 16px 0; }
.overview-steps h4, .overview-criteria h4 { font-size: 0.7rem; letter-spacing: 2px; color: var(--cyan); margin-bottom: 10px; }
.process-step-list { list-style: none; padding: 0; }
.process-step-list li {
  padding: 6px 12px; margin-bottom: 4px;
  background: rgba(0,240,255,0.02); border-left: 2px solid var(--cyan-dim);
  font-size: 0.75rem; display: flex; gap: 12px; align-items: center;
}
.step-num {
  font-family: var(--display); font-size: 0.7rem; color: var(--cyan);
  min-width: 20px; text-align: right;
}
.criteria-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
.criteria-table th { text-align: left; padding: 4px 8px; color: var(--cyan); opacity: 0.7; border-bottom: 1px solid var(--cyan-dim); }
.criteria-table td { padding: 4px 8px; border-bottom: 1px solid rgba(0,240,255,0.05); }
.section-divider { border: none; border-top: 1px solid var(--cyan-dim); margin: 20px 0; }

/* Judge Evidence */
.evidence-task-section { margin-bottom: 24px; }
.evidence-task-title { font-family: var(--display); font-size: 0.8rem; color: var(--text-bright); letter-spacing: 2px; margin-bottom: 16px; }
.evidence-dim-block { margin-bottom: 16px; padding: 12px; background: rgba(0,240,255,0.02); border: 1px solid rgba(0,240,255,0.08); }
.evidence-dim-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--cyan-dim); }
.evidence-dim-name { font-size: 0.85rem; color: var(--cyan); font-weight: bold; }
.evidence-dim-full { font-size: 0.7rem; color: var(--text); opacity: 0.6; }
.evidence-agents-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 768px) { .evidence-agents-row { grid-template-columns: 1fr; } }
.evidence-agent-block { padding: 10px; border: 1px solid rgba(0,240,255,0.1); }
.evidence-agent-block.primary { border-color: rgba(0,240,255,0.2); background: rgba(0,240,255,0.02); }
.evidence-agent-block.baseline { border-color: rgba(255,0,170,0.2); background: rgba(255,0,170,0.02); }
.evidence-agent-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.evidence-agent-label { font-size: 0.6rem; letter-spacing: 2px; padding: 2px 6px; }
.evidence-agent-block.primary .evidence-agent-label { background: rgba(0,240,255,0.15); color: var(--cyan); }
.evidence-agent-block.baseline .evidence-agent-label { background: rgba(255,0,170,0.15); color: var(--magenta); }
.evidence-agent-id { font-size: 0.7rem; color: var(--text); opacity: 0.7; }
.evidence-text { font-size: 0.72rem; line-height: 1.5; margin-bottom: 6px; }
.evidence-text.muted { opacity: 0.4; font-style: italic; }
.evidence-deductions { margin-top: 8px; border-top: 1px solid rgba(0,240,255,0.08); padding-top: 6px; }
.deduction-item { font-size: 0.68rem; padding: 2px 0; display: flex; gap: 8px; }
.deduction-item .ded-pts { color: var(--red); font-weight: bold; min-width: 24px; }

/* Agent Output Comparison */
.output-task-section { margin-bottom: 24px; }
.output-task-title { font-family: var(--display); font-size: 0.8rem; color: var(--text-bright); letter-spacing: 2px; margin-bottom: 12px; }
.structure-diff { margin-bottom: 12px; padding: 10px; background: rgba(0,240,255,0.02); border: 1px solid rgba(0,240,255,0.08); }
.structure-diff h4 { font-size: 0.65rem; letter-spacing: 2px; color: var(--cyan); margin-bottom: 8px; }
.diff-item { font-size: 0.7rem; padding: 3px 0; }
.diff-label { color: var(--text-bright); margin-right: 8px; }
.diff-item.primary-only { color: var(--cyan); }
.diff-item.baseline-only { color: var(--magenta); }
.diff-item.length-diff { color: var(--amber); }
.diff-item.same { color: var(--text); opacity: 0.7; }
.diff-item code { background: rgba(0,240,255,0.06); padding: 1px 4px; font-size: 0.68rem; }
.output-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 768px) { .output-columns { grid-template-columns: 1fr; } }
.output-column { border: 1px solid rgba(0,240,255,0.1); }
.output-column.primary-col { border-color: rgba(0,240,255,0.2); }
.output-column.baseline-col { border-color: rgba(255,0,170,0.2); }
.output-col-header { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid rgba(0,240,255,0.1); }
.output-agent-label { font-size: 0.6rem; letter-spacing: 2px; padding: 2px 6px; }
.primary-col .output-agent-label { background: rgba(0,240,255,0.15); color: var(--cyan); }
.baseline-col .output-agent-label { background: rgba(255,0,170,0.15); color: var(--magenta); }
.output-agent-id { font-size: 0.7rem; color: var(--text); opacity: 0.7; }
.output-json {
  margin: 0; padding: 12px; overflow-x: auto; max-height: 500px; overflow-y: auto;
  background: rgba(0,0,0,0.3); font-size: 0.65rem; line-height: 1.4;
}
.output-json code { color: var(--text); }

/* Task cards */
.task-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
.task-card .frame-task { padding: 20px; }
.task-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.task-header h3 { font-family: var(--display); font-size: 0.85rem; color: var(--text-bright); letter-spacing: 2px; flex: 1; }
.task-meta { display: flex; gap: 6px; }
.task-card-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; font-size: 0.68rem; color: var(--text); opacity: 0.7; }
.meta-item-inline b { color: var(--cyan); opacity: 0.8; }
.complexity-low { border-color: var(--teal); color: var(--teal); }
.complexity-medium { border-color: var(--amber); color: var(--amber); }
.complexity-high { border-color: var(--magenta); color: var(--magenta); }
.task-score { font-family: var(--display); font-size: 1.4rem; font-weight: 900; }
.score-excellent { color: var(--cyan); text-shadow: 0 0 8px var(--cyan-glow); }
.score-good { color: var(--teal); }
.score-fair { color: var(--amber); }
.score-poor { color: var(--red); }

/* Dimension table */
.dim-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
.dim-table th { text-align: left; padding: 4px 8px; color: var(--cyan); opacity: 0.7; border-bottom: 1px solid var(--cyan-dim); }
.dim-table td { padding: 4px 8px; }
.score-cell { font-family: var(--display); font-weight: 700; }
.weight-cell { opacity: 0.5; }
.mini-bar { width: 80px; height: 4px; background: rgba(0,240,255,0.1); border-radius: 2px; overflow: hidden; }
.mini-fill { height: 100%; border-radius: 2px; transition: width 1s ease-out; }
.mini-fill.score-excellent { background: var(--cyan); }
.mini-fill.score-good { background: var(--teal); }
.mini-fill.score-fair { background: var(--amber); }
.mini-fill.score-poor { background: var(--red); }

/* Evidence */
.evidence-section { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--cyan-dim); }
.evidence-section h4 { font-size: 0.7rem; color: var(--amber); letter-spacing: 2px; margin-bottom: 6px; }
.deduction { font-size: 0.7rem; padding: 4px 0; display: flex; gap: 8px; }
.ded-dim { color: var(--cyan); min-width: 50px; }
.ded-reason { flex: 1; }
.ded-pts { color: var(--red); font-weight: bold; }
.highlights { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.highlight-tag { font-size: 0.65rem; padding: 2px 8px; background: rgba(0,212,170,0.1); border: 1px solid rgba(0,212,170,0.3); color: var(--teal); }

/* Comparison table */
.compare-table { width: 100%; border-collapse: collapse; }
.compare-table th, .compare-table td { padding: 8px 12px; text-align: center; }
.compare-table th { color: var(--cyan); border-bottom: 1px solid var(--cyan-dim); font-size: 0.7rem; letter-spacing: 2px; }
.compare-table td { border-bottom: 1px solid rgba(0,240,255,0.05); }
.compare-table td:first-child { text-align: left; }
.compare-table-wide { font-size: 0.72rem; }
.compare-table-wide .evidence-cell { text-align: left; font-size: 0.65rem; max-width: 200px; color: var(--text); opacity: 0.7; }
.compare-table a { color: var(--cyan); text-decoration: none; }
.compare-table a:hover { text-decoration: underline; }

/* Index cards */
.index-card { display: block; text-decoration: none; color: inherit; }
.index-card .frame-task { padding: 20px; cursor: pointer; }
.index-card:hover .frame-task { border-color: var(--cyan); }
.index-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.index-card-header h3 { font-family: var(--display); font-size: 0.8rem; color: var(--text-bright); letter-spacing: 2px; flex: 1; }
.index-card-scores { display: flex; align-items: center; gap: 24px; margin-bottom: 8px; }
.index-score-primary, .index-score-baseline { text-align: center; }
.index-card-link { font-size: 0.65rem; letter-spacing: 2px; color: var(--cyan); opacity: 0.6; text-align: right; }
.index-card:hover .index-card-link { opacity: 1; }

/* Leaderboard */
.leaderboard-table { width: 100%; border-collapse: collapse; }
.leaderboard-table th, .leaderboard-table td { padding: 10px 16px; text-align: center; }
.leaderboard-table th { color: var(--cyan); border-bottom: 1px solid var(--cyan-dim); font-size: 0.75rem; letter-spacing: 2px; }
.leaderboard-table td { border-bottom: 1px solid rgba(0,240,255,0.05); }
.current-agent { background: rgba(0,240,255,0.05); }
.current-agent td { color: var(--text-bright); }

/* Footer */
.arwes-footer { text-align: center; padding: 20px; opacity: 0.6; }
.arwes-footer .frame { padding: 16px; }
.arwes-footer p { font-size: 0.7rem; letter-spacing: 2px; }
.footer-sub { margin-top: 4px; opacity: 0.5; }

/* Fade-in animation */
.fade-in { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease-out, transform 0.6s ease-out; }
.fade-in.visible { opacity: 1; transform: translateY(0); }

/* Responsive */
@media (max-width: 600px) {
  h1 { font-size: 1.2rem; }
  .score-hero { flex-direction: column; }
  .score-stats { flex-direction: row; flex-wrap: wrap; justify-content: center; }
  .task-grid { grid-template-columns: 1fr; }
}
</style>`;

// ---------------------------------------------------------------------------
// JavaScript (animations, sounds, typing)
// ---------------------------------------------------------------------------

const SCRIPT = `<script>
// Audio context for sci-fi sounds
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function playTone(freq, duration, type='sine', vol=0.04) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + duration);
}
function playHover() { playTone(1200, 0.08, 'sine', 0.03); }
function playClick() { playTone(800, 0.05, 'square', 0.02); playTone(1600, 0.1, 'sine', 0.03); }
function playReveal() { playTone(400, 0.15, 'sine', 0.03); setTimeout(()=>playTone(600,0.15,'sine',0.03),100); setTimeout(()=>playTone(800,0.2,'sine',0.04),200); }

// Init audio on first interaction
document.addEventListener('click', () => { initAudio(); }, { once: true });
document.addEventListener('mousemove', () => { initAudio(); }, { once: true });

// Hover/click sounds on frames
document.querySelectorAll('.frame').forEach(f => {
  f.addEventListener('mouseenter', playHover);
  f.addEventListener('click', playClick);
});

// Typing animation
document.querySelectorAll('.typing').forEach(el => {
  const text = el.dataset.text || el.textContent;
  el.textContent = '';
  let i = 0;
  function type() {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(type, 40 + Math.random() * 30);
    }
  }
  setTimeout(type, 600);
});

// Scroll-triggered fade-in
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const delay = parseInt(entry.target.dataset.delay || '0');
      setTimeout(() => {
        entry.target.classList.add('visible');
        playReveal();
      }, delay);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// Animated score counter
document.querySelectorAll('.score-number').forEach(el => {
  const target = parseInt(el.dataset.target);
  let current = 0;
  const step = Math.max(1, Math.floor(target / 60));
  function count() {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current < target) requestAnimationFrame(count);
  }
  setTimeout(count, 800);
});

// Animated bar fills
setTimeout(() => {
  document.querySelectorAll('.bar-fill:not(.compare)').forEach(el => {
    el.style.width = el.dataset.width + '%';
  });
  document.querySelectorAll('.bar-fill.compare').forEach(el => {
    el.style.width = el.dataset.width + '%';
  });
}, 600);

// Animated mini-bar fills
setTimeout(() => {
  document.querySelectorAll('.mini-fill').forEach(el => {
    el.style.width = el.parentElement ? el.style.width : '0%';
  });
}, 1200);
<\/script>`;

export default renderHtmlReport;
