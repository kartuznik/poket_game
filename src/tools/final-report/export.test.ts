import { describe, expect, it } from 'vitest';
import type { PriorityProcessId } from '../../lib/types';
import { PRIORITY_PROCESSES } from '../priority-diag/calc';
import type { ReportSources } from './summary';
import { buildEfimReport, buildReportCsv, reportCsvFilename } from './export';
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
    expect(text.startsWith('Риск выручки:')).toBe(true);
    expect(text).toContain('• Правила ответа');
    expect(text).toContain('• Один сценарий');
    expect(text).toContain(buildFinalSummary(sources).lead);
    expect(text).not.toContain('Рано');
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
    expect(csv).toContain('Выручка;Ниша;своя');
    const nicheLine = buildReportCsv(sources, [], 1, 'school')
      .split('\r\n')
      .find((line) => line.startsWith('Выручка;Ниша;'));
    expect(nicheLine?.split(';')).toEqual(['Выручка', 'Ниша', 'Онлайн-школа и коуч']);
    expect(csv).toContain('Выручка;Итого риск, ₽;31500');
    expect(csv).toContain('Выручка;Можно вернуть, ₽;22050');
    expect(csv).toContain('Готовность;Баллы;1,5');
    expect(csv).not.toContain('Итого баллов');
    expect(csv).toContain('Выручка;Коридор от, ₽;');
    expect(csv).toContain('Выручка;Коридор до, ₽;');
    expect(csv).toContain('Выручка;Насколько вы уверены в цифрах;');
    expect(csv).toContain('доля возврата — наугад');
    expect(csv).not.toContain('Покрытие ботом');
    expect(csv).toContain('Готовность;Вердикт;Рано');
    expect(csv).toContain('"Правила ответа; Один сценарий"');
    expect(csv).toContain('Готовность;Понятно, что отвечать в типовых ситуациях;Частично');
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
    expect(mainRisk).toContain('Выручка;Итого риск, ₽;31500');
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
    expect(csv).toContain('Рутина;Итого экономия, ₽/мес;');
    expect(csv).not.toContain('Ниша');
    expect(csv).toContain('Рутина;Часов в месяц;0');
    expect(csv).not.toContain('Итого часов');
  });

  it('prints the meta stamp in Moscow time and keeps each priority once', () => {
    const stamp = Date.parse('2026-10-31T11:32:00Z');
    const ranking = PRIORITY_PROCESSES.map((process, index) => ({
      id: process.id,
      title: process.title,
      score: index === 0 ? 5 : 1,
    }));
    const inputs = Object.fromEntries(
      PRIORITY_PROCESSES.map((process) => [process.id, { frequency: 5, time: 4, errorCost: 3 }]),
    ) as Record<PriorityProcessId, { frequency: number; time: number; errorCost: number }>;
    const full: ReportSources = {
      ...sources,
      routine: {
        toolId: 'routine-calc',
        inputs: {
          presetId: null,
          operationsPerWeek: 4,
          minutesPerOperation: 15,
          hourlyRate: 500,
          automationSharePercent: 40,
        },
        results: {
          hoursPerMonth: 1.08,
          workDaysPerYear: 2,
          savedHoursPerMonth: 0.4,
          savedWorkDaysPerYear: 1,
          savedMoneyPerMonth: 5400,
        },
        updatedAt: 1,
      },
      priority: {
        toolId: 'priority-diag',
        inputs,
        results: {
          topProcessId: 'inquiries',
          topTitle: 'Приём обращений',
          topScore: 5,
          tied: false,
          ranking,
        },
        updatedAt: 1,
      },
    };
    const csv = buildReportCsv(full, [], stamp);
    expect(csv).toContain('# Сгенерировано: 31 октября 2026, 14:32');
    expect(csv).toContain('Выручка;Итого риск, ₽;31500');
    expect(csv).toContain('Рутина;Часов в месяц;1,08');
    expect(csv).not.toContain('Итого часов');
    expect(reportCsvFilename(stamp)).toBe('business-game-report-2026-10-31.csv');
    expect(reportCsvFilename(Date.parse('2026-10-31T21:30:00Z'))).toBe(
      'business-game-report-2026-11-01.csv',
    );
    const precise = buildReportCsv(
      {
        ...sources,
        revenue: {
          ...sources.revenue!,
          uncertainty: {
            leads: 'precise',
            lateShare: 'precise',
            conversion: 'precise',
            check: 'precise',
            recoveryShare: 'precise',
          },
        },
      },
      [],
      stamp,
    );
    expect(precise).toContain('Выручка;Точка (все входы точные);22050');
    expect(precise).not.toContain('Коридор от');
    expect(precise).not.toContain('Коридор до');
    expect(csv).toContain('Готовность;Баллы;1,5');
    expect(csv).not.toContain('Итого баллов');
    expect(csv).not.toContain('---История изменений---');
    expect(csv).toContain('Приоритет;Приём обращений, балл;5');
    expect(csv).not.toContain('Процесс №');
    expect(csv).not.toContain('Детализация');
    expect(csv).not.toContain('Оплата');
    expect(csv).toContain('Приоритет;Приём обращений — частота;5');
    expect(csv).toContain('Приоритет;Приём обращений — время;4');
    expect(csv).toContain('Приоритет;Приём обращений — цена ошибки;3');
    const now = 40 * 86_400_000;
    const compared = buildReportCsv(
      full,
      [
        {
          savedAt: now - 30 * 86_400_000,
          revenueAtRiskPerMonth: 15000,
          routineHoursPerMonth: 2,
          readinessScore: 1,
        },
      ],
      now,
    );
    const history = (compared.split('---История изменений---')[1] ?? '').trim().split('\r\n');
    expect(history[0]).toBe('Раздел;Показатель;Значение;Предыдущее;Изменение');
    expect(history.slice(1).every((row) => row.split(';').length === 5)).toBe(true);
    expect(compared).toContain('Готовность;Баллы;1,5;1;+50%');
  });

  it('writes a percent that rounds to zero as 0', () => {
    const now = 40 * 86_400_000;
    const csv = buildReportCsv(
      sources,
      [
        {
          savedAt: now - 30 * 86_400_000,
          revenueAtRiskPerMonth: 31626,
          routineHoursPerMonth: null,
          readinessScore: null,
        },
      ],
      now,
    );
    expect(csv).toContain('Выручка;Риск в месяц, ₽;31500;31626;0');
    const history = csv.split('---История изменений---')[1] ?? '';
    expect(history).not.toContain('0%');
  });
});
