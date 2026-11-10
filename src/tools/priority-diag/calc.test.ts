import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatRubles } from '../../lib/format';
import type { PriorityProcessId, PriorityScoreInput } from '../../lib/types';
import {
  PRIORITY_PROCESSES,
  QUIET_TEXT,
  classifyBoard,
  clampScore,
  composePriorityResults,
  defaultPriorityInputs,
  rankProcesses,
  resolvePriority,
  restorePriorityResults,
  scoreProcess,
  scoresFromPain,
  tieQuestion,
  type PriorityMoney,
} from './calc';

describe('priority score', () => {
  it('weights frequency at 0.4 and time and error cost at 0.3', () => {
    expect(scoreProcess({ frequency: 5, time: 4, errorCost: 5 })).toBe(4.7);
    expect(scoreProcess({ frequency: 1, time: 1, errorCost: 1 })).toBe(1);
    expect(scoreProcess({ frequency: 5, time: 5, errorCost: 5 })).toBe(5);
  });

  it('writes one pain mark into frequency, time and error cost', () => {
    expect(scoresFromPain(4)).toEqual({ frequency: 4, time: 4, errorCost: 4 });
    expect(scoreProcess(scoresFromPain(2))).toBe(2);
    expect(scoresFromPain(0).frequency).toBe(1);
  });

  it('pulls scores outside 1–5 back onto the scale', () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(9)).toBe(5);
    expect(clampScore(3.6)).toBe(4);
    expect(clampScore(Number.NaN)).toBe(3);
    expect(scoreProcess({ frequency: 0, time: 100, errorCost: Number.NaN })).toBe(
      scoreProcess({ frequency: 1, time: 5, errorCost: 3 }),
    );
  });
});

describe('rankProcesses', () => {
  it('puts incoming messages first on the default scores', () => {
    const result = rankProcesses(defaultPriorityInputs());
    expect(result.top.id).toBe('inquiries');
    expect(result.top.score).toBe(4.7);
    expect(result.tied).toBe(false);
    expect(result.ranked).toHaveLength(6);
    expect(result.ranked.map((item) => item.id)).toEqual([
      'inquiries',
      'answers',
      'booking',
      'payment',
      'reminders',
      'reports',
    ]);
  });

  it('breaks a tie toward the costlier error, then frequency, then funnel order', () => {
    const inputs = defaultPriorityInputs();
    const tied = rankProcesses({
      inquiries: { frequency: 3, time: 3, errorCost: 3 },
      answers: { frequency: 3, time: 3, errorCost: 3 },
      booking: { frequency: 1, time: 1, errorCost: 1 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    });
    const leaders = tied.ranked.filter((item) => item.score === tied.top.score);
    expect(leaders.map((item) => item.id).slice(0, 2)).toEqual(['inquiries', 'answers']);
    expect(classifyBoard({
      inquiries: { frequency: 3, time: 3, errorCost: 3 },
      answers: { frequency: 3, time: 3, errorCost: 3 },
      booking: { frequency: 1, time: 1, errorCost: 1 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    }).leader).toBeNull();
    expect(tied.tied).toBe(true);

    const errorWins = rankProcesses({
      ...inputs,
      payment: { frequency: 2, time: 2, errorCost: 5 },
      reminders: { frequency: 5, time: 2, errorCost: 1 },
    });
    const payment = errorWins.ranked.find((item) => item.id === 'payment');
    const reminders = errorWins.ranked.find((item) => item.id === 'reminders');
    expect(payment?.score).toBe(reminders?.score);
    expect(errorWins.ranked.findIndex((item) => item.id === 'payment')).toBeLessThan(
      errorWins.ranked.findIndex((item) => item.id === 'reminders'),
    );
  });

  it('keeps a recommendation on every process', () => {
    const result = rankProcesses(defaultPriorityInputs());
    expect(result.ranked.every((item) => item.recommendation.length > 20)).toBe(true);
    expect(PRIORITY_PROCESSES).toHaveLength(6);
  });

  it('ranks a zero-like board without throwing', () => {
    const inputs = defaultPriorityInputs();
    const flat = rankProcesses({
      inquiries: { frequency: 1, time: 1, errorCost: 1 },
      answers: { frequency: 1, time: 1, errorCost: 1 },
      booking: { frequency: 1, time: 1, errorCost: 1 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    });
    expect(flat.top.score).toBe(1);
    expect(classifyBoard({
      inquiries: { frequency: 1, time: 1, errorCost: 1 },
      answers: { frequency: 1, time: 1, errorCost: 1 },
      booking: { frequency: 1, time: 1, errorCost: 1 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    })).toMatchObject({ kind: 'quiet', leader: null });
    expect(flat.tied).toBe(true);
    expect(inputs.inquiries.frequency).toBe(5);
  });
});

function pain(score: number): PriorityScoreInput {
  return { frequency: score, time: score, errorCost: score };
}

function boardOf(
  score: number,
  overrides: Partial<Record<PriorityProcessId, PriorityScoreInput>> = {},
): Record<PriorityProcessId, PriorityScoreInput> {
  return {
    inquiries: pain(score),
    answers: pain(score),
    booking: pain(score),
    payment: pain(score),
    reminders: pain(score),
    reports: pain(score),
    ...overrides,
  };
}

const noMoney: PriorityMoney = { revenue: null, routine: null };

function expectMoneyAgrees(reason: string, revenue: number, routine: number): void {
  const revenueText = formatRubles(revenue);
  const routineText = formatRubles(routine);
  expect(reason).toContain(revenueText);
  expect(reason).toContain(routineText);
  if (revenue > routine) {
    expect(revenue).toBeGreaterThan(routine);
    expect(reason.toLowerCase()).toContain(
      `под риском ${revenueText}, это больше экономии рутины ${routineText}`,
    );
    expect(reason).not.toContain(`экономия рутины ${routineText}, это больше`);
    return;
  }
  if (routine > revenue) {
    expect(routine).toBeGreaterThan(revenue);
    expect(reason).toContain(`экономия рутины ${routineText}, это больше выручки под риском ${revenueText}`);
    expect(reason).not.toContain(`под риском ${revenueText}, это больше`);
    return;
  }
  expect(reason).not.toContain('это больше');
}

describe('classifyBoard', () => {
  it('gives every flat integer board and every top tie no array-order leader', () => {
    expect(classifyBoard(boardOf(1))).toMatchObject({ kind: 'quiet', leader: null });
    for (const score of [2, 3, 4, 5]) {
      const board = classifyBoard(boardOf(score));
      expect(board.kind).toBe('tied');
      expect(board.leader).toBeNull();
      expect(board.peers).toHaveLength(6);
      expect(resolvePriority(board, null, noMoney, []).processId).toBeNull();
    }
    for (const width of [2, 3, 4, 5]) {
      const overrides: Partial<Record<PriorityProcessId, PriorityScoreInput>> = {};
      PRIORITY_PROCESSES.forEach((process, index) => {
        overrides[process.id] = pain(index < width ? 5 : 1);
      });
      const board = classifyBoard(boardOf(1, overrides));
      expect(board.kind).toBe('tied');
      expect(board.leader).toBeNull();
      expect(board.peers).toHaveLength(width);
      expect(board.peers.map((item) => item.id)).not.toContain(
        PRIORITY_PROCESSES[width]?.id,
      );
      expect(resolvePriority(board, null, noMoney, []).processId).not.toBe('inquiries');
    }
  });

  it('names the only higher score, including one that is not first in the array', () => {
    const payment = classifyBoard(boardOf(1, { payment: pain(5) }));
    expect(payment.leader?.id).toBe('payment');
    expect(payment.kind).toBe('leader');
    expect(payment.leader?.id).not.toBe(PRIORITY_PROCESSES[0]?.id);

    const mixed = classifyBoard(
      boardOf(1, {
        payment: { frequency: 2, time: 2, errorCost: 5 },
        reminders: { frequency: 5, time: 2, errorCost: 1 },
      }),
    );
    expect(mixed.kind).toBe('tied');
    expect(mixed.leader).toBeNull();
    expect(mixed.peers.map((item) => item.id).sort()).toEqual(['payment', 'reminders']);
    expect(mixed.peers.every((item) => item.score === 2.9)).toBe(true);
  });
});

describe('resolvePriority', () => {
  it('changes the rank and the reason when the visitor picks another chip', () => {
    const board = classifyBoard(boardOf(5));
    const payment = resolvePriority(board, 'payment', noMoney, []);
    const answers = resolvePriority(board, 'answers', noMoney, []);
    expect(payment).toMatchObject({ source: 'visitor', processId: 'payment' });
    expect(answers).toMatchObject({ source: 'visitor', processId: 'answers' });
    expect(payment.reason).toBe('Лидер — «Оплата»: вы выбрали, что сгорит первым.');
    expect(answers.reason).toBe('Лидер — «Ответы на вопросы»: вы выбрали, что сгорит первым.');
    expect(payment.reason).not.toContain('это больше');
  });

  it('ignores a chip that is no longer in the tie and does not crown it', () => {
    const narrowed = classifyBoard(boardOf(5, { inquiries: pain(1) }));
    const stale = resolvePriority(narrowed, 'inquiries', { revenue: 20_000, routine: 1_000 }, []);
    expect(narrowed.peers.map((item) => item.id)).not.toContain('inquiries');
    expect(stale.processId).not.toBe('inquiries');
    expect(stale.source).not.toBe('visitor');

    const unique = classifyBoard(boardOf(1, { answers: pain(5) }));
    const dropped = resolvePriority(unique, 'payment', noMoney, []);
    expect(dropped).toMatchObject({ source: 'unique', processId: 'answers' });
    expect(dropped.processId).not.toBe('payment');
    expect(dropped.reason).not.toContain('это больше');
  });

  it('names the larger sum with formatRubles and never the smaller one', () => {
    const errorTie = classifyBoard(
      boardOf(1, {
        payment: { frequency: 2, time: 2, errorCost: 5 },
        reminders: { frequency: 5, time: 2, errorCost: 1 },
      }),
    );
    const revenueWins = resolvePriority(errorTie, null, { revenue: 20_000, routine: 5_000 }, []);
    expect(revenueWins).toMatchObject({ source: 'money', processId: 'payment' });
    expectMoneyAgrees(revenueWins.reason, 20_000, 5_000);

    const routineTie = classifyBoard(boardOf(1, { booking: pain(4), payment: pain(4) }));
    const routineWins = resolvePriority(
      routineTie,
      null,
      { revenue: 15_840, routine: 90_200 },
      ['orders'],
    );
    expect(90_200).toBeGreaterThan(15_840);
    expect(routineWins).toMatchObject({ source: 'money', processId: 'booking' });
    expect(routineWins.reason).toBe(
      `Лидер — «Запись и заказы»: деньги разводят процессы, экономия рутины ${formatRubles(90_200)}, это больше выручки под риском ${formatRubles(15_840)}.`,
    );
    expect(routineWins.reason).toContain('деньги разводят процессы');
    expect(routineWins.reason).not.toContain('вы выбрали');
    expectMoneyAgrees(routineWins.reason, 15_840, 90_200);

    const sameError = classifyBoard(boardOf(4, { reports: pain(1) }));
    const ambiguous = resolvePriority(sameError, null, { revenue: 20_000, routine: 5_000 }, []);
    expect(ambiguous.source).toBe('open');
    expect(ambiguous.processId).toBeNull();
    expectMoneyAgrees(ambiguous.reason, 20_000, 5_000);
    expect(ambiguous.reason).toContain('не на один процесс');

    const equal = resolvePriority(errorTie, null, { revenue: 5_000, routine: 5_000 }, []);
    expect(equal).toMatchObject({ source: 'open', processId: null });
    expectMoneyAgrees(equal.reason, 5_000, 5_000);
    expect(equal.reason).toContain('равны');

    const absent = resolvePriority(errorTie, null, noMoney, []);
    expect(absent).toMatchObject({ source: 'open', processId: null });
    expect(absent.reason).toContain('Сумм выручки и рутины нет');
    expect(absent.reason).not.toContain('это больше');

    const quiet = resolvePriority(classifyBoard(boardOf(1)), 'inquiries', { revenue: 1, routine: 2 }, []);
    expect(quiet.reason).toBe(QUIET_TEXT);
    expect(quiet.processId).toBeNull();
    expect(quiet.reason).not.toContain('это больше');
  });

  it('drops a stored chip that left the tie and keeps a chip that is still tied', () => {
    const moved = restorePriorityResults(boardOf(5, { inquiries: pain(1) }), {
      topProcessId: 'inquiries',
      resolution: 'visitor',
      resolutionReason: 'Лидер — «Приём обращений»: вы выбрали, что сгорит первым.',
    });
    expect(moved.topProcessId).not.toBe('inquiries');
    expect(moved.resolution).not.toBe('visitor');
    expect(moved.topTitle).not.toBe('Приём обращений');

    const kept = restorePriorityResults(boardOf(5), {
      topProcessId: 'payment',
      resolution: 'visitor',
      resolutionReason: 'старая причина',
    });
    expect(kept.topProcessId).toBe('payment');
    expect(kept.resolution).toBe('visitor');
    expect(kept.resolutionReason).toContain('Оплата');

    const payment = composePriorityResults(boardOf(5), 'payment', noMoney, []);
    const answers = composePriorityResults(boardOf(5), 'answers', noMoney, []);
    expect(payment.topProcessId).toBe('payment');
    expect(answers.topProcessId).toBe('answers');
    expect(payment.resolutionReason).not.toBe(answers.resolutionReason);
  });

  it('asks which tied process burns first, with a plural for a partial tie', () => {
    expect(tieQuestion(6)).toBe(
      'Балл одинаковый у всех шести. Что сгорит первым, если неделю не трогать?',
    );
    expect(tieQuestion(2)).toContain('2 процесса');
    expect(tieQuestion(5)).toContain('5 процессов');
    expect(tieQuestion(3)).toContain('Что сгорит первым');
  });

  it('renders the shortened screen heading without the redundant Диагностика prefix (Q27)', () => {
    const viewSource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './view.ts'),
      'utf8',
    );
    expect(viewSource).toContain("title.textContent = 'Что автоматизировать первым'");
  });
});
