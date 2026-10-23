import { describe, expect, it } from 'vitest';
import {
  CLOSED_TOOLTIP,
  placeTooltip,
  reduceTooltip,
  signalFromKey,
  type TooltipBox,
} from './tooltip';

const ANCHOR: TooltipBox = {
  top: 200,
  left: 40,
  right: 60,
  bottom: 220,
  width: 20,
  height: 20,
};

describe('tooltip keyboard and visibility', () => {
  it('shows on hover and hides when the pointer leaves', () => {
    const shown = reduceTooltip(CLOSED_TOOLTIP, {
      type: 'pointer-enter',
      ownerId: 'leads',
    });
    expect(shown).toEqual({ open: true, pinned: false, ownerId: 'leads' });

    const hidden = reduceTooltip(shown, {
      type: 'pointer-leave',
      ownerId: 'leads',
    });
    expect(hidden).toEqual(CLOSED_TOOLTIP);
  });

  it('pins on click or Enter/Space and ignores the pointer leaving', () => {
    expect(signalFromKey('Enter')).toBe('activate');
    expect(signalFromKey(' ')).toBe('activate');
    expect(signalFromKey('Spacebar')).toBe('activate');

    const pinned = reduceTooltip(CLOSED_TOOLTIP, {
      type: 'activate',
      ownerId: 'loss',
    });
    expect(pinned).toEqual({ open: true, pinned: true, ownerId: 'loss' });

    const stillOpen = reduceTooltip(pinned, {
      type: 'pointer-leave',
      ownerId: 'loss',
    });
    expect(stillOpen).toEqual(pinned);

    const untouched = reduceTooltip(pinned, {
      type: 'pointer-enter',
      ownerId: 'check',
    });
    expect(untouched).toEqual(pinned);
  });

  it('closes a pinned tip on the second activation, Escape, or an outside press', () => {
    const pinned = reduceTooltip(CLOSED_TOOLTIP, {
      type: 'activate',
      ownerId: 'late',
    });

    expect(
      reduceTooltip(pinned, { type: 'activate', ownerId: 'late' }),
    ).toEqual(CLOSED_TOOLTIP);

    expect(signalFromKey('Escape')).toBe('dismiss');
    expect(reduceTooltip(pinned, { type: 'dismiss' })).toEqual(CLOSED_TOOLTIP);
  });

  it('does not treat Tab as a tooltip action, so focus can move on', () => {
    expect(signalFromKey('Tab')).toBeNull();
    expect(signalFromKey('ArrowDown')).toBeNull();
  });
});

describe('tooltip placement', () => {
  it('places the popup above the trigger when there is room', () => {
    const placed = placeTooltip({
      anchor: ANCHOR,
      popup: { width: 240, height: 80 },
      viewport: { width: 960, height: 800 },
    });
    expect(placed.placement).toBe('above');
    expect(placed.top).toBe(ANCHOR.top - 8 - 80);
    expect(placed.left).toBe(ANCHOR.left);
  });

  it('drops below the field when the top edge is tight, so the input stays visible', () => {
    const avoid: TooltipBox = {
      top: 48,
      left: 16,
      right: 300,
      bottom: 94,
      width: 284,
      height: 46,
    };
    const placed = placeTooltip({
      anchor: { ...ANCHOR, top: 16, bottom: 36 },
      popup: { width: 240, height: 90 },
      viewport: { width: 375, height: 700 },
      avoid,
    });
    expect(placed.placement).toBe('below');
    expect(placed.top).toBe(avoid.bottom + 8);
  });

  it('keeps a wide popup inside a 320px viewport', () => {
    const placed = placeTooltip({
      anchor: { ...ANCHOR, left: 260, right: 280 },
      popup: { width: 280, height: 120 },
      viewport: { width: 320, height: 640 },
    });
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.left + 280).toBeLessThanOrEqual(320 - 8);
    expect(placed.top).toBeGreaterThanOrEqual(8);
  });
});
