import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clampStep,
  editStepFor,
  enterAdvances,
  enterStepMove,
  firstShownField,
  globalProgressPercent,
  isRevenueStepValid,
  isRoutineStartChosen,
  isRoutineStepValid,
  journeyIndex,
  localProgressPercent,
  migrateRoutineStep,
  nextMove,
  resolveInitialStep,
  stepCountFor,
} from './wizard';

const wizardView = resolve(dirname(fileURLToPath(import.meta.url)), '../components/wizard.ts');

describe('wizard steps', () => {
  it('uses a different step count for each tool', () => {
    expect(stepCountFor('revenue-risk')).toBe(4);
    expect(stepCountFor('routine-calc')).toBe(2);
    expect(stepCountFor('priority-diag')).toBe(1);
    expect(stepCountFor('readiness-check')).toBe(3);
    expect(stepCountFor('final-report')).toBeNull();
    expect(journeyIndex('readiness-check')).toBe(4);
  });

  it('moves on Enter only when the step is valid and stays inside the tool', () => {
    expect(enterAdvances('Enter', false, 'number')).toBe(true);
    expect(enterAdvances('Go', false, 'textarea')).toBe(true);
    expect(enterAdvances('Enter', true, 'number')).toBe(false);
    expect(enterAdvances('Enter', false, 'other')).toBe(false);
    expect(enterAdvances('Tab', false, 'number')).toBe(false);
    expect(enterStepMove(2, 4, false, false)).toBe('stay');
    expect(enterStepMove(2, 4, true, false)).toBe('advance');
    expect(enterStepMove(4, 4, true, false)).toBe('reveal');
    expect(enterStepMove(4, 4, true, true)).toBe('stay');
    expect(nextMove(4, 4, true)).toBe('finish');
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
    expect(isRoutineStepValid(2, { operationsPerWeek: 'пусто', minutesPerOperation: 'пусто' }, true)).toBe(true);
    expect(isRoutineStepValid(2, { hourlyRate: 'не число' }, true)).toBe(false);
    expect(isRoutineStepValid(2, {})).toBe(true);
    expect(editStepFor('routine-calc')).toBe(2);
    expect(migrateRoutineStep(1)).toBe(1);
    expect(migrateRoutineStep(2)).toBe(2);
    expect(migrateRoutineStep(3)).toBe(2);
    expect(migrateRoutineStep(4)).toBe(2);
    expect(resolveInitialStep(2, 4, null)).toBe(2);
    expect(resolveInitialStep(2, 3, 1)).toBe(2);
  });

  it('lands on the rate when operations and share are inside a hidden group', () => {
    const picked = firstShownField([
      { id: 'ops', hidden: false, inHiddenSubtree: true },
      { id: 'share', hidden: false, inHiddenSubtree: true },
      { id: 'rate', hidden: false, inHiddenSubtree: false },
    ]);
    expect(picked?.id).toBe('rate');
  });

  it('does not keep a neighbor step hook', () => {
    const source = readFileSync(wizardView, 'utf8');
    expect(source).not.toContain('neighborStep');
    expect(source).toContain('stepRow.hidden = count <= 1');
  });
});
