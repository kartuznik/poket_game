import { describe, expect, it } from 'vitest';
import type { ReportSources } from '../final-report/summary';
import { PRIORITY_PROCESSES } from '../priority-diag/calc';
import type {
  PriorityBridgeSnapshot,
  ReadinessBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
} from '../../lib/types';
import { buildWeekPlan } from './week-plan';

const revenue = (risk: number, precise = false): RevenueRiskBridgeSnapshot => ({
  toolId: 'revenue-risk',
  updatedAt: 1,
  inputs: {
    leadsPerMonth: 100,
    lateSharePercent: 10,
    conversionPercent: 20,
    avgCheck: 500,
    lossFactor: 0.5,
    mode: 'custom',
  },
  ...(precise
    ? {
        uncertainty: {
          leads: 'precise' as const,
          lateShare: 'precise' as const,
          conversion: 'precise' as const,
          check: 'precise' as const,
          recoveryShare: 'precise' as const,
        },
      }
    : {}),
  results: {
    lateLeads: 10,
    revenueAtRiskMax: risk,
    recoverableRevenue: risk / 2,
    revenueAtRiskPerYear: risk * 12,
    costPerMissedDialog: 100,
  },
});

const routine = (hours: number): RoutineBridgeSnapshot => ({
  toolId: 'routine-calc',
  updatedAt: 1,
  inputs: {
    presetId: null,
    operationsPerWeek: 10,
    minutesPerOperation: 10,
    hourlyRate: null,
    automationSharePercent: 50,
  },
  results: {
    hoursPerMonth: hours,
    workDaysPerYear: 1,
    savedHoursPerMonth: 1,
    savedWorkDaysPerYear: 1,
    savedMoneyPerMonth: null,
  },
});

const priority: PriorityBridgeSnapshot = {
  toolId: 'priority-diag',
  updatedAt: 1,
  inputs: {
    inquiries: { frequency: 1, time: 1, errorCost: 1 },
    answers: { frequency: 5, time: 5, errorCost: 5 },
    booking: { frequency: 1, time: 1, errorCost: 1 },
    payment: { frequency: 1, time: 1, errorCost: 1 },
    reminders: { frequency: 1, time: 1, errorCost: 1 },
    reports: { frequency: 1, time: 1, errorCost: 1 },
  },
  results: {
    topProcessId: 'answers',
    topTitle: 'Ответы на вопросы',
    topScore: 5,
    tied: false,
    ranking: [],
  },
};

const readiness = (owner: 'yes' | 'no'): ReadinessBridgeSnapshot => ({
  toolId: 'readiness-check',
  updatedAt: 1,
  inputs: {
    repeated: 'yes',
    rules: 'yes',
    'one-path': 'yes',
    'one-place': 'yes',
    faq: 'yes',
    numbers: 'yes',
    owner,
    channel: 'yes',
    time: 'yes',
  },
  results: { score: owner === 'yes' ? 9 : 8, band: 'ready', bandLabel: 'Можно начинать', unclosedTitles: [] },
});

const none: ReportSources = { revenue: null, routine: null, priority: null, readiness: null };

describe('buildWeekPlan', () => {
  it('stays empty until a tool is confirmed', () => {
    expect(buildWeekPlan(none)).toEqual([]);
  });

  it('opens with the widest inputs when the corridor is wide', () => {
    const plan = buildWeekPlan({ ...none, revenue: revenue(1000) });
    expect(plan).toHaveLength(3);
    expect(plan[0]?.id).toBe('measure');
    expect(plan[0]?.text).toContain('Сначала уточните:');
    expect(plan.map((step) => step.id)).not.toContain('revenue-response');
  });

  it('asks to time the first reply only from 20 000 ₽ a month', () => {
    const below = buildWeekPlan({ ...none, revenue: revenue(19_999, true) });
    const at = buildWeekPlan({ ...none, revenue: revenue(20_000, true) });
    expect(below.map((step) => step.id)).not.toContain('revenue-response');
    expect(at[0]?.text).toBe('Замерьте время первого ответа 5 дней подряд');
  });

  it('asks for a time study only from 65 hours a month', () => {
    const below = buildWeekPlan({ ...none, routine: routine(64) });
    const at = buildWeekPlan({ ...none, routine: routine(65) });
    expect(below.map((step) => step.id)).not.toContain('routine-timing');
    expect(at[0]?.text).toBe('Проведите хронометраж одного рабочего дня');
  });

  it('names an owner only when that checklist item is still open', () => {
    const closed = buildWeekPlan({ ...none, readiness: readiness('yes') });
    const open = buildWeekPlan({ ...none, readiness: readiness('no') });
    expect(closed.map((step) => step.id)).not.toContain('readiness-owner');
    expect(open[0]?.text).toBe('Назначьте ответственного за Telegram-канал');
  });

  it('uses the recommendation of the highest-scoring process', () => {
    const plan = buildWeekPlan({ ...none, priority });
    const expected = PRIORITY_PROCESSES.find((item) => item.id === 'answers');
    expect(plan[0]?.id).toBe('priority-answers');
    expect(plan[0]?.text).toBe(expected?.recommendation);
    expect(plan[0]?.text).not.toContain('Автоматизируйте');
  });

  it('keeps three steps and fills the rest from the shared tail', () => {
    const plan = buildWeekPlan({
      ...none,
      revenue: revenue(50_000, true),
      routine: routine(80),
      priority,
      readiness: readiness('no'),
    });
    expect(plan).toHaveLength(3);
    expect(plan.map((step) => step.id)).toEqual([
      'revenue-response',
      'routine-timing',
      'readiness-owner',
    ]);
  });
});
