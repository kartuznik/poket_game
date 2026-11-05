import { formatCountWithNoun, formatNumber } from '../../lib/format';

const SCORE_SCALE = 5;
const READINESS_TOTAL = 9;
export const RING_SIZE = 72;
export const RING_STROKE = 5;
export const RING_RADIUS = 33.5;

const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Bar length as a percent of a 1–5 score. Any non-zero score is at least 20%. */
export function priorityBarPercent(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(100, Math.max(20, (score / SCORE_SCALE) * 100));
}

/**
 * Gap between first and second place. A gap under half a point is omitted
 * so the line does not say «На 0,1 балла выше следующего».
 * Fractions keep the genitive singular already used by formatCountWithNoun.
 */
export function priorityGapLine(first: number, second: number): string | null {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const gap = Math.round((first - second) * 100) / 100;
  if (gap < 0.5) return null;
  const phrase = formatCountWithNoun(gap, ['балл', 'балла', 'баллов']);
  return `На ${phrase} выше следующего`;
}

export interface PriorityBarModel {
  readonly title: string;
  readonly scoreLabel: string;
  readonly widthPercent: number;
  readonly showBar: boolean;
  readonly leader: boolean;
}

export interface PriorityBoardModel {
  readonly bars: readonly PriorityBarModel[];
  readonly gapLine: string | null;
}

/** Highest scores are cobalt. The gap line uses the first two places in score order. */
export function priorityBoard(
  ranking: readonly { readonly title: string; readonly score: number }[],
): PriorityBoardModel {
  const ordered = [...ranking].sort((a, b) => b.score - a.score);
  const top = ordered[0]?.score;
  const second = ordered[1]?.score;
  return {
    bars: ordered.map((row) => ({
      title: row.title,
      scoreLabel: formatNumber(row.score),
      widthPercent: priorityBarPercent(row.score),
      showBar: row.score > 0,
      leader: top !== undefined && row.score === top,
    })),
    gapLine: top !== undefined && second !== undefined ? priorityGapLine(top, second) : null,
  };
}

export interface ReadinessRingModel {
  readonly size: number;
  readonly stroke: number;
  readonly radius: number;
  readonly filled: number;
  readonly gap: number;
  readonly label: string;
  readonly fontSize: number;
}

/** Inner label shrinks once the fraction no longer fits the hole of a 72px ring. */
export function ringFontSize(label: string): number {
  if (label.length <= 4) return 15;
  if (label.length <= 5) return 13;
  return 11;
}

/** Arc length is score/9 of the circumference, and never longer than one full turn. */
export function readinessRing(score: number, total = READINESS_TOTAL): ReadinessRingModel {
  const safeScore = Number.isFinite(score) ? Math.max(0, score) : 0;
  const safeTotal = Number.isFinite(total) && total > 0 ? total : READINESS_TOTAL;
  const ratio = Math.min(1, safeScore / safeTotal);
  const filled = RING_CIRCUMFERENCE * ratio;
  const label = `${formatNumber(safeScore)}/${formatNumber(safeTotal)}`;
  return {
    size: RING_SIZE,
    stroke: RING_STROKE,
    radius: RING_RADIUS,
    filled,
    gap: RING_CIRCUMFERENCE - filled,
    label,
    fontSize: ringFontSize(label),
  };
}
