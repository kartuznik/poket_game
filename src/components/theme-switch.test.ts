import { describe, expect, it } from 'vitest';
import { reduceThemeMenu, themeKeyAction, type ThemeMenuState } from './theme-switch';

const CLOSED: ThemeMenuState = {
  open: false,
  selected: 'system',
  active: 'system',
};

describe('theme switch keyboard', () => {
  it('opens on Enter or Space and commits the highlighted theme', () => {
    expect(themeKeyAction('Enter', false)).toEqual({ type: 'open' });
    expect(themeKeyAction(' ', false)).toEqual({ type: 'open' });

    const opened = reduceThemeMenu(CLOSED, { type: 'open' });
    expect(opened).toEqual({ open: true, selected: 'system', active: 'system' });

    const highlighted = reduceThemeMenu(opened, { type: 'next' });
    expect(highlighted.active).toBe('light');
    expect(highlighted.selected).toBe('system');

    const committed = reduceThemeMenu(highlighted, { type: 'commit' });
    expect(committed).toEqual({ open: false, selected: 'light', active: 'light' });
  });

  it('moves with arrows, wraps, and restores the previous theme on Escape', () => {
    const opened = reduceThemeMenu(
      { open: false, selected: 'dark', active: 'light' },
      { type: 'open' },
    );
    expect(opened.active).toBe('dark');

    const wrapped = reduceThemeMenu(opened, { type: 'next' });
    expect(wrapped.active).toBe('system');

    const back = reduceThemeMenu(wrapped, { type: 'prev' });
    expect(back.active).toBe('dark');

    expect(reduceThemeMenu(back, { type: 'cancel' })).toEqual({
      open: false,
      selected: 'dark',
      active: 'dark',
    });
  });

  it('keeps Tab from changing the theme and ignores Home while closed', () => {
    expect(themeKeyAction('Tab', true)).toEqual({ type: 'close' });
    expect(themeKeyAction('Tab', false)).toBeNull();
    expect(themeKeyAction('Home', false)).toBeNull();
    expect(themeKeyAction('End', true)).toEqual({ type: 'highlight', value: 'dark' });
    expect(themeKeyAction('ArrowUp', false)).toEqual({ type: 'prev' });

    const jumped = reduceThemeMenu(
      { open: true, selected: 'light', active: 'light' },
      { type: 'highlight', value: 'dark' },
    );
    expect(jumped.selected).toBe('light');
    expect(jumped.active).toBe('dark');
  });
});
