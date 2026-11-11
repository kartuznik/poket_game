import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('Q17b scenario wording', () => {
  it('keeps the scenario warning only in the footer and uses пример elsewhere in the UI', () => {
    const ui = [
      'src/components/hero-preview.ts',
      'src/tools/revenue-risk/view.ts',
      'src/tools/revenue-risk/calc.ts',
    ];
    for (const path of ui) {
      expect(read(path).toLowerCase()).not.toContain('сценарное допущение');
    }
    const footer = read('src/main.ts');
    expect(footer).toContain(
      'Сценарное допущение, не замер вашего бизнеса. Счёт идёт в браузере, автор цифры не получает.',
    );
    expect(read('src/tools/revenue-risk/view.ts')).toContain("textContent = 'Пример по нише'");
    expect(read('src/tools/revenue-risk/calc.ts')).toContain('Примерные цифры, не замер вашего бизнеса');
    expect(read('src/lib/niche-presets.ts')).toContain("return nicheId ? `Ниша: ${nicheTitle(nicheId)}` : 'Моя конверсия'");
  });
});
