import { describe, expect, it } from 'vitest';
import { formatRubles, formatWorkHours } from '../lib/format';
import type {
  PriorityBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
} from '../lib/types';
import {
  PRIOR_CONTEXT_NOTE,
  PRIOR_CONTEXT_TITLE,
  buildPriorContextLines,
  type PriorContextSources,
} from './prior-context';

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

function routineLine(hours: number, saved: number, money: number | null) {
  const snapshot: RoutineBridgeSnapshot = {
    ...routine,
    results: {
      ...routine.results,
      hoursPerMonth: hours,
      savedHoursPerMonth: saved,
      savedMoneyPerMonth: money,
    },
  };
  return buildPriorContextLines({ ...empty, routine: snapshot }, 'priority-diag')[0];
}

describe('buildPriorContextLines', () => {
  it('names the block as figures carried over from the previous tool', () => {
    expect(PRIOR_CONTEXT_TITLE).toBe('Данные из предыдущего шага');
    expect(PRIOR_CONTEXT_NOTE).toContain('на прошлом шаге');
  });

  it('shows only saved revenue on the routine step', () => {
    const lines = buildPriorContextLines({ ...empty, revenue, routine, priority }, 'routine-calc');
    expect(lines.map((line) => line.label)).toEqual(['Выручка']);
    expect(lines[0]?.clauses).toEqual([formatRubles(63000), 'в месяц под риском']);
    expect(lines[0]?.text).toBe('63\u00A0000\u00A0₽ в месяц под риском');
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
    expect(onlyRoutine[0]?.clauses[0]).toMatch(/в месяц,$/);
    expect(onlyRoutine[0]?.clauses[1]).toMatch(/^можно вернуть /);
    expect(onlyRoutine[0]?.text).toBe(onlyRoutine[0]?.clauses.join(' '));
  });

  it('says an equal hour count once, for every plural and for a rounded match', () => {
    const whole = [0, 1, 1.04, 2, 4, 5, 11, 21, 22, 18, 112, 122];
    for (const hours of whole) {
      const line = routineLine(hours, hours, null);
      const shown = formatWorkHours(hours);
      expect(line?.clauses, String(hours)).toEqual([`${shown} в месяц,`, 'можно вернуть целиком']);
      expect(line?.clauses[1]).not.toContain(shown);
    }

    const sameMoney = routineLine(18, 18, 90200);
    expect(sameMoney?.clauses).toEqual([
      `${formatWorkHours(18)} в месяц,`,
      'можно вернуть целиком,',
      formatRubles(90200),
    ]);
    expect(sameMoney?.clauses[1]).not.toContain(formatWorkHours(18));

    const rounded = routineLine(17.96, 18.04, null);
    expect(rounded?.clauses).toEqual([`${formatWorkHours(18)} в месяц,`, 'можно вернуть целиком']);
    expect(routineLine(1.04, 1, null)?.clauses).toEqual([
      `${formatWorkHours(1)} в месяц,`,
      'можно вернуть целиком',
    ]);

    const partial = routineLine(18, 10.8, null);
    expect(partial?.clauses).toEqual([
      `${formatWorkHours(18)} в месяц,`,
      `можно вернуть ${formatWorkHours(10.8)}`,
    ]);

    const partialMoney = routineLine(18, 10.8, 12400);
    expect(partialMoney?.clauses).toEqual([
      `${formatWorkHours(18)} в месяц,`,
      `можно вернуть ${formatWorkHours(10.8)},`,
      formatRubles(12400),
    ]);

    const nothingBack = routineLine(18, 0, null);
    expect(nothingBack?.clauses).toEqual([
      `${formatWorkHours(18)} в месяц,`,
      `можно вернуть ${formatWorkHours(0)}`,
    ]);

    const zeroMoney = routineLine(18, 18, 0);
    expect(zeroMoney?.clauses).toEqual([
      `${formatWorkHours(18)} в месяц,`,
      'можно вернуть целиком,',
      formatRubles(0),
    ]);

    const fraction = routineLine(1.5, 2, null);
    expect(fraction?.clauses).toEqual([
      `${formatWorkHours(1.5)} в месяц,`,
      `можно вернуть ${formatWorkHours(2)}`,
    ]);
  });

  it('keeps the ruble amount as its own clause so the hours stay whole', () => {
    const withMoney: RoutineBridgeSnapshot = {
      ...routine,
      results: { ...routine.results, savedMoneyPerMonth: 12400 },
    };
    const [line] = buildPriorContextLines({ ...empty, routine: withMoney }, 'priority-diag');
    expect(line?.clauses).toHaveLength(3);
    expect(line?.clauses[1]).toMatch(/,$/);
    expect(line?.clauses[2]).toContain('₽');
    expect(line?.text).toBe(line?.clauses.join(' '));
  });

  it('adds the priority line only on the checklist, and stays empty when nothing is saved', () => {
    const lines = buildPriorContextLines({ revenue, routine, priority }, 'readiness-check');
    expect(lines.map((line) => line.label)).toEqual(['Выручка', 'Рутина', 'Что первым']);
    expect(lines[2]?.text).toContain('Приём обращений');
    expect(buildPriorContextLines(empty, 'readiness-check')).toEqual([]);
  });
});
