import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME_ID,
  DEFAULT_TOOL_ID,
  ToolBridge,
  buildRouteHash,
  parseRouteState,
  shouldRedrawOnRoute,
} from '../bridge';
import { copyTextToClipboard } from '../clipboard';
import {
  formatCountWithNoun,
  formatDurationMinutes,
  formatIntegerGrouping,
  formatPercent,
  formatRubles,
  formatWorkHours,
  normalizeFiniteNumber,
  pluralize,
} from '../format';
import { createScenarioStore, type KeyValueStorage } from '../storage';
import { formatStubPreview } from '../../tools/stub-factory';

describe('format utilities & pluralization', () => {
  it('normalizes degenerate numbers (NaN, Infinity, -0, strings)', () => {
    expect(normalizeFiniteNumber(Number.NaN, 0)).toBe(0);
    expect(normalizeFiniteNumber(Number.POSITIVE_INFINITY, 10)).toBe(10);
    expect(normalizeFiniteNumber(Number.NEGATIVE_INFINITY, -5)).toBe(-5);
    expect(Object.is(normalizeFiniteNumber(-0), 0)).toBe(true);
    expect(normalizeFiniteNumber('42')).toBe(42);
    expect(normalizeFiniteNumber('not-a-number', 7)).toBe(7);
  });

  it('correctly declines Russian nouns across standard and edge cases', () => {
    const forms = ['обращение', 'обращения', 'обращений'] as const;
    expect(pluralize(0, forms)).toBe('обращений');
    expect(pluralize(1, forms)).toBe('обращение');
    expect(pluralize(2, forms)).toBe('обращения');
    expect(pluralize(4, forms)).toBe('обращения');
    expect(pluralize(5, forms)).toBe('обращений');
    expect(pluralize(11, forms)).toBe('обращений');
    expect(pluralize(14, forms)).toBe('обращений');
    expect(pluralize(21, forms)).toBe('обращение');
    expect(pluralize(22, forms)).toBe('обращения');
    expect(pluralize(25, forms)).toBe('обращений');
    expect(pluralize(111, forms)).toBe('обращений');
    expect(pluralize(-1, forms)).toBe('обращение');
    expect(pluralize(1.5, forms)).toBe('обращения');
    expect(pluralize(Number.NaN, forms)).toBe('обращений');
  });

  it('formats rubles with non-breaking spaces and clamps negative by default', () => {
    expect(formatRubles(0)).toBe('0\u00A0₽');
    expect(formatRubles(-0)).toBe('0\u00A0₽');
    expect(formatRubles(45000)).toBe('45\u00A0000\u00A0₽');
    expect(formatRubles(1234567.4)).toBe('1\u00A0234\u00A0567\u00A0₽');
    expect(formatRubles(-5000)).toBe('0\u00A0₽');
    expect(formatRubles(-5000, { allowNegative: true })).toBe('−5\u00A0000\u00A0₽');
    expect(formatRubles(15000, { showPlusSign: true })).toBe('+15\u00A0000\u00A0₽');
    expect(formatRubles(Number.NaN)).toBe('0\u00A0₽');
    expect(formatRubles(Number.POSITIVE_INFINITY)).toBe('0\u00A0₽');
  });

  it('formats percentages with safe clamping and decimals', () => {
    expect(formatPercent(30)).toBe('30%');
    expect(formatPercent(-15)).toBe('0%');
    expect(formatPercent(240)).toBe('100%');
    expect(formatPercent(12.5, { decimals: 1 })).toBe('12,5%');
    expect(formatPercent(12.0, { decimals: 1 })).toBe('12%');
    expect(formatPercent(Number.NaN)).toBe('0%');
  });

  it('formats duration in minutes and work hours', () => {
    expect(formatDurationMinutes(0)).toBe('0\u00A0минут');
    expect(formatDurationMinutes(-20)).toBe('0\u00A0минут');
    expect(formatDurationMinutes(1)).toBe('1\u00A0минута');
    expect(formatDurationMinutes(45)).toBe('45\u00A0минут');
    expect(formatDurationMinutes(60)).toBe('1\u00A0час');
    expect(formatDurationMinutes(135)).toBe('2\u00A0часа 15\u00A0минут');
    expect(formatDurationMinutes(Number.NaN)).toBe('0\u00A0минут');

    expect(formatWorkHours(5)).toBe('5\u00A0часов');
    expect(formatWorkHours(16, true)).toBe('16\u00A0часов (~2\u00A0рабочих дня)');
    expect(formatWorkHours(20, true)).toBe('20\u00A0часов (~2,5\u00A0рабочих дня)');
  });

  it('formats integer grouping and counts with nouns', () => {
    expect(formatIntegerGrouping(10000)).toBe('10\u00A0000');
    expect(formatCountWithNoun(3, ['день', 'дня', 'дней'])).toBe('3\u00A0дня');
  });
});

describe('clipboard utility with WebView fallback', () => {
  it('uses primary Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const res = await copyTextToClipboard('Итог: 45 000 ₽', 'расчёт выручки', {
      writeText,
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe('clipboard-api');
    expect(res.message).toBe('Скопировано в буфер: расчёт выручки');
    expect(writeText).toHaveBeenCalledWith('Итог: 45 000 ₽');
  });

  it('falls back to execCommand when Clipboard API rejects (e.g. WebView HTTP context)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const execCommandCopy = vi.fn().mockReturnValue(true);

    const res = await copyTextToClipboard('Итог: 12 часов', 'расчёт рутины', {
      writeText,
      execCommandCopy,
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe('exec-command');
    expect(res.message).toBe('Скопировано в буфер: расчёт рутины');
    expect(execCommandCopy).toHaveBeenCalledWith('Итог: 12 часов');
  });

  it('returns clear failure message when both Clipboard API and execCommand fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Blocked'));
    const execCommandCopy = vi.fn().mockReturnValue(false);

    const res = await copyTextToClipboard('Текст', 'сводка диагностики', {
      writeText,
      execCommandCopy,
    });

    expect(res.ok).toBe(false);
    expect(res.method).toBe('failed');
    expect(res.message).toContain('Буфер обмена заблокирован браузером');
    expect(res.message).toContain('сводка диагностики');
  });

  it('rejects empty or whitespace-only text gracefully', async () => {
    const res = await copyTextToClipboard('   ', 'пустой отчёт');
    expect(res.ok).toBe(false);
    expect(res.method).toBe('failed');
    expect(res.message).toContain('пустой текст');
  });
});

describe('local scenario storage with private-mode degradation', () => {
  it('saves, loads, and compares scenarios ("До и после") when storage works', () => {
    const map = new Map<string, string>();
    const mockStorage: KeyValueStorage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    };

    const store = createScenarioStore(() => mockStorage);
    const saved = store.save('revenue-risk', {
      label: 'До автоматизации',
      primaryValue: 60000,
      formattedValue: '60 000 ₽',
      now: 1700000000000,
    });

    expect(saved.persisted).toBe(true);
    expect(store.load('revenue-risk')?.primaryValue).toBe(60000);

    const comparison = store.compare('revenue-risk', 18000, true);
    expect(comparison).not.toBeNull();
    expect(comparison?.delta).toBe(-42000);
    expect(comparison?.deltaPercent).toBe(-70);
    expect(comparison?.direction).toBe('improved');
  });

  it('degrades smoothly to in-memory store when localStorage throws SecurityError or QuotaExceededError', () => {
    const brokenStorage: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError: The operation is insecure.');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };

    const store = createScenarioStore(() => brokenStorage);
    const saved = store.save('routine-calc', {
      label: 'Текущая рутина',
      primaryValue: 24,
      formattedValue: '24 часа',
    });

    expect(saved.persisted).toBe(false);
    // Still works within the current session via memory fallback!
    const loaded = store.load('routine-calc');
    expect(loaded?.primaryValue).toBe(24);

    store.clear('routine-calc');
    expect(store.load('routine-calc')).toBeNull();
  });

  it('handles corrupted JSON in localStorage without crashing', () => {
    const corruptedStorage: KeyValueStorage = {
      getItem: () => '{bad json',
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    const store = createScenarioStore(() => corruptedStorage);
    expect(store.load('readiness-check')).toBeNull();
  });
});

describe('URL routing and cross-tool handoff bridge', () => {
  it('parses toolId and themeId from hash and query strings', () => {
    expect(parseRouteState('', '#routine-calc')).toEqual({
      toolId: 'routine-calc',
      themeId: DEFAULT_THEME_ID,
      step: null,
    });

    expect(parseRouteState('?theme=playful', '#priority-diag')).toEqual({
      toolId: 'priority-diag',
      themeId: 'playful',
      step: null,
    });

    expect(parseRouteState('', '#readiness-check?theme=editorial')).toEqual({
      toolId: 'readiness-check',
      themeId: 'editorial',
      step: null,
    });

    expect(parseRouteState('?tool=unknown&theme=invalid', '#bad-hash')).toEqual({
      toolId: DEFAULT_TOOL_ID,
      themeId: DEFAULT_THEME_ID,
      step: null,
    });

    expect(parseRouteState('', '#revenue-risk?step=2')).toEqual({
      toolId: 'revenue-risk',
      themeId: DEFAULT_THEME_ID,
      step: 2,
    });
    expect(parseRouteState('', '#revenue-risk?step=0').step).toBeNull();
    expect(buildRouteHash('revenue-risk', 'minimal', 2)).toBe('#revenue-risk?step=2');
    expect(buildRouteHash('revenue-risk', 'playful', 3)).toBe(
      '#revenue-risk?theme=playful&step=3',
    );
    expect(buildRouteHash('revenue-risk', 'minimal', 1)).toBe('#revenue-risk');

    expect(buildRouteHash('priority-diag', 'minimal')).toBe('#priority-diag');
    expect(buildRouteHash('priority-diag', 'playful')).toBe(
      '#priority-diag?theme=playful',
    );
    expect(parseRouteState('', '#final-report').toolId).toBe('final-report');
    expect(shouldRedrawOnRoute('revenue-risk', 'final-report')).toBe(true);
    expect(shouldRedrawOnRoute('final-report', 'final-report')).toBe(true);
    expect(shouldRedrawOnRoute('revenue-risk', 'revenue-risk')).toBe(false);
    expect(shouldRedrawOnRoute('revenue-risk', 'revenue-risk', 1, 2)).toBe(true);
  });

  it('passes handoff payload between tools in memory and consumes once', () => {
    const bridge = new ToolBridge();
    const snapshot = bridge.saveRevenueRiskResult({
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
    });

    expect(bridge.getRevenueRiskResult()?.results.revenueAtRiskMax).toBe(31500);
    expect(bridge.getRevenueRiskResult()?.inputs.leadsPerMonth).toBe(100);

    bridge.send({
      fromTool: 'revenue-risk',
      toTool: 'routine-calc',
      label: '31 500 ₽/мес под риском',
      suggestedValue: 200,
      note: 'поток 100 обращений/мес',
      revenueRiskSnapshot: snapshot,
    });

    expect(bridge.peek('routine-calc')?.suggestedValue).toBe(200);
    expect(
      bridge.peek('routine-calc')?.revenueRiskSnapshot?.results
        .costPerMissedDialog,
    ).toBe(900);
    const consumed = bridge.consume('routine-calc');
    expect(consumed?.fromTool).toBe('revenue-risk');
    expect(bridge.peek('routine-calc')).toBeNull();

    bridge.saveRoutineResult({
      inputs: {
        presetId: 'answers',
        operationsPerWeek: 40,
        minutesPerOperation: 6,
        automationSharePercent: 70,
        hourlyRate: null,
      },
      results: {
        hoursPerMonth: 17.32,
        workDaysPerYear: 25.98,
        savedHoursPerMonth: 12.12,
        savedWorkDaysPerYear: 18.18,
        savedMoneyPerMonth: null,
      },
    });
    expect(bridge.getRoutineResult()?.results.hoursPerMonth).toBe(17.32);
    bridge.clear();
    expect(bridge.getRoutineResult()).toBeNull();
  });

  it('formats Stage 1 stub previews across all four tools safely', () => {
    expect(formatStubPreview('revenue-risk', 120).formattedDisplay).toBe(
      '120\u00A0000\u00A0₽',
    );
    expect(formatStubPreview('routine-calc', 240).formattedDisplay).toBe(
      '4\u00A0часа',
    );
    expect(formatStubPreview('priority-diag', 75).formattedDisplay).toBe(
      'Индекс 75%',
    );
    expect(formatStubPreview('readiness-check', 6).formattedDisplay).toBe(
      '6\u00A0пунктов из 9',
    );
  });
});
