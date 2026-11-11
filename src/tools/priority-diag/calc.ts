import { formatRubles, normalizeFiniteNumber, pluralize } from '../../lib/format';
import type { PriorityProcessId, PriorityScoreInput, RoutinePresetId } from '../../lib/types';

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
      'Начните с первого ответа: шаблон на входящее и сбор контакта. Деньги сейчас теряются именно тут — в неотвеченных чатах.',
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
 * Orders six processes for display. Equal scores sort by the costlier error,
 * then the higher frequency. That order is not a rank: a tie has no leader.
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

export type PriorityBoardKind = 'leader' | 'quiet' | 'tied';

export interface PriorityBoard {
  readonly kind: PriorityBoardKind;
  readonly peers: readonly RankedProcess[];
  readonly leader: RankedProcess | null;
}

export type RankSource = 'unique' | 'visitor' | 'money' | 'open';

export interface PriorityResolution {
  readonly source: RankSource;
  readonly processId: PriorityProcessId | null;
  readonly reason: string;
}

export interface PriorityMoney {
  readonly revenue: number | null;
  readonly routine: number | null;
}

export const QUIET_TEXT =
  'Ни один процесс не выше единицы. Ранга нет. Смотрите риск выручки и часы рутины.';

/** Clipboard, Telegram, Threads and the HTML file keep the previous sentence. */
export const QUIET_SHARE_TEXT =
  'Ни один процесс не болит сильнее единицы. Ранга нет. Смотрите риск выручки и часы рутины.';

export function keepQuietShareText(text: string): string {
  return text.split(QUIET_TEXT).join(QUIET_SHARE_TEXT);
}

/** All six scores at 1 are quiet. One strict maximum is a leader. Any other shared maximum is a tie. */
export function classifyBoard(
  inputs: Readonly<Record<PriorityProcessId, PriorityScoreInput>>,
): PriorityBoard {
  const ranked = rankProcesses(inputs).ranked;
  const topScore = ranked[0]?.score ?? 0;
  const peers = ranked.filter((item) => item.score === topScore);
  if (ranked.length > 0 && ranked.every((item) => item.score === 1)) {
    return { kind: 'quiet', peers, leader: null };
  }
  if (peers.length === 1) {
    return { kind: 'leader', peers, leader: peers[0] ?? null };
  }
  return { kind: 'tied', peers, leader: null };
}

export function tieQuestion(peerCount: number): string {
  if (peerCount >= 6) {
    return 'Балл одинаковый у всех шести. Что сгорит первым, если неделю не трогать?';
  }
  const noun = pluralize(peerCount, ['процесс', 'процесса', 'процессов']);
  return `Одинаковый балл у ${String(peerCount)} ${noun}. Что сгорит первым, если неделю не трогать?`;
}

function processTitle(id: PriorityProcessId): string {
  return PRIORITY_PROCESSES.find((item) => item.id === id)?.title ?? id;
}

/** Orders and booking presets both point at the booking process. Sheets point at reports. */
function processForRoutinePreset(id: RoutinePresetId): PriorityProcessId {
  if (id === 'answers') return 'answers';
  if (id === 'sheets') return 'reports';
  return 'booking';
}

function moneyPick(
  peers: readonly RankedProcess[],
  money: PriorityMoney,
  routinePresetIds: readonly RoutinePresetId[],
): RankedProcess | null {
  const { revenue, routine } = money;
  if (revenue === null || routine === null || revenue === routine) return null;
  if (revenue > routine) {
    const maxError = Math.max(...peers.map((item) => item.errorCost));
    let pool = peers.filter((item) => item.errorCost === maxError);
    if (pool.length > 1) {
      const maxFrequency = Math.max(...pool.map((item) => item.frequency));
      pool = pool.filter((item) => item.frequency === maxFrequency);
    }
    return pool.length === 1 ? (pool[0] ?? null) : null;
  }
  const mapped = new Set(routinePresetIds.map(processForRoutinePreset));
  const hits = peers.filter((item) => mapped.has(item.id));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

function sumsPhrase(revenue: number, routine: number): string {
  const revenueText = formatRubles(revenue);
  const routineText = formatRubles(routine);
  if (revenue > routine) {
    return `под риском ${revenueText}, это больше экономии рутины ${routineText}`;
  }
  if (routine > revenue) {
    return `экономия рутины ${routineText}, это больше выручки под риском ${revenueText}`;
  }
  return `под риском ${revenueText} и экономия рутины ${routineText} равны`;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function openReason(money: PriorityMoney, ambiguous: boolean): string {
  const { revenue, routine } = money;
  if (revenue === null && routine === null) {
    return 'Баллы совпали. Выбор не сделан. Сумм выручки и рутины нет, деньги процессы не разводят. Лидер не назначен.';
  }
  if (revenue === null || routine === null) {
    const present =
      revenue === null
        ? `экономия рутины ${formatRubles(routine as number)} есть, выручки под риском нет`
        : `под риском ${formatRubles(revenue as number)} есть, экономии рутины нет`;
    return `Баллы совпали. Выбор не сделан. ${sentence(present)}, деньги процессы не разводят. Лидер не назначен.`;
  }
  const comparison = sumsPhrase(revenue, routine);
  const tail = ambiguous
    ? `${sentence(comparison)}, но правило указывает не на один процесс.`
    : `${sentence(comparison)}.`;
  return `Баллы совпали. Выбор не сделан. ${tail} Лидер не назначен.`;
}

/**
 * Picks a leader only from a strict maximum, the visitor's chip, or one process the money rule names.
 * A stored chip outside the current tie is ignored. Array order never wins.
 */
export function resolvePriority(
  board: PriorityBoard,
  pick: PriorityProcessId | null,
  money: PriorityMoney,
  routinePresetIds: readonly RoutinePresetId[],
): PriorityResolution {
  if (board.kind === 'quiet') {
    return { source: 'open', processId: null, reason: QUIET_TEXT };
  }
  if (board.kind === 'leader' && board.leader) {
    return {
      source: 'unique',
      processId: board.leader.id,
      reason: `Лидер — «${board.leader.title}»: балл строго выше остальных.`,
    };
  }
  const picked = pick !== null && board.peers.some((item) => item.id === pick) ? pick : null;
  if (picked) {
    return {
      source: 'visitor',
      processId: picked,
      reason: `Лидер — «${processTitle(picked)}»: вы выбрали, что сгорит первым.`,
    };
  }
  const bothSums = money.revenue !== null && money.routine !== null;
  const winner = moneyPick(board.peers, money, routinePresetIds);
  if (winner && bothSums && money.revenue !== money.routine) {
    return {
      source: 'money',
      processId: winner.id,
      reason: `Лидер — «${winner.title}»: деньги разводят процессы, ${sumsPhrase(money.revenue as number, money.routine as number)}.`,
    };
  }
  const ambiguous =
    bothSums &&
    money.revenue !== money.routine &&
    winner === null;
  return { source: 'open', processId: null, reason: openReason(money, ambiguous) };
}

export interface StoredPriorityChoice {
  readonly topProcessId: PriorityProcessId | null;
  readonly resolution: RankSource | null;
  readonly resolutionReason: string | null;
}

export interface PriorityResultFields {
  readonly topProcessId: PriorityProcessId | null;
  readonly topTitle: string;
  readonly topScore: number;
  readonly tied: boolean;
  readonly ranking: readonly {
    readonly id: PriorityProcessId;
    readonly title: string;
    readonly score: number;
  }[];
  readonly board: PriorityBoardKind;
  readonly peerIds: readonly PriorityProcessId[];
  readonly resolution: RankSource;
  readonly resolutionReason: string;
}

/** Saves the board from inputs. A chip outside the current tie does not become the leader. */
export function composePriorityResults(
  inputs: Readonly<Record<PriorityProcessId, PriorityScoreInput>>,
  pick: PriorityProcessId | null,
  money: PriorityMoney,
  routinePresetIds: readonly RoutinePresetId[],
): PriorityResultFields {
  const board = classifyBoard(inputs);
  const resolution = resolvePriority(board, pick, money, routinePresetIds);
  const ranked = rankProcesses(inputs).ranked;
  const leader = resolution.processId
    ? (ranked.find((item) => item.id === resolution.processId) ?? null)
    : null;
  return {
    topProcessId: leader?.id ?? null,
    topTitle: leader?.title ?? '',
    topScore: leader?.score ?? board.peers[0]?.score ?? 0,
    tied: board.kind !== 'leader',
    ranking: ranked.map((item) => ({ id: item.id, title: item.title, score: item.score })),
    board: board.kind,
    peerIds: board.peers.map((item) => item.id),
    resolution: resolution.source,
    resolutionReason: resolution.reason,
  };
}

/**
 * Rebuilds a saved board from inputs. A visitor chip is kept only while that
 * process is still tied. A disappeared tie or a process that left the tie
 * cannot come back as the leader.
 */
export function restorePriorityResults(
  inputs: Readonly<Record<PriorityProcessId, PriorityScoreInput>>,
  stored: StoredPriorityChoice,
): PriorityResultFields {
  const board = classifyBoard(inputs);
  if (board.kind !== 'tied') {
    return composePriorityResults(inputs, null, { revenue: null, routine: null }, []);
  }
  const stillPeer =
    stored.topProcessId !== null && board.peers.some((item) => item.id === stored.topProcessId);
  if (stored.resolution === 'visitor' && stillPeer) {
    return composePriorityResults(inputs, stored.topProcessId, { revenue: null, routine: null }, []);
  }
  if (stored.resolution === 'money' && stillPeer && stored.resolutionReason) {
    const base = composePriorityResults(inputs, null, { revenue: null, routine: null }, []);
    const leader = rankProcesses(inputs).ranked.find((item) => item.id === stored.topProcessId);
    if (!leader) return base;
    return {
      ...base,
      topProcessId: leader.id,
      topTitle: leader.title,
      topScore: leader.score,
      resolution: 'money',
      resolutionReason: stored.resolutionReason,
    };
  }
  return composePriorityResults(inputs, null, { revenue: null, routine: null }, []);
}

/** A saved process is a leader only for a strict, chosen, or money resolution. */
export function confirmedPriorityLeader(priority: {
  readonly results: {
    readonly topProcessId: PriorityProcessId | null;
    readonly topTitle: string;
    readonly topScore: number;
    readonly tied: boolean;
    readonly board?: PriorityBoardKind;
    readonly resolution?: RankSource;
  };
} | null): { readonly id: PriorityProcessId; readonly title: string; readonly score: number } | null {
  if (!priority) return null;
  const { results } = priority;
  if (results.board === 'quiet' || results.resolution === 'open') return null;
  if (!results.topProcessId || results.topTitle.trim() === '') return null;
  if (
    results.resolution === 'unique' ||
    results.resolution === 'visitor' ||
    results.resolution === 'money' ||
    (results.resolution === undefined && results.tied === false)
  ) {
    return { id: results.topProcessId, title: results.topTitle, score: results.topScore };
  }
  return null;
}
