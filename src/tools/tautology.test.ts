import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { emptyDossier } from '../lib/dossier';
import { PRIOR_CONTEXT_NOTE, PRIOR_CONTEXT_TITLE } from '../components/prior-context';
import { buildAuditHandoff, buildTelegramSummary } from './audit-finish/report';
import { buildEfimReport } from './final-report/export';
import { buildHtmlReport } from './final-report/html-report';
import {
  QUIET_SHARE_TEXT,
  QUIET_TEXT,
  classifyBoard,
  composePriorityResults,
  rankProcesses,
  resolvePriority,
} from './priority-diag/calc';
import { buildPriorityShareText } from './priority-diag/view';
import type { PriorityProcessId, PriorityScoreInput } from '../lib/types';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

const pain = (value: number): PriorityScoreInput => ({ frequency: value, time: value, errorCost: value });
const ids: readonly PriorityProcessId[] = ['inquiries', 'answers', 'booking', 'payment', 'reminders', 'reports'];
const quietInputs = Object.fromEntries(ids.map((id) => [id, pain(1)])) as Record<
  PriorityProcessId,
  PriorityScoreInput
>;
const quietResults = composePriorityResults(quietInputs, null, { revenue: null, routine: null }, []);
const quietSources = {
  revenue: null,
  routine: null,
  priority: {
    toolId: 'priority-diag' as const,
    updatedAt: 1,
    inputs: quietInputs,
    results: quietResults,
  },
  readiness: null,
};

describe('tautology replacements', () => {
  it('puts the approved screen sentences in place', () => {
    expect(QUIET_TEXT).toBe(
      'Ни один процесс не выше единицы. Ранга нет. Смотрите риск выручки и часы рутины.',
    );
    expect(PRIOR_CONTEXT_TITLE).toBe('С прошлых шагов');
    expect(PRIOR_CONTEXT_NOTE).toBe('Для ориентира, не для нового ввода.');
    const routine = read('src/tools/routine-calc/view.ts');
    expect(routine).toContain("metric('В рублях', money)");
    expect(routine).toContain('Рубли = сохранённые часы × ставка');
    expect(routine).toContain('Часы и рубли считаются от этой доли.');
    expect(routine).toContain('Пустое поле оставляет расчёт в часах, без рублей.');
    expect(routine).not.toContain('Часы и рубли экономии');
    expect(routine).not.toContain('Экономия в рублях = часы экономии');
    const revenue = read('src/tools/revenue-risk/view.ts');
    expect(revenue).toContain('Доля обращений с поздним ответом или без ответа. Порог задаёте вы: хоть 15 минут, хоть час.');
    expect(revenue).not.toContain('для кого-то это 15 минут');
    const priority = read('src/tools/priority-diag/view.ts');
    expect(priority).toContain('оценка: ${value}');
    expect(priority).not.toContain('насколько это больно');
    expect(priority).toContain("'Что болит сильнее?'");
    expect(read('src/main.ts')).toContain("finishLink.textContent = 'Итоги'");
    expect(read('src/main.ts')).toContain("wordmark.textContent = 'Игра в бизнес'");
    expect(read('src/tools/final-report/export.ts')).toContain("'# Игра в бизнес · Бизнес-аудит'");
    expect(read('src/tools/final-report/export.ts')).toContain("'Ничего не болит'");
    expect(read('src/tools/final-report/html-report.ts')).toContain('<title>Бизнес-аудит</title>');
  });

  it('keeps the previous quiet sentence in share, messengers and the HTML file', () => {
    expect(QUIET_SHARE_TEXT).toContain('не болит сильнее единицы');
    const board = classifyBoard(quietInputs);
    const resolution = resolvePriority(board, null, { revenue: null, routine: null }, []);
    const share = buildPriorityShareText(rankProcesses(quietInputs).ranked, board, resolution);
    expect(share.startsWith(QUIET_SHARE_TEXT)).toBe(true);
    expect(share).not.toContain('не выше единицы');
    expect(buildTelegramSummary(quietSources).startsWith(QUIET_SHARE_TEXT)).toBe(true);
    expect(buildAuditHandoff(quietSources)).toContain(QUIET_SHARE_TEXT);
    expect(buildAuditHandoff(quietSources)).not.toContain('не выше единицы');
    expect(buildEfimReport(quietSources)).toContain(QUIET_SHARE_TEXT);
    expect(buildEfimReport(quietSources)).not.toContain('не выше единицы');
    const html = buildHtmlReport({ ...emptyDossier(1), priority: quietSources.priority });
    expect(html).toContain(QUIET_SHARE_TEXT);
    expect(html).not.toContain('не выше единицы');
    expect(html).toContain('<title>Бизнес-аудит</title>');
  });
});
