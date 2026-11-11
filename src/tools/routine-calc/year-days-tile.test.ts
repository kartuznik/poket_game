import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const viewSource = readFileSync(resolve(here, 'view.ts'), 'utf8');
const cssSource = readFileSync(resolve(here, '../../styles/main.css'), 'utf8');

/** The unbreakable tile string, number and unit kept together. */
const YEAR_DAYS_VALUE = '33,8\u00A0рабочих\u00A0дня';
/** JetBrains Mono 600 at 1.125rem. Scroll width of that string with normal tracking. */
const NATURAL_WIDTH_PX = 173;
const FONT_PX = 18;

function yearDaysRule(): { readonly maxCell: number; readonly trackingEm: number } {
  const start = cssSource.indexOf('container-name: year-days');
  const rule = cssSource.slice(start, cssSource.indexOf('}', cssSource.indexOf('letter-spacing:', start)) + 1);
  const maxCell = Number(rule.match(/max-width:\s*(\d+)px/)?.[1]);
  const trackingEm = Number(rule.match(/letter-spacing:\s*(-?[\d.]+)em/)?.[1]);
  return { maxCell, trackingEm };
}

function cellWidth(viewport: number): number {
  const wrap = Math.min(viewport, 1200);
  const wide = viewport >= 760;
  const content = wrap - (wide ? 80 : 40);
  const stage = viewport >= 960 ? content - 280 - 24 : content;
  const inner = stage - (wide ? 64 : 44) - 2;
  if (viewport < 400) return inner;
  return (inner - 8) / 2;
}

function fittedWidth(cell: number): number {
  const { maxCell, trackingEm } = yearDaysRule();
  const tracking = cell <= maxCell ? trackingEm : 0;
  const gaps = [...YEAR_DAYS_VALUE].length - 1;
  return NATURAL_WIDTH_PX + gaps * FONT_PX * tracking;
}

describe('year-days result tile', () => {
  it('keeps the unit on the Экономия в год value', () => {
    expect(viewSource).toContain(
      "metric('Экономия в год', formatWorkDays(result.savedWorkDaysPerYear), 'metric-box--year-days')",
    );
    expect(viewSource).toContain("const WORKDAY_FORMS = ['рабочий день', 'рабочих дня', 'рабочих дней']");
    expect(YEAR_DAYS_VALUE).toContain('рабочих');
    expect(YEAR_DAYS_VALUE).toContain('дня');
    expect(viewSource).not.toContain('word-break');
  });

  it('keeps the value node within its cell on the narrow result widths', () => {
    const { trackingEm, maxCell } = yearDaysRule();
    expect(trackingEm).toBeLessThan(0);
    expect(maxCell).toBeGreaterThan(0);
    const rule = cssSource.slice(cssSource.indexOf('container-name: year-days'), cssSource.indexOf('.metric-box--recoverable'));
    expect(rule).not.toContain('word-break');
    expect(rule).not.toContain('break-all');
    for (const viewport of [320, 360, 390, 400, 430, 768, 1440]) {
      const cell = cellWidth(viewport);
      expect(fittedWidth(cell)).toBeLessThanOrEqual(cell);
    }
  });
});
