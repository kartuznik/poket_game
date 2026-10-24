import { formatRubles, formatWorkHours } from '../../lib/format';
import { EMPTY_REPORT_TEXT, buildFinalSummary, type ReportSources } from '../final-report/summary';

export const THREADS_PROFILE_URL = 'https://www.threads.net/@_kartuzzz';

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
    lines.push(EMPTY_REPORT_TEXT, '', '@_kartuzzz');
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

  const recommendations = buildRecommendations(sources);
  if (recommendations.length > 0) {
    lines.push('Что сделать дальше');
    for (const item of recommendations) lines.push(`• ${item}`);
    lines.push('');
  }
  lines.push('@_kartuzzz');
  return lines.join('\n');
}
