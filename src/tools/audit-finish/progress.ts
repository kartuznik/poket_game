import { pluralize } from '../../lib/format';
import type { MetricSnapshot } from '../../lib/dossier';

export interface ProgressLine {
  readonly label: string;
  readonly text: string;
}

export interface ProgressView {
  readonly line: ProgressLine | null;
  readonly baseline: MetricSnapshot | null;
  readonly series: readonly MetricSnapshot[];
}

const DAY_MS = 86_400_000;
const MONTH_DAYS = 28;

export function formatDayMonth(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow',
  }).format(new Date(timestamp));
}

export function metricDelta(
  before: number,
  after: number,
): { readonly kind: 'same' | 'absolute' | 'percent'; readonly value: number } {
  const delta = after - before;
  if (Math.abs(delta) < 1e-6) return { kind: 'same', value: 0 };
  if (Math.abs(before) < 1e-6) return { kind: 'absolute', value: delta };
  return { kind: 'percent', value: Math.round((delta / Math.abs(before)) * 100) };
}

function signed(value: number, suffix: string): string {
  if (value === 0) return `0${suffix}`;
  const body = String(Math.abs(value)).replace('.', ',');
  return `${value > 0 ? '+' : '−'}${body}${suffix}`;
}

function phrase(before: number, after: number, absoluteUnit: string): string {
  const delta = metricDelta(before, after);
  if (delta.kind === 'same') return '0%';
  if (delta.kind === 'absolute') return signed(Math.round(delta.value * 100) / 100, ` ${absoluteUnit}`);
  return signed(delta.value, '%');
}

function describeChange(baseline: MetricSnapshot, current: MetricSnapshot): string {
  const parts: string[] = [];
  if (baseline.revenueAtRiskPerMonth !== null && current.revenueAtRiskPerMonth !== null) {
    parts.push(
      `риск выручки ${phrase(baseline.revenueAtRiskPerMonth, current.revenueAtRiskPerMonth, '₽/мес')}`,
    );
  }
  if (baseline.routineHoursPerMonth !== null && current.routineHoursPerMonth !== null) {
    parts.push(
      `рутина ${phrase(baseline.routineHoursPerMonth, current.routineHoursPerMonth, 'ч/мес')}`,
    );
  }
  if (baseline.readinessScore !== null && current.readinessScore !== null) {
    parts.push(`готовность ${phrase(baseline.readinessScore, current.readinessScore, 'балла')}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'сравнивать пока нечего';
}

/** Sentence for a baseline at least a day old. No line when every snapshot is from today. */
export function buildProgress(
  history: readonly MetricSnapshot[],
  current: MetricSnapshot,
  now: number,
): ProgressView {
  const series = [...history.filter((item) => item.savedAt < current.savedAt), current].sort(
    (left, right) => left.savedAt - right.savedAt,
  );
  const older = series.filter((item) => item.savedAt !== current.savedAt && now - item.savedAt >= DAY_MS);
  const baseline = older[older.length - 1] ?? null;
  if (!baseline) return { line: null, baseline: null, series };
  const days = Math.max(1, Math.round((now - baseline.savedAt) / DAY_MS));
  const label =
    days >= MONTH_DAYS
      ? `За ${days} ${pluralize(days, ['день', 'дня', 'дней'])}`
      : `С замера ${formatDayMonth(baseline.savedAt)}`;
  return { line: { label, text: describeChange(baseline, current) }, baseline, series };
}
