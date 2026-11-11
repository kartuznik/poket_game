import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ENABLE_TEAR_OFF_STUB,
  computeTearThreshold,
  formatCompletionStamp,
  normalizeTearProgress,
} from './tear-off-stub';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('real tear-off stub and Night Vault stamp', () => {
  it('computes ~1/3 width threshold clamped to 84..140px and normalizes progress', () => {
    expect(ENABLE_TEAR_OFF_STUB).toBe(true);
    expect(computeTearThreshold(200)).toBe(84);
    expect(computeTearThreshold(300)).toBeCloseTo(96, 2);
    expect(computeTearThreshold(600)).toBe(140);
    expect(normalizeTearProgress(48, 96)).toBeCloseTo(0.5, 4);
    expect(normalizeTearProgress(120, 96)).toBe(1);
    expect(normalizeTearProgress(-20, 96)).toBe(0);
  });

  it('formats the completion stamp without brackets or unicode checkmarks', () => {
    const stamp = formatCompletionStamp(Date.UTC(2026, 10, 9, 10, 0, 0));
    expect(stamp).toBe('Аудит пройден · 2026\u201111\u201109');
    expect(stamp).not.toContain('[');
    expect(stamp).not.toContain('✓');
  });

  it('mounts the real tear-off ticket, copy fallback, and tertiary links without clipping perforation notches', () => {
    const stubSource = readFileSync(resolve(root, 'src/components/tear-off-stub.ts'), 'utf8');
    expect(stubSource).toContain('Скопировать текст отчёта');
    expect(stubSource).toContain('if (event.target === stub)');

    const finishView = readFileSync(resolve(root, 'src/tools/audit-finish/view.ts'), 'utf8');
    expect(finishView).toContain('createTearOffTicket(');
    expect(finishView).toContain("htmlBtn.textContent = 'Скачать HTML'");
    expect(finishView).toContain("csvBtn.textContent = 'Таблица.CSV'");
    expect(finishView).toContain("pdfBtn.textContent = 'Печать PDF'");

    const css = readFileSync(resolve(root, 'src/styles/main.css'), 'utf8');
    expect(css).toContain('@keyframes stub-away');
    expect(css).toContain('@keyframes stub-print');
    expect(css).toContain('clip-path: inset(12px 0 100% 0)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('opacity: 0.35 !important');
  });
});
