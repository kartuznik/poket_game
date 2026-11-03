import type { RoutinePresetId, UncertaintyProfile } from './types';

export type BusinessNicheId = 'cafe-food' | 'beauty' | 'school' | 'freelance' | 'retail';

export interface NichePreset {
  readonly id: BusinessNicheId;
  readonly title: string;
  readonly leadsPerMonth: number;
  readonly lateSharePercent: number;
  readonly avgCheck: number;
  readonly operationsPerWeek: number;
  readonly minutesPerOperation: number;
  readonly conversionPercent: number;
  readonly conversionCaption: string;
  readonly routinePresetIds: readonly RoutinePresetId[];
}

/** Revenue inputs a niche marks as a guess. Recovery stays as it was. */
export const NICHE_REVENUE_TAGS = {
  leads: 'guess',
  lateShare: 'guess',
  check: 'guess',
} as const;

export const NICHE_CAPTION = 'значение ниши, сценарное допущение — замените своим замером';

export const NICHE_ACCENT_TITLE = 'Цифр под рукой нет? Возьмите пример ниши.';
export const NICHE_ACCENT_TEXT =
  'Подставим обращения, опоздания и чек. Это сценарное допущение, не ваш замер.';
export const NICHE_ACCENT_BUTTON = 'Показать пример ниши';
export const NICHE_QUIET_BUTTON = 'Подставить значения ниши';

/** Empty niche fields get the accent prompt. A saved number keeps the quiet button. Fixed for the visit. */
export function nichePromptKind(values: readonly string[]): 'accent' | 'quiet' {
  return values.some((value) => value.trim() !== '') ? 'quiet' : 'accent';
}

const PRESETS: readonly NichePreset[] = [
  {
    id: 'cafe-food',
    title: 'Кафе и еда',
    leadsPerMonth: 180,
    lateSharePercent: 40,
    avgCheck: 900,
    operationsPerWeek: 25,
    minutesPerOperation: 10,
    conversionPercent: 25,
    conversionCaption: 'Сценарное допущение для заказов еды. Не замер.',
    routinePresetIds: ['orders', 'booking'],
  },
  {
    id: 'beauty',
    title: 'Бьюти-услуги',
    leadsPerMonth: 60,
    lateSharePercent: 25,
    avgCheck: 2500,
    operationsPerWeek: 20,
    minutesPerOperation: 8,
    conversionPercent: 30,
    conversionCaption: 'Сценарное допущение записи. Не замер.',
    routinePresetIds: ['booking', 'answers'],
  },
  {
    id: 'school',
    title: 'Онлайн-школа и коуч',
    leadsPerMonth: 40,
    lateSharePercent: 45,
    avgCheck: 12000,
    operationsPerWeek: 40,
    minutesPerOperation: 6,
    conversionPercent: 12,
    conversionCaption: 'Сценарное допущение длинной продажи обучения. Не замер.',
    routinePresetIds: ['answers', 'sheets'],
  },
  {
    id: 'freelance',
    title: 'Фрилансер и консультант',
    leadsPerMonth: 15,
    lateSharePercent: 30,
    avgCheck: 7000,
    operationsPerWeek: 15,
    minutesPerOperation: 12,
    conversionPercent: 10,
    conversionCaption: 'Сценарное допущение редких консультаций. Не замер.',
    routinePresetIds: ['answers', 'sheets'],
  },
  {
    id: 'retail',
    title: 'Розница и товарка',
    leadsPerMonth: 120,
    lateSharePercent: 30,
    avgCheck: 2200,
    operationsPerWeek: 25,
    minutesPerOperation: 10,
    conversionPercent: 20,
    conversionCaption: 'Сценарное допущение товарной покупки. Не замер.',
    routinePresetIds: ['orders', 'answers'],
  },
];

const PRESET_IDS = new Set<string>(PRESETS.map((preset) => preset.id));

export function listNichePresets(): readonly NichePreset[] {
  return PRESETS;
}

export function nicheById(id: string | null | undefined): NichePreset | null {
  if (!id || !PRESET_IDS.has(id)) return null;
  return PRESETS.find((preset) => preset.id === id) ?? null;
}

/** `null` is the visitor's own numbers, stored and printed as «своя». */
export function nicheTitle(id: BusinessNicheId | null): string {
  return nicheById(id)?.title ?? 'своя';
}

export function scenarioLine(id: BusinessNicheId | null): string {
  return `Сценарий: ${nicheTitle(id)}`;
}

export function applyNicheGuess(tags: UncertaintyProfile): UncertaintyProfile {
  return {
    ...tags,
    leads: NICHE_REVENUE_TAGS.leads,
    lateShare: NICHE_REVENUE_TAGS.lateShare,
    check: NICHE_REVENUE_TAGS.check,
    conversion: 'guess',
  };
}

/** Stored preset id for a niche conversion. It is not one of the four old scenarios. */
export function nicheConversionPresetId(id: BusinessNicheId): string {
  return `niche:${id}`;
}

export function nicheIdFromConversionPreset(presetId: string | null | undefined): BusinessNicheId | null {
  if (!presetId?.startsWith('niche:')) return null;
  return nicheById(presetId.slice('niche:'.length))?.id ?? null;
}

/** Caption stays only while the typed number is still the niche number. */
export function nicheCaptionVisible(raw: string, presetValue: number): boolean {
  if (raw.trim() === '') return false;
  const value = Number(raw);
  return Number.isFinite(value) && value === presetValue;
}

export interface NumberField {
  readonly label: string;
  readonly current: string;
  readonly next: string;
}

export function revenueNicheFields(
  current: { readonly leads: string; readonly late: string; readonly check: string },
  preset: NichePreset,
): readonly NumberField[] {
  return [
    { label: 'Обращения в месяц', current: current.leads, next: String(preset.leadsPerMonth) },
    { label: 'Доля поздних, %', current: current.late, next: String(preset.lateSharePercent) },
    { label: 'Средний чек, ₽', current: current.check, next: String(preset.avgCheck) },
  ];
}

export function routineNicheFields(
  current: { readonly operations: string; readonly minutes: string },
  preset: NichePreset,
): readonly NumberField[] {
  return [
    { label: 'Операций в неделю', current: current.operations, next: String(preset.operationsPerWeek) },
    { label: 'Минут на операцию', current: current.minutes, next: String(preset.minutesPerOperation) },
  ];
}

function sameNumber(current: string, next: string): boolean {
  if (current.trim() === '') return false;
  const value = Number(current);
  return Number.isFinite(value) && value === Number(next);
}

export type NicheApplyPlan = 'noop' | 'label' | 'fill' | 'confirm';

/** Empty fields fill quietly. Different filled numbers ask first. The same preset twice does nothing. */
export function planNicheApply(
  currentId: BusinessNicheId | null,
  presetId: BusinessNicheId,
  fields: readonly NumberField[],
): NicheApplyPlan {
  const sameNumbers = fields.every((field) => sameNumber(field.current, field.next));
  if (sameNumbers && currentId === presetId) return 'noop';
  if (sameNumbers) return 'label';
  const overwrites = fields.some((field) => field.current.trim() !== '' && !sameNumber(field.current, field.next));
  return overwrites ? 'confirm' : 'fill';
}

export function formatFieldChange(field: NumberField): string {
  const from = field.current.trim() === '' ? 'пусто' : field.current;
  return `${field.label}: ${from} → ${field.next}`;
}
