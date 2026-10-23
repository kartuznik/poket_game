import { describe, expect, it } from 'vitest';
import type { ReadinessItemId, ReadinessStatus } from '../../lib/types';
import {
  READINESS_ITEMS,
  assessReadiness,
  bandForScore,
  defaultReadinessAnswers,
} from './calc';

function fill(status: ReadinessStatus): Record<ReadinessItemId, ReadinessStatus> {
  return {
    repeated: status,
    rules: status,
    'one-path': status,
    'one-place': status,
    faq: status,
    numbers: status,
    owner: status,
    channel: status,
    time: status,
  };
}

describe('readiness bands', () => {
  it('splits the scale into early, gaps and ready', () => {
    expect(bandForScore(0)).toBe('early');
    expect(bandForScore(3)).toBe('early');
    expect(bandForScore(3.5)).toBe('early');
    expect(bandForScore(4)).toBe('gaps');
    expect(bandForScore(6.5)).toBe('gaps');
    expect(bandForScore(7)).toBe('ready');
    expect(bandForScore(9)).toBe('ready');
  });

  it('scores nine "no" answers as zero and lists every item as open', () => {
    const result = assessReadiness(defaultReadinessAnswers());
    expect(result.score).toBe(0);
    expect(result.bandLabel).toBe('Рано');
    expect(result.unclosed).toHaveLength(9);
  });

  it('gives half a point for "partial" and still treats it as unclosed', () => {
    const result = assessReadiness(fill('partial'));
    expect(result.score).toBe(4.5);
    expect(result.band).toBe('gaps');
    expect(result.bandLabel).toBe('Закройте пробелы');
    expect(result.unclosed).toHaveLength(9);
  });

  it('reaches "можно начинать" at 7 yes answers and hides closed items', () => {
    const answers = fill('no');
    const yesIds: ReadinessItemId[] = [
      'repeated',
      'rules',
      'one-path',
      'one-place',
      'faq',
      'numbers',
      'owner',
    ];
    for (const id of yesIds) answers[id] = 'yes';
    const result = assessReadiness(answers);
    expect(result.score).toBe(7);
    expect(result.bandLabel).toBe('Можно начинать');
    expect(result.unclosed.map((item) => item.id)).toEqual(['channel', 'time']);
  });

  it('scores a full yes board as 9 with an empty gap list', () => {
    const result = assessReadiness(fill('yes'));
    expect(result.score).toBe(9);
    expect(result.band).toBe('ready');
    expect(result.unclosed).toEqual([]);
    expect(READINESS_ITEMS).toHaveLength(9);
  });

  it('mixes yes and partial without crossing into ready below 7', () => {
    const answers = fill('yes');
    answers.time = 'partial';
    answers.channel = 'partial';
    answers.owner = 'no';
    const result = assessReadiness(answers);
    expect(result.score).toBe(7);
    expect(result.band).toBe('ready');

    answers.owner = 'no';
    answers.numbers = 'no';
    const lower = assessReadiness(answers);
    expect(lower.score).toBe(6);
    expect(lower.band).toBe('gaps');
    expect(lower.unclosed.map((item) => item.id)).toEqual(['numbers', 'owner', 'channel', 'time']);
  });
});
