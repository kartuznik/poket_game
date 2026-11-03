import { describe, expect, it } from 'vitest';
import { emptyDossier } from '../lib/dossier';
import {
  activeConversionNiche,
  conversionModeCsvLabel,
  listNichePresets,
  nicheConversionCardTitle,
} from '../lib/niche-presets';
import { buildReportCsv } from './final-report/export';
import { buildHtmlReport } from './final-report/html-report';
import { NO_DEFAULT_LINE, chipBoardModel } from './priority-diag/chips';
import { aggregateRoutine, calculateRoutine, getRoutinePresetById } from './routine-calc/calc';
import { EMPTY_RATE_HINT, SHARE_INPUT_STEP, collapsePresetsToManual, routineStepModel } from './routine-calc/steps';

function emptyLocked<T extends { readonly visible: boolean; readonly disabled: boolean; readonly value: string }>(
  controls: readonly T[],
): readonly T[] {
  return controls.filter((control) => control.visible && control.disabled && control.value.trim() === '');
}

describe('round 3.6.1 guards', () => {
  it('rejects a visible control that is disabled and empty', () => {
    const cafe = listNichePresets().find((preset) => preset.id === 'cafe-food');
    if (!cafe) throw new Error('missing cafe preset');
    expect(activeConversionNiche('cafe-food', 'preset', 'beauty-local')).toBe('cafe-food');
    expect(activeConversionNiche(null, 'preset', 'beauty-local')).toBeNull();
    expect(nicheConversionCardTitle(cafe)).toBe('Ваша ниша: Кафе и еда — 25%');
    expect(conversionModeCsvLabel('preset', 'niche:cafe-food')).toBe('Ниша: Кафе и еда');

    const orders = getRoutinePresetById('orders');
    const booking = getRoutinePresetById('booking');
    const items = [orders, booking].map((preset) => ({
      operationsPerWeek: preset.operationsPerWeek,
      minutesPerOperation: preset.minutesPerOperation,
      automationSharePercent: preset.automationSharePercent,
      hourlyRate: null,
    }));
    const breakdown = routineStepModel({
      presetIds: ['orders', 'booking'],
      customEntry: false,
      operations: '',
      minutes: '',
      share: '',
    });
    expect(breakdown.kind).toBe('breakdown');
    expect(breakdown.manualSwitch).toBe(true);
    expect(emptyLocked(breakdown.controls)).toEqual([]);

    const collapsed = collapsePresetsToManual(items);
    expect(
      calculateRoutine({
        operationsPerWeek: collapsed.operationsPerWeek,
        minutesPerOperation: collapsed.minutesPerOperation,
        automationSharePercent: collapsed.automationSharePercent,
        hourlyRate: null,
      }).hoursPerMonth,
    ).toBe(aggregateRoutine(items).hoursPerMonth);
    const manual = routineStepModel({
      presetIds: [],
      customEntry: true,
      operations: String(collapsed.operationsPerWeek),
      minutes: String(collapsed.minutesPerOperation),
      share: String(collapsed.automationSharePercent),
    });
    expect(emptyLocked(manual.controls)).toEqual([]);
    expect(manual.controls.find((control) => control.id === 'slider')?.step).toBe(SHARE_INPUT_STEP);

    const money = chipBoardModel({
      peers: [
        { id: 'payment', title: 'Оплата' },
        { id: 'booking', title: 'Запись и заказы' },
      ],
      source: 'money',
      processId: 'payment',
      pickedProcessId: null,
    });
    expect(money.persistedPick).toBeNull();
    expect(money.chips.find((chip) => chip.id === 'payment')?.pressed).toBe(true);
    const open = chipBoardModel({
      peers: [
        { id: 'payment', title: 'Оплата' },
        { id: 'booking', title: 'Запись и заказы' },
      ],
      source: 'open',
      processId: null,
      pickedProcessId: null,
    });
    expect(open.defaultLine).toBe(NO_DEFAULT_LINE);
    expect(open.chips.every((chip) => !chip.pressed)).toBe(true);

    const routine = {
      toolId: 'routine-calc' as const,
      updatedAt: 1,
      inputs: {
        presetId: null,
        operationsPerWeek: 25,
        minutesPerOperation: 10,
        hourlyRate: null,
        automationSharePercent: 60,
      },
      results: {
        hoursPerMonth: 18.04,
        workDaysPerYear: 27.06,
        savedHoursPerMonth: 10.82,
        savedWorkDaysPerYear: 16.23,
        savedMoneyPerMonth: null,
      },
    };
    const csv = buildReportCsv({ revenue: null, routine, priority: null, readiness: null });
    expect(csv).not.toContain('Итого экономия, ₽/мес');
    expect(buildHtmlReport({ ...emptyDossier(), routine }, 1)).not.toContain('Итого экономия, ₽/мес');
    expect(EMPTY_RATE_HINT).toBe('Поставьте ставку, чтобы увидеть экономию в деньгах');
  });
});
