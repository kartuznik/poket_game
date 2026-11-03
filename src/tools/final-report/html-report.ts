import { metricsFromDossier, type BusinessDossier, type MetricSnapshot } from '../../lib/dossier';
import { formatNumber, formatWorkHours } from '../../lib/format';
import { buildProgress, progressChart } from '../audit-finish/progress';
import { buildWeekPlan } from '../audit-finish/week-plan';
import { QUIET_TEXT, confirmedPriorityLeader } from '../priority-diag/calc';
import { calculateRoutine, getRoutinePresetById, routineItems } from '../routine-calc/calc';
import {
  computeCorridor,
  computeWhatIf,
  defaultUncertainty,
  formatCorridorLine,
  formatUncertaintyProfile,
} from '../revenue-risk/calc';
import { nicheTitle } from '../../lib/niche-presets';
import { formatGeneratedAt, reportFileDay } from './export';
import { EMPTY_REPORT_TEXT, buildThesisPieces } from './summary';

const PRODUCT_URL = 'https://kartuznik.github.io/poket_game/';

/** `business-game-report-2026-10-31.html`, dated in Moscow. */
export function reportHtmlFilename(now: number): string {
  return `business-game-report-${reportFileDay(now)}.html`;
}

function rubles(amount: number): string {
  return `${formatNumber(Math.max(0, Math.round(amount)))}\u00A0₽`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function currentSnapshot(dossier: BusinessDossier, now: number): MetricSnapshot {
  const metrics = metricsFromDossier(dossier);
  const last = dossier.history[dossier.history.length - 1];
  if (
    last &&
    last.revenueAtRiskPerMonth === metrics.revenueAtRiskPerMonth &&
    last.routineHoursPerMonth === metrics.routineHoursPerMonth &&
    last.readinessScore === metrics.readinessScore
  ) {
    return last;
  }
  return { savedAt: now, ...metrics };
}

function sparkline(values: readonly number[], label: string): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 6 + (1 - (value - min) / span) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return `<svg class="spark" viewBox="0 0 100 40" role="img" aria-label="${esc(label)}"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function metricCard(label: string, value: string, note: string): string {
  return `<article class="metric"><p>${esc(label)}</p><strong>${esc(value)}</strong><span>${esc(note)}</span></article>`;
}

const STYLE = `
:root {
  color-scheme: light;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --bg-page: #f6f6f3;
  --bg-surface: #ffffff;
  --bg-subtle: #ededeb;
  --bg-result: #f0f4ff;
  --text-primary: #16181d;
  --text-secondary: #434956;
  --text-muted: #646b7a;
  --text-accent: #1d4ed8;
  --accent-primary: #1d4ed8;
  --border-color: #16181d;
  --shadow-card: 3px 3px 0 #16181d;
  --radius-md: 16px;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg-page: #1b1d22;
    --bg-surface: #262932;
    --bg-subtle: #20232a;
    --bg-result: #222838;
    --text-primary: #f3f4f6;
    --text-secondary: #c8cdd6;
    --text-muted: #aeb4c0;
    --text-accent: #b7c9f7;
    --accent-primary: #3f62c4;
    --border-color: #8f96a4;
    --shadow-card: 3px 3px 0 #aeb4c0;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg-page);
  color: var(--text-primary);
  font: 16px/1.45 var(--font-sans);
}
main { width: min(600px, 100%); margin: 0 auto; padding: 20px 16px 36px; }
a { color: var(--text-accent); }
h1, h2, h3, p { margin: 0; }
header { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
.mark { width: 32px; height: 32px; border: 2px solid var(--accent-primary); border-radius: 8px; background: var(--bg-result); }
h1 { font-size: 1.15rem; line-height: 1.3; font-weight: 650; }
h1 strong { font-weight: 800; }
.muted { color: var(--text-secondary); }
.handle { font-weight: 800; }
.metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; }
.metric, .panel {
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
  min-width: 0;
}
.metric p, .metric span { color: var(--text-secondary); font-size: 0.8125rem; }
.metric strong { display: block; margin: 4px 0; font-size: 1.35rem; line-height: 1.2; overflow-wrap: anywhere; }
section { margin-top: 18px; }
h2 { font-size: 1.05rem; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; background: var(--bg-result); }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
ol, ul { margin: 0; padding-left: 1.2rem; }
li { margin: 8px 0; }
li p { color: var(--text-secondary); }
.spark { display: block; width: 100%; height: 120px; color: var(--accent-primary); margin-top: 8px; }
footer { margin-top: 28px; color: var(--text-muted); font-size: 0.8125rem; display: flex; flex-direction: column; gap: 4px; }
@media (max-width: 420px) {
  .metrics { grid-template-columns: 1fr; }
  .metric strong { font-size: 1.2rem; }
}
@page { margin: 12mm; }
@media print {
  button, .no-print { display: none !important; }
  :root {
    color-scheme: light;
    --bg-page: #fff;
    --bg-surface: #fff;
    --bg-result: #fff;
    --text-primary: #16181d;
    --text-secondary: #434956;
    --text-muted: #646b7a;
    --text-accent: #1d4ed8;
    --accent-primary: #1d4ed8;
    --border-color: #16181d;
    --shadow-card: none;
  }
  body { background: #fff; color: #16181d; }
  main { width: auto; max-width: none; }
  .metric, .panel { box-shadow: none; background: #fff; }
  .metric, .panel, li, tr, header, footer, .week-plan, .spark {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`.trim();

/** Self-contained audit page. No network, no extra fonts. */
export function buildHtmlReport(dossier: BusinessDossier, now = Date.now()): string {
  const sources = {
    revenue: dossier.revenue,
    routine: dossier.routine,
    priority: dossier.priority,
    readiness: dossier.readiness,
  };
  const stamp = formatGeneratedAt(now);
  const { revenue, routine, priority, readiness } = sources;
  const hasData = Boolean(revenue || routine || priority || readiness);

  const cards = [
    metricCard(
      'Под риском за месяц',
      revenue ? rubles(revenue.results.revenueAtRiskMax) : 'нет замера',
      '',
    ),
    metricCard(
      'Можно вернуть за месяц',
      revenue ? rubles(revenue.results.recoverableRevenue) : 'нет замера',
      '',
    ),
    metricCard(
      'Часы ручной работы',
      routine ? formatWorkHours(routine.results.hoursPerMonth) : 'нет замера',
      '',
    ),
    metricCard(
      'Чек-лист из 9',
      readiness ? String(readiness.results.score).replace('.', ',') : 'нет замера',
      readiness ? readiness.results.bandLabel : '',
    ),
  ].join('');

  let corridor = '';
  if (revenue) {
    const tags = revenue.uncertainty ?? defaultUncertainty(revenue.inputs.mode);
    const band = computeCorridor(revenue.inputs, tags);
    const rows = [
      `<tr><th>Ниша</th><td>${esc(nicheTitle(dossier.niche))}</td></tr>`,
      `<tr><th>Разброс</th><td>${esc(formatCorridorLine(band, tags))}</td></tr>`,
      `<tr><th>Насколько вы уверены в цифрах</th><td>${esc(formatUncertaintyProfile(tags))}</td></tr>`,
    ];
    if (typeof revenue.botCoverage === 'number') {
      const whatIf = computeWhatIf(
        { risk: revenue.results.revenueAtRiskMax, lossFactor: revenue.inputs.lossFactor },
        revenue.botCoverage,
      );
      rows.push(
        `<tr><th>Сейчас</th><td>${esc(rubles(whatIf.lostNow))}</td></tr>`,
        `<tr><th>С ботом</th><td>${esc(rubles(whatIf.lostWithBot))}</td></tr>`,
        `<tr><th>Предотвращено</th><td>${esc(rubles(whatIf.prevented))}</td></tr>`,
      );
    }
    corridor = `<section><h2>Насколько цифра плавает</h2><div class="panel"><table>${rows.join('')}</table></div></section>`;
  }

  let top = '';
  if (priority) {
    const leader = confirmedPriorityLeader(priority);
    const state =
      priority.results.board === 'quiet'
        ? priority.results.resolutionReason || QUIET_TEXT
        : leader
          ? `Лидер: ${leader.title}`
          : 'Лидер не выбран';
    const peerIds = new Set(priority.results.peerIds ?? []);
    const items = priority.results.ranking.map((item) => {
      const equal = priority.results.board === 'tied' && (peerIds.size === 0 || peerIds.has(item.id));
      const badge = equal ? ' <span class="muted">одинаковый балл</span>' : '';
      return `<li><strong>${esc(item.title)}</strong> <span class="muted">балл ${esc(String(item.score).replace('.', ','))}</span>${badge}</li>`;
    });
    top = `<section><h2>Приоритет</h2><p>${esc(state)}</p><ul>${items.join('')}</ul></section>`;
  }

  const progress = buildProgress(dossier.history, currentSnapshot(dossier, now), now);
  let progressHtml = '';
  if (progress.line) {
    const chart = progressChart(progress.series);
    const figure = chart
      ? `<p class="muted">${esc(chart.title)}</p>${sparkline(chart.values, `${chart.title}: ${chart.values.join(', ')}`)}`
      : '';
    progressHtml = `<section><h2>Ваш прогресс</h2><p>${esc(`${progress.line.label}: ${progress.line.text}`)}</p>${figure}</section>`;
  }

  let routinesHtml = '';
  if (routine) {
    const items = routineItems(routine.inputs);
    const rows = items
      .map((item) => {
        const title = item.presetId ? getRoutinePresetById(item.presetId).title : 'свои цифры';
        const partial = calculateRoutine({ ...item, hourlyRate: null });
        return `<tr><th>${esc(title)}</th><td>${esc(formatWorkHours(partial.hoursPerMonth))}</td><td>${esc(`${String(item.automationSharePercent)}%`)}</td></tr>`;
      })
      .join('');
    const total =
      items.length > 1
        ? `<tr><th>Итого</th><td>${esc(formatWorkHours(routine.results.hoursPerMonth))}</td><td></td></tr>`
        : '';
    routinesHtml = `<section><h2>Рутина</h2><table>${rows}${total}</table></section>`;
  }

  const plan = buildWeekPlan(sources);
  const planHtml =
    plan.length === 0
      ? ''
      : `<section class="week-plan"><h2>Что сделать на этой неделе</h2><ol>${plan
          .map((step) => `<li>${esc(step.text)}</li>`)
          .join('')}</ol></section>`;

  const thesis = hasData
    ? buildThesisPieces(sources)
        .map((piece) => (piece.strong ? `<strong>${esc(piece.text)}</strong>` : esc(piece.text)))
        .join('')
    : esc(EMPTY_REPORT_TEXT);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Бизнес-аудит</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<span class="mark" aria-hidden="true"></span>
<h1>${thesis}</h1>
<p class="handle">@_kartuzzz</p>
</header>
<section class="metrics" aria-label="Сводка">${cards}</section>
${corridor}
${routinesHtml}
${top}
${progressHtml}
${planHtml}
<footer>
<p>Сгенерировано ${esc(stamp)}</p>
<p><a href="${PRODUCT_URL}">${esc(PRODUCT_URL)}</a></p>
</footer>
</main>
</body>
</html>`;
}
