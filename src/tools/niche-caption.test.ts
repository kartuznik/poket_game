import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Q16b niche caption', () => {
  it('does not render the niche name with the Не замер stub under the card', () => {
    const revenue = readFileSync(resolve(root, 'src/tools/revenue-risk/view.ts'), 'utf8');
    const routine = readFileSync(resolve(root, 'src/tools/routine-calc/view.ts'), 'utf8');
    expect(revenue).not.toContain('conversionCaption');
    expect(revenue).not.toContain('Не замер');
    expect(revenue).not.toContain('preset-card__desc');
    expect(routine).not.toContain('conversionCaption');
    expect(routine).not.toContain('Не замер');
    expect(routine).not.toContain('checklistCaption');
    const revenueHits = revenue.match(/замер/gi)?.length ?? 0;
    const routineHits = routine.match(/замер/gi)?.length ?? 0;
    expect(revenueHits).toBeLessThan(3);
    expect(routineHits).toBeLessThan(3);
  });
});
