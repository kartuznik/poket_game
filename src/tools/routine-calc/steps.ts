import type { RoutinePresetId } from '../../lib/types';
import {
  aggregateRoutine,
  calculateRoutine,
  getRoutinePresetById,
  weightedAutomationShare,
  type RoutineInput,
} from './calc';

/** True when the stored niche list is exactly the selected routine presets. */
export function nicheRoutineMatch(
  nicheIds: readonly string[] | null,
  presetIds: readonly string[],
  customEntry: boolean,
): boolean {
  if (!nicheIds || customEntry) return false;
  return nicheIds.length === presetIds.length && nicheIds.every((id) => presetIds.includes(id));
}

export const SHARE_INPUT_STEP = '0.01';

export interface RoutineDetailRow {
  readonly presetId: RoutinePresetId | null;
  readonly title: string;
  readonly operations: string;
  readonly minutes: string;
}

export interface RoutineDetailModel {
  readonly kind: 'niche' | 'table' | 'custom';
  readonly cards: readonly RoutineBreakdownCardModel[];
  readonly rows: readonly RoutineDetailRow[];
  readonly shareVisible: boolean;
  readonly rateVisible: true;
}

/** Step 2. A matching niche is read-only cards plus the rate. A manual list is one row per routine. */
export function routineDetailModel(input: {
  readonly nicheMatch: boolean;
  readonly customEntry: boolean;
  readonly presetIds: readonly RoutinePresetId[];
  readonly operations: string;
  readonly minutes: string;
  readonly lines: Readonly<Record<string, { readonly operations: string; readonly minutes: string } | undefined>>;
}): RoutineDetailModel {
  if (input.nicheMatch) {
    return {
      kind: 'niche',
      cards: input.presetIds.map((id) => {
        const preset = getRoutinePresetById(id);
        return {
          presetId: id,
          title: preset.title,
          operationsPerWeek: preset.operationsPerWeek,
          minutesPerOperation: preset.minutesPerOperation,
          automationSharePercent: preset.automationSharePercent,
        };
      }),
      rows: [],
      shareVisible: false,
      rateVisible: true,
    };
  }
  if (input.presetIds.length > 0 && !input.customEntry) {
    return {
      kind: 'table',
      cards: [],
      rows: input.presetIds.map((id) => {
        const preset = getRoutinePresetById(id);
        const edited = input.lines[id];
        return {
          presetId: id,
          title: preset.title,
          operations: edited?.operations ?? String(preset.operationsPerWeek),
          minutes: edited?.minutes ?? String(preset.minutesPerOperation),
        };
      }),
      shareVisible: true,
      rateVisible: true,
    };
  }
  return {
    kind: 'custom',
    cards: [],
    rows: [
      {
        presetId: null,
        title: 'Свои цифры',
        operations: input.operations,
        minutes: input.minutes,
      },
    ],
    shareVisible: true,
    rateVisible: true,
  };
}

/** Visual marker that the manual switch is leaving preset numbers. Not aria-pressed. */
export function manualSwitchClass(presetCount: number): string {
  const base = 'action-btn action-btn--secondary';
  return presetCount > 0 ? `${base} action-btn--from-preset` : base;
}

export const EMPTY_RATE_HINT = 'Поставьте ставку, чтобы увидеть экономию в деньгах';

/** Niche hides the share field. A table or a free row shows the validator text, including an empty share. */
export function shareFieldError(
  kind: 'niche' | 'table' | 'custom',
  message: string | undefined,
): string | undefined {
  if (kind === 'niche') return undefined;
  return message;
}

export interface RoutineControlModel {
  readonly id: 'operations' | 'minutes' | 'share' | 'slider';
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly value: string;
  readonly step: string;
}

export interface RoutineBreakdownCardModel {
  readonly presetId: RoutinePresetId;
  readonly title: string;
  readonly operationsPerWeek: number;
  readonly minutesPerOperation: number;
  readonly automationSharePercent: number;
}

export interface RoutineStepModel {
  readonly kind: 'breakdown' | 'manual';
  readonly cards: readonly RoutineBreakdownCardModel[];
  readonly totalHours: number | null;
  readonly manualSwitch: boolean;
  readonly controls: readonly RoutineControlModel[];
}

export interface ManualRoutineLine {
  readonly operationsPerWeek: number;
  readonly minutesPerOperation: number;
  readonly automationSharePercent: number;
  readonly hoursPerMonth: number;
}

function control(
  id: RoutineControlModel['id'],
  visible: boolean,
  value: string,
): RoutineControlModel {
  return {
    id,
    visible,
    disabled: false,
    readOnly: false,
    value: visible ? value : '',
    step: id === 'slider' || id === 'share' ? SHARE_INPUT_STEP : '1',
  };
}

/** Steps 2–4. Presets show cards. Manual mode shows live fields. No locked empty control. */
export function routineStepModel(input: {
  readonly presetIds: readonly RoutinePresetId[];
  readonly customEntry: boolean;
  readonly operations: string;
  readonly minutes: string;
  readonly share: string;
  readonly allowManualSwitch?: boolean;
}): RoutineStepModel {
  const breakdown = input.presetIds.length > 0 && !input.customEntry;
  if (!breakdown) {
    return {
      kind: 'manual',
      cards: [],
      totalHours: null,
      manualSwitch: false,
      controls: [
        control('operations', true, input.operations),
        control('minutes', true, input.minutes),
        control('share', true, input.share),
        control('slider', true, input.share),
      ],
    };
  }
  const lines = input.presetIds.map((id) => {
    const preset = getRoutinePresetById(id);
    return {
      presetId: id,
      title: preset.title,
      operationsPerWeek: preset.operationsPerWeek,
      minutesPerOperation: preset.minutesPerOperation,
      automationSharePercent: preset.automationSharePercent,
    };
  });
  const total = aggregateRoutine(
    lines.map((line) => ({
      operationsPerWeek: line.operationsPerWeek,
      minutesPerOperation: line.minutesPerOperation,
      automationSharePercent: line.automationSharePercent,
      hourlyRate: null,
    })),
  );
  return {
    kind: 'breakdown',
    cards: lines,
    totalHours: total.hoursPerMonth,
    manualSwitch: input.allowManualSwitch !== false,
    controls: [
      control('operations', false, ''),
      control('minutes', false, ''),
      control('share', false, ''),
      control('slider', false, ''),
    ],
  };
}

/**
 * One manual row whose hours match the aggregate after the usual rounding.
 * Minutes move by one hundredth until calculateRoutine lands on the same hours.
 */
export function collapsePresetsToManual(items: readonly RoutineInput[]): ManualRoutineLine {
  const source = items.map((item) => ({ ...item, hourlyRate: null }));
  const totals = aggregateRoutine(source);
  const operationsPerWeek = source.reduce((sum, item) => sum + item.operationsPerWeek, 0);
  const automationSharePercent = weightedAutomationShare(source);
  if (operationsPerWeek === 0) {
    return {
      operationsPerWeek: 0,
      minutesPerOperation: 0,
      automationSharePercent,
      hoursPerMonth: totals.hoursPerMonth,
    };
  }
  const exact = (totals.hoursPerMonth * 60) / (operationsPerWeek * 4.33);
  let minutesPerOperation = Math.round(exact * 100) / 100;
  let hoursPerMonth = hoursOf(operationsPerWeek, minutesPerOperation, automationSharePercent);
  if (hoursPerMonth !== totals.hoursPerMonth) {
    for (let decimals = 3; decimals <= 6 && hoursPerMonth !== totals.hoursPerMonth; decimals += 1) {
      const factor = 10 ** decimals;
      const base = Math.round(exact * factor) / factor;
      for (let delta = -20; delta <= 20; delta += 1) {
        const candidate = Math.round((base + delta / factor) * factor) / factor;
        if (candidate < 0 || candidate > 480) continue;
        const hours = hoursOf(operationsPerWeek, candidate, automationSharePercent);
        if (hours === totals.hoursPerMonth) {
          minutesPerOperation = candidate;
          hoursPerMonth = hours;
          break;
        }
      }
    }
  }
  return {
    operationsPerWeek,
    minutesPerOperation,
    automationSharePercent,
    hoursPerMonth,
  };
}

function hoursOf(operations: number, minutes: number, share: number): number {
  return calculateRoutine({
    operationsPerWeek: operations,
    minutesPerOperation: minutes,
    automationSharePercent: share,
    hourlyRate: null,
  }).hoursPerMonth;
}
