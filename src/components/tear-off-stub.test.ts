import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ENABLE_TEAR_OFF_STUB,
  TEAR_OFF_MICROCOPY,
  TEAR_OFF_THRESHOLD_PX,
  clampTearOffset,
  formatCompletionStamp,
  shouldCompleteTearOff,
} from './tear-off-stub';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('tear-off stub and completion stamp', () => {
  it('uses a single canonical microcopy and 72px drag threshold', () => {
    expect(ENABLE_TEAR_OFF_STUB).toBe(true);
    expect(TEAR_OFF_MICROCOPY).toBe('СВАЙП ДЛЯ ОТРЫВА');
    expect(TEAR_OFF_THRESHOLD_PX).toBe(72);
    expect(shouldCompleteTearOff(71)).toBe(false);
    expect(shouldCompleteTearOff(72)).toBe(true);
    expect(shouldCompleteTearOff(140)).toBe(true);
    expect(shouldCompleteTearOff(Number.NaN)).toBe(false);
    expect(clampTearOffset(-15)).toBe(0);
    expect(clampTearOffset(45)).toBe(45);
    expect(clampTearOffset(240, 108)).toBe(108);
  });

  it('formats the editorial completion stamp with Moscow date', () => {
    const stamp = formatCompletionStamp(Date.UTC(2026, 10, 9, 10, 0, 0), 'dossier');
    expect(stamp).toBe('[ ✓ АУДИТ ПРОЙДЕН · 2026-11-09 ]');
    const stepStamp = formatCompletionStamp(Date.UTC(2026, 10, 9, 10, 0, 0), 'step');
    expect(stepStamp).toBe('[ ✓ РАСЧЁТ ПОДТВЕРЖДЁН · 2026-11-09 ]');
  });

  it('keeps first-level export buttons alongside the reversible stub and disables animations on reduced motion', () => {
    const finishView = readFileSync(resolve(root, 'src/tools/audit-finish/view.ts'), 'utf8');
    expect(finishView).toContain("paintLabeledButton(htmlBtn, 'Скачать HTML'");
    expect(finishView).toContain("paintLabeledButton(csvBtn, 'Таблица .CSV'");
    expect(finishView).toContain("paintLabeledButton(pdfBtn, 'Печать PDF'");
    expect(finishView).toContain('createTearOffStub(');

    const css = readFileSync(resolve(root, 'src/styles/main.css'), 'utf8');
    expect(css).toContain('@keyframes print-carriage');
    expect(css).toContain('@keyframes receipt-feed');
    expect(css).toContain('@keyframes stamp-strike');
    expect(css).toContain('@keyframes print-head-sweep');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
