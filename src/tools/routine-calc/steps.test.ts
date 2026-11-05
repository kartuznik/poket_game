import { describe, expect, it } from 'vitest';
import { aggregateRoutine, calculateRoutine, getRoutinePresetById, validateRoutineDraft } from './calc';
import {
  EMPTY_RATE_HINT,
  SHARE_INPUT_STEP,
  collapsePresetsToManual,
  manualSwitchClass,
  nicheRoutineMatch,
  routineDetailModel,
  routineStepModel,
  shareFieldError,
} from './steps';

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

  it('shows read-only niche cards and a manual table with two fields per routine', () => {
    const matched = nicheRoutineMatch(['orders', 'booking'], ['orders', 'booking'], false);
    const niche = routineDetailModel({
      nicheMatch: matched,
      customEntry: false,
      presetIds: ['orders', 'booking'],
      operations: '',
      minutes: '',
      lines: {},
    });
    expect(niche.kind).toBe('niche');
    expect(niche.rows).toEqual([]);
    expect(niche.shareVisible).toBe(false);
    expect(niche.rateVisible).toBe(true);
    expect(niche.cards.map((card) => card.title)).toEqual(['Приём заказов', 'Записи']);
    const table = routineDetailModel({
      nicheMatch: false,
      customEntry: false,
      presetIds: ['orders', 'booking'],
      operations: '',
      minutes: '',
      lines: {},
    });
    expect(table.kind).toBe('table');
    expect(table.shareVisible).toBe(true);
    expect(table.rows.map((row) => [row.title, row.operations, row.minutes])).toEqual([
      ['Приём заказов', '25', '10'],
      ['Записи', '20', '8'],
    ]);
    const custom = routineDetailModel({
      nicheMatch: false,
      customEntry: true,
      presetIds: [],
      operations: '45',
      minutes: '9',
      lines: {},
    });
    expect(custom.rows).toEqual([{ presetId: null, title: 'Свои цифры', operations: '45', minutes: '9' }]);
  });

  it('shows the share validator text for a table and a free row, and hides it for a niche', () => {
    const message = validateRoutineDraft({
      operationsPerWeekRaw: '25',
      minutesPerOperationRaw: '10',
      automationSharePercentRaw: '',
      hourlyRateRaw: '',
    }).errors.automationSharePercent;
    expect(message).toBe('Введите долю автоматизации от 0 до 100.');
    expect(shareFieldError('table', message)).toBe(message);
    expect(shareFieldError('custom', message)).toBe(message);
    expect(shareFieldError('niche', message)).toBeUndefined();
  });
});
