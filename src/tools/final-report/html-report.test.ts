import { describe, expect, it } from 'vitest';
import { emptyDossier, type MetricSnapshot } from '../../lib/dossier';
import { formatRubles } from '../../lib/format';
import { buildHtmlReport } from './html-report';
import type { ReportSources } from './summary';

const DAY = 86_400_000;

function visit(history: readonly MetricSnapshot[] = []): ReturnType<typeof emptyDossier> {
  const now = Date.parse('2026-10-31T11:32:00Z');
  const sources: ReportSources = {
    revenue: {
      toolId: 'revenue-risk',
      updatedAt: 1,
      inputs: {
        leadsPerMonth: 100,
        lateSharePercent: 35,
        conversionPercent: 20,
        avgCheck: 4500,
        lossFactor: 0.3,
        mode: 'custom',
      },
      results: {
        lateLeads: 35,
        revenueAtRiskMax: 31500,
        recoverableRevenue: 22050,
        revenueAtRiskPerYear: 378000,
        costPerMissedDialog: 900,
      },
      botCoverage: 0.7,
    },
    routine: {
      toolId: 'routine-calc',
      updatedAt: 1,
      inputs: {
        presetId: null,
        operationsPerWeek: 4,
        minutesPerOperation: 15,
        hourlyRate: 500,
        automationSharePercent: 40,
      },
      results: {
        hoursPerMonth: 86.6,
        workDaysPerYear: 20,
        savedHoursPerMonth: 10,
        savedWorkDaysPerYear: 2,
        savedMoneyPerMonth: 5000,
      },
    },
    priority: {
      toolId: 'priority-diag',
      updatedAt: 1,
      inputs: {
        inquiries: { frequency: 5, time: 5, errorCost: 5 },
        answers: { frequency: 4, time: 4, errorCost: 4 },
        booking: { frequency: 3, time: 3, errorCost: 3 },
        payment: { frequency: 1, time: 1, errorCost: 1 },
        reminders: { frequency: 2, time: 2, errorCost: 2 },
        reports: { frequency: 2, time: 2, errorCost: 2 },
      },
      results: {
        topProcessId: 'inquiries',
        topTitle: 'Приём обращений',
        topScore: 5,
        tied: false,
        ranking: [
          { id: 'inquiries', title: 'Приём обращений', score: 5 },
          { id: 'answers', title: 'Ответы на вопросы', score: 4 },
          { id: 'booking', title: 'Запись и заказы', score: 3 },
        ],
      },
    },
    readiness: {
      toolId: 'readiness-check',
      updatedAt: 1,
      inputs: {
        repeated: 'yes',
        rules: 'yes',
        'one-path': 'yes',
        'one-place': 'yes',
        faq: 'yes',
        numbers: 'yes',
        owner: 'yes',
        channel: 'yes',
        time: 'yes',
      },
      results: { score: 9, band: 'ready', bandLabel: 'Можно начинать', unclosedTitles: [] },
    },
  };
  return {
    ...emptyDossier(now),
    ...sources,
    history,
  };
}

describe('html report', () => {
  it('is a self-contained page with the four headline numbers', () => {
    const html = buildHtmlReport(visit(), Date.parse('2026-10-31T11:32:00Z'));
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('>Риск<');
    expect(html).toContain('>Потенциал<');
    expect(html).toContain('>Часы<');
    expect(html).toContain('>Готовность<');
    expect(html).toContain(formatRubles(31500));
    expect(html).toContain(formatRubles(22050));
    expect(html).toContain('Можно начинать');
    expect(html).toContain('Приём обращений');
    expect(html).toContain('Что сделать на этой неделе');
    expect(html).not.toContain('<svg');
    expect(new TextEncoder().encode(html).byteLength).toBeLessThanOrEqual(50 * 1024);
    const urls = html.match(/https?:\/\/[^\s"'<]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(new URL(url).hostname).toBe('kartuznik.github.io');
  });

  it('draws the sparkline only after three comparable points', () => {
    const now = Date.parse('2026-10-31T11:32:00Z');
    const scored = visit([
      {
        savedAt: now - 60 * DAY,
        revenueAtRiskPerMonth: 50000,
        routineHoursPerMonth: 100,
        readinessScore: 4,
      },
      {
        savedAt: now - 30 * DAY,
        revenueAtRiskPerMonth: 40000,
        routineHoursPerMonth: 90,
        readinessScore: 6,
      },
      {
        savedAt: now,
        revenueAtRiskPerMonth: 31500,
        routineHoursPerMonth: 86.6,
        readinessScore: 9,
      },
    ]);
    const html = buildHtmlReport(scored, now);
    expect(html).toContain('<svg');
    expect(html).toContain('Ваш прогресс');
    expect(html).toContain('За 30 дней');
    expect(new TextEncoder().encode(html).byteLength).toBeLessThanOrEqual(50 * 1024);
  });
});
