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
    expect(text.startsWith('Игра в бизнес — отчёт для Ефима')).toBe(true);
    expect(text).toContain('• Правила ответа');
    expect(text).toContain('• Один сценарий');
    expect(text).toContain(buildFinalSummary(sources).lead);
    expect(text).toContain('Рано');
    expect(text).toContain('https://kartuznik.github.io/poket_game/');
    expect(buildEfimReport({ revenue: null, routine: null, priority: null, readiness: null })).toContain(
      'Заполните хотя бы один инструмент',
    );
  });

  it('builds a UTF-8 CSV with Cyrillic and a quoted list', () => {
    const csv = buildReportCsv(sources);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('# Игра в бизнес · Бизнес-аудит');
    expect(lines[1]?.startsWith('# Сгенерировано: ')).toBe(true);
    expect(lines[2]).toBe('# https://kartuznik.github.io/poket_game/');
    expect(csv).toContain('Раздел;Показатель;Значение');
    expect(csv).not.toContain('Предыдущее');
    expect(csv).not.toContain('Изменение');
    expect(csv).toContain('Итого риск, ₽;31500');
    expect(csv).toContain('Итого потенциал, ₽;22050');
    expect(csv).toContain('Итого баллов;1,5');
    expect(csv).toContain('Коридор от, ₽;');
    expect(csv).toContain('Профиль точности;');
    expect(csv).toContain('доля возврата — наугад');
    expect(csv).not.toContain('Покрытие ботом');
    expect(csv).toContain('Вердикт;Рано');
    expect(csv).toContain('"Правила ответа; Один сценарий"');
    expect(csv).toContain('Понятно, что отвечать в типовых ситуациях;Частично');
    expect(csv).toContain('Что сделать на этой неделе');
    expect(csv).not.toContain('---История изменений---');
    expect(csv).not.toContain('Контакты;');
    const now = 40 * 86_400_000;
    const compared = buildReportCsv(
      sources,
      [
        {
          savedAt: now - 30 * 86_400_000,
          revenueAtRiskPerMonth: 15000,
          routineHoursPerMonth: null,
          readinessScore: null,
        },
      ],
      now,
    );
    expect(compared).toContain('---История изменений---');
    expect(compared).toContain('Раздел;Показатель;Значение;Предыдущее;Изменение');
    expect(compared).toContain('Выручка;Риск в месяц, ₽;31500;15000;+110%');
    expect(compared).not.toContain('Рутина;Часов в месяц;');
    const mainRisk = compared.split('---История изменений---')[0] ?? '';
    expect(mainRisk).toContain('Итого риск, ₽;31500');
    expect(mainRisk).not.toContain('Предыдущее');
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
    expect(csv).toContain('Итого экономия, ₽/мес;');
    expect(csv).toContain('Итого часов в месяц;0');
  });
});
