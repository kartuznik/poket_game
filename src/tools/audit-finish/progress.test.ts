import { describe, expect, it } from 'vitest';
import type { MetricSnapshot } from '../../lib/dossier';
import { buildProgress, progressChart } from './progress';

const point = (
  savedAt: number,
  revenue: number | null,
  routine: number | null = null,
  readiness: number | null = null,
): MetricSnapshot => ({
  savedAt,
  revenueAtRiskPerMonth: revenue,
  routineHoursPerMonth: routine,
  readinessScore: readiness,
});

const DAY = 86_400_000;

describe('buildProgress', () => {
  it('hides the line when every snapshot is from the last day', () => {
    const now = 10 * DAY;
    const view = buildProgress(
      [point(now - 3_600_000, 100), point(now - 60_000, 80)],
      point(now, 80),
      now,
    );
    expect(view.line).toBeNull();
    expect(view.series.length).toBeGreaterThanOrEqual(2);
  });

  it('names a recent baseline by its date and skips the word month', () => {
    const now = Date.UTC(2026, 9, 31, 9, 0, 0);
    const view = buildProgress([point(now - 2 * DAY, 100)], point(now, 80), now);
    expect(view.line?.label.startsWith('С замера ')).toBe(true);
    expect(view.line?.label).not.toContain('месяц');
    expect(view.line?.text).toContain('риск выручки −20%');
  });

  it('counts a month in days and refuses a percent off a zero base', () => {
    const now = 40 * DAY;
    const view = buildProgress(
      [point(now - 30 * DAY, 0, 10, 4)],
      point(now, 500, 8, 6),
      now,
    );
    expect(view.line?.label).toBe('За 30 дней');
    expect(view.line?.text).toContain('риск выручки +500 ₽/мес');
    expect(view.line?.text).toContain('рутина −20%');
    expect(view.line?.text).toContain('готовность +50%');
    expect(view.line?.text.indexOf('₽/мес')).toBeLessThan(view.line?.text.indexOf('%') ?? -1);
  });

  it('draws a line only from the third point of one metric', () => {
    const now = 10 * DAY;
    const two = buildProgress([point(now - 40 * DAY, 10)], point(now, 8), now);
    expect(progressChart(two.series)).toBeNull();
    const three = buildProgress(
      [point(now - 40 * DAY, 10), point(now - 10 * DAY, 9)],
      point(now, 8),
      now,
    );
    expect(progressChart(three.series)?.values).toEqual([10, 9, 8]);
    expect(progressChart(three.series)?.title).toBe('Риск выручки, ₽/мес');
  });
});
