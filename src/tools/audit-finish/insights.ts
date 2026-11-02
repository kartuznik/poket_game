import type { ReportSources } from '../final-report/summary';
import { READINESS_READY_SCORE } from '../readiness-check/calc';

const RISK_NOTICE = 20_000;
const RISK_QUIET = 5_000;
const HOURS_HEAVY = 65;
const HOURS_LIGHT = 10;
const ANSWERS_TITLE = 'Ответы на вопросы';

export const INSIGHT_CHECKLIST_OPEN =
  'Чек-лист ещё не закрыт, а выручка под риском уже заметная. Сначала нужен человек, который отвечает за канал.';
export const INSIGHT_ANSWERS =
  'Больше всего времени уходит на одинаковые ответы. Бот здесь окупается быстрее, чем в остальных процессах.';
export const INSIGHT_READY =
  'По чек-листу старт уже возможен. Недельный план ниже — первый ход, не новый диагноз.';
export const INSIGHT_QUIET =
  'Пожара в цифрах нет. Достаточно повторить замер раз в месяц.';

/** At most two lines. A missing tool does not count as zero and does not fire its rule. */
export function buildInsights(sources: ReportSources): readonly string[] {
  const lines: string[] = [];
  const risk = sources.revenue?.results.revenueAtRiskMax;
  const score = sources.readiness?.results.score;
  const hours = sources.routine?.results.hoursPerMonth;
  const topTitle = sources.priority?.results.ranking[0]?.title;

  if (risk !== undefined && risk >= RISK_NOTICE && score !== undefined && score < READINESS_READY_SCORE) {
    lines.push(INSIGHT_CHECKLIST_OPEN);
  }
  if (hours !== undefined && hours >= HOURS_HEAVY && topTitle === ANSWERS_TITLE) {
    lines.push(INSIGHT_ANSWERS);
  }
  if (risk !== undefined && risk >= RISK_NOTICE && score !== undefined && score >= READINESS_READY_SCORE) {
    lines.push(INSIGHT_READY);
  }
  if (risk !== undefined && risk < RISK_QUIET && hours !== undefined && hours < HOURS_LIGHT) {
    lines.push(INSIGHT_QUIET);
  }
  return lines.slice(0, 2);
}
