import { describe, expect, it } from 'vitest';
import {
  ROUTINE_PRESETS,
  aggregateRoutine,
  answersAutomationPercent,
  calculateRoutine,
  weightedAutomationShare,
  getRoutinePresetById,
  validateRoutineDraft,
} from './calc';

describe('calculateRoutine', () => {
  it('turns weekly operations into hours, workdays and money', () => {
    const result = calculateRoutine({
      operationsPerWeek: 40,
      minutesPerOperation: 6,
      automationSharePercent: 70,
      hourlyRate: 500,
    });

    expect(result.hoursPerMonth).toBeCloseTo(17.32, 2);
    expect(result.workDaysPerYear).toBeCloseTo(25.98, 2);
    expect(result.savedHoursPerMonth).toBeCloseTo(12.12, 2);
    expect(result.savedWorkDaysPerYear).toBeCloseTo(18.18, 2);
    expect(result.savedMoneyPerMonth).toBe(6060);
  });

  it('returns zeros when there are no operations', () => {
    const result = calculateRoutine({
      operationsPerWeek: 0,
      minutesPerOperation: 30,
      automationSharePercent: 100,
      hourlyRate: 1000,
    });

    expect(result.hoursPerMonth).toBe(0);
    expect(result.workDaysPerYear).toBe(0);
    expect(result.savedHoursPerMonth).toBe(0);
    expect(result.savedMoneyPerMonth).toBe(0);
  });

  it('keeps the hours and hides money when the rate is empty', () => {
    const result = calculateRoutine({
      operationsPerWeek: 10,
      minutesPerOperation: 30,
      automationSharePercent: 50,
      hourlyRate: null,
    });

    expect(result.hoursPerMonth).toBeGreaterThan(0);
    expect(result.savedMoneyPerMonth).toBeNull();
  });

  it('treats a stated zero rate as zero savings, not a missing rate', () => {
    const result = calculateRoutine({
      operationsPerWeek: 10,
      minutesPerOperation: 30,
      automationSharePercent: 50,
      hourlyRate: 0,
    });

    expect(result.savedMoneyPerMonth).toBe(0);
  });

  it('frees nothing when automation share is zero and everything at 100%', () => {
    const base = {
      operationsPerWeek: 10,
      minutesPerOperation: 60,
      hourlyRate: 100,
    };
    const none = calculateRoutine({ ...base, automationSharePercent: 0 });
    const all = calculateRoutine({ ...base, automationSharePercent: 100 });

    expect(none.savedHoursPerMonth).toBe(0);
    expect(none.savedMoneyPerMonth).toBe(0);
    expect(all.savedHoursPerMonth).toBe(all.hoursPerMonth);
    expect(all.hoursPerMonth).toBeCloseTo(43.3, 2);
  });

  it('clamps negative and oversized inputs instead of producing nonsense', () => {
    const result = calculateRoutine({
      operationsPerWeek: -20,
      minutesPerOperation: 9999,
      automationSharePercent: 140,
      hourlyRate: -50,
    });

    expect(result.hoursPerMonth).toBe(0);
    expect(result.savedMoneyPerMonth).toBe(0);
  });

  it('maps NaN to an empty routine', () => {
    const result = calculateRoutine({
      operationsPerWeek: Number.NaN,
      minutesPerOperation: Number.POSITIVE_INFINITY,
      automationSharePercent: Number.NaN,
      hourlyRate: Number.NaN,
    });

    expect(result.hoursPerMonth).toBe(0);
    expect(result.savedMoneyPerMonth).toBe(0);
  });
});

describe('validateRoutineDraft', () => {
  it('accepts an empty rate and a comma decimal', () => {
    const validated = validateRoutineDraft({
      operationsPerWeekRaw: '12,5',
      minutesPerOperationRaw: '8',
      automationSharePercentRaw: '40',
      hourlyRateRaw: '',
    });

    expect(validated.isValid).toBe(true);
    expect(validated.input?.operationsPerWeek).toBe(12.5);
    expect(validated.input?.hourlyRate).toBeNull();
  });

  it('rejects an empty operations field, a huge minute count and a negative rate', () => {
    const validated = validateRoutineDraft({
      operationsPerWeekRaw: '',
      minutesPerOperationRaw: '500',
      automationSharePercentRaw: '101',
      hourlyRateRaw: '-1',
    });

    expect(validated.isValid).toBe(false);
    expect(validated.input).toBeNull();
    expect(validated.errors.operationsPerWeek).toBeTruthy();
    expect(validated.errors.minutesPerOperation).toBeTruthy();
    expect(validated.errors.automationSharePercent).toBeTruthy();
    expect(validated.errors.hourlyRate).toBeTruthy();
  });
});

describe('routine presets', () => {
  it('exposes four named routines with their own defaults', () => {
    expect(ROUTINE_PRESETS.map((preset) => preset.title)).toEqual([
      'Ответы на вопросы',
      'Приём заказов',
      'Записи',
      'Перенос в таблицы',
    ]);
    expect(getRoutinePresetById('sheets').operationsPerWeek).toBe(15);
    expect(getRoutinePresetById('answers').automationSharePercent).toBe(70);
  });

  it('offers the answers-process share and ignores other confirmed routines', () => {
    expect(
      answersAutomationPercent({
        inputs: { presetId: 'answers', automationSharePercent: 65 },
      }),
    ).toBe(65);
    expect(
      answersAutomationPercent({
        inputs: { presetId: 'orders', automationSharePercent: 60 },
      }),
    ).toBeNull();
    expect(
      answersAutomationPercent({
        inputs: { presetId: null, automationSharePercent: 70 },
      }),
    ).toBeNull();
    expect(
      answersAutomationPercent({
        inputs: {
          presetId: null,
          automationSharePercent: 0,
          items: [
            { presetId: 'orders', operationsPerWeek: 25, minutesPerOperation: 10, automationSharePercent: 60 },
            { presetId: 'booking', operationsPerWeek: 20, minutesPerOperation: 8, automationSharePercent: 75 },
          ],
        },
      }),
    ).toBeNull();
    expect(
      answersAutomationPercent({
        inputs: {
          presetId: 'orders',
          automationSharePercent: 60,
          items: [
            { presetId: 'answers', operationsPerWeek: 40, minutesPerOperation: 6, automationSharePercent: 70 },
            { presetId: 'sheets', operationsPerWeek: 15, minutesPerOperation: 12, automationSharePercent: 80 },
          ],
        },
      }),
    ).toBe(70);
  });
});

describe('aggregateRoutine', () => {
  const orders = {
    operationsPerWeek: 25,
    minutesPerOperation: 10,
    automationSharePercent: 60,
    hourlyRate: null as number | null,
  };
  const booking = {
    operationsPerWeek: 20,
    minutesPerOperation: 8,
    automationSharePercent: 75,
    hourlyRate: null as number | null,
  };

  it('matches a single preset with the old calculation, including an empty rate and a zero rate', () => {
    const one = {
      operationsPerWeek: 40,
      minutesPerOperation: 6,
      automationSharePercent: 70,
      hourlyRate: 500 as number | null,
    };
    expect(aggregateRoutine([one])).toEqual(calculateRoutine(one));
    expect(aggregateRoutine([{ ...one, hourlyRate: null }]).savedMoneyPerMonth).toBeNull();
    expect(aggregateRoutine([{ ...one, hourlyRate: 0 }]).savedMoneyPerMonth).toBe(0);
    expect(aggregateRoutine([{ ...one, automationSharePercent: 0 }]).savedHoursPerMonth).toBe(0);
  });

  it('sums two and three presets and weights the share by hours once', () => {
    const two = aggregateRoutine([orders, booking]);
    expect(two.hoursPerMonth).toBe(29.59);
    expect(two.savedHoursPerMonth).toBe(19.49);
    expect(weightedAutomationShare([orders, booking])).toBe(65.85);
    const three = aggregateRoutine([
      { operationsPerWeek: 40, minutesPerOperation: 6, automationSharePercent: 70, hourlyRate: null },
      orders,
      booking,
    ]);
    expect(three.hoursPerMonth).toBe(46.91);
    expect(three.savedHoursPerMonth).toBe(31.61);
    expect(
      weightedAutomationShare([
        { operationsPerWeek: 40, minutesPerOperation: 6, automationSharePercent: 70, hourlyRate: null },
        orders,
        booking,
      ]),
    ).toBe(67.38);
  });
});
