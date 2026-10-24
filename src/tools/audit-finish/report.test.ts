import { describe, expect, it } from 'vitest';
import { buildAuditHandoff, buildRecommendations } from './report';
import type { ReportSources } from '../final-report/summary';
import type {
  PriorityBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
} from '../../lib/types';

const revenue: RevenueRiskBridgeSnapshot = {
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
};

const priority: PriorityBridgeSnapshot = {
  toolId: 'priority-diag',
  updatedAt: 1,
  inputs: {
    inquiries: { frequency: 5, time: 4, errorCost: 5 },
    answers: { frequency: 5, time: 3, errorCost: 4 },
    booking: { frequency: 4, time: 3, errorCost: 4 },
    payment: { frequency: 3, time: 2, errorCost: 5 },
    reminders: { frequency: 3, time: 2, errorCost: 3 },
    reports: { frequency: 2, time: 4, errorCost: 2 },
  },
  results: {
    topProcessId: 'inquiries',
    topTitle: 'Приём обращений',
    topScore: 4.7,
    tied: false,
    ranking: [],
  },
};

const sources: ReportSources = {
  revenue,
  routine: null,
  priority,
  readiness: null,
};

describe('audit handoff', () => {
  it('builds at most three recommendations from confirmed tools only', () => {
    const items = buildRecommendations(sources);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Приём обращений');
    expect(items[1]).toContain('31');
    expect(items.join(' ')).not.toContain('рутин');
  });

  it('puts the confirmed numbers into the copied text and leaves contacts out', () => {
    const text = buildAuditHandoff(sources);
    expect(text.startsWith('Игра в бизнес — отчёт для Ефима')).toBe(true);
    expect(text).not.toContain('Имя:');
    expect(text).not.toContain('Telegram:');
    expect(text).not.toContain('Телефон:');
    expect(text).toContain('Потенциал возврата');
    expect(text).toContain('Что сделать дальше');
    expect(text).toContain('https://kartuznik.github.io/poket_game/');
    expect(text).not.toContain('Готовность');
  });

  it('keeps an unfinished path out of the summary', () => {
    const text = buildAuditHandoff({
      revenue: null,
      routine: null,
      priority: null,
      readiness: null,
    });
    expect(text).toContain('Заполните хотя бы один инструмент');
    expect(text).not.toContain('Имя:');
    expect(text).not.toContain('Что сделать дальше');
  });
});
