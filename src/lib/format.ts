export type PluralForms = readonly [one: string, few: string, many: string];

const NBSP = '\u00A0';

/**
 * Normalizes any numeric input into a finite number or fallback (default 0).
 * Protects against NaN, Infinity, -Infinity, and -0.
 */
export function normalizeFiniteNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Object.is(num, -0) ? 0 : num;
}

/**
 * Selects the correct Russian plural form for a given number.
 * Examples:
 *   pluralize(1, ['час', 'часа', 'часов']) -> 'час'
 *   pluralize(2, ['час', 'часа', 'часов']) -> 'часа'
 *   pluralize(5, ['час', 'часа', 'часов']) -> 'часов'
 *   pluralize(1.5, ['час', 'часа', 'часов']) -> 'часа'
 */
export function pluralize(count: number, forms: PluralForms): string {
  const safe = Math.abs(normalizeFiniteNumber(count, 0));

  // Fractional numbers in Russian take the genitive singular ('few', e.g. 1.5 часа)
  if (!Number.isInteger(safe)) {
    return forms[1];
  }

  const mod100 = safe % 100;
  if (mod100 >= 11 && mod100 <= 19) {
    return forms[2];
  }

  const mod10 = safe % 10;
  if (mod10 === 1) {
    return forms[0];
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return forms[1];
  }
  return forms[2];
}

/**
 * Formats an integer with thin non-breaking spaces as thousand separators.
 */
export function formatIntegerGrouping(value: number): string {
  const safe = Math.round(normalizeFiniteNumber(value, 0));
  const isNegative = safe < 0;
  const absStr = Math.abs(safe).toString();
  const grouped = absStr.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return isNegative && safe !== 0 ? `−${grouped}` : grouped;
}

/**
 * Formats a count with its Russian plural noun.
 */
export function formatCountWithNoun(count: number, forms: PluralForms): string {
  const safe = normalizeFiniteNumber(count, 0);
  const rounded = Number.isInteger(safe)
    ? formatIntegerGrouping(safe)
    : safe.toFixed(1).replace('.', ',');
  return `${rounded}${NBSP}${pluralize(safe, forms)}`;
}

export interface FormatRublesOptions {
  readonly allowNegative?: boolean;
  readonly showPlusSign?: boolean;
}

/**
 * Formats an amount in Russian rubles (e.g. "45 000 ₽").
 * Clamps negative numbers to 0 by default unless allowNegative is true.
 */
export function formatRubles(
  amount: number,
  options: FormatRublesOptions = {},
): string {
  const safe = normalizeFiniteNumber(amount, 0);
  const clamped = options.allowNegative ? safe : Math.max(0, safe);
  const rounded = Math.round(clamped);

  if (rounded === 0) {
    return `0${NBSP}₽`;
  }

  const formatted = formatIntegerGrouping(rounded);
  if (options.showPlusSign && rounded > 0) {
    return `+${formatted}${NBSP}₽`;
  }
  return `${formatted}${NBSP}₽`;
}

export interface FormatPercentOptions {
  readonly clampMin?: number;
  readonly clampMax?: number;
  readonly decimals?: number;
}

/**
 * Formats a percentage value (0..100 by default) with safe clamping and Russian comma.
 */
export function formatPercent(
  value: number,
  options: FormatPercentOptions = {},
): string {
  const min = options.clampMin ?? 0;
  const max = options.clampMax ?? 100;
  const decimals = Math.max(0, Math.min(2, options.decimals ?? 0));

  const safe = normalizeFiniteNumber(value, 0);
  const clamped = Math.min(max, Math.max(min, safe));

  if (decimals === 0 || Number.isInteger(clamped)) {
    return `${Math.round(clamped)}%`;
  }

  const fixed = clamped
    .toFixed(decimals)
    .replace(/\.?0+$/, '')
    .replace('.', ',');
  return `${fixed}%`;
}

const MINUTE_FORMS: PluralForms = ['минута', 'минуты', 'минут'];
const HOUR_FORMS: PluralForms = ['час', 'часа', 'часов'];
const WORKDAY_FORMS: PluralForms = ['рабочий день', 'рабочих дня', 'рабочих дней'];

/**
 * Formats duration in minutes into a human-friendly Russian string:
 * - < 60 min: "45 минут"
 * - >= 60 min: "2 часа 15 минут" or "3 часа"
 */
export function formatDurationMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(normalizeFiniteNumber(totalMinutes, 0)));
  if (safe < 60) {
    return formatCountWithNoun(safe, MINUTE_FORMS);
  }

  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  const hoursPart = formatCountWithNoun(hours, HOUR_FORMS);

  if (minutes === 0) {
    return hoursPart;
  }
  return `${hoursPart} ${formatCountWithNoun(minutes, MINUTE_FORMS)}`;
}

/**
 * Formats hours with optional 8-hour workday equivalent.
 */
export function formatWorkHours(
  hours: number,
  includeWorkdays = false,
): string {
  const safe = Math.max(0, normalizeFiniteNumber(hours, 0));
  const roundedHours = Math.round(safe * 10) / 10;
  const isWhole = Number.isInteger(roundedHours);
  const numStr = isWhole
    ? formatIntegerGrouping(roundedHours)
    : roundedHours.toFixed(1).replace('.', ',');
  const base = `${numStr}${NBSP}${pluralize(roundedHours, HOUR_FORMS)}`;

  if (!includeWorkdays || roundedHours < 8) {
    return base;
  }

  const workdays = Math.round((roundedHours / 8) * 10) / 10;
  const daysStr = Number.isInteger(workdays)
    ? formatIntegerGrouping(workdays)
    : workdays.toFixed(1).replace('.', ',');
  return `${base} (~${daysStr}${NBSP}${pluralize(workdays, WORKDAY_FORMS)})`;
}
