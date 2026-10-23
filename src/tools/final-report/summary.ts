import { formatRubles, formatWorkHours } from '../../lib/format';
import type {
  PriorityBridgeSnapshot,
  ReadinessBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
} from '../../lib/types';

export const EMPTY_REPORT_TEXT =
  'Заполните хотя бы один инструмент, чтобы увидеть сводку';

export interface ReportSources {
  readonly revenue: RevenueRiskBridgeSnapshot | null;
  readonly routine: RoutineBridgeSnapshot | null;
  readonly priority: PriorityBridgeSnapshot | null;
  readonly readiness: ReadinessBridgeSnapshot | null;
}

export interface SummaryBlock {
  readonly title: string;
  readonly text: string;
}

export interface FinalSummary {
  readonly hasData: boolean;
  readonly lead: string;
  readonly headline: string;
  readonly blocks: readonly SummaryBlock[];
}

function sentence(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join(' ');
}

/** One short lead plus a block per tool that already has a snapshot. */
export function buildFinalSummary(sources: ReportSources): FinalSummary {
  const { revenue, routine, priority, readiness } = sources;
  if (!revenue && !routine && !priority && !readiness) {
    return { hasData: false, lead: '', headline: '', blocks: [] };
  }

  const parts: string[] = [];
  if (priority) {
    parts.push(`Ваш главный приоритет: ${priority.results.topTitle}.`);
  }
  if (routine) {
    parts.push(
      `Потенциальная экономия: ${formatWorkHours(routine.results.savedHoursPerMonth)} в месяц.`,
    );
  }
  if (revenue) {
    parts.push(`Риск выручки: ${formatRubles(revenue.results.revenueAtRiskMax)}.`);
  }
  if (readiness) {
    parts.push(`Готовность: ${readiness.results.bandLabel}.`);
  }

  const blocks: SummaryBlock[] = [];
  if (priority) {
    const tie = priority.results.tied ? ' Есть процесс с таким же баллом.' : '';
    blocks.push({
      title: 'Что первым',
      text: `${priority.results.topTitle}, балл ${String(priority.results.topScore).replace('.', ',')}.${tie}`,
    });
  }
  if (routine) {
    const money =
      routine.results.savedMoneyPerMonth === null
        ? 'Ставка не указана, поэтому экономия в рублях не считается.'
        : `В деньгах это ${formatRubles(routine.results.savedMoneyPerMonth)} в месяц.`;
    blocks.push({
      title: 'Рутина',
      text: `На эту работу уходит ${formatWorkHours(routine.results.hoursPerMonth)} в месяц, ${routine.results.workDaysPerYear.toString().replace('.', ',')} рабочих дней в год. ${money}`,
    });
  }
  if (revenue) {
    blocks.push({
      title: 'Выручка под риском',
      text: `${formatRubles(revenue.results.revenueAtRiskMax)} в месяц. Вернуть автоматизацией можно около ${formatRubles(revenue.results.recoverableRevenue)}.`,
    });
  }
  if (readiness) {
    const open =
      readiness.results.unclosedTitles.length === 0
        ? 'Незакрытых пунктов нет.'
        : `Не закрыто: ${readiness.results.unclosedTitles.join('; ')}.`;
    blocks.push({
      title: 'Готовность',
      text: `${readiness.results.bandLabel}, ${String(readiness.results.score).replace('.', ',')} из 9. ${open}`,
    });
  }

  const headline = priority
    ? priority.results.topTitle
    : revenue
      ? formatRubles(revenue.results.revenueAtRiskMax)
      : routine
        ? formatWorkHours(routine.results.savedHoursPerMonth)
        : (readiness?.results.bandLabel ?? '');

  return {
    hasData: true,
    lead: sentence(parts),
    headline,
    blocks,
  };
}
