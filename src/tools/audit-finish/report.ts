import { formatRubles, formatWorkHours } from '../../lib/format';
import {
  computeCorridor,
  defaultUncertainty,
  formatCorridorLine,
  isAllPrecise,
} from '../revenue-risk/calc';
import { EMPTY_REPORT_TEXT, buildFinalSummary, type ReportSources } from '../final-report/summary';
import type { RevenueRiskBridgeSnapshot } from '../../lib/types';
import { buildWeekPlan } from './week-plan';
import { formatDayMonth } from './progress';

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

/** Text the visitor pastes to Efim: the confirmed numbers and the next steps. */
export function buildAuditHandoff(sources: ReportSources): string {
  const summary = buildFinalSummary(sources);
  const lines = ['Игра в бизнес — отчёт для Ефима', ''];

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
    const due = remeasureBy(sources);
    if (due) lines.push(due);
    lines.push('');
  }
  lines.push(
    'Рассчитать для своего бизнеса: https://kartuznik.github.io/poket_game/',
    '@_kartuzzz',
  );
  return lines.join('\n');
}

const DAY_MS = 86_400_000;

function remeasureBy(sources: ReportSources): string | null {
  const stamps = [sources.revenue, sources.routine, sources.priority, sources.readiness]
    .map((item) => item?.updatedAt)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (stamps.length === 0) return null;
  const latest = Math.max(...stamps);
  return `Повторить замер до ${formatDayMonth(latest + 7 * DAY_MS)}.`;
}

function telegramRevenueLine(revenue: RevenueRiskBridgeSnapshot): string {
  const tags = revenue.uncertainty ?? defaultUncertainty(revenue.inputs.mode);
  if (isAllPrecise(tags)) {
    return `Возврат: ${formatRubles(revenue.results.recoverableRevenue)}/мес`;
  }
  const corridor = computeCorridor(revenue.inputs, tags);
  return `Возврат: ${formatCorridorLine(corridor, tags)}`;
}

/**
 * Messenger-sized summary. A later lead bot can send this same text.
 * Round 1 only copies it into Telegram. At most six lines.
 */
export function buildTelegramSummary(sources: ReportSources): string {
  const lines = ['Игра в бизнес'];
  if (sources.revenue) lines.push(telegramRevenueLine(sources.revenue));
  if (sources.routine) {
    lines.push(`Рутина: ${formatWorkHours(sources.routine.results.savedHoursPerMonth)}`);
  }
  if (sources.priority) lines.push(`Первым: ${sources.priority.results.topTitle}`);
  if (sources.readiness) lines.push(`Готовность: ${sources.readiness.results.bandLabel}`);
  lines.push('https://kartuznik.github.io/poket_game/');
  return lines.join('\n');
}
