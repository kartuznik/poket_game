import { describe, expect, it } from 'vitest';
import type {
  PriorityBridgeSnapshot,
  ReadinessBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
} from '../../lib/types';
import { EMPTY_REPORT_TEXT, buildFinalSummary, type ReportSources } from './summary';

const revenue: RevenueRiskBridgeSnapshot = {
  toolId: 'revenue-risk',
  inputs: {
    leadsPerMonth: 100,
    lateSharePercent: 35,
    conversionPercent: 20,
    avgCheck: 4500,
    lossFactor: 0.3,
    mode: 'custom',
  },
  results: {
    lateLeads: 35,
    revenueAtRiskMax: 31500,
    recoverableRevenue: 22050,
    revenueAtRiskPerYear: 378000,
    costPerMissedDialog: 900,
  },
  updatedAt: 1,
};

const routine: RoutineBridgeSnapshot = {
  toolId: 'routine-calc',
  inputs: {
    presetId: 'answers',
    operationsPerWeek: 40,
    minutesPerOperation: 6,
    hourlyRate: 500,
    automationSharePercent: 70,
  },
  results: {
    hoursPerMonth: 17.32,
    workDaysPerYear: 25.98,
    savedHoursPerMonth: 12.12,
    savedWorkDaysPerYear: 18.18,
    savedMoneyPerMonth: 6060,
  },
  updatedAt: 1,
};

const priority: PriorityBridgeSnapshot = {
  toolId: 'priority-diag',
  inputs: {
    inquiries: { frequency: 5, time: 4, errorCost: 5 },
    answers: { frequency: 5, time: 3, errorCost: 4 },
    booking: { frequency: 4, time: 3, errorCost: 4 },
    payment: { frequency: 3, time: 2, errorCost: 5 },
    reminders: { frequency: 3, time: 2, errorCost: 3 },
    reports: { frequency: 2, time: 4, errorCost: 2 },
  },
  results: {
    topProcessId: 'inquiries',
    topTitle: 'Приём обращений',
    topScore: 4.7,
    tied: false,
    ranking: [],
  },
  updatedAt: 1,
};

const readiness: ReadinessBridgeSnapshot = {
  toolId: 'readiness-check',
  inputs: {
    repeated: 'yes',
    rules: 'yes',
    'one-path': 'partial',
    'one-place': 'no',
    faq: 'no',
    numbers: 'no',
    owner: 'no',
    channel: 'no',
    time: 'no',
  },
  results: {
    score: 2.5,
    band: 'early',
    bandLabel: 'Рано',
    unclosedTitles: ['Запись, заказ или оплата идут по одному сценарию'],
  },
  updatedAt: 1,
};

const empty: ReportSources = {
  revenue: null,
  routine: null,
  priority: null,
  readiness: null,
};

describe('buildFinalSummary', () => {
  it('stays empty until at least one tool has a snapshot', () => {
    const summary = buildFinalSummary(empty);
    expect(summary.hasData).toBe(false);
    expect(summary.blocks).toEqual([]);
    expect(EMPTY_REPORT_TEXT).toContain('Заполните хотя бы один инструмент');
  });

  it('keeps a single tool in the lead', () => {
    const summary = buildFinalSummary({ ...empty, revenue });
    expect(summary.hasData).toBe(true);
    expect(summary.lead).toContain('22');
    expect(summary.lead).toContain('Потенциал возврата');
    expect(summary.blocks).toHaveLength(1);
  });

  it('joins priority, savings and revenue into one lead', () => {
    const summary = buildFinalSummary({ revenue, routine, priority, readiness });
    expect(summary.lead).toBe(
      'Ваш главный приоритет: Приём обращений. Можно вернуть 12,1\u00A0часа в месяц. Потенциал возврата: 22\u00A0050\u00A0₽. Готовность: Рано.',
    );
    expect(summary.headline).toBe('Приём обращений');
    expect(summary.blocks.map((block) => block.title)).toEqual([
      'Что первым',
      'Рутина',
      'Потенциал возврата',
      'Готовность',
    ]);
  });

  it('says when the hourly rate was not given', () => {
    const summary = buildFinalSummary({
      ...empty,
      routine: {
        ...routine,
        results: { ...routine.results, savedMoneyPerMonth: null },
      },
    });
    expect(summary.blocks[0]?.text).toContain('Ставка не указана');
  });
});
