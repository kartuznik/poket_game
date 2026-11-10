import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { placeRevealedResult, type RevealedResultHost } from './wizard';

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

  it('uses the instant reveal helper when the result card opens', () => {
    const branch = wizardSource.slice(
      wizardSource.indexOf('if (collapsed) {'),
      wizardSource.indexOf('if (inputsOpen && panel)'),
    );
    expect(branch).toContain("placeRevealedResult(card, 'auto')");
    expect(branch).not.toContain("behavior: 'smooth'");
  });
});
