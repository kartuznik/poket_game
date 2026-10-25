import { describe, expect, it } from 'vitest';
import {
  PRIORITY_PROCESSES,
  clampScore,
  defaultPriorityInputs,
  rankProcesses,
  scoreProcess,
  scoresFromPain,
} from './calc';

describe('priority score', () => {
  it('weights frequency at 0.4 and time and error cost at 0.3', () => {
    expect(scoreProcess({ frequency: 5, time: 4, errorCost: 5 })).toBe(4.7);
    expect(scoreProcess({ frequency: 1, time: 1, errorCost: 1 })).toBe(1);
    expect(scoreProcess({ frequency: 5, time: 5, errorCost: 5 })).toBe(5);
  });

  it('writes one pain mark into frequency, time and error cost', () => {
    expect(scoresFromPain(4)).toEqual({ frequency: 4, time: 4, errorCost: 4 });
    expect(scoreProcess(scoresFromPain(2))).toBe(2);
    expect(scoresFromPain(0).frequency).toBe(1);
  });

  it('pulls scores outside 1–5 back onto the scale', () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(9)).toBe(5);
    expect(clampScore(3.6)).toBe(4);
    expect(clampScore(Number.NaN)).toBe(3);
    expect(scoreProcess({ frequency: 0, time: 100, errorCost: Number.NaN })).toBe(
      scoreProcess({ frequency: 1, time: 5, errorCost: 3 }),
    );
  });
});

describe('rankProcesses', () => {
  it('puts incoming messages first on the default scores', () => {
    const result = rankProcesses(defaultPriorityInputs());
    expect(result.top.id).toBe('inquiries');
    expect(result.top.score).toBe(4.7);
    expect(result.tied).toBe(false);
    expect(result.ranked).toHaveLength(6);
    expect(result.ranked.map((item) => item.id)).toEqual([
      'inquiries',
      'answers',
      'booking',
      'payment',
      'reminders',
      'reports',
    ]);
  });

  it('breaks a tie toward the costlier error, then frequency, then funnel order', () => {
    const inputs = defaultPriorityInputs();
    const tied = rankProcesses({
      inquiries: { frequency: 3, time: 3, errorCost: 3 },
      answers: { frequency: 3, time: 3, errorCost: 3 },
      booking: { frequency: 1, time: 1, errorCost: 1 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    });
    const leaders = tied.ranked.filter((item) => item.score === tied.top.score);
    expect(leaders.map((item) => item.id).slice(0, 2)).toEqual(['inquiries', 'answers']);
    expect(tied.top.id).toBe('inquiries');
    expect(tied.tied).toBe(true);

    const errorWins = rankProcesses({
      ...inputs,
      payment: { frequency: 2, time: 2, errorCost: 5 },
      reminders: { frequency: 5, time: 2, errorCost: 1 },
    });
    const payment = errorWins.ranked.find((item) => item.id === 'payment');
    const reminders = errorWins.ranked.find((item) => item.id === 'reminders');
    expect(payment?.score).toBe(reminders?.score);
    expect(errorWins.ranked.findIndex((item) => item.id === 'payment')).toBeLessThan(
      errorWins.ranked.findIndex((item) => item.id === 'reminders'),
    );
  });

  it('keeps a recommendation on every process', () => {
    const result = rankProcesses(defaultPriorityInputs());
    expect(result.ranked.every((item) => item.recommendation.length > 20)).toBe(true);
    expect(PRIORITY_PROCESSES).toHaveLength(6);
  });

  it('ranks a zero-like board without throwing', () => {
    const inputs = defaultPriorityInputs();
    const flat = rankProcesses({
      inquiries: { frequency: 1, time: 1, errorCost: 1 },
      answers: { frequency: 1, time: 1, errorCost: 1 },
      booking: { frequency: 1, time: 1, errorCost: 1 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    });
    expect(flat.top.score).toBe(1);
    expect(flat.top.id).toBe('inquiries');
    expect(flat.tied).toBe(true);
    expect(inputs.inquiries.frequency).toBe(5);
  });
});
