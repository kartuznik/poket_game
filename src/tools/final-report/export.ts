import { escapeCsvCell, formatCsvNumber } from '../../lib/csv';
import {
  computeCorridor,
  computeWhatIf,
  defaultUncertainty,
  formatUncertaintyProfile,
} from '../revenue-risk/calc';
import { READINESS_ITEMS } from '../readiness-check/calc';
import { getRoutinePresetById } from '../routine-calc/calc';
import type { MetricSnapshot } from '../../lib/dossier';
import { buildWeekPlan } from '../audit-finish/week-plan';
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

const PRODUCT_URL = 'https://kartuznik.github.io/poket_game/';
const TOP_PROCESS_COUNT = 3;

function cells(values: readonly string[]): string {
  return values.map((value) => escapeCsvCell(value)).join(';');
}

function pair(label: string, value: string): string {
  return cells([label, value]);
}

function num(label: string, value: number): string {
  return pair(label, formatCsvNumber(value));
}

export function formatGeneratedAt(now: number): string {
  const date = new Date(now);
  const day = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  })
    .format(date)
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s*г\.$/, '');
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Moscow',
  })
    .format(date)
    .replace(/[\u00a0\u202f]/g, ' ');
  return `${day}, ${time}`;
}

function stepLine(index: number, text: string): string {
  const sentence = /[.!?…]$/.test(text) ? text : `${text}.`;
  return cells([`${String(index)}. ${sentence}`]);
}

/** Placeholder until the history section lands in its own change. */
function historyLines(
  sources: ReportSources,
  history: readonly MetricSnapshot[],
  now: number,
): readonly string[] {
  if (sources.revenue === null && history.length === 0 && now < 0) return [];
  return [];
}

/** Every entered value and result, ready for Excel and Google Sheets. */
export function buildReportCsv(
  sources: ReportSources,
  history: readonly MetricSnapshot[] = [],
  now = Date.now(),
): string {
  const lines = [
    '# Игра в бизнес · Бизнес-аудит',
    `# Сгенерировано: ${formatGeneratedAt(now)}`,
    `# ${PRODUCT_URL}`,
    'Раздел;Показатель;Значение',
  ];
  const { revenue, routine, priority, readiness } = sources;

  if (revenue) {
    lines.push('Выручка');
    lines.push(
      num('Обращений в месяц', revenue.inputs.leadsPerMonth),
      num('Доля поздних, %', revenue.inputs.lateSharePercent),
      num('Конверсия, %', revenue.inputs.conversionPercent),
      num('Средний чек, ₽', revenue.inputs.avgCheck),
      num('Доля возврата, %', (1 - revenue.inputs.lossFactor) * 100),
      pair('Режим', revenue.inputs.mode === 'preset' ? 'Сценарное допущение' : 'Моя конверсия'),
      num('Поздних обращений', revenue.results.lateLeads),
      num('Риск в год, ₽', revenue.results.revenueAtRiskPerYear),
      num('Один вовремя отвеченный диалог, ₽', revenue.results.costPerMissedDialog),
    );
    const tags = revenue.uncertainty ?? defaultUncertainty(revenue.inputs.mode);
    const corridor = computeCorridor(revenue.inputs, tags);
    lines.push(
      num('Коридор от, ₽', corridor.low),
      num('Коридор до, ₽', corridor.high),
      pair('Профиль точности', formatUncertaintyProfile(tags)),
    );
    if (typeof revenue.botCoverage === 'number') {
      const whatIf = computeWhatIf(
        { risk: revenue.results.revenueAtRiskMax, lossFactor: revenue.inputs.lossFactor },
        revenue.botCoverage,
      );
      lines.push(
        num('Покрытие ботом, %', revenue.botCoverage * 100),
        num('Потери сейчас, ₽', whatIf.lostNow),
        num('Потери с ботом, ₽', whatIf.lostWithBot),
        num('Предотвращено, ₽', whatIf.prevented),
      );
    }
    lines.push(
      num('Итого риск, ₽', revenue.results.revenueAtRiskMax),
      num('Итого потенциал, ₽', revenue.results.recoverableRevenue),
      '',
    );
  }

  if (routine) {
    lines.push('Рутина');
    lines.push(
      pair(
        'Типовая рутина',
        routine.inputs.presetId ? getRoutinePresetById(routine.inputs.presetId).title : 'свои цифры',
      ),
      num('Операций в неделю', routine.inputs.operationsPerWeek),
      num('Минут на операцию', routine.inputs.minutesPerOperation),
      num('Доля автоматизации, %', routine.inputs.automationSharePercent),
    );
    if (routine.inputs.hourlyRate !== null) {
      lines.push(num('Ставка, ₽/час', routine.inputs.hourlyRate));
    }
    lines.push(
      num('Часов в месяц', routine.results.hoursPerMonth),
      num('Рабочих дней в год', routine.results.workDaysPerYear),
      num('Экономия часов в месяц', routine.results.savedHoursPerMonth),
    );
    lines.push(
      routine.results.savedMoneyPerMonth === null
        ? pair('Итого экономия, ₽/мес', '')
        : num('Итого экономия, ₽/мес', routine.results.savedMoneyPerMonth),
    );
    lines.push(num('Итого часов в месяц', routine.results.hoursPerMonth), '');
  }

  if (priority) {
    lines.push('Приоритет');
    priority.results.ranking.forEach((item, index) => {
      lines.push(cells([`Процесс №${String(index + 1)}`, item.title, `балл ${formatCsvNumber(item.score)}`]));
    });
    lines.push(num('Итого процессов в топе', Math.min(TOP_PROCESS_COUNT, priority.results.ranking.length)), '');
    priority.results.ranking.forEach((item, index) => {
      const score = priority.inputs[item.id];
      lines.push(`Детализация процесса №${String(index + 1)}: ${item.title}`);
      lines.push(
        num('Частота', score.frequency),
        num('Время', score.time),
        num('Цена ошибки', score.errorCost),
        '',
      );
    });
  }

  if (readiness) {
    const yesCount = READINESS_ITEMS.filter((item) => readiness.inputs[item.id] === 'yes').length;
    lines.push('Готовность');
    lines.push(num('Баллы', readiness.results.score), pair('Вердикт', readiness.results.bandLabel));
    if (readiness.results.unclosedTitles.length > 0) {
      lines.push(pair('Не закрыто', readiness.results.unclosedTitles.join('; ')));
    }
    for (const item of READINESS_ITEMS) {
      const status = readiness.inputs[item.id];
      const label = status === 'yes' ? 'Да' : status === 'partial' ? 'Частично' : 'Нет';
      lines.push(pair(item.title, label));
    }
    lines.push(
      pair('Итого «Да»', `${String(yesCount)} из ${String(READINESS_ITEMS.length)}`),
      num('Итого баллов', readiness.results.score),
      '',
    );
  }

  const plan = buildWeekPlan(sources);
  if (plan.length > 0) {
    lines.push('Что сделать на этой неделе');
    plan.forEach((step, index) => {
      lines.push(stepLine(index + 1, step.text));
    });
    lines.push('');
  }

  lines.push(...historyLines(sources, history, now));
  return `\uFEFF${lines.join('\r\n')}`;
}
