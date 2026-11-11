import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  placeRevealedResult,
  shouldCollapseToResult,
  shouldTransferRevealFocus,
  type RevealedResultHost,
} from './wizard';

const wizardSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './wizard.ts'), 'utf8');

function control(hidden = false): {
  hidden: boolean;
  parentElement: { closest(selector: string): unknown };
  focus: ReturnType<typeof vi.fn>;
} {
  return {
    hidden,
    parentElement: { closest: () => null },
    focus: vi.fn(),
  };
}

describe('placeRevealedResult', () => {
  it('scrolls the revealed result into view and focuses its first control (Q52)', () => {
    const hidden = control(true);
    const visible = control(false);
    const scrollIntoView = vi.fn();
    const card: RevealedResultHost = {
      hidden: false,
      querySelectorAll: () => [hidden, visible],
      scrollIntoView,
    };
    placeRevealedResult(card, 'auto');
    expect(hidden.focus).not.toHaveBeenCalled();
    expect(visible.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(visible.focus.mock.invocationCallOrder[0]).toBeLessThan(
      scrollIntoView.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not scroll a result that is still hidden', () => {
    const scrollIntoView = vi.fn();
    const card: RevealedResultHost = {
      hidden: true,
      querySelectorAll: () => {
        throw new Error('hidden card is not searched');
      },
      scrollIntoView,
    };
    placeRevealedResult(card, 'auto');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([
    ['revenue-risk', { holdFields: false, fieldActive: true, cardHidden: true }],
    ['routine-calc', { holdFields: true, fieldActive: true, cardHidden: true }],
    ['priority-diag', { holdFields: false, fieldActive: false, cardHidden: true }],
    ['readiness-check', { holdFields: false, fieldActive: false, cardHidden: false }],
  ] as const)('collapses %s when Показать расчёт reveals the card', (_tool, flags) => {
    expect(
      shouldCollapseToResult({
        step: 2,
        count: 2,
        revealResult: true,
        inputsOpen: false,
        hasCard: true,
        ...flags,
      }),
    ).toBe(true);
    expect(
      shouldCollapseToResult({
        step: 2,
        count: 2,
        revealResult: false,
        inputsOpen: false,
        hasCard: true,
        holdFields: true,
        fieldActive: true,
        cardHidden: true,
      }),
    ).toBe(false);
  });

  it('reveals after a fresh calculation and keeps hidden panels out of tab order', () => {
    const show = wizardSource.slice(
      wizardSource.indexOf('function showResult()'),
      wizardSource.indexOf('const goAdjacent'),
    );
    expect(show.indexOf('options.onRecalculate?.()')).toBeLessThan(show.indexOf('paint(true)'));
    expect(wizardSource).toContain('panel.inert = true');
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/main.css'), 'utf8');
    expect(css).toContain('.certainty-details:not([open]) > .certainty-details__body');
    expect(css).toContain('.info-details:not([open]) > .info-details__body');
    const tools = ['revenue-risk', 'routine-calc', 'priority-diag', 'readiness-check'];
    for (const tool of tools) {
      const source = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '../tools', tool, 'view.ts'),
        'utf8',
      );
      expect(source).toContain('createResultBanner()');
      expect(source).toContain('onRecalculate:');
    }
  });

  it.each([
    ['revenue-risk', 'мышиный клик по Показать расчёт'],
    ['revenue-risk', 'Enter из поля'],
    ['revenue-risk', 'Enter по сфокусированной навкнопке'],
    ['routine-calc', 'мышиный клик по Показать расчёт'],
    ['routine-calc', 'Enter из поля'],
    ['routine-calc', 'Enter по сфокусированной навкнопке'],
    ['priority-diag', 'последний выбор шкалы'],
    ['priority-diag', 'Space по choice-scale__btn'],
    ['readiness-check', 'последний ответ'],
    ['readiness-check', 'Space по Да'],
    ['readiness-check', 'клик по Частично'],
  ])('%s after %s focuses the first visible control inside the card', (_tool, _trigger) => {
    expect(shouldTransferRevealFocus(true, true)).toBe(true);
    const hidden = control(true);
    const edit = control(false);
    const scrollIntoView = vi.fn();
    const card: RevealedResultHost = {
      hidden: false,
      querySelectorAll: () => [hidden, edit],
      scrollIntoView,
    };
    placeRevealedResult(card, 'auto');
    expect(edit.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(hidden.focus).not.toHaveBeenCalled();
  });

  it('does not move focus while the result card stays hidden', () => {
    expect(shouldTransferRevealFocus(true, false)).toBe(false);
    expect(shouldTransferRevealFocus(false, false)).toBe(false);
    expect(shouldTransferRevealFocus(false, true)).toBe(false);
  });

  it('transfers reveal focus even when paint does not ask to move focus', () => {
    const paint = wizardSource.slice(
      wizardSource.indexOf('function paint(moveFocus: boolean)'),
      wizardSource.indexOf('editBtn.addEventListener'),
    );
    const transfer = paint.indexOf('shouldTransferRevealFocus(wasHidden, nowVisible)');
    const gate = paint.indexOf('if (!moveFocus) return;');
    expect(transfer).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(transfer);
  });

  it('uses the instant reveal helper when the result card opens', () => {
    const branch = wizardSource.slice(
      wizardSource.indexOf('if (collapsed) {'),
      wizardSource.indexOf('if (inputsOpen && panel)'),
    );
    expect(branch).toContain("placeRevealedResult(card, 'auto')");
    expect(branch).not.toContain("behavior: 'smooth'");
  });
});
