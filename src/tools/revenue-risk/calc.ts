import { formatRubles, normalizeFiniteNumber } from '../../lib/format';
import type {
  UncertaintyInputId,
  UncertaintyProfile,
  UncertaintyTag,
} from '../../lib/types';

export type { UncertaintyInputId, UncertaintyProfile, UncertaintyTag };

export type NichePresetId =
  | 'beauty-local'
  | 'ecommerce'
  | 'experts-edu'
  | 'b2b-services';

export type ConversionInputMode = 'custom' | 'preset';

export interface NichePreset {
  readonly id: NichePresetId;
  readonly title: string;
  readonly description: string;
  readonly defaultConversionPercent: number;
  readonly defaultLossFactor: number;
  readonly badgeDisclaimer: string;
}

export const MARKET_AVERAGE_BADGE_DISCLAIMER =
  'Условный сценарий. Это не статистика по России и не ваши цифры. Значение можно заменить на своё.';

export const MARKET_AVERAGE_RESULT_DISCLAIMER =
  'Сценарное допущение, не замер вашего бизнеса. Даже если цифра грубая, виден порядок потерь.';

export const DEFAULT_LOSS_FACTOR = 0.3;
export const DEFAULT_LOSS_FACTOR_PERCENT = 30;

export const REVENUE_RISK_DEFAULTS = {
  leadsPerMonth: 100,
  lateSharePercent: 35,
  conversionPercent: 20,
  avgCheck: 4500,
  lossFactor: DEFAULT_LOSS_FACTOR,
  presetId: 'beauty-local' as NichePresetId,
} as const;

export const NICHE_PRESETS: readonly NichePreset[] = [
  {
    id: 'beauty-local',
    title: 'Бьюти, здоровье, локальные услуги',
    description: 'Запись на приём или визит',
    defaultConversionPercent: 30,
    defaultLossFactor: 0.5,
    badgeDisclaimer: MARKET_AVERAGE_BADGE_DISCLAIMER,
  },
  {
    id: 'ecommerce',
    title: 'Товарный бизнес',
    description: 'Одежда, подарки, декор, цветы',
    defaultConversionPercent: 20,
    defaultLossFactor: 0.5,
    badgeDisclaimer: MARKET_AVERAGE_BADGE_DISCLAIMER,
  },
  {
    id: 'experts-edu',
    title: 'Эксперты, обучение, инфопродукты',
    description: 'Фриланс, агентства, наставничество',
    defaultConversionPercent: 12,
    defaultLossFactor: 0.42,
    badgeDisclaimer: MARKET_AVERAGE_BADGE_DISCLAIMER,
  },
  {
    id: 'b2b-services',
    title: 'Сложные услуги с высоким чеком',
    description: 'Ремонт, производство, разработка',
    defaultConversionPercent: 8,
    defaultLossFactor: 0.37,
    badgeDisclaimer: MARKET_AVERAGE_BADGE_DISCLAIMER,
  },
] as const;

export function getNichePresetById(id: NichePresetId): NichePreset {
  const found = NICHE_PRESETS.find((preset) => preset.id === id);
  return found ?? NICHE_PRESETS[0]!;
}

export interface RevenueRiskInput {
  readonly leadsPerMonth: number;
  readonly lateSharePercent: number;
  readonly conversionPercent: number;
  readonly avgCheck: number;
  readonly lossFactor?: number;
}

export interface RevenueRiskResult {
  readonly normalizedInput: Required<RevenueRiskInput>;
  readonly lateLeads: number;
  readonly revenueAtRiskMax: number;
  readonly recoverableRevenue: number;
  readonly revenueAtRiskPerYear: number;
  readonly costPerMissedDialog: number;
}

export interface RevenueRiskRawDraft {
  readonly leadsPerMonthRaw: string;
  readonly lateSharePercentRaw: string;
  readonly conversionPercentRaw: string;
  readonly avgCheckRaw: string;
  readonly lossFactorPercentRaw: string;
  readonly mode: ConversionInputMode;
}

export interface RevenueRiskFieldErrors {
  readonly leadsPerMonth?: string;
  readonly lateSharePercent?: string;
  readonly conversionPercent?: string;
  readonly avgCheck?: string;
  readonly lossFactorPercent?: string;
}

export interface RevenueRiskValidationResult {
  readonly isValid: boolean;
  readonly errors: RevenueRiskFieldErrors;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Converts the visible 0–100% loss slider into the 0–1 factor used by the formula.
 * Out-of-range and non-finite values collapse to the 30% default.
 */
export function lossFactorFromPercent(percent: number): number {
  const safe = normalizeFiniteNumber(percent, DEFAULT_LOSS_FACTOR_PERCENT);
  return clamp(safe, 0, 100) / 100;
}

/** What the visitor sees. 30% stored loss is a 70% recovery share. */
export function recoveryPercentFromLossFactor(lossFactor: number): number {
  const safe = clamp(
    normalizeFiniteNumber(lossFactor, DEFAULT_LOSS_FACTOR),
    0,
    1,
  );
  return Math.round((1 - safe) * 100);
}

/** The slider is the share they can bring back. Storage keeps the loss complement. */
export function lossFactorFromRecoveryPercent(recoveryPercent: number): number {
  const shown = clamp(
    normalizeFiniteNumber(
      recoveryPercent,
      recoveryPercentFromLossFactor(DEFAULT_LOSS_FACTOR),
    ),
    0,
    100,
  );
  return (100 - shown) / 100;
}

function parseStrictFinite(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const num = Number(trimmed.replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

/**
 * Validates raw form string inputs and returns user-facing Russian error messages
 * per field when empty or out of bounds.
 */
export function validateRevenueRiskDraft(
  draft: RevenueRiskRawDraft,
): RevenueRiskValidationResult {
  const errors: {
    leadsPerMonth?: string;
    lateSharePercent?: string;
    conversionPercent?: string;
    avgCheck?: string;
    lossFactorPercent?: string;
  } = {};

  const leads = parseStrictFinite(draft.leadsPerMonthRaw);
  if (leads === null) {
    errors.leadsPerMonth = 'Укажите количество обращений в месяц.';
  } else if (leads < 0) {
    errors.leadsPerMonth = 'Количество обращений не может быть отрицательным.';
  }

  const lateShare = parseStrictFinite(draft.lateSharePercentRaw);
  if (lateShare === null) {
    errors.lateSharePercent = 'Укажите долю поздних или пропущенных ответов (0–100%).';
  } else if (lateShare < 0 || lateShare > 100) {
    errors.lateSharePercent = 'Доля поздних ответов должна быть в диапазоне от 0 до 100%.';
  }

  const conversion = parseStrictFinite(draft.conversionPercentRaw);
  if (conversion === null) {
    errors.conversionPercent = 'Укажите конверсию из обращения в покупку.';
  } else if (draft.mode === 'custom' && (conversion < 1 || conversion > 95)) {
    errors.conversionPercent =
      'В режиме «Моя конверсия» введите значение от 1% до 95%.';
  } else if (conversion < 0 || conversion > 100) {
    errors.conversionPercent = 'Конверсия должна быть в диапазоне от 0 до 100%.';
  }

  const avgCheck = parseStrictFinite(draft.avgCheckRaw);
  if (avgCheck === null) {
    errors.avgCheck = 'Укажите средний чек в рублях.';
  } else if (avgCheck < 0) {
    errors.avgCheck = 'Средний чек не может быть отрицательным.';
  }

  const recoveryPercent = parseStrictFinite(draft.lossFactorPercentRaw);
  if (recoveryPercent === null) {
    errors.lossFactorPercent = 'Укажите долю возврата быстрым ответом (0–100%).';
  } else if (recoveryPercent < 0 || recoveryPercent > 100) {
    errors.lossFactorPercent = 'Доля возврата должна быть в диапазоне от 0 до 100%.';
  }

  const isValid =
    !errors.leadsPerMonth &&
    !errors.lateSharePercent &&
    !errors.conversionPercent &&
    !errors.avgCheck &&
    !errors.lossFactorPercent;

  return { isValid, errors };
}

/**
 * Pure calculation function for the Revenue at Risk Calculator.
 *
 * Math specification:
 * 1. lateLeads = leadsPerMonth * (lateSharePercent / 100)
 * 2. revenueAtRiskMax = lateLeads * (conversionPercent / 100) * avgCheck
 * 3. recoverableRevenue = revenueAtRiskMax * recoveryShare
 *    recoveryShare = 1 - lossFactor. The screen shows recoveryShare.
 * 4. revenueAtRiskPerYear = revenueAtRiskMax * 12
 * Trigger metric:
 * 5. costPerMissedDialog = avgCheck * (conversionPercent / 100)
 */
export function calculateRevenueRisk(
  input: RevenueRiskInput,
): RevenueRiskResult {
  const leadsPerMonth = Math.max(
    0,
    normalizeFiniteNumber(input.leadsPerMonth, 0),
  );
  const lateSharePercent = clamp(
    normalizeFiniteNumber(input.lateSharePercent, 0),
    0,
    100,
  );
  const conversionPercent = clamp(
    normalizeFiniteNumber(input.conversionPercent, 0),
    0,
    100,
  );
  const avgCheck = Math.max(0, normalizeFiniteNumber(input.avgCheck, 0));
  const lossFactor = clamp(
    normalizeFiniteNumber(input.lossFactor ?? DEFAULT_LOSS_FACTOR, DEFAULT_LOSS_FACTOR),
    0,
    1,
  );

  const lateShareRatio = lateSharePercent / 100;
  const conversionRatio = conversionPercent / 100;

  const lateLeads = leadsPerMonth * lateShareRatio;
  const revenueAtRiskMax = lateLeads * conversionRatio * avgCheck;
  const recoverableRevenue = revenueAtRiskMax * (1 - lossFactor);
  const revenueAtRiskPerYear = revenueAtRiskMax * 12;
  const costPerMissedDialog = avgCheck * conversionRatio;

  return {
    normalizedInput: {
      leadsPerMonth,
      lateSharePercent,
      conversionPercent,
      avgCheck,
      lossFactor,
    },
    lateLeads,
    revenueAtRiskMax,
    recoverableRevenue,
    revenueAtRiskPerYear,
    costPerMissedDialog,
  };
}

export interface RevenueCorridor {
  readonly low: number;
  readonly base: number;
  readonly high: number;
}

export const UNCERTAINTY_SPREAD: Readonly<Record<UncertaintyTag, number>> = {
  precise: 0,
  rough: 0.15,
  guess: 0.35,
};

export const CORRIDOR_POINT_LINE =
  'вы уверены во всех входах — коридор схлопнулся в точку';

export const CORRIDOR_WIDTH_NOTE =
  'Ширина коридора показывает вашу неопределённость во всех входах. Чтобы сузить — уточните теги на самые важные для вас параметры';

const UNCERTAINTY_INPUTS: readonly UncertaintyInputId[] = [
  'leads',
  'lateShare',
  'conversion',
  'check',
  'recoveryShare',
];

const MEASURE_RANK: readonly UncertaintyInputId[] = [
  'conversion',
  'recoveryShare',
  'lateShare',
  'leads',
  'check',
];

export const UNCERTAINTY_INPUT_LABELS: Readonly<Record<UncertaintyInputId, string>> = {
  leads: 'обращения',
  lateShare: 'доля поздних',
  conversion: 'конверсия',
  check: 'средний чек',
  recoveryShare: 'доля возврата',
};

export const UNCERTAINTY_TAG_LABELS: Readonly<Record<UncertaintyTag, string>> = {
  precise: 'точно',
  rough: 'примерно',
  guess: 'наугад',
};

export function defaultUncertainty(mode: ConversionInputMode): UncertaintyProfile {
  return {
    leads: 'rough',
    lateShare: 'rough',
    conversion: mode === 'preset' ? 'guess' : 'rough',
    check: 'rough',
    recoveryShare: 'guess',
  };
}

/** A tag the visitor already chose stays. Only an untouched conversion follows the mode. */
export function uncertaintyAfterModeChange(
  tags: UncertaintyProfile,
  previousMode: ConversionInputMode,
  nextMode: ConversionInputMode,
): UncertaintyProfile {
  if (previousMode === nextMode) return tags;
  if (tags.conversion !== defaultUncertainty(previousMode).conversion) return tags;
  return { ...tags, conversion: defaultUncertainty(nextMode).conversion };
}

export function isAllPrecise(tags: UncertaintyProfile): boolean {
  return UNCERTAINTY_INPUTS.every((id) => tags[id] === 'precise');
}

export function computeCorridor(
  input: RevenueRiskInput,
  tags: UncertaintyProfile,
): RevenueCorridor {
  const calculated = calculateRevenueRisk(input);
  const normalized = calculated.normalizedInput;
  const recoveryPercent = (1 - normalized.lossFactor) * 100;
  const bound = (direction: -1 | 1): number => {
    const leads = Math.max(
      0,
      normalized.leadsPerMonth * (1 + direction * UNCERTAINTY_SPREAD[tags.leads]),
    );
    const late = clamp(
      normalized.lateSharePercent * (1 + direction * UNCERTAINTY_SPREAD[tags.lateShare]),
      0,
      100,
    );
    const conversion = clamp(
      normalized.conversionPercent * (1 + direction * UNCERTAINTY_SPREAD[tags.conversion]),
      0,
      100,
    );
    const check = Math.max(
      0,
      normalized.avgCheck * (1 + direction * UNCERTAINTY_SPREAD[tags.check]),
    );
    const recovery = clamp(
      recoveryPercent * (1 + direction * UNCERTAINTY_SPREAD[tags.recoveryShare]),
      0,
      100,
    );
    return leads * (late / 100) * (conversion / 100) * check * (recovery / 100);
  };
  return { low: bound(-1), base: calculated.recoverableRevenue, high: bound(1) };
}

export function shouldShowMeasureFirst(corridor: RevenueCorridor): boolean {
  return Math.round(corridor.low) !== Math.round(corridor.high);
}

export function topUncertainInputs(
  tags: UncertaintyProfile,
  limit = 2,
): readonly UncertaintyInputId[] {
  return [...MEASURE_RANK]
    .sort((left, right) => {
      const bySpread = UNCERTAINTY_SPREAD[tags[right]] - UNCERTAINTY_SPREAD[tags[left]];
      if (bySpread !== 0) return bySpread;
      return MEASURE_RANK.indexOf(left) - MEASURE_RANK.indexOf(right);
    })
    .slice(0, limit);
}

export function formatUncertaintyProfile(tags: UncertaintyProfile): string {
  return UNCERTAINTY_INPUTS.map(
    (id) => `${UNCERTAINTY_INPUT_LABELS[id]} — ${UNCERTAINTY_TAG_LABELS[tags[id]]}`,
  ).join(', ');
}

export function formatCorridorLine(corridor: RevenueCorridor, tags: UncertaintyProfile): string {
  if (isAllPrecise(tags)) return CORRIDOR_POINT_LINE;
  return `от ${formatRubles(corridor.low)} до ${formatRubles(corridor.high)}/мес`;
}
