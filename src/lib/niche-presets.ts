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
  /** Visible return share. The corridor formula is not derived from this field. */
  readonly recoveryPercent: number;
  readonly conversionCaption: string;
  readonly routinePresetIds: readonly RoutinePresetId[];
}

/** Revenue inputs a niche marks as a guess. Recovery stays as it was. */
export const NICHE_REVENUE_TAGS = {
  leads: 'guess',
  lateShare: 'guess',
  check: 'guess',
} as const;

export const NICHE_CAPTION = 'примерные цифры ниши — замените своим замером';

export const NICHE_ACCENT_TITLE = 'Цифр под рукой нет? Возьмите пример ниши.';
export const NICHE_ACCENT_TEXT =
  'Подставим обращения, долю поздних ответов и средний чек — потом замените своими';
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
    recoveryPercent: 50,
    conversionCaption: 'Кафе и еда. Не замер.',
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
    recoveryPercent: 50,
    conversionCaption: 'Бьюти, здоровье, локальные услуги. Не замер.',
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
    recoveryPercent: 58,
    conversionCaption: 'Онлайн-школа и коуч. Не замер.',
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
    recoveryPercent: 30,
    conversionCaption: 'Фрилансер и консультант. Не замер.',
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
    recoveryPercent: 50,
    conversionCaption: 'Одежда, подарки, декор, цветы. Не замер.',
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
  const preset = nicheById(id);
  return `Сценарий: ${preset ? preset.title : 'ваши цифры'}`;
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

/**
 * Which niche owns the conversion step. A standing niche wins in scenario mode,
 * even if an old scenario id is still stored. Custom mode and an explicit old
 * scenario with an empty niche leave the fifth card off.
 */
export function activeConversionNiche(
  dossierNiche: BusinessNicheId | null,
  mode: 'preset' | 'custom',
  explicitOldScenario: string | null,
): BusinessNicheId | null {
  if (mode !== 'preset') return null;
  if (explicitOldScenario && !dossierNiche) return null;
  return dossierNiche;
}

/** Which niche control stays after a preset is stored. Undo wins over «Своя ниша». */
export function nichePromptVisibility(nicheSet: boolean, hasUndo: boolean): 'prompt' | 'undo' | 'own' {
  if (!nicheSet) return 'prompt';
  return hasUndo ? 'undo' : 'own';
}
export function nicheConversionCardTitle(niche: NichePreset): string {
  return `Ваша ниша: ${niche.title} — ${String(niche.conversionPercent)}%`;
}

/**
 * The fifth card is the niche already stored in the dossier.
 * `beauty-local` is only the fallback when that field is still empty.
 */
export function storedNicheConversionCard(
  storedNiche: BusinessNicheId | null,
): BusinessNicheId | null {
  return activeConversionNiche(storedNiche, 'preset', storedNiche === null ? 'beauty-local' : null);
}

/** CSV «Режим». A niche preset names the niche; anything else is manual conversion. */
export function conversionModeCsvLabel(
  mode: 'preset' | 'custom',
  presetId: string | null | undefined,
): string {
  if (mode !== 'preset') return 'Моя конверсия';
  const nicheId = nicheIdFromConversionPreset(presetId);
  return nicheId ? `Ниша: ${nicheTitle(nicheId)}` : 'Моя конверсия';
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
  current: { readonly presetIds: readonly string[] },
  preset: NichePreset,
): readonly NumberField[] {
  return [
    {
      label: 'Рутины',
      current: current.presetIds.join('+'),
      next: preset.routinePresetIds.join('+'),
    },
  ];
}

function sameNumber(current: string, next: string): boolean {
  if (current.trim() === '') return false;
  if (current.trim() === next.trim()) return true;
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
