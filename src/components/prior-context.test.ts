import { describe, expect, it } from 'vitest';
import type {
  PriorityBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
} from '../lib/types';
import { buildPriorContextLines, type PriorContextSources } from './prior-context';

const revenue: RevenueRiskBridgeSnapshot = {
  toolId: 'revenue-risk',
  inputs: {
    leadsPerMonth: 200,
    lateSharePercent: 35,
    conversionPercent: 20,
    avgCheck: 4500,
    lossFactor: 0.3,
    mode: 'custom',
  },
  results: {
    lateLeads: 70,
    revenueAtRiskMax: 63000,
    recoverableRevenue: 44100,
    revenueAtRiskPerYear: 756000,
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
    hourlyRate: null,
    automationSharePercent: 70,
  },
  results: {
    hoursPerMonth: 17.32,
    workDaysPerYear: 25.98,
    savedHoursPerMonth: 12.12,
    savedWorkDaysPerYear: 18.18,
    savedMoneyPerMonth: null,
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

const empty: PriorContextSources = { revenue: null, routine: null, priority: null };

describe('buildPriorContextLines', () => {
  it('shows only saved revenue on the routine step', () => {
    const lines = buildPriorContextLines({ ...empty, revenue, routine, priority }, 'routine-calc');
    expect(lines.map((line) => line.label)).toEqual(['Выручка']);
    expect(lines[0]?.text).toContain('63');
    expect(lines[0]?.text).not.toContain('undefined');
  });

  it('shows revenue and routine on the priority step, skipping a missing one', () => {
    expect(
      buildPriorContextLines({ ...empty, revenue, routine }, 'priority-diag').map((line) => line.label),
    ).toEqual(['Выручка', 'Рутина']);
    const onlyRoutine = buildPriorContextLines({ ...empty, routine }, 'priority-diag');
    expect(onlyRoutine.map((line) => line.label)).toEqual(['Рутина']);
    expect(onlyRoutine[0]?.text).toContain('можно вернуть');
    expect(onlyRoutine[0]?.text).not.toMatch(/null|undefined/);
  });

  it('adds the priority line only on the checklist, and stays empty when nothing is saved', () => {
    const lines = buildPriorContextLines({ revenue, routine, priority }, 'readiness-check');
    expect(lines.map((line) => line.label)).toEqual(['Выручка', 'Рутина', 'Что первым']);
    expect(lines[2]?.text).toContain('Приём обращений');
    expect(buildPriorContextLines(empty, 'readiness-check')).toEqual([]);
  });
});
