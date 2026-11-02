import { describe, expect, it } from 'vitest';
import { defaultUncertainty } from '../tools/revenue-risk/calc';
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
  nicheCaptionVisible,
  nichePromptKind,
  nicheTitle,
  planNicheApply,
  revenueNicheFields,
  scenarioLine,
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
    expect(listNichePresets().every((preset) => !('conversionPercent' in preset))).toBe(true);
  });

  it('marks the three revenue inputs as a guess and leaves conversion tags alone', () => {
    const before = defaultUncertainty('custom');
    const after = applyNicheGuess(before);
    expect(after.leads).toBe('guess');
    expect(after.lateShare).toBe('guess');
    expect(after.check).toBe('guess');
    expect(after.conversion).toBe(before.conversion);
    expect(after.recoveryShare).toBe(before.recoveryShare);
  });

  it('drops the caption after a manual edit and keeps the guess tag', () => {
    const tags = applyNicheGuess(defaultUncertainty('custom'));
    expect(nicheCaptionVisible('180', 180)).toBe(true);
    expect(nicheCaptionVisible('181', 180)).toBe(false);
    expect(nicheCaptionVisible('', 180)).toBe(false);
    expect(tags.leads).toBe('guess');
    expect(NICHE_CAPTION).toContain('сценарное допущение');
  });

  it('uses the accent prompt only while every niche field is empty', () => {
    expect(nichePromptKind(['', '  ', ''])).toBe('accent');
    expect(nichePromptKind(['10', '', ''])).toBe('quiet');
    expect(nichePromptKind(['', '40', ''])).toBe('quiet');
    expect(NICHE_ACCENT_TITLE).toBe('Первый раз? Начните с ниши');
    expect(NICHE_ACCENT_TEXT).toContain('сценарные');
    expect(NICHE_ACCENT_BUTTON).toBe('Выбрать нишу');
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
