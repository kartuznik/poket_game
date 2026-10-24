import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOSS_FACTOR,
  DEFAULT_LOSS_FACTOR_PERCENT,
  MARKET_AVERAGE_BADGE_DISCLAIMER,
  NICHE_PRESETS,
  REVENUE_RISK_DEFAULTS,
  calculateRevenueRisk,
  getNichePresetById,
  lossFactorFromPercent,
  lossFactorFromRecoveryPercent,
  recoveryPercentFromLossFactor,
  validateRevenueRiskDraft,
} from './calc';

describe('calculateRevenueRisk — core formulas & normal scenarios', () => {
  it('calculates default custom scenario accurately', () => {
    const res = calculateRevenueRisk({
      leadsPerMonth: 100,
      lateSharePercent: 35,
      conversionPercent: 20,
      avgCheck: 4500,
      lossFactor: 0.5,
    });

    // lateLeads = 100 * 0.35 = 35
    expect(res.lateLeads).toBeCloseTo(35, 5);
    // revenueAtRiskMax = 35 * 0.20 * 4500 = 31 500
    expect(res.revenueAtRiskMax).toBeCloseTo(31500, 5);
    // recoverableRevenue = 31 500 * (1 - 0.5) = 15 750
    expect(res.recoverableRevenue).toBeCloseTo(15750, 5);
    // revenueAtRiskPerYear = 31 500 * 12 = 378 000
    expect(res.revenueAtRiskPerYear).toBeCloseTo(378000, 5);
    // costPerMissedDialog = 4500 * 0.20 = 900
    expect(res.costPerMissedDialog).toBeCloseTo(900, 5);
  });

  it('calculates correctly for all 4 Russian market niche presets', () => {
    expect(NICHE_PRESETS).toHaveLength(4);

    // 1. Beauty & local services (30%, lossFactor 0.5)
    const beauty = getNichePresetById('beauty-local');
    expect(beauty.defaultConversionPercent).toBe(30);
    expect(beauty.defaultLossFactor).toBe(0.5);
    expect(beauty.badgeDisclaimer).toBe(MARKET_AVERAGE_BADGE_DISCLAIMER);

    const resBeauty = calculateRevenueRisk({
      leadsPerMonth: 200,
      lateSharePercent: 25,
      conversionPercent: beauty.defaultConversionPercent,
      avgCheck: 3000,
      lossFactor: beauty.defaultLossFactor,
    });
    // lateLeads = 50, risk/mo = 50 * 0.3 * 3000 = 45 000, recoverable = 22 500
    expect(resBeauty.lateLeads).toBeCloseTo(50, 5);
    expect(resBeauty.revenueAtRiskMax).toBeCloseTo(45000, 5);
    expect(resBeauty.recoverableRevenue).toBeCloseTo(22500, 5);
    expect(resBeauty.revenueAtRiskPerYear).toBeCloseTo(540000, 5);
    expect(resBeauty.costPerMissedDialog).toBeCloseTo(900, 5);

    // 2. E-commerce (20%, lossFactor 0.5)
    const ecom = getNichePresetById('ecommerce');
    expect(ecom.defaultConversionPercent).toBe(20);
    expect(ecom.defaultLossFactor).toBe(0.5);

    // 3. Experts & education (12%, lossFactor 0.42)
    const experts = getNichePresetById('experts-edu');
    expect(experts.defaultConversionPercent).toBe(12);
    expect(experts.defaultLossFactor).toBe(0.42);
    const resExperts = calculateRevenueRisk({
      leadsPerMonth: 100,
      lateSharePercent: 50,
      conversionPercent: experts.defaultConversionPercent,
      avgCheck: 10000,
      lossFactor: experts.defaultLossFactor,
    });
    // lateLeads = 50, risk/mo = 50 * 0.12 * 10000 = 60 000, recoverable = 60000 * 0.58 = 34 800
    expect(resExperts.revenueAtRiskMax).toBeCloseTo(60000, 5);
    expect(resExperts.recoverableRevenue).toBeCloseTo(34800, 5);
    expect(resExperts.costPerMissedDialog).toBeCloseTo(1200, 5);

    // 4. B2B & complex services (8%, lossFactor 0.37)
    const b2b = getNichePresetById('b2b-services');
    expect(b2b.defaultConversionPercent).toBe(8);
    expect(b2b.defaultLossFactor).toBe(0.37);
    const resB2B = calculateRevenueRisk({
      leadsPerMonth: 50,
      lateSharePercent: 40,
      conversionPercent: b2b.defaultConversionPercent,
      avgCheck: 50000,
      lossFactor: b2b.defaultLossFactor,
    });
    // lateLeads = 20, risk/mo = 20 * 0.08 * 50000 = 80 000, recoverable = 80000 * 0.63 = 50 400
    expect(resB2B.revenueAtRiskMax).toBeCloseTo(80000, 5);
    expect(resB2B.recoverableRevenue).toBeCloseTo(50400, 5);
    expect(resB2B.costPerMissedDialog).toBeCloseTo(4000, 5);
  });

  it('turns a 70% recovery share into the stored 30% loss and returns 70% of the money at risk', () => {
    const lossFactor = lossFactorFromRecoveryPercent(70);
    expect(lossFactor).toBeCloseTo(0.3, 5);
    expect(recoveryPercentFromLossFactor(lossFactor)).toBe(70);
    const res = calculateRevenueRisk({
      leadsPerMonth: 100,
      lateSharePercent: 35,
      conversionPercent: 20,
      avgCheck: 4500,
      lossFactor,
    });
    expect(res.revenueAtRiskMax).toBeCloseTo(31500, 5);
    expect(res.recoverableRevenue).toBeCloseTo(22050, 5);
    expect(Number.isNaN(res.recoverableRevenue)).toBe(false);
    expect(recoveryPercentFromLossFactor(0.3)).toBe(70);
    expect(recoveryPercentFromLossFactor(Number.NaN)).toBe(70);
  });

  it('uses the visible 30% default as a 70% recovery and lets a preset value be overridden', () => {
    expect(DEFAULT_LOSS_FACTOR_PERCENT).toBe(30);
    expect(lossFactorFromPercent(30)).toBeCloseTo(0.3, 5);
    expect(lossFactorFromPercent(Number.NaN)).toBeCloseTo(DEFAULT_LOSS_FACTOR, 5);

    const baseline = calculateRevenueRisk({
      leadsPerMonth: 100,
      lateSharePercent: 35,
      conversionPercent: 20,
      avgCheck: 4500,
      lossFactor: lossFactorFromPercent(DEFAULT_LOSS_FACTOR_PERCENT),
    });
    expect(baseline.revenueAtRiskMax).toBeCloseTo(31500, 5);
    expect(baseline.recoverableRevenue).toBeCloseTo(31500 * 0.7, 5);

    expect(lossFactorFromPercent(50)).toBeCloseTo(0.5, 5);
    expect(lossFactorFromPercent(42)).toBeCloseTo(0.42, 5);
    expect(lossFactorFromPercent(37)).toBeCloseTo(0.37, 5);

    const overridden = calculateRevenueRisk({
      leadsPerMonth: 100,
      lateSharePercent: 35,
      conversionPercent: 30,
      avgCheck: 4500,
      lossFactor: lossFactorFromPercent(10),
    });
    expect(overridden.normalizedInput.lossFactor).toBeCloseTo(0.1, 5);
    expect(overridden.recoverableRevenue).toBeCloseTo(
      overridden.revenueAtRiskMax * 0.9,
      5,
    );
  });

  it('uses DEFAULT_LOSS_FACTOR when lossFactor is omitted', () => {
    const res = calculateRevenueRisk({
      leadsPerMonth: REVENUE_RISK_DEFAULTS.leadsPerMonth,
      lateSharePercent: 50,
      conversionPercent: 10,
      avgCheck: 1000,
    });
    expect(res.normalizedInput.lossFactor).toBe(DEFAULT_LOSS_FACTOR);
    expect(res.revenueAtRiskMax).toBeCloseTo(5000, 5);
    expect(res.recoverableRevenue).toBeCloseTo(5000 * (1 - DEFAULT_LOSS_FACTOR), 5);
  });
});

describe('calculateRevenueRisk — zero, boundary & degenerate inputs', () => {
  it('returns zero risk when leads, late share, conversion, or avgCheck is 0', () => {
    expect(
      calculateRevenueRisk({
        leadsPerMonth: 0,
        lateSharePercent: 35,
        conversionPercent: 20,
        avgCheck: 4500,
      }).revenueAtRiskMax,
    ).toBe(0);

    const zeroLate = calculateRevenueRisk({
      leadsPerMonth: 100,
      lateSharePercent: 0,
      conversionPercent: 20,
      avgCheck: 4500,
    });
    expect(zeroLate.revenueAtRiskMax).toBe(0);
    // Trigger metric still reflects single dialog value even if late share is 0%
    expect(zeroLate.costPerMissedDialog).toBe(900);

    expect(
      calculateRevenueRisk({
        leadsPerMonth: 100,
        lateSharePercent: 35,
        conversionPercent: 0,
        avgCheck: 4500,
      }).costPerMissedDialog,
    ).toBe(0);
  });

  it('handles 100% boundaries and lossFactor 0 / 1', () => {
    const fullLoss = calculateRevenueRisk({
      leadsPerMonth: 100,
      lateSharePercent: 100,
      conversionPercent: 100,
      avgCheck: 1000,
      lossFactor: 1,
    });
    expect(fullLoss.lateLeads).toBe(100);
    expect(fullLoss.revenueAtRiskMax).toBe(100000);
    expect(fullLoss.recoverableRevenue).toBe(0);

    const fullRecovery = calculateRevenueRisk({
      leadsPerMonth: 100,
      lateSharePercent: 100,
      conversionPercent: 100,
      avgCheck: 1000,
      lossFactor: 0,
    });
    expect(fullRecovery.recoverableRevenue).toBe(100000);
  });

  it('clamps negative numbers, >100% percentages, NaN, and Infinity safely', () => {
    const degenerate = calculateRevenueRisk({
      leadsPerMonth: -50,
      lateSharePercent: 250,
      conversionPercent: -10,
      avgCheck: Number.NaN,
      lossFactor: Number.POSITIVE_INFINITY,
    });

    expect(degenerate.normalizedInput.leadsPerMonth).toBe(0);
    expect(degenerate.normalizedInput.lateSharePercent).toBe(100);
    expect(degenerate.normalizedInput.conversionPercent).toBe(0);
    expect(degenerate.normalizedInput.avgCheck).toBe(0);
    expect(degenerate.normalizedInput.lossFactor).toBe(DEFAULT_LOSS_FACTOR);
    expect(degenerate.revenueAtRiskMax).toBe(0);
    expect(degenerate.revenueAtRiskPerYear).toBe(0);
    expect(degenerate.recoverableRevenue).toBe(0);
    expect(degenerate.costPerMissedDialog).toBe(0);
  });
});

describe('validateRevenueRiskDraft — form validation rules', () => {
  it('accepts valid custom and preset drafts', () => {
    expect(
      validateRevenueRiskDraft({
        leadsPerMonthRaw: '100',
        lateSharePercentRaw: '35',
        conversionPercentRaw: '20',
        avgCheckRaw: '4500',
        lossFactorPercentRaw: '30',
        mode: 'custom',
      }).isValid,
    ).toBe(true);

    expect(
      validateRevenueRiskDraft({
        leadsPerMonthRaw: '0',
        lateSharePercentRaw: '0',
        conversionPercentRaw: '30',
        avgCheckRaw: '0',
        lossFactorPercentRaw: '50',
        mode: 'preset',
      }).isValid,
    ).toBe(true);
  });

  it('reports field-specific Russian errors for empty, negative, or out-of-range inputs', () => {
    const emptyRes = validateRevenueRiskDraft({
      leadsPerMonthRaw: '   ',
      lateSharePercentRaw: '',
      conversionPercentRaw: '',
      avgCheckRaw: '',
      lossFactorPercentRaw: '',
      mode: 'custom',
    });
    expect(emptyRes.isValid).toBe(false);
    expect(emptyRes.errors.leadsPerMonth).toBeDefined();
    expect(emptyRes.errors.lateSharePercent).toBeDefined();
    expect(emptyRes.errors.conversionPercent).toBeDefined();
    expect(emptyRes.errors.avgCheck).toBeDefined();
    expect(emptyRes.errors.lossFactorPercent).toBeDefined();

    const outOfBounds = validateRevenueRiskDraft({
      leadsPerMonthRaw: '-5',
      lateSharePercentRaw: '120',
      conversionPercentRaw: '98',
      avgCheckRaw: '-100',
      lossFactorPercentRaw: '140',
      mode: 'custom',
    });
    expect(outOfBounds.isValid).toBe(false);
    expect(outOfBounds.errors.leadsPerMonth).toContain('отрицательным');
    expect(outOfBounds.errors.lateSharePercent).toContain('от 0 до 100%');
    expect(outOfBounds.errors.conversionPercent).toContain('от 1% до 95%');
    expect(outOfBounds.errors.avgCheck).toContain('отрицательным');
    expect(outOfBounds.errors.lossFactorPercent).toContain('от 0 до 100%');
  });
});
