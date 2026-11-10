import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNCERTAINTY_SPREAD, computeCorridor, defaultUncertainty } from '../tools/revenue-risk/calc';
import {
  NICHE_ACCENT_BUTTON,
  NICHE_ACCENT_TEXT,
  NICHE_ACCENT_TITLE,
  NICHE_CAPTION,
  NICHE_QUIET_BUTTON,
  applyNicheGuess,
  formatFieldChange,
  listNichePresets,
  nicheById,
  activeConversionNiche,
  conversionModeCsvLabel,
  nicheCaptionVisible,
  nicheConversionCardTitle,
  nicheIdFromConversionPreset,
  nichePromptKind,
  nichePromptVisibility,
  nicheTitle,
  planNicheApply,
  revenueNicheFields,
  scenarioLine,
  storedNicheConversionCard,
} from './niche-presets';

describe('niche presets', () => {
  it('lists five niches and treats anything else as своя', () => {
    expect(listNichePresets().map((preset) => preset.title)).toEqual([
      'Кафе и еда',
      'Бьюти-услуги',
      'Онлайн-школа и коуч',
      'Фрилансер и консультант',
      'Розница и товарка',
    ]);
    expect(listNichePresets().find((preset) => preset.id === 'cafe-food')).toMatchObject({
      leadsPerMonth: 180,
      lateSharePercent: 40,
      avgCheck: 900,
      operationsPerWeek: 25,
      minutesPerOperation: 10,
    });
    expect(nicheTitle(null)).toBe('своя');
    expect(nicheById('unknown')).toBeNull();
    expect(scenarioLine('beauty')).toBe('Сценарий: Бьюти-услуги');
    expect(scenarioLine(null)).toBe('Сценарий: ваши цифры');
    expect(nicheIdFromConversionPreset('niche:cafe-food')).toBe('cafe-food');
    expect(nicheIdFromConversionPreset('beauty-local')).toBeNull();
    expect(activeConversionNiche('cafe-food', 'preset', 'beauty-local')).toBe('cafe-food');
    expect(activeConversionNiche('cafe-food', 'preset', null)).toBe('cafe-food');
    expect(activeConversionNiche(null, 'preset', 'beauty-local')).toBeNull();
    expect(activeConversionNiche('cafe-food', 'custom', null)).toBeNull();
    const cafe = listNichePresets().find((preset) => preset.id === 'cafe-food');
    if (!cafe) throw new Error('missing cafe preset');
    expect(nicheConversionCardTitle(cafe)).toBe('Ваша ниша: Кафе и еда — 25%');
    expect(conversionModeCsvLabel('preset', 'niche:cafe-food')).toBe('Ниша: Кафе и еда');
    expect(conversionModeCsvLabel('preset', 'beauty-local')).toBe('Сценарное допущение');
    expect(conversionModeCsvLabel('custom', 'niche:cafe-food')).toBe('Моя конверсия');
    const byId = Object.fromEntries(listNichePresets().map((preset) => [preset.id, preset]));
    expect(byId['cafe-food']).toMatchObject({
      conversionPercent: 25,
      recoveryPercent: 50,
      conversionCaption: 'Кафе и еда. Не замер.',
      routinePresetIds: ['orders', 'booking'],
    });
    expect(byId['beauty']).toMatchObject({
      conversionPercent: 30,
      recoveryPercent: 50,
      conversionCaption: 'Бьюти, здоровье, локальные услуги. Не замер.',
      routinePresetIds: ['booking', 'answers'],
    });
    expect(byId['school']).toMatchObject({
      conversionPercent: 12,
      recoveryPercent: 58,
      conversionCaption: 'Онлайн-школа и коуч. Не замер.',
      routinePresetIds: ['answers', 'sheets'],
    });
    expect(byId['freelance']).toMatchObject({
      conversionPercent: 10,
      recoveryPercent: 30,
      conversionCaption: 'Фрилансер и консультант. Не замер.',
      routinePresetIds: ['answers', 'sheets'],
    });
    expect(byId['retail']).toMatchObject({
      conversionPercent: 20,
      recoveryPercent: 50,
      conversionCaption: 'Одежда, подарки, декор, цветы. Не замер.',
      routinePresetIds: ['orders', 'answers'],
    });
    for (const preset of listNichePresets()) {
      expect(storedNicheConversionCard(preset.id)).toBe(preset.id);
      expect(storedNicheConversionCard(preset.id)).not.toBeNull();
    }
    expect(storedNicheConversionCard(null)).toBeNull();
    expect(nichePromptVisibility(false, false)).toBe('prompt');
    expect(nichePromptVisibility(true, true)).toBe('undo');
    expect(nichePromptVisibility(true, false)).toBe('own');
    const view = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../tools/revenue-risk/view.ts'),
      'utf8',
    );
    const apply = view.slice(view.indexOf('function applyRevenueNiche'), view.indexOf('let refreshSteps'));
    expect(apply.indexOf('dossier.update')).toBeGreaterThanOrEqual(0);
    expect(apply.indexOf('dossier.update')).toBeLessThan(apply.indexOf('syncConversionFieldWithMode'));
    expect(view).toContain('nicheConversionId = storedNicheConversionCard(dossier.read().niche)');
    expect(
      listNichePresets().every(
        (preset) =>
          preset.conversionCaption.includes('Не замер') &&
          preset.routinePresetIds.length >= 1 &&
          preset.routinePresetIds.length <= 3,
      ),
    ).toBe(true);
  });

  it('marks revenue inputs and conversion as a guess and leaves the recovery tag', () => {
    const before = defaultUncertainty('custom');
    const after = applyNicheGuess(before);
    expect(after.leads).toBe('guess');
    expect(after.lateShare).toBe('guess');
    expect(after.check).toBe('guess');
    expect(after.conversion).toBe('guess');
    expect(after.recoveryShare).toBe(before.recoveryShare);
    expect(UNCERTAINTY_SPREAD.guess).toBe(0.35);
    const input = {
      leadsPerMonth: 100,
      lateSharePercent: 40,
      conversionPercent: 25,
      avgCheck: 900,
      lossFactor: 0.5,
    };
    const wide = computeCorridor(input, after);
    const narrow = computeCorridor(input, { ...after, conversion: 'precise' });
    expect(wide.high - wide.low).toBeGreaterThan(narrow.high - narrow.low);
    expect(wide.base).toBe(narrow.base);
  });

  it('drops the caption after a manual edit and keeps the guess tag', () => {
    const tags = applyNicheGuess(defaultUncertainty('custom'));
    expect(nicheCaptionVisible('180', 180)).toBe(true);
    expect(nicheCaptionVisible('181', 180)).toBe(false);
    expect(nicheCaptionVisible('', 180)).toBe(false);
    expect(tags.leads).toBe('guess');
    expect(NICHE_CAPTION).toContain('примерные цифры');
  });

  it('uses the accent prompt only while every niche field is empty', () => {
    expect(nichePromptKind(['', '  ', ''])).toBe('accent');
    expect(nichePromptKind(['10', '', ''])).toBe('quiet');
    expect(nichePromptKind(['', '40', ''])).toBe('quiet');
    expect(NICHE_ACCENT_TITLE).toBe('Цифр под рукой нет? Возьмите пример ниши.');
    expect(NICHE_ACCENT_TEXT).toContain('долю поздних ответов');
    expect(NICHE_ACCENT_BUTTON).toBe('Показать пример ниши');
    expect(NICHE_QUIET_BUTTON).toBe('Подставить значения ниши');
  });

  it('keeps the same apply plan for an accent prompt and a quiet button', () => {
    const cafe = listNichePresets()[0];
    if (!cafe) throw new Error('missing cafe preset');
    const empty = revenueNicheFields({ leads: '', late: '', check: '' }, cafe);
    const filled = revenueNicheFields({ leads: '10', late: '20', check: '1000' }, cafe);
    expect(nichePromptKind([empty[0]!.current, empty[1]!.current, empty[2]!.current])).toBe('accent');
    expect(nichePromptKind([filled[0]!.current, filled[1]!.current, filled[2]!.current])).toBe('quiet');
    expect(planNicheApply(null, cafe.id, empty)).toBe('fill');
    expect(planNicheApply(null, cafe.id, filled)).toBe('confirm');
    expect(planNicheApply(cafe.id, cafe.id, revenueNicheFields({ leads: '180', late: '40', check: '900' }, cafe))).toBe(
      'noop',
    );
  });

  it('asks before overwriting filled numbers and stays quiet on an empty draft', () => {
    const cafe = listNichePresets()[0];
    if (!cafe) throw new Error('missing cafe preset');
    const empty = revenueNicheFields({ leads: '', late: '', check: '' }, cafe);
    expect(planNicheApply(null, cafe.id, empty)).toBe('fill');
    const filled = revenueNicheFields({ leads: '10', late: '20', check: '1000' }, cafe);
    expect(planNicheApply(null, cafe.id, filled)).toBe('confirm');
    expect(formatFieldChange(filled[0]!)).toBe('Обращения в месяц: 10 → 180');
    const same = revenueNicheFields(
      { leads: '180', late: '40', check: '900' },
      cafe,
    );
    expect(planNicheApply(cafe.id, cafe.id, same)).toBe('noop');
    expect(planNicheApply(null, cafe.id, same)).toBe('label');
  });
});
