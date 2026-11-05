import { describe, expect, it } from 'vitest';
import { priorityBarPercent, priorityGapLine, readinessRing, RING_RADIUS } from './viz';

const circumference = 2 * Math.PI * RING_RADIUS;

describe('finish screen micro visuals', () => {
  it('sizes a priority bar from a ceiling of 5', () => {
    expect(priorityBarPercent(5)).toBe(100);
    expect(priorityBarPercent(3)).toBe(60);
    expect(priorityBarPercent(1)).toBe(20);
    expect(priorityBarPercent(0)).toBe(0);
    expect(priorityBarPercent(6)).toBe(100);
    expect(priorityBarPercent(-2)).toBe(0);
  });

  it('draws the readiness arc as a share of the circle', () => {
    const six = readinessRing(6);
    expect(six.size).toBe(56);
    expect(six.stroke).toBe(4);
    expect(six.radius).toBe(26);
    expect(six.filled / circumference).toBeCloseTo(6 / 9, 5);
    expect(six.gap).toBeCloseTo(circumference - six.filled, 5);
    expect(six.label).toBe('6/9');
    expect(six.fontSize).toBe(12);

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
