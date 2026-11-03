import { describe, expect, it } from 'vitest';
import type { ReportSources } from '../final-report/summary';
import type {
  PriorityBridgeSnapshot,
  ReadinessBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
} from '../../lib/types';
import { composePriorityResults } from '../priority-diag/calc';
import { READINESS_READY_SCORE } from '../readiness-check/calc';
import {
  INSIGHT_ANSWERS,
  INSIGHT_CHECKLIST_OPEN,
  INSIGHT_QUIET,
  INSIGHT_READY,
  buildInsights,
} from './insights';

const revenue = (risk: number): RevenueRiskBridgeSnapshot => ({
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

const priority = (title: string): PriorityBridgeSnapshot => ({
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
    topTitle: title,
    topScore: 5,
    tied: false,
    ranking: [{ id: 'answers', title, score: 5 }],
  },
});

const readiness = (score: number): ReadinessBridgeSnapshot => ({
  toolId: 'readiness-check',
  updatedAt: 1,
  inputs: {
    repeated: 'yes',
    rules: 'partial',
    'one-path': 'yes',
    'one-place': 'yes',
    faq: 'yes',
    numbers: 'yes',
    owner: 'no',
    channel: 'yes',
    time: 'yes',
  },
  results: { score, band: score >= READINESS_READY_SCORE ? 'ready' : 'gaps', bandLabel: 'полоса', unclosedTitles: [] },
});

const empty: ReportSources = { revenue: null, routine: null, priority: null, readiness: null };

describe('buildInsights', () => {
  it('uses the ready-band edge: 6.5 with risk is the first insight, 7 is the third', () => {
    expect(READINESS_READY_SCORE).toBe(7);
    expect(
      buildInsights({ ...empty, revenue: revenue(20_000), readiness: readiness(6.5) }),
    ).toEqual([INSIGHT_CHECKLIST_OPEN]);
    expect(
      buildInsights({ ...empty, revenue: revenue(20_000), readiness: readiness(7) }),
    ).toEqual([INSIGHT_READY]);
  });

  it('stays silent at 6.5 when revenue is not confirmed', () => {
    expect(buildInsights({ ...empty, readiness: readiness(6.5) })).toEqual([]);
  });

  it('does not treat a missing tool as zero', () => {
    expect(buildInsights({ ...empty, revenue: revenue(1_000) })).toEqual([]);
    expect(buildInsights({ ...empty, routine: routine(4) })).toEqual([]);
    expect(
      buildInsights({ ...empty, routine: routine(70), priority: priority('Ответы на вопросы') }),
    ).toEqual([INSIGHT_ANSWERS]);
  });

  it('keeps the first two insights when two rules match', () => {
    const lines = buildInsights({
      revenue: revenue(20_000),
      routine: routine(70),
      priority: priority('Ответы на вопросы'),
      readiness: readiness(6.5),
    });
    expect(lines).toEqual([INSIGHT_CHECKLIST_OPEN, INSIGHT_ANSWERS]);
  });

  it('keeps the first two when the ready pair matches', () => {
    const lines = buildInsights({
      revenue: revenue(20_000),
      routine: routine(70),
      priority: priority('Ответы на вопросы'),
      readiness: readiness(7),
    });
    expect(lines).toEqual([INSIGHT_ANSWERS, INSIGHT_READY]);
  });

  it('fires the quiet line only when both small numbers are confirmed', () => {
    expect(
      buildInsights({ ...empty, revenue: revenue(4_999), routine: routine(9.9) }),
    ).toEqual([INSIGHT_QUIET]);
  });

  it('does not treat the first array row as the leader when the board is open', () => {
    const inputs = {
      inquiries: { frequency: 1, time: 1, errorCost: 1 },
      answers: { frequency: 5, time: 5, errorCost: 5 },
      booking: { frequency: 5, time: 5, errorCost: 5 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    };
    const open = priority('Ответы на вопросы');
    const tied = {
      ...open,
      inputs,
      results: {
        ...composePriorityResults(inputs, null, { revenue: null, routine: null }, []),
        ranking: [{ id: 'answers' as const, title: 'Ответы на вопросы', score: 5 }],
      },
    };
    expect(buildInsights({ ...empty, routine: routine(70), priority: tied })).toEqual([]);
    const chosen = {
      ...tied,
      results: composePriorityResults(inputs, 'answers', { revenue: null, routine: null }, []),
    };
    expect(buildInsights({ ...empty, routine: routine(70), priority: chosen })).toEqual([INSIGHT_ANSWERS]);
  });

  it('does not quote a week-plan step', () => {
    const blob = [INSIGHT_CHECKLIST_OPEN, INSIGHT_ANSWERS, INSIGHT_READY, INSIGHT_QUIET].join('\n');
    expect(blob).not.toContain('Замерьте время первого ответа');
    expect(blob).not.toContain('Проведите хронометраж');
    expect(blob).not.toContain('Назначьте ответственного');
  });
});
