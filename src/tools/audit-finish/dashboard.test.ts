import { describe, expect, it } from 'vitest';
import type { ReportSources } from '../final-report/summary';
import type { ReadinessBridgeSnapshot, RevenueRiskBridgeSnapshot, RoutineBridgeSnapshot } from '../../lib/types';
import { formatWorkHours } from '../../lib/format';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDashboard } from './dashboard';

const revenue = (risk: number): RevenueRiskBridgeSnapshot => ({
  toolId: 'revenue-risk',
  updatedAt: 1,
  inputs: {
    leadsPerMonth: 100,
    lateSharePercent: 10,
    conversionPercent: 20,
    avgCheck: 500,
    lossFactor: 0.5,
    mode: 'custom',
  },
  results: {
    lateLeads: 10,
    revenueAtRiskMax: risk,
    recoverableRevenue: risk / 2,
    revenueAtRiskPerYear: risk * 12,
    costPerMissedDialog: 100,
  },
});

const routine = (hours: number): RoutineBridgeSnapshot => ({
  toolId: 'routine-calc',
  updatedAt: 1,
  inputs: {
    presetId: null,
    operationsPerWeek: 10,
    minutesPerOperation: 10,
    hourlyRate: null,
    automationSharePercent: 50,
  },
  results: {
    hoursPerMonth: hours,
    workDaysPerYear: 1,
    savedHoursPerMonth: 1,
    savedWorkDaysPerYear: 1,
    savedMoneyPerMonth: null,
  },
});

const readiness = (score: number, bandLabel: string): ReadinessBridgeSnapshot => ({
  toolId: 'readiness-check',
  updatedAt: 1,
  inputs: {
    repeated: 'yes',
    rules: 'partial',
    'one-path': 'yes',
    'one-place': 'yes',
    faq: 'yes',
    numbers: 'yes',
    owner: 'yes',
    channel: 'yes',
    time: 'yes',
  },
  results: { score, band: 'gaps', bandLabel, unclosedTitles: [] },
});

const empty: ReportSources = { revenue: null, routine: null, priority: null, readiness: null };

describe('buildDashboard', () => {
  it('shows an em dash when a tool is not confirmed', () => {
    const cards = buildDashboard(empty);
    expect(cards.map((card) => card.value)).toEqual(['—', '—', '—', '—']);
    expect(cards.every((card) => card.note === 'не замерено')).toBe(true);
  });

  it('formats a half-point readiness score with its verdict', () => {
    const cards = buildDashboard({
      ...empty,
      revenue: revenue(7800),
      routine: routine(1.08),
      readiness: readiness(4.5, 'Есть пробелы'),
    });
    expect(cards[0]?.value).toBe('7\u00A0800\u00A0₽');
    expect(cards[1]?.value).toBe('3\u00A0900\u00A0₽');
    expect(cards[2]?.value).toBe(formatWorkHours(1.08));
    expect(cards[3]?.value).toBe('4,5/9');
    expect(cards[3]?.note).toBe('Есть пробелы');
  });

  it('uses the approved short labels and keeps the hour unit on the tile', () => {
    const cards = buildDashboard({
      ...empty,
      revenue: revenue(3150),
      routine: routine(30.3),
      readiness: readiness(6.5, 'Закройте пробелы'),
    });
    expect(cards.map((card) => card.label)).toEqual([
      'Риск за мес',
      'Вернуть за мес',
      'Ручная работа',
      'Чек-лист',
    ]);
    expect(cards[2]?.value).toBe('30,3\u00A0часа');
    expect(cards[2]?.value).toBe(formatWorkHours(30.3));
    expect(cards[0]?.value).toContain('₽');
    expect(cards[1]?.value).toContain('₽');
    const view = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './view.ts'), 'utf8');
    const tile = view.slice(view.indexOf('finish-dashboard__grid'), view.indexOf('finish-dashboard__scenario'));
    expect(tile).not.toContain('dashboardHoursTileValue');
    expect(tile).toContain('value.textContent = item.value');
    expect(tile).toContain('finish-card__note');
  });
});
