import { describe, expect, it } from 'vitest';
import { RESULT_BANNER_LABEL } from './result-banner';

describe('result banner', () => {
  it('names the card as the calculation, not another question', () => {
    expect(RESULT_BANNER_LABEL).toBe('Ваш расчёт');
  });
});
