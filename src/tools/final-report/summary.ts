import { formatCountWithNoun, formatRubles, formatWorkHours } from '../../lib/format';
import {
  computeCorridor,
  defaultUncertainty,
  formatCorridorLine,
  formatUncertaintyProfile,
} from '../revenue-risk/calc';
import type {
  PriorityBridgeSnapshot,
  ReadinessBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
} from '../../lib/types';
import { editStepFor, type JourneyToolId } from '../../lib/wizard';

export const EMPTY_REPORT_TEXT =
  'Заполните хотя бы один инструмент, чтобы увидеть итоги.';

export interface ReportSources {
  readonly revenue: RevenueRiskBridgeSnapshot | null;
  readonly routine: RoutineBridgeSnapshot | null;
  readonly priority: PriorityBridgeSnapshot | null;
  readonly readiness: ReadinessBridgeSnapshot | null;
}

export interface SummaryBlock {
  readonly title: string;
  readonly text: string;
  readonly lines?: readonly string[];
  readonly sourceToolId?: JourneyToolId;
  readonly editStep?: number;
}

export interface FinalSummary {
  readonly hasData: boolean;
  readonly lead: string;
  readonly headline: string;
  readonly blocks: readonly SummaryBlock[];
}

export interface ThesisPiece {
  readonly text: string;
  readonly strong?: boolean;
}

/** One conclusion. Revenue leads. A missing tool is skipped, not invented. */
export function buildThesisPieces(sources: ReportSources): readonly ThesisPiece[] {
  const { revenue, routine, priority, readiness } = sources;
  if (revenue) {
    return [
      { text: 'Риск выручки: ' },
      { text: formatRubles(revenue.results.revenueAtRiskMax), strong: true },
      { text: '/мес. Можно вернуть: ' },
      { text: formatRubles(revenue.results.recoverableRevenue), strong: true },
      { text: ' при быстрых ответах.' },
    ];
  }
  if (routine) {
    return [
      { text: 'Ручная работа: ' },
      { text: formatWorkHours(routine.results.hoursPerMonth), strong: true },
      { text: ' в месяц.' },
    ];
  }
  if (priority) {
    return [
      { text: 'Первым: ' },
      { text: priority.results.topTitle, strong: true },
      { text: '.' },
    ];
  }
  if (readiness) {
    return [
      { text: 'Чек-лист: ' },
      { text: readiness.results.bandLabel, strong: true },
      { text: '.' },
    ];
  }
  return [];
}

export function thesisText(pieces: readonly ThesisPiece[]): string {
  return pieces.map((piece) => piece.text).join('');
}

/** One short lead plus a block per tool that already has a snapshot. */
export function buildFinalSummary(sources: ReportSources): FinalSummary {
  const { revenue, routine, priority, readiness } = sources;
  if (!revenue && !routine && !priority && !readiness) {
    return { hasData: false, lead: '', headline: '', blocks: [] };
  }

  const blocks: SummaryBlock[] = [];
  if (priority) {
    const tie = priority.results.tied ? ' Есть процесс с таким же баллом.' : '';
    blocks.push({
      title: 'Что первым',
      text: `${priority.results.topTitle}, балл ${String(priority.results.topScore).replace('.', ',')}.${tie}`,
      sourceToolId: 'priority-diag',
      editStep: editStepFor('priority-diag'),
    });
  }
  if (routine) {
    const money =
      routine.results.savedMoneyPerMonth === null
        ? 'Ставка не указана, поэтому экономия в рублях не считается.'
        : `В деньгах это ${formatRubles(routine.results.savedMoneyPerMonth)} в месяц.`;
    const workDays = Math.round(routine.results.workDaysPerYear * 10) / 10;
    blocks.push({
      title: 'Рутина',
      text: `${formatCountWithNoun(workDays, ['рабочий день', 'рабочих дня', 'рабочих дней'])} в год. ${money}`,
      sourceToolId: 'routine-calc',
      editStep: editStepFor('routine-calc'),
    });
  }
  if (revenue) {
    const tags = revenue.uncertainty ?? defaultUncertainty(revenue.inputs.mode);
    const corridor = computeCorridor(revenue.inputs, tags);
    blocks.push({
      title: 'Насколько цифра плавает',
      text: `${formatCorridorLine(corridor, tags)}. Насколько вы уверены в цифрах: ${formatUncertaintyProfile(tags)}.`,
      sourceToolId: 'revenue-risk',
      editStep: editStepFor('revenue-risk'),
    });
  }
  if (readiness) {
    const open = readiness.results.unclosedTitles;
    blocks.push(
      open.length === 0
        ? {
            title: 'Готовность',
            text: 'Незакрытых пунктов нет.',
            sourceToolId: 'readiness-check',
            editStep: editStepFor('readiness-check'),
          }
        : {
            title: 'Готовность',
            text: 'Не закрыто:',
            lines: open,
            sourceToolId: 'readiness-check',
            editStep: editStepFor('readiness-check'),
          },
    );
  }

  const headline = priority
    ? priority.results.topTitle
    : revenue
      ? formatRubles(revenue.results.recoverableRevenue)
      : routine
        ? formatWorkHours(routine.results.savedHoursPerMonth)
        : (readiness?.results.bandLabel ?? '');

  return {
    hasData: true,
    lead: thesisText(buildThesisPieces(sources)),
    headline,
    blocks,
  };
}
