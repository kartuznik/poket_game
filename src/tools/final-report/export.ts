import { escapeCsvCell, formatCsvNumber } from '../../lib/csv';
import {
  computeCorridor,
  computeWhatIf,
  defaultUncertainty,
  formatUncertaintyProfile,
  isAllPrecise,
} from '../revenue-risk/calc';
import { READINESS_ITEMS } from '../readiness-check/calc';
import { getRoutinePresetById } from '../routine-calc/calc';
import type { MetricSnapshot } from '../../lib/dossier';
import { buildProgress, metricDelta } from '../audit-finish/progress';
import { buildWeekPlan } from '../audit-finish/week-plan';
import type { ReportSources } from './summary';
import { EMPTY_REPORT_TEXT, buildFinalSummary } from './summary';

/** `2026-10-31` in Europe/Moscow. Shared by the CSV and HTML file names. */
export function reportFileDay(now: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/** `business-game-report-2026-10-31.csv`, dated in Moscow. */
export function reportCsvFilename(now: number): string {
  return `business-game-report-${reportFileDay(now)}.csv`;
}

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

function csvRow(section: string, label: string, value: string): string {
  return cells([section, label, value]);
}

function num(section: string, label: string, value: number): string {
  return csvRow(section, label, formatCsvNumber(value));
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
  return csvRow('Что сделать на этой неделе', String(index), sentence);
}

function csvChange(before: number, after: number): string {
  const delta = metricDelta(before, after);
  if (delta.kind === 'same' || (delta.kind === 'percent' && delta.value === 0)) return '0';
  if (delta.kind === 'absolute') {
    const text = formatCsvNumber(delta.value);
    return delta.value > 0 ? `+${text}` : text;
  }
  return `${delta.value > 0 ? '+' : ''}${String(delta.value)}%`;
}

function historyRow(
  section: string,
  label: string,
  before: number | null,
  after: number | null,
): string | null {
  if (before === null || after === null) return null;
  return cells([section, label, formatCsvNumber(after), formatCsvNumber(before), csvChange(before, after)]);
}

/** Previous and change live here, and only when a comparable snapshot exists. */
function historyLines(
  sources: ReportSources,
  history: readonly MetricSnapshot[],
  now: number,
): readonly string[] {
  const current: MetricSnapshot = {
    savedAt: now,
    revenueAtRiskPerMonth: sources.revenue?.results.revenueAtRiskMax ?? null,
    routineHoursPerMonth: sources.routine?.results.hoursPerMonth ?? null,
    readinessScore: sources.readiness?.results.score ?? null,
  };
  const baseline = buildProgress(history, current, now).baseline;
  if (!baseline) return [];
  const rows = [
    historyRow('Выручка', 'Риск в месяц, ₽', baseline.revenueAtRiskPerMonth, current.revenueAtRiskPerMonth),
    historyRow('Рутина', 'Часов в месяц', baseline.routineHoursPerMonth, current.routineHoursPerMonth),
    historyRow('Готовность', 'Баллы', baseline.readinessScore, current.readinessScore),
  ].filter((row): row is string => row !== null);
  if (rows.length === 0) return [];
  return [
    '---История изменений---',
    'Раздел;Показатель;Значение;Предыдущее;Изменение',
    ...rows,
  ];
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
    const section = 'Выручка';
    lines.push(
      num(section, 'Обращений в месяц', revenue.inputs.leadsPerMonth),
      num(section, 'Доля поздних, %', revenue.inputs.lateSharePercent),
      num(section, 'Конверсия, %', revenue.inputs.conversionPercent),
      num(section, 'Средний чек, ₽', revenue.inputs.avgCheck),
      num(section, 'Доля возврата, %', (1 - revenue.inputs.lossFactor) * 100),
      csvRow(section, 'Режим', revenue.inputs.mode === 'preset' ? 'Сценарное допущение' : 'Моя конверсия'),
      num(section, 'Поздних обращений', revenue.results.lateLeads),
      num(section, 'Риск в год, ₽', revenue.results.revenueAtRiskPerYear),
      num(section, 'Один вовремя отвеченный диалог, ₽', revenue.results.costPerMissedDialog),
    );
    const tags = revenue.uncertainty ?? defaultUncertainty(revenue.inputs.mode);
    const corridor = computeCorridor(revenue.inputs, tags);
    if (isAllPrecise(tags)) {
      lines.push(csvRow(section, 'Точка (все входы точные)', formatCsvNumber(corridor.base)));
    } else {
      lines.push(
        num(section, 'Коридор от, ₽', corridor.low),
        num(section, 'Коридор до, ₽', corridor.high),
      );
    }
    lines.push(csvRow(section, 'Профиль точности', formatUncertaintyProfile(tags)));
    if (typeof revenue.botCoverage === 'number') {
      const whatIf = computeWhatIf(
        { risk: revenue.results.revenueAtRiskMax, lossFactor: revenue.inputs.lossFactor },
        revenue.botCoverage,
      );
      lines.push(
        num(section, 'Покрытие ботом, %', revenue.botCoverage * 100),
        num(section, 'Потери сейчас, ₽', whatIf.lostNow),
        num(section, 'Потери с ботом, ₽', whatIf.lostWithBot),
        num(section, 'Предотвращено, ₽', whatIf.prevented),
      );
    }
    lines.push(
      num(section, 'Итого риск, ₽', revenue.results.revenueAtRiskMax),
      num(section, 'Итого потенциал, ₽', revenue.results.recoverableRevenue),
      '',
    );
  }

  if (routine) {
    const section = 'Рутина';
    lines.push(
      csvRow(
        section,
        'Типовая рутина',
        routine.inputs.presetId ? getRoutinePresetById(routine.inputs.presetId).title : 'свои цифры',
      ),
      num(section, 'Операций в неделю', routine.inputs.operationsPerWeek),
      num(section, 'Минут на операцию', routine.inputs.minutesPerOperation),
      num(section, 'Доля автоматизации, %', routine.inputs.automationSharePercent),
    );
    if (routine.inputs.hourlyRate !== null) {
      lines.push(num(section, 'Ставка, ₽/час', routine.inputs.hourlyRate));
    }
    lines.push(
      num(section, 'Часов в месяц', routine.results.hoursPerMonth),
      num(section, 'Рабочих дней в год', routine.results.workDaysPerYear),
      num(section, 'Экономия часов в месяц', routine.results.savedHoursPerMonth),
    );
    lines.push(
      routine.results.savedMoneyPerMonth === null
        ? csvRow(section, 'Итого экономия, ₽/мес', '')
        : num(section, 'Итого экономия, ₽/мес', routine.results.savedMoneyPerMonth),
      '',
    );
  }

  if (priority) {
    const section = 'Приоритет';
    const top = priority.results.ranking.slice(0, TOP_PROCESS_COUNT);
    for (const item of top) {
      lines.push(num(section, `${item.title}, балл`, item.score));
    }
    lines.push(num(section, 'Итого процессов в топе', Math.min(TOP_PROCESS_COUNT, priority.results.ranking.length)));
    for (const item of top) {
      const score = priority.inputs[item.id];
      lines.push(
        num(section, `${item.title} — частота`, score.frequency),
        num(section, `${item.title} — время`, score.time),
        num(section, `${item.title} — цена ошибки`, score.errorCost),
      );
    }
    lines.push('');
  }

  if (readiness) {
    const section = 'Готовность';
    const yesCount = READINESS_ITEMS.filter((item) => readiness.inputs[item.id] === 'yes').length;
    lines.push(
      num(section, 'Баллы', readiness.results.score),
      csvRow(section, 'Вердикт', readiness.results.bandLabel),
    );
    if (readiness.results.unclosedTitles.length > 0) {
      lines.push(csvRow(section, 'Не закрыто', readiness.results.unclosedTitles.join('; ')));
    }
    for (const item of READINESS_ITEMS) {
      const status = readiness.inputs[item.id];
      const label = status === 'yes' ? 'Да' : status === 'partial' ? 'Частично' : 'Нет';
      lines.push(csvRow(section, item.title, label));
    }
    lines.push(csvRow(section, 'Итого «Да»', `${String(yesCount)} из ${String(READINESS_ITEMS.length)}`), '');
  }

  const plan = buildWeekPlan(sources);
  if (plan.length > 0) {
    plan.forEach((step, index) => {
      lines.push(stepLine(index + 1, step.text));
    });
    lines.push('');
  }

  lines.push(...historyLines(sources, history, now));
  return `\uFEFF${lines.join('\r\n')}`;
}
