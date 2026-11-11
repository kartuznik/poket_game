import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TYPOGRAPHY_ATTRIBUTES, bindRussianTypography } from './typography';

describe('bindRussianTypography (Q25 & Q26)', () => {
  it('binds prepositions, conjunctions, particles, dashes, and short trailing words', () => {
    expect(bindRussianTypography('Количество обращений в месяц')).toBe(
      'Количество обращений в\u00A0месяц',
    );
    expect(bindRussianTypography('Посчитать выручку под риском')).toBe(
      'Посчитать выручку под\u00A0риском',
    );
    expect(bindRussianTypography('Доля поздних или пропущенных ответов')).toBe(
      'Доля поздних или\u00A0пропущенных ответов',
    );
    expect(bindRussianTypography('Ваша ниша: Фрилансер и консультант — 10%')).toBe(
      'Ваша ниша: Фрилансер и\u00A0консультант\u00A0—\u00A010%',
    );
    expect(bindRussianTypography('Выручка под риском в год')).toBe(
      'Выручка под\u00A0риском в\u00A0год',
    );
    expect(
      bindRussianTypography('Пример · фрилансер и консультант · примерные цифры'),
    ).toBe('Пример\u00A0·\u00A0фрилансер и\u00A0консультант\u00A0·\u00A0примерные цифры');
  });

  it('inserts word-joiner (U+2060) around slash in ₽/мес even when spaces are already NBSP', () => {
    expect(bindRussianTypography('16\u00A0200\u00A0₽/мес')).toBe(
      '16\u00A0200\u00A0₽\u2060/\u2060мес',
    );
    expect(bindRussianTypography('8\u00A0100\u00A0₽/мес')).toBe(
      '8\u00A0100\u00A0₽\u2060/\u2060мес',
    );
    expect(bindRussianTypography('обращений/мес')).toBe('обращений\u2060/\u2060мес');
  });

  it('binds the remaining short words and removes a space before punctuation', () => {
    expect(bindRussianTypography('Таблица .CSV')).toBe('Таблица.CSV');
    expect(bindRussianTypography('цифра , следующая')).toBe('цифра, следующая');
    expect(bindRussianTypography('если своей цифры нет')).toBe('если\u00A0своей цифры\u00A0нет');
    expect(bindRussianTypography('чтобы закрыть пробелы')).toBe('чтобы\u00A0закрыть пробелы');
    expect(bindRussianTypography('это всё ещё пример')).toBe('это\u00A0всё\u00A0ещё\u00A0пример');
    expect(bindRussianTypography('балл их процесса')).toBe('балл их\u00A0процесса');
    expect(bindRussianTypography('уже на шаге')).toBe('уже\u00A0на\u00A0шаге');
    expect(bindRussianTypography('вот что первым')).toBe('вот\u00A0что\u00A0первым');
    expect(TYPOGRAPHY_ATTRIBUTES).toEqual([
      'aria-label',
      'aria-description',
      'placeholder',
      'title',
      'alt',
    ]);

    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const prior = readFileSync(resolve(root, 'src/components/prior-context.ts'), 'utf8');
    const finish = readFileSync(resolve(root, 'src/tools/audit-finish/view.ts'), 'utf8');
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
    const typography = readFileSync(resolve(root, 'src/lib/typography.ts'), 'utf8');
    expect(prior).not.toContain(' ,');
    expect(finish).not.toContain('Таблица .CSV');
    expect(finish).toContain("csvBtn.textContent = 'Таблица.CSV'");
    expect(main).toContain('attributeFilter');
    expect(typography).toContain('aria-label');
    expect(typography).toContain('placeholder');
    expect(typography).toContain('title');
  });
});
