import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function source(path: string): string {
  return readFileSync(resolve(here, path), 'utf8');
}

const revenue = source('revenue-risk/view.ts');
const routine = source('routine-calc/view.ts');
const priority = source('priority-diag/view.ts');
const readiness = source('readiness-check/view.ts');
const heading = source('../components/field-heading.ts');
const screens = [revenue, routine, priority, readiness, heading];

describe('inline help lines', () => {
  it('does not render a help-tip control on any screen', () => {
    for (const file of screens) {
      expect(file).not.toContain('createHelpTip');
      expect(file).not.toContain('help-tip');
      expect(file).not.toContain('bindHelpTipHover');
      expect(file).not.toContain('setHelpTipText');
    }
    expect(revenue).not.toContain('Как считаем');
    expect(routine).not.toContain('Как считаем');
    expect(priority).not.toContain('Как считаем');
  });

  it('keeps one muted line where the field would otherwise lose its meaning', () => {
    expect(revenue).toContain("const LEADS_NOTE = 'Сообщение, звонок и заявка — одно обращение.'");
    expect(revenue).toContain('LEADS_NOTE');
    expect(routine).toContain("const OPERATIONS_NOTE = 'Один звонок, сообщение или запись — одна операция.'");
    expect(routine).toContain("const MINUTES_NOTE = 'Обычное время одного раза, не самый долгий случай.'");
    expect(routine).toContain("const SHARE_NOTE = '0% — всё руками, 100% — операция уходит целиком.'");
    expect(routine).toContain("const RATE_NOTE = 'Пустое поле оставляет расчёт в часах, без рублей.'");
    expect(priority).toContain("hint.textContent = '1 — терпимо, 5 — горит'");
    expect(priority).not.toContain('почти не болит');
    expect(heading).toContain("hint.className = 'field-hint'");
  });
});
