import { describe, expect, it } from 'vitest';
import { escapeCsvCell, formatCsvNumber, toCsv } from './csv';

describe('csv', () => {
  it('prefixes a BOM and separates columns with semicolons', () => {
    const csv = toCsv([
      ['Раздел', 'Показатель', 'Значение'],
      ['Выручка', 'Риск', '31 500'],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith('\uFEFFРаздел;Показатель;Значение\r\n')).toBe(true);
    expect(csv).toContain('Выручка;Риск;31 500');
  });

  it('quotes cells that contain the delimiter, quotes or line breaks', () => {
    expect(escapeCsvCell('просто')).toBe('просто');
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
    expect(escapeCsvCell('скажи "да"')).toBe('"скажи ""да"""');
    const csv = toCsv([['Заметка', 'строка\nдва']]);
    expect(csv).toContain('"строка\nдва"');
  });

  it('uses a comma as the decimal mark for Russian Excel', () => {
    expect(formatCsvNumber(12.1)).toBe('12,1');
    expect(formatCsvNumber(0)).toBe('0');
    expect(formatCsvNumber(4.666)).toBe('4,67');
  });
});
