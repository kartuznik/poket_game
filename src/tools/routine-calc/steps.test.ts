import { describe, expect, it } from 'vitest';
import { aggregateRoutine, calculateRoutine, getRoutinePresetById } from './calc';
import { EMPTY_RATE_HINT, SHARE_INPUT_STEP, collapsePresetsToManual, manualSwitchClass, nicheRoutineMatch, routineStepModel } from './steps';

describe('routine step model', () => {
  const orders = getRoutinePresetById('orders');
  const booking = getRoutinePresetById('booking');
  const items = [orders, booking].map((preset) => ({
    operationsPerWeek: preset.operationsPerWeek,
    minutesPerOperation: preset.minutesPerOperation,
    automationSharePercent: preset.automationSharePercent,
    hourlyRate: null,
  }));

  it('shows a breakdown instead of locked empty fields', () => {
    const model = routineStepModel({
      presetIds: ['orders', 'booking'],
      customEntry: false,
      operations: '',
      minutes: '',
      share: '',
    });
    expect(model.kind).toBe('breakdown');
    expect(model.manualSwitch).toBe(true);
    expect(manualSwitchClass(2)).toBe('action-btn action-btn--secondary action-btn--from-preset');
    expect(manualSwitchClass(0)).toBe('action-btn action-btn--secondary');
    const nicheCards = routineStepModel({
      presetIds: ['orders', 'booking'],
      customEntry: false,
      operations: '',
      minutes: '',
      share: '',
      allowManualSwitch: false,
    });
    expect(nicheRoutineMatch(['orders', 'booking'], ['orders', 'booking'], false)).toBe(true);
    expect(nicheRoutineMatch(['orders', 'booking'], ['orders', 'booking'], true)).toBe(false);
    expect(nicheCards.kind).toBe('breakdown');
    expect(nicheCards.manualSwitch).toBe(false);
    expect(nicheCards.cards.map((card) => card.title)).toEqual(['Приём заказов', 'Записи']);
    expect(model.cards.map((card) => card.title)).toEqual(['Приём заказов', 'Записи']);
    expect(model.totalHours).toBe(aggregateRoutine(items).hoursPerMonth);
    expect(model.controls.filter((control) => control.visible && control.disabled && control.value === '')).toEqual(
      [],
    );
    expect(model.controls.every((control) => !control.visible)).toBe(true);
  });

  it('keeps the aggregate hours after switching to one manual row', () => {
    const collapsed = collapsePresetsToManual(items);
    const manual = calculateRoutine({
      operationsPerWeek: collapsed.operationsPerWeek,
      minutesPerOperation: collapsed.minutesPerOperation,
      automationSharePercent: collapsed.automationSharePercent,
      hourlyRate: null,
    });
    expect(manual.hoursPerMonth).toBe(aggregateRoutine(items).hoursPerMonth);
    expect(collapsed.automationSharePercent).toBe(65.85);
    const model = routineStepModel({
      presetIds: [],
      customEntry: true,
      operations: String(collapsed.operationsPerWeek),
      minutes: String(collapsed.minutesPerOperation),
      share: String(collapsed.automationSharePercent),
    });
    expect(model.kind).toBe('manual');
    const slider = model.controls.find((control) => control.id === 'slider');
    expect(slider).toMatchObject({
      visible: true,
      disabled: false,
      readOnly: false,
      step: SHARE_INPUT_STEP,
      value: '65.85',
    });
    expect(SHARE_INPUT_STEP).toBe('0.01');
    expect(EMPTY_RATE_HINT).toBe('Поставьте ставку, чтобы увидеть экономию в деньгах');
  });
});
