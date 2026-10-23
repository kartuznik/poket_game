import { describe, expect, it } from 'vitest';
import type { ReportSources } from './summary';
import { buildEfimReport, buildReportCsv } from './export';
import { buildFinalSummary } from './summary';

const sources: ReportSources = {
  revenue: {
    toolId: 'revenue-risk',
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
    updatedAt: 1,
  },
  routine: null,
  priority: null,
  readiness: {
    toolId: 'readiness-check',
    inputs: {
      repeated: 'yes',
      rules: 'partial',
      'one-path': 'no',
      'one-place': 'no',
      faq: 'no',
      numbers: 'no',
      owner: 'no',
      channel: 'no',
      time: 'no',
    },
    results: {
      score: 1.5,
      band: 'early',
      bandLabel: 'Рано',
      unclosedTitles: ['Правила ответа', 'Один сценарий'],
    },
    updatedAt: 1,
  },
};

describe('report export', () => {
  it('writes a note for Efim from the same summary', () => {
    const text = buildEfimReport(sources);
    expect(text.startsWith('Игра в бизнес — сводка для Ефима')).toBe(true);
    expect(text).toContain(buildFinalSummary(sources).lead);
    expect(text).toContain('Рано');
    expect(buildEfimReport({ revenue: null, routine: null, priority: null, readiness: null })).toContain(
      'Заполните хотя бы один инструмент',
    );
  });

  it('builds a UTF-8 CSV with Cyrillic and a quoted list', () => {
    const csv = buildReportCsv(sources);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Выручка;Риск в месяц, ₽;31500');
    expect(csv).toContain('Готовность;Вердикт;Рано');
    expect(csv).toContain('"Правила ответа; Один сценарий"');
    expect(csv).toContain('Понятно, что отвечать в типовых ситуациях;Частично');
  });

  it('leaves money blank when the routine rate is empty', () => {
    const csv = buildReportCsv({
      revenue: null,
      priority: null,
      readiness: null,
      routine: {
        toolId: 'routine-calc',
        inputs: {
          presetId: null,
          operationsPerWeek: 0,
          minutesPerOperation: 0,
          hourlyRate: null,
          automationSharePercent: 0,
        },
        results: {
          hoursPerMonth: 0,
          workDaysPerYear: 0,
          savedHoursPerMonth: 0,
          savedWorkDaysPerYear: 0,
          savedMoneyPerMonth: null,
        },
        updatedAt: 1,
      },
    });
    expect(csv).toContain('Рутина;Экономия, ₽/мес;');
    expect(csv).toContain('Рутина;Часов в месяц;0');
  });
});
