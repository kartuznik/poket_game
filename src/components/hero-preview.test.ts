import { describe, expect, it } from 'vitest';
import {
  computeNichePreview,
  interpolateCounterValue,
  nextChipIndex,
  splitNicheChips,
} from './hero-preview';
import { buildStickyScoreModel, diffStickyMetrics } from './sticky-score';

describe('hero live preview recalculation', () => {
  it('computes real revenue at risk and recoverable numbers for every niche', () => {
    const cafe = computeNichePreview('cafe-food');
    expect(cafe.risk).toBe(16200);
    expect(cafe.recoverable).toBe(8100);
    expect(cafe.riskFormatted).toBe('16\u00A0200\u00A0₽');
    expect(cafe.recoverableFormatted).toBe('8\u00A0100\u00A0₽/мес');
    expect(cafe.caption).toBe('Пример · кафе и еда · сценарное допущение');

    const school = computeNichePreview('school');
    // 40 leads * 45% late = 18 * 12% conv * 12000 check = 25920 risk; 58% recovery = 15033.6
    expect(school.risk).toBe(25920);
    expect(school.recoverable).toBeCloseTo(15033.6, 1);
    expect(school.caption).toBe('Пример · онлайн-школа и коуч · сценарное допущение');
    expect(school.sparklinePoints).not.toBe(cafe.sparklinePoints);

    const beauty = computeNichePreview('beauty');
    // 60 * 25% = 15 * 30% * 2500 = 11250 risk; 50% recovery = 5625
    expect(beauty.risk).toBe(11250);
    expect(beauty.recoverable).toBe(5625);
  });

  it('caps visible chips at 5–6 and supports roving radiogroup arrow navigation', () => {
    const split = splitNicheChips(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 5);
    expect(split.visible).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(split.overflow).toEqual(['f', 'g']);

    expect(nextChipIndex(0, 5, 'ArrowRight')).toBe(1);
    expect(nextChipIndex(4, 5, 'ArrowRight')).toBe(0);
    expect(nextChipIndex(0, 5, 'ArrowLeft')).toBe(4);
    expect(nextChipIndex(3, 5, 'Home')).toBe(0);
    expect(nextChipIndex(1, 5, 'End')).toBe(4);
    expect(nextChipIndex(1, 5, 'Tab')).toBeNull();

    expect(interpolateCounterValue(16200, 25920, 0)).toBe(16200);
    expect(interpolateCounterValue(16200, 25920, 1)).toBe(25920);
  });
});

describe('sticky score panel updates', () => {
  it('stays hidden before start, shows em-dashes for uncalculated tools, and hides on final dossier', () => {
    const empty = { revenue: null, routine: null, readiness: null };

    const beforeStart = buildStickyScoreModel(empty, 'revenue-risk', false);
    expect(beforeStart.visible).toBe(false);
    expect(beforeStart.risk).toBe('—');
    expect(beforeStart.recoverable).toBe('—');
    expect(beforeStart.hours).toBe('—');
    expect(beforeStart.readiness).toBe('—');

    const step1Started = buildStickyScoreModel(empty, 'revenue-risk', true);
    expect(step1Started.visible).toBe(true);
    expect(step1Started.progressLabel).toBe('1/4');
    expect(step1Started.risk).toBe('—');

    const withRevenueOnStep2 = buildStickyScoreModel(
      {
        revenue: {
          toolId: 'revenue-risk',
          updatedAt: 1,
          inputs: {
            leadsPerMonth: 180,
            lateSharePercent: 40,
            conversionPercent: 25,
            avgCheck: 900,
            lossFactor: 0.5,
            mode: 'preset',
          },
          results: {
            lateLeads: 72,
            revenueAtRiskMax: 16200,
            recoverableRevenue: 8100,
            revenueAtRiskPerYear: 194400,
            costPerMissedDialog: 225,
          },
        },
        routine: null,
        readiness: null,
      },
      'routine-calc',
      true,
    );
    expect(withRevenueOnStep2.visible).toBe(true);
    expect(withRevenueOnStep2.progressLabel).toBe('2/4');
    expect(withRevenueOnStep2.risk).toBe('16\u00A0200\u00A0₽');
    expect(withRevenueOnStep2.recoverable).toBe('8\u00A0100\u00A0₽');
    expect(withRevenueOnStep2.hours).toBe('—');
    expect(withRevenueOnStep2.readiness).toBe('—');

    const changed = diffStickyMetrics(step1Started, withRevenueOnStep2);
    expect(changed).toEqual(['risk', 'recoverable']);

    const onFinale = buildStickyScoreModel(
      {
        revenue: null,
        routine: null,
        readiness: null,
      },
      'audit-finish',
      true,
    );
    expect(onFinale.visible).toBe(false);
  });
});
