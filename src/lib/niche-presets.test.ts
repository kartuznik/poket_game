import { describe, expect, it } from 'vitest';
import { defaultUncertainty } from '../tools/revenue-risk/calc';
import {
  NICHE_CAPTION,
  applyNicheGuess,
  formatFieldChange,
  listNichePresets,
  nicheById,
  nicheCaptionVisible,
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
