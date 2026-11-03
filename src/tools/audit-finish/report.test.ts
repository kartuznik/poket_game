import { describe, expect, it } from 'vitest';
import { renderAuditFinish } from './view';
import {
  TELEGRAM_PROFILE_URL,
  THREADS_PROFILE_URL,
  buildAuditHandoff,
  buildRecommendations,
  buildTelegramSummary,
} from './report';
import type { ReadinessBridgeSnapshot, RoutineBridgeSnapshot } from '../../lib/types';
import { QUIET_TEXT, composePriorityResults } from '../priority-diag/calc';
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
    expect(text.startsWith('Риск выручки:')).toBe(true);
    expect(text).not.toContain('Имя:');
    expect(text).not.toContain('Telegram:');
    expect(text).not.toContain('Телефон:');
    expect(text).toContain('Можно вернуть:');
    expect(text).not.toContain('Потенциал');
    expect(text).toContain('Что сделать на этой неделе');
    expect(text).not.toContain('Повторить замер до');
    expect(text).not.toContain('Что сделать дальше');
    expect(text).not.toContain('За 30 дней');
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
    expect(text).not.toContain('Что сделать на этой неделе');
    expect(text).not.toContain('Повторить замер');
  });

  it('adds the progress sentence when a snapshot is at least a day old', () => {
    const now = 40 * 86_400_000;
    const text = buildAuditHandoff(
      sources,
      [
        {
          savedAt: now - 30 * 86_400_000,
          revenueAtRiskPerMonth: 35000,
          routineHoursPerMonth: null,
          readinessScore: null,
        },
      ],
      now,
    );
    expect(text).toContain('За 30 дней: риск выручки −10%');
    expect(text).not.toContain('без изменений');
  });
});

const routine: RoutineBridgeSnapshot = {
  toolId: 'routine-calc',
  updatedAt: 1,
  inputs: {
    presetId: 'answers',
    operationsPerWeek: 40,
    minutesPerOperation: 6,
    hourlyRate: 500,
    automationSharePercent: 70,
  },
  results: {
    hoursPerMonth: 17.32,
    workDaysPerYear: 25.98,
    savedHoursPerMonth: 12.12,
    savedWorkDaysPerYear: 18.18,
    savedMoneyPerMonth: 6060,
  },
};

const readiness: ReadinessBridgeSnapshot = {
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
};

describe('share destinations', () => {
  it('opens Telegram at @kartuznik and Threads at @_kartuzzz', () => {
    expect(TELEGRAM_PROFILE_URL).toBe('https://t.me/kartuznik');
    expect(THREADS_PROFILE_URL).toBe('https://www.threads.com/@_kartuzzz');
    expect(TELEGRAM_PROFILE_URL).not.toContain('_kartuzzz');
    expect(THREADS_PROFILE_URL).not.toContain('t.me');

    const source = renderAuditFinish.toString();
    const openedBy = (button: string): string => {
      const start = source.indexOf(`${button}.addEventListener`);
      const openAt = source.indexOf('window.open(', start);
      const end = source.indexOf(')', openAt);
      const call = source.slice(openAt, end);
      const name = call.match(/\.([A-Z0-9_]+)/);
      return name?.[1] ?? '';
    };
    expect(openedBy('telegramBtn')).toBe('TELEGRAM_PROFILE_URL');
    expect(openedBy('copyBtn')).toBe('THREADS_PROFILE_URL');
    expect(source).not.toContain('t.me/_kartuzzz');
    expect(source).not.toContain('threads.com/@kartuznik');
  });
});

describe('telegram summary', () => {
  it('stays within six lines for one, two, three and four confirmed tools', () => {
    const one = buildTelegramSummary({ revenue, routine: null, priority: null, readiness: null });
    const two = buildTelegramSummary({ revenue, routine, priority: null, readiness: null });
    const three = buildTelegramSummary({ revenue, routine, priority, readiness: null });
    const four = buildTelegramSummary({ revenue, routine, priority, readiness });
    expect(one.split('\n')).toHaveLength(2);
    expect(two.split('\n')).toHaveLength(3);
    expect(three.split('\n')).toHaveLength(4);
    expect(four.split('\n')).toHaveLength(5);
    for (const text of [one, two, three, four]) {
      expect(text.split('\n').length).toBeLessThanOrEqual(6);
      expect(text).toContain('https://kartuznik.github.io/poket_game/');
      expect(text).not.toContain('Что сделать на этой неделе');
      expect(text.startsWith('Риск выручки:')).toBe(true);
      expect(text).not.toContain('Игра в бизнес');
    }
    expect(one).toContain('Можно вернуть:');
    expect(one).not.toContain('Ручная работа:');
    expect(two).toContain('Ручная работа:');
    expect(two).not.toContain('Первым:');
    expect(three).toContain('Первым: Приём обращений');
    const quietInputs = {
      inquiries: { frequency: 1, time: 1, errorCost: 1 },
      answers: { frequency: 1, time: 1, errorCost: 1 },
      booking: { frequency: 1, time: 1, errorCost: 1 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    };
    const quiet = buildTelegramSummary({
      revenue: null,
      routine: null,
      priority: {
        ...priority,
        inputs: quietInputs,
        results: composePriorityResults(quietInputs, null, { revenue: null, routine: null }, []),
      },
      readiness: null,
    });
    expect(quiet.split('\n').length).toBeLessThanOrEqual(6);
    expect(quiet.startsWith(QUIET_TEXT)).toBe(true);
    expect(quiet).not.toContain('Первым');
    expect(quiet).not.toContain('Заполните хотя бы один инструмент');
    expect(three).not.toContain('Чек-лист:');
    expect(four).toContain('Чек-лист: Можно начинать');
  });
});
