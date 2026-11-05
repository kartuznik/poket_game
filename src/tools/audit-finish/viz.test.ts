import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { priorityBarPercent, priorityBoard, priorityGapLine, readinessRing, RING_RADIUS } from './viz';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const circumference = 2 * Math.PI * RING_RADIUS;

describe('finish screen micro visuals', () => {
  it('sizes a priority bar from a ceiling of 5', () => {
    expect(priorityBarPercent(5)).toBe(100);
    expect(priorityBarPercent(4)).toBe(80);
    expect(priorityBarPercent(3)).toBe(60);
    expect(priorityBarPercent(2)).toBe(40);
    expect(priorityBarPercent(1)).toBe(20);
    expect(priorityBarPercent(0.5)).toBe(20);
    expect(priorityBarPercent(2.5)).toBe(50);
    expect(priorityBarPercent(0)).toBe(0);
    expect(priorityBarPercent(6)).toBe(100);
    expect(priorityBarPercent(-2)).toBe(0);
  });

  it('draws a bar for every non-zero score, at least 20% wide', () => {
    const board = priorityBoard([
      { title: 'Приём', score: 5 },
      { title: 'Ответы', score: 4 },
      { title: 'Запись', score: 3 },
      { title: 'Оплата', score: 2.5 },
      { title: 'Напоминания', score: 2 },
      { title: 'Отчёты', score: 1 },
      { title: 'Пусто', score: 0 },
    ]);
    const shown = board.bars.filter((bar) => bar.showBar);
    expect(shown.map((bar) => bar.scoreLabel)).toEqual(['5', '4', '3', '2,5', '2', '1']);
    const widths = [1, 2, 3, 4, 5].map((score) => priorityBarPercent(score));
    expect(widths).toEqual([20, 40, 60, 80, 100]);
    expect(widths[0]).toBeLessThan(widths[1] ?? 0);
    expect(widths[1]).toBeLessThan(widths[2] ?? 0);
    expect(widths[2]).toBeLessThan(widths[3] ?? 0);
    expect(widths[3]).toBeLessThan(widths[4] ?? 0);
    expect(shown.find((bar) => bar.scoreLabel === '2,5')?.widthPercent).toBe(50);
    expect(shown[0]?.leader).toBe(true);
    expect(shown.slice(1).every((bar) => bar.leader === false)).toBe(true);
    expect(board.bars.filter((bar) => !bar.showBar).map((bar) => bar.scoreLabel)).toEqual(['0']);

    const quiet = priorityBoard([
      { title: 'Оплата', score: 2 },
      { title: 'Отчёты', score: 1 },
    ]);
    expect(quiet.bars.every((bar) => bar.showBar)).toBe(true);
    expect(quiet.bars.map((bar) => bar.widthPercent)).toEqual([40, 20]);
    expect(quiet.bars[0]?.leader).toBe(true);
    expect(quiet.bars[1]?.leader).toBe(false);
  });

  it('draws the readiness arc as a share of the circle', () => {
    const six = readinessRing(6);
    expect(six.size).toBe(72);
    expect(six.stroke).toBe(5);
    expect(six.radius).toBe(33.5);
    expect(six.filled / circumference).toBeCloseTo(6 / 9, 5);
    expect(six.gap).toBeCloseTo(circumference - six.filled, 5);
    expect(six.label).toBe('6/9');
    expect(six.fontSize).toBe(15);

    const half = readinessRing(4.5);
    expect(half.filled / circumference).toBeCloseTo(0.5, 5);
    expect(half.label).toBe('4,5/9');
    expect(half.fontSize).toBeLessThan(six.fontSize);
  });

  it('shrinks the ring label when the fraction is longer than the hole', () => {
    const overflow = readinessRing(10.5);
    expect(overflow.label).toBe('10,5/9');
    expect(overflow.fontSize).toBeLessThan(readinessRing(4.5).fontSize);
    expect(overflow.filled).toBeCloseTo(circumference, 5);
  });

  it('keeps the bar behind showBar and splits priority from the metric cards', () => {
    const view = readFileSync(resolve(root, 'src/tools/audit-finish/view.ts'), 'utf8');
    const gate = view.indexOf('if (bar.showBar)');
    const mark = view.indexOf('finish-bar finish-bar--leader');
    expect(gate).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(gate);
    expect(view).toContain("divider.className = 'finish-divider'");
    expect(view).toContain(
      'dashboard.append(scenario, priorityBlock(sources.priority), divider, dashboardGrid)',
    );

    const css = readFileSync(resolve(root, 'src/styles/main.css'), 'utf8');
    const dividerAt = css.indexOf('.finish-divider');
    const divider = css.slice(dividerAt, dividerAt + 180);
    expect(divider).toContain('height: 1px');
    expect(divider).toContain('margin: 12px 0');
    expect(divider).toContain('var(--border-color)');
    const ring = css.slice(css.indexOf('.finish-ring__track'), css.indexOf('.finish-ring__track') + 220);
    expect(ring).toContain('stroke-width: 5px');
  });

  it('declines the gap and hides a difference under half a point', () => {
    expect(priorityGapLine(5, 4)).toBe('На 1\u00A0балл выше следующего');
    expect(priorityGapLine(5, 3)).toBe('На 2\u00A0балла выше следующего');
    expect(priorityGapLine(5, 0)).toBe('На 5\u00A0баллов выше следующего');
    expect(priorityGapLine(4.5, 3)).toBe('На 1,5\u00A0балла выше следующего');
    expect(priorityGapLine(2.5, 0)).toBe('На 2,5\u00A0балла выше следующего');
    expect(priorityGapLine(3, 3)).toBeNull();
    expect(priorityGapLine(3.4, 3)).toBeNull();
    expect(priorityGapLine(3.5, 3)).toBe('На 0,5\u00A0балла выше следующего');
  });
});
