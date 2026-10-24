import { formatCsvNumber, toCsv } from '../../lib/csv';
import { PRIORITY_PROCESSES } from '../priority-diag/calc';
import { READINESS_ITEMS } from '../readiness-check/calc';
import { getRoutinePresetById } from '../routine-calc/calc';
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
  lines.push('@_kartuzzz');
  return lines.join('\n');
}

function row(section: string, label: string, value: string): readonly [string, string, string] {
  return [section, label, value];
}

/** Every entered value and result, ready for Excel and Google Sheets. */
export function buildReportCsv(sources: ReportSources): string {
  const rows: (readonly string[])[] = [['Раздел', 'Показатель', 'Значение']];
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
      row('Выручка', 'Риск в месяц, ₽', formatCsvNumber(revenue.results.revenueAtRiskMax)),
      row('Выручка', 'Риск в год, ₽', formatCsvNumber(revenue.results.revenueAtRiskPerYear)),
      row('Выручка', 'Потенциал возврата, ₽', formatCsvNumber(revenue.results.recoverableRevenue)),
      row('Выручка', 'Цена пропущенного диалога, ₽', formatCsvNumber(revenue.results.costPerMissedDialog)),
    );
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
      row('Рутина', 'Часов в месяц', formatCsvNumber(routine.results.hoursPerMonth)),
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
      row('Готовность', 'Баллы', formatCsvNumber(readiness.results.score)),
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
