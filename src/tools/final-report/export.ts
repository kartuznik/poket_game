import { formatCsvNumber, toCsv } from '../../lib/csv';
import {
  computeCorridor,
  computeWhatIf,
  defaultUncertainty,
  formatUncertaintyProfile,
} from '../revenue-risk/calc';
import { PRIORITY_PROCESSES } from '../priority-diag/calc';
import { READINESS_ITEMS } from '../readiness-check/calc';
import { getRoutinePresetById } from '../routine-calc/calc';
import type { MetricSnapshot } from '../../lib/dossier';
import { buildProgress, metricDelta } from '../audit-finish/progress';
import type { ReportSources } from './summary';
import { EMPTY_REPORT_TEXT, buildFinalSummary } from './summary';

export const REPORT_CSV_FILENAME = 'business-game-report.csv';

/** Structured note the owner can paste into a chat with Efim. */
export function buildEfimReport(sources: ReportSources): string {
  const summary = buildFinalSummary(sources);
  if (!summary.hasData) return EMPTY_REPORT_TEXT;

  const lines = ['Игра в бизнес — отчёт для Ефима', '', summary.lead, ''];
  for (const block of summary.blocks) {
    lines.push(block.title);
    lines.push(block.text);
    if (block.lines) {
      for (const line of block.lines) lines.push(`• ${line}`);
    }
    lines.push('');
  }
  lines.push(
    'Рассчитать для своего бизнеса: https://kartuznik.github.io/poket_game/',
    '@_kartuzzz',
  );
  return lines.join('\n');
}

function row(
  section: string,
  label: string,
  value: string,
  previous = '',
  change = '',
): readonly [string, string, string, string, string] {
  return [section, label, value, previous, change];
}

function csvChange(before: number, after: number): string {
  const delta = metricDelta(before, after);
  if (delta.kind === 'same') return '0';
  if (delta.kind === 'absolute') return formatCsvNumber(delta.value);
  return `${delta.value}%`;
}

function trackedCells(
  baseline: MetricSnapshot | null,
  before: number | null | undefined,
  after: number,
): { readonly previous: string; readonly change: string } {
  if (baseline === null || before === null || before === undefined) return { previous: '', change: '' };
  return { previous: formatCsvNumber(before), change: csvChange(before, after) };
}

/** Every entered value and result, ready for Excel and Google Sheets. */
export function buildReportCsv(
  sources: ReportSources,
  history: readonly MetricSnapshot[] = [],
  now = Date.now(),
): string {
  const current: MetricSnapshot = {
    savedAt: now,
    revenueAtRiskPerMonth: sources.revenue?.results.revenueAtRiskMax ?? null,
    routineHoursPerMonth: sources.routine?.results.hoursPerMonth ?? null,
    readinessScore: sources.readiness?.results.score ?? null,
  };
  const baseline = buildProgress(history, current, now).baseline;
  const rows: (readonly string[])[] = [
    ['Раздел', 'Показатель', 'Значение', 'Предыдущее значение', 'Изменение'],
  ];
  const { revenue, routine, priority, readiness } = sources;

  if (revenue) {
    rows.push(
      row('Выручка', 'Обращений в месяц', formatCsvNumber(revenue.inputs.leadsPerMonth)),
      row('Выручка', 'Доля поздних, %', formatCsvNumber(revenue.inputs.lateSharePercent)),
      row('Выручка', 'Конверсия, %', formatCsvNumber(revenue.inputs.conversionPercent)),
      row('Выручка', 'Средний чек, ₽', formatCsvNumber(revenue.inputs.avgCheck)),
      row(
        'Выручка',
        'Доля возврата, %',
        formatCsvNumber((1 - revenue.inputs.lossFactor) * 100),
      ),
      row('Выручка', 'Режим', revenue.inputs.mode === 'preset' ? 'Сценарное допущение' : 'Моя конверсия'),
      row('Выручка', 'Поздних обращений', formatCsvNumber(revenue.results.lateLeads)),
      row(
        'Выручка',
        'Риск в месяц, ₽',
        formatCsvNumber(revenue.results.revenueAtRiskMax),
        trackedCells(baseline, baseline?.revenueAtRiskPerMonth, revenue.results.revenueAtRiskMax)
          .previous,
        trackedCells(baseline, baseline?.revenueAtRiskPerMonth, revenue.results.revenueAtRiskMax)
          .change,
      ),
      row('Выручка', 'Риск в год, ₽', formatCsvNumber(revenue.results.revenueAtRiskPerYear)),
      row('Выручка', 'Потенциал возврата, ₽', formatCsvNumber(revenue.results.recoverableRevenue)),
      row('Выручка', 'Один вовремя отвеченный диалог, ₽', formatCsvNumber(revenue.results.costPerMissedDialog)),
    );
    const tags = revenue.uncertainty ?? defaultUncertainty(revenue.inputs.mode);
    const corridor = computeCorridor(revenue.inputs, tags);
    rows.push(
      row('Выручка', 'Коридор от, ₽', formatCsvNumber(corridor.low)),
      row('Выручка', 'Коридор до, ₽', formatCsvNumber(corridor.high)),
      row('Выручка', 'Профиль точности', formatUncertaintyProfile(tags)),
    );
    if (typeof revenue.botCoverage === 'number') {
      const whatIf = computeWhatIf(
        { risk: revenue.results.revenueAtRiskMax, lossFactor: revenue.inputs.lossFactor },
        revenue.botCoverage,
      );
      rows.push(
        row('Выручка', 'Покрытие ботом, %', formatCsvNumber(revenue.botCoverage * 100)),
        row('Выручка', 'Потери сейчас, ₽', formatCsvNumber(whatIf.lostNow)),
        row('Выручка', 'Потери с ботом, ₽', formatCsvNumber(whatIf.lostWithBot)),
        row('Выручка', 'Предотвращено, ₽', formatCsvNumber(whatIf.prevented)),
      );
    }
  }

  if (routine) {
    rows.push(
      row(
        'Рутина',
        'Типовая рутина',
        routine.inputs.presetId ? getRoutinePresetById(routine.inputs.presetId).title : 'свои цифры',
      ),
      row('Рутина', 'Операций в неделю', formatCsvNumber(routine.inputs.operationsPerWeek)),
      row('Рутина', 'Минут на операцию', formatCsvNumber(routine.inputs.minutesPerOperation)),
      row('Рутина', 'Доля автоматизации, %', formatCsvNumber(routine.inputs.automationSharePercent)),
      row(
        'Рутина',
        'Ставка, ₽/час',
        routine.inputs.hourlyRate === null ? '' : formatCsvNumber(routine.inputs.hourlyRate),
      ),
      row(
        'Рутина',
        'Часов в месяц',
        formatCsvNumber(routine.results.hoursPerMonth),
        trackedCells(baseline, baseline?.routineHoursPerMonth, routine.results.hoursPerMonth).previous,
        trackedCells(baseline, baseline?.routineHoursPerMonth, routine.results.hoursPerMonth).change,
      ),
      row('Рутина', 'Рабочих дней в год', formatCsvNumber(routine.results.workDaysPerYear)),
      row('Рутина', 'Экономия часов в месяц', formatCsvNumber(routine.results.savedHoursPerMonth)),
      row(
        'Рутина',
        'Экономия, ₽/мес',
        routine.results.savedMoneyPerMonth === null
          ? ''
          : formatCsvNumber(routine.results.savedMoneyPerMonth),
      ),
    );
  }

  if (priority) {
    rows.push(
      row('Приоритет', 'Процесс №1', priority.results.topTitle),
      row('Приоритет', 'Балл', formatCsvNumber(priority.results.topScore)),
    );
    for (const item of priority.results.ranking) {
      rows.push(row('Приоритет', item.title, formatCsvNumber(item.score)));
    }
    for (const process of PRIORITY_PROCESSES) {
      const score = priority.inputs[process.id];
      rows.push(
        row('Приоритет', `${process.title}: частота`, formatCsvNumber(score.frequency)),
        row('Приоритет', `${process.title}: время`, formatCsvNumber(score.time)),
        row('Приоритет', `${process.title}: цена ошибки`, formatCsvNumber(score.errorCost)),
      );
    }
  }

  if (readiness) {
    rows.push(
      row(
        'Готовность',
        'Баллы',
        formatCsvNumber(readiness.results.score),
        trackedCells(baseline, baseline?.readinessScore, readiness.results.score).previous,
        trackedCells(baseline, baseline?.readinessScore, readiness.results.score).change,
      ),
      row('Готовность', 'Вердикт', readiness.results.bandLabel),
      row('Готовность', 'Не закрыто', readiness.results.unclosedTitles.join('; ')),
    );
    for (const item of READINESS_ITEMS) {
      const status = readiness.inputs[item.id];
      const label = status === 'yes' ? 'Да' : status === 'partial' ? 'Частично' : 'Нет';
      rows.push(row('Готовность', item.title, label));
    }
  }

  return toCsv(rows);
}
