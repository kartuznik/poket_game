import { normalizeFiniteNumber } from '../../lib/format';
import type { PriorityProcessId, PriorityScoreInput } from '../../lib/types';

export const PRIORITY_WEIGHTS = {
  frequency: 0.4,
  time: 0.3,
  errorCost: 0.3,
} as const;

export interface PriorityProcess {
  readonly id: PriorityProcessId;
  readonly title: string;
  readonly recommendation: string;
  readonly defaults: PriorityScoreInput;
}

export const PRIORITY_PROCESSES: readonly PriorityProcess[] = [
  {
    id: 'inquiries',
    title: 'Приём обращений',
    recommendation:
      'Начните с первого ответа: шаблон на входящее и сбор контакта. Это самый короткий путь к деньгам, которые сейчас ждут в чате.',
    defaults: { frequency: 5, time: 4, errorCost: 5 },
  },
  {
    id: 'answers',
    title: 'Ответы на вопросы',
    recommendation:
      'Соберите десять частых вопросов в готовые ответы. Обычные вопросы закрывает бот, к вам попадает только нестандарт.',
    defaults: { frequency: 5, time: 3, errorCost: 4 },
  },
  {
    id: 'booking',
    title: 'Запись и заказы',
    recommendation:
      'Сведите запись или заказ к одной форме: что нужно, когда и как с вами связаться. Эти переписки повторяются слово в слово.',
    defaults: { frequency: 4, time: 3, errorCost: 4 },
  },
  {
    id: 'payment',
    title: 'Оплата',
    recommendation:
      'Ссылку на оплату отправляйте сразу после подтверждения заказа. Ошибка здесь стоит денег, даже если таких операций немного.',
    defaults: { frequency: 3, time: 2, errorCost: 5 },
  },
  {
    id: 'reminders',
    title: 'Напоминания',
    recommendation:
      'Напоминание за день и за час снимает неявки. Это короткий сценарий, его логично включить следом за записью.',
    defaults: { frequency: 3, time: 2, errorCost: 3 },
  },
  {
    id: 'reports',
    title: 'Отчёты',
    recommendation:
      'Недельный отчёт собирайте из того же места, куда уже попадают обращения. Ручной отчёт не должен занимать полдня.',
    defaults: { frequency: 2, time: 4, errorCost: 2 },
  },
] as const;

export function defaultPriorityInputs(): Record<PriorityProcessId, PriorityScoreInput> {
  return Object.fromEntries(
    PRIORITY_PROCESSES.map((process) => [process.id, process.defaults]),
  ) as Record<PriorityProcessId, PriorityScoreInput>;
}

export interface RankedProcess {
  readonly id: PriorityProcessId;
  readonly title: string;
  readonly frequency: number;
  readonly time: number;
  readonly errorCost: number;
  readonly score: number;
  readonly recommendation: string;
}

export interface PriorityResult {
  readonly ranked: readonly RankedProcess[];
  readonly top: RankedProcess;
  readonly tied: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Scores outside 1–5 are pulled back onto the scale. Non-numbers become 3. */
export function clampScore(value: number): number {
  const safe = normalizeFiniteNumber(value, 3);
  return Math.min(5, Math.max(1, Math.round(safe)));
}

/** One pain mark stands in for frequency, time and error cost together. */
export function scoresFromPain(pain: number): PriorityScoreInput {
  const value = clampScore(pain);
  return { frequency: value, time: value, errorCost: value };
}

export function scoreProcess(input: PriorityScoreInput): number {
  const frequency = clampScore(input.frequency);
  const time = clampScore(input.time);
  const errorCost = clampScore(input.errorCost);
  return round2(
    frequency * PRIORITY_WEIGHTS.frequency +
      time * PRIORITY_WEIGHTS.time +
      errorCost * PRIORITY_WEIGHTS.errorCost,
  );
}

/**
 * Ranks six processes. Equal scores break toward the costlier error,
 * then the higher frequency, then the earlier place in the funnel.
 */
export function rankProcesses(
  inputs: Readonly<Record<PriorityProcessId, PriorityScoreInput>>,
): PriorityResult {
  const ranked = PRIORITY_PROCESSES.map((process, index) => {
    const raw = inputs[process.id];
    const frequency = clampScore(raw.frequency);
    const time = clampScore(raw.time);
    const errorCost = clampScore(raw.errorCost);
    return {
      index,
      id: process.id,
      title: process.title,
      frequency,
      time,
      errorCost,
      score: scoreProcess({ frequency, time, errorCost }),
      recommendation: process.recommendation,
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.errorCost !== a.errorCost) return b.errorCost - a.errorCost;
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return a.index - b.index;
  });

  const top = ranked[0];
  if (!top) {
    throw new Error('Priority ranking is empty');
  }
  const second = ranked[1];
  const toRanked = (row: (typeof ranked)[number]): RankedProcess => ({
    id: row.id,
    title: row.title,
    frequency: row.frequency,
    time: row.time,
    errorCost: row.errorCost,
    score: row.score,
    recommendation: row.recommendation,
  });
  return {
    ranked: ranked.map(toRanked),
    top: toRanked(top),
    tied: second ? second.score === top.score : false,
  };
}
