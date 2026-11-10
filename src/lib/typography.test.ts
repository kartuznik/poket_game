import { describe, expect, it } from 'vitest';
import { bindRussianTypography } from './typography';

describe('bindRussianTypography (Q25)', () => {
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
});
