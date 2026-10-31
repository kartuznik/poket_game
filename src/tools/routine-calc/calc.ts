import { normalizeFiniteNumber } from '../../lib/format';
import type { RoutinePresetId } from '../../lib/types';

/** Average weeks in a month: 52 / 12 rounded to the brief's 4.33. */
export const WEEKS_PER_MONTH = 4.33;
export const HOURS_PER_WORKDAY = 8;

export interface RoutinePreset {
  readonly id: RoutinePresetId;
  readonly title: string;
  readonly description: string;
  readonly operationsPerWeek: number;
  readonly minutesPerOperation: number;
  readonly automationSharePercent: number;
}

export const ROUTINE_PRESETS: readonly RoutinePreset[] = [
  {
    id: 'answers',
    title: 'Ответы на вопросы',
    description: 'Типовые сообщения в чатах и личных сообщениях',
    operationsPerWeek: 40,
    minutesPerOperation: 6,
    automationSharePercent: 70,
  },
  {
    id: 'orders',
    title: 'Приём заказов',
    description: 'Состав, адрес и подтверждение',
    operationsPerWeek: 25,
    minutesPerOperation: 10,
    automationSharePercent: 60,
  },
  {
    id: 'booking',
    title: 'Записи',
    description: 'Запись, перенос и напоминание',
    operationsPerWeek: 20,
    minutesPerOperation: 8,
    automationSharePercent: 75,
  },
  {
    id: 'sheets',
    title: 'Перенос в таблицы',
    description: 'Перенести обращение из чата в таблицу',
    operationsPerWeek: 15,
    minutesPerOperation: 12,
    automationSharePercent: 80,
  },
] as const;

export const ROUTINE_DEFAULTS = {
  presetId: 'answers' as RoutinePresetId,
  operationsPerWeek: 40,
  minutesPerOperation: 6,
  automationSharePercent: 70,
} as const;

export function getRoutinePresetById(id: RoutinePresetId): RoutinePreset {
  return ROUTINE_PRESETS.find((preset) => preset.id === id) ?? ROUTINE_PRESETS[0]!;
}

/** Share from a confirmed routine whose process is «Ответы на вопросы». */
export function answersAutomationPercent(
  routine: {
    readonly inputs: {
      readonly presetId: RoutinePresetId | null;
      readonly automationSharePercent: number;
    };
  } | null,
): number | null {
  if (!routine || routine.inputs.presetId === null) return null;
  const preset = ROUTINE_PRESETS.find((item) => item.id === routine.inputs.presetId);
  if (!preset || preset.title !== 'Ответы на вопросы') return null;
  const share = routine.inputs.automationSharePercent;
  return Number.isFinite(share) ? share : null;
}

export interface RoutineInput {
  readonly operationsPerWeek: number;
  readonly minutesPerOperation: number;
  readonly automationSharePercent: number;
  readonly hourlyRate: number | null;
}

export interface RoutineResult {
  readonly hoursPerMonth: number;
  readonly workDaysPerYear: number;
  readonly savedHoursPerMonth: number;
  readonly savedWorkDaysPerYear: number;
  readonly savedMoneyPerMonth: number | null;
}

export interface RoutineRawDraft {
  readonly operationsPerWeekRaw: string;
  readonly minutesPerOperationRaw: string;
  readonly automationSharePercentRaw: string;
  readonly hourlyRateRaw: string;
}

export interface RoutineFieldErrors {
  operationsPerWeek?: string;
  minutesPerOperation?: string;
  automationSharePercent?: string;
  hourlyRate?: string;
}

export interface RoutineValidationResult {
  readonly isValid: boolean;
  readonly errors: RoutineFieldErrors;
  readonly input: RoutineInput | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Hours the routine eats per month, workdays per year, and money freed
 * by the automation share. An empty hourly rate leaves money as null.
 */
export function calculateRoutine(input: RoutineInput): RoutineResult {
  const operations = clamp(normalizeFiniteNumber(input.operationsPerWeek, 0), 0, 10000);
  const minutes = clamp(normalizeFiniteNumber(input.minutesPerOperation, 0), 0, 480);
  const share = clamp(normalizeFiniteNumber(input.automationSharePercent, 0), 0, 100);
  const rate =
    input.hourlyRate === null
      ? null
      : clamp(normalizeFiniteNumber(input.hourlyRate, 0), 0, 100000);

  const hoursPerMonth = round2((operations * minutes * WEEKS_PER_MONTH) / 60);
  const savedHoursPerMonth = round2(hoursPerMonth * (share / 100));
  const workDaysPerYear = round2((hoursPerMonth * 12) / HOURS_PER_WORKDAY);
  const savedWorkDaysPerYear = round2((savedHoursPerMonth * 12) / HOURS_PER_WORKDAY);

  return {
    hoursPerMonth,
    workDaysPerYear,
    savedHoursPerMonth,
    savedWorkDaysPerYear,
    savedMoneyPerMonth: rate === null ? null : round2(savedHoursPerMonth * rate),
  };
}

function readNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function validateRoutineDraft(draft: RoutineRawDraft): RoutineValidationResult {
  const errors: RoutineFieldErrors = {};

  const operations = readNumber(draft.operationsPerWeekRaw);
  if (operations === null) {
    errors.operationsPerWeek = 'Введите число операций в неделю.';
  } else if (operations < 0 || operations > 10000) {
    errors.operationsPerWeek = 'Операций в неделю: от 0 до 10 000.';
  }

  const minutes = readNumber(draft.minutesPerOperationRaw);
  if (minutes === null) {
    errors.minutesPerOperation = 'Введите, сколько минут занимает одна операция.';
  } else if (minutes < 0 || minutes > 480) {
    errors.minutesPerOperation = 'Минуты на операцию: от 0 до 480.';
  }

  const share = readNumber(draft.automationSharePercentRaw);
  if (share === null) {
    errors.automationSharePercent = 'Введите долю автоматизации от 0 до 100.';
  } else if (share < 0 || share > 100) {
    errors.automationSharePercent = 'Доля автоматизации: от 0 до 100%.';
  }

  const rateRaw = draft.hourlyRateRaw.trim();
  let hourlyRate: number | null = null;
  if (rateRaw) {
    const rate = readNumber(rateRaw);
    if (rate === null) {
      errors.hourlyRate = 'Ставка должна быть числом или остаться пустой.';
    } else if (rate < 0 || rate > 100000) {
      errors.hourlyRate = 'Ставка: от 0 до 100 000 ₽/час.';
    } else {
      hourlyRate = rate;
    }
  }

  const isValid = Object.keys(errors).length === 0;
  if (!isValid || operations === null || minutes === null || share === null) {
    return { isValid: false, errors, input: null };
  }

  return {
    isValid: true,
    errors,
    input: {
      operationsPerWeek: operations,
      minutesPerOperation: minutes,
      automationSharePercent: share,
      hourlyRate,
    },
  };
}
