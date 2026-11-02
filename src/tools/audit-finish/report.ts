import { formatRubles, formatWorkHours } from '../../lib/format';
import {
  EMPTY_REPORT_TEXT,
  buildFinalSummary,
  buildThesisPieces,
  thesisText,
  type ReportSources,
} from '../final-report/summary';
import type { MetricSnapshot } from '../../lib/dossier';
import { buildWeekPlan } from './week-plan';
import { buildProgress, formatDayMonth } from './progress';

export const THREADS_PROFILE_URL = 'https://www.threads.com/@_kartuzzz';
/** Telegram chat of the author. Threads stays @_kartuzzz. */
export const TELEGRAM_PROFILE_URL = 'https://t.me/kartuznik';

/** Two or three concrete next steps. Missing tools are simply absent. */
export function buildRecommendations(sources: ReportSources): readonly string[] {
  const items: string[] = [];
  if (sources.priority) {
    items.push(`Первым разберите «${sources.priority.results.topTitle}».`);
  }
  if (sources.revenue && sources.revenue.results.revenueAtRiskMax > 0) {
    items.push(
      `На поздних ответах сейчас ${formatRubles(sources.revenue.results.revenueAtRiskMax)} в месяц.`,
    );
  }
  if (sources.routine && sources.routine.results.savedHoursPerMonth > 0) {
    items.push(
      `На рутине можно вернуть ${formatWorkHours(sources.routine.results.savedHoursPerMonth)} в месяц.`,
    );
  }
  if (sources.readiness) {
    const band = sources.readiness.results.band;
    items.push(
      band === 'ready'
        ? 'По чек-листу уже можно собирать первый сценарий.'
        : band === 'gaps'
          ? 'Сначала закройте пробелы из чек-листа, потом собирайте сценарий.'
          : 'Сначала запишите, что повторяется и что отвечать. Бота пока рано.',
    );
  }
  return items.slice(0, 3);
}

function progressSentence(
  sources: ReportSources,
  history: readonly MetricSnapshot[],
  now: number,
): string | null {
  const metrics = {
    revenueAtRiskPerMonth: sources.revenue?.results.revenueAtRiskMax ?? null,
    routineHoursPerMonth: sources.routine?.results.hoursPerMonth ?? null,
    readinessScore: sources.readiness?.results.score ?? null,
  };
  const last = history[history.length - 1];
  const current: MetricSnapshot =
    last &&
    last.revenueAtRiskPerMonth === metrics.revenueAtRiskPerMonth &&
    last.routineHoursPerMonth === metrics.routineHoursPerMonth &&
    last.readinessScore === metrics.readinessScore
      ? last
      : { savedAt: now, ...metrics };
  const line = buildProgress(history, current, now).line;
  return line ? `${line.label}: ${line.text}` : null;
}

/** Text the visitor pastes to Efim: the confirmed numbers and the next steps. */
export function buildAuditHandoff(
  sources: ReportSources,
  history: readonly MetricSnapshot[] = [],
  now = Date.now(),
): string {
  const summary = buildFinalSummary(sources);
  const lines: string[] = [];

  if (!summary.hasData) {
    lines.push(
      EMPTY_REPORT_TEXT,
      '',
      'Рассчитать для своего бизнеса: https://kartuznik.github.io/poket_game/',
      '@_kartuzzz',
    );
    return lines.join('\n');
  }

  lines.push(summary.lead, '');
  for (const block of summary.blocks) {
    lines.push(block.title);
    lines.push(block.text);
    if (block.lines) {
      for (const line of block.lines) lines.push(`• ${line}`);
    }
    lines.push('');
  }

  const plan = buildWeekPlan(sources);
  if (plan.length > 0) {
    lines.push('Что сделать на этой неделе');
    for (const step of plan) lines.push(`• ${step.text}`);
    lines.push('');
  }
  const progress = progressSentence(sources, history, now);
  if (progress) lines.push(progress, '');
  lines.push(
    'Рассчитать для своего бизнеса: https://kartuznik.github.io/poket_game/',
    '@_kartuzzz',
  );
  return lines.join('\n');
}

const DAY_MS = 86_400_000;

export function formatRemeasureBy(sources: ReportSources): string | null {
  const stamps = [sources.revenue, sources.routine, sources.priority, sources.readiness]
    .map((item) => item?.updatedAt)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (stamps.length === 0) return null;
  const latest = Math.max(...stamps);
  return `Повторить замер до ${formatDayMonth(latest + 7 * DAY_MS)}.`;
}

/**
 * Messenger-sized summary. A later lead bot can send this same text.
 * At most six lines. Four confirmed tools fit in five.
 */
export function buildTelegramSummary(sources: ReportSources): string {
  const thesis = buildThesisPieces(sources);
  const lines = [thesis.length > 0 ? thesisText(thesis) : EMPTY_REPORT_TEXT];
  if (sources.routine && sources.revenue) {
    lines.push(`Ручная работа: ${formatWorkHours(sources.routine.results.hoursPerMonth)}`);
  }
  if (sources.priority && (sources.revenue || sources.routine)) {
    lines.push(`Первым: ${sources.priority.results.topTitle}`);
  }
  if (sources.readiness && (sources.revenue || sources.routine || sources.priority)) {
    lines.push(`Чек-лист: ${sources.readiness.results.bandLabel}`);
  }
  lines.push('https://kartuznik.github.io/poket_game/');
  return lines.join('\n');
}
