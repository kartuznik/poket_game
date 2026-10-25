import { describe, expect, it } from 'vitest';
import {
  clampStep,
  editStepFor,
  globalProgressPercent,
  isRevenueStepValid,
  isRoutineStartChosen,
  isRoutineStepValid,
  journeyIndex,
  localProgressPercent,
  nextMove,
  resolveInitialStep,
  stepCountFor,
} from './wizard';

describe('wizard steps', () => {
  it('uses a different step count for each tool', () => {
    expect(stepCountFor('revenue-risk')).toBe(4);
    expect(stepCountFor('routine-calc')).toBe(4);
    expect(stepCountFor('priority-diag')).toBe(1);
    expect(stepCountFor('readiness-check')).toBe(3);
    expect(stepCountFor('final-report')).toBeNull();
    expect(journeyIndex('readiness-check')).toBe(4);
  });

  it('refuses the next step while the current one is invalid', () => {
    expect(nextMove(1, 4, false)).toBe('stay');
    expect(nextMove(1, 4, true)).toBe('advance');
    expect(nextMove(4, 4, true)).toBe('finish');
    expect(nextMove(4, 4, false)).toBe('stay');
  });

  it('keeps the step inside the tool and prefers the route over the draft', () => {
    expect(clampStep(0, 4)).toBe(1);
    expect(clampStep(9, 4)).toBe(4);
    expect(resolveInitialStep(4, 3, 1)).toBe(3);
    expect(resolveInitialStep(4, null, 2)).toBe(2);
    expect(resolveInitialStep(6, null, null)).toBe(1);
    expect(editStepFor('priority-diag')).toBe(1);
    expect(editStepFor('readiness-check')).toBe(3);
  });

  it('fills the global bar by tool and the local bar by step', () => {
    expect(globalProgressPercent(1)).toBe(25);
    expect(globalProgressPercent(4)).toBe(100);
    expect(localProgressPercent(1, 4)).toBe(25);
    expect(localProgressPercent(2, 6)).toBeCloseTo(33.333, 2);
  });

  it('validates only the fields that belong to the current step', () => {
    expect(isRevenueStepValid(1, { leadsPerMonth: 'Укажите количество' })).toBe(false);
    expect(isRevenueStepValid(1, {})).toBe(true);
    expect(isRevenueStepValid(2, { lateSharePercent: 'вне диапазона' })).toBe(false);
    expect(isRevenueStepValid(3, {})).toBe(true);
    expect(isRevenueStepValid(4, { avgCheck: 'пусто' })).toBe(false);
    expect(isRevenueStepValid(4, { lossFactorPercent: 'пусто' })).toBe(false);
    expect(isRevenueStepValid(4, { leadsPerMonth: 'пусто' })).toBe(false);
    expect(isRevenueStepValid(4, { lateSharePercent: 'пусто' })).toBe(false);
    expect(isRevenueStepValid(4, { conversionPercent: 'пусто' })).toBe(false);
    expect(isRevenueStepValid(4, {})).toBe(true);

    expect(isRoutineStartChosen(false, false)).toBe(false);
    expect(isRoutineStartChosen(true, false)).toBe(true);
    expect(isRoutineStartChosen(false, true)).toBe(true);
    expect(isRoutineStepValid(1, { operationsPerWeek: 'пусто' })).toBe(true);
    expect(isRoutineStepValid(2, { operationsPerWeek: 'пусто' })).toBe(false);
    expect(isRoutineStepValid(3, {})).toBe(true);
    expect(isRoutineStepValid(4, { hourlyRate: 'не число' })).toBe(false);
    expect(isRoutineStepValid(4, {})).toBe(true);
  });
});
