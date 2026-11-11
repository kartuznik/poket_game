import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(resolve(here, 'view.ts'), 'utf8');
const css = readFileSync(resolve(here, '../../styles/main.css'), 'utf8').replace(/\r\n/g, '\n');
const htmlReport = readFileSync(resolve(here, '../final-report/html-report.ts'), 'utf8');
const stub = readFileSync(resolve(here, '../../components/tear-off-stub.ts'), 'utf8');

describe('week plan sewn under grid B', () => {
  it('places the plan after the grid, with mono indexes, and not on the stub', () => {
    expect(view).toContain('dashboard.append(plan)');
    expect(view).not.toContain('dashboardGrid.append(plan)');
    expect(view).not.toContain('card.append(plan)');
    expect(view).toContain("String(index + 1).padStart(2, '0')");
    expect(stub).not.toContain('week-plan');
    expect(stub).not.toContain('Что сделать на этой неделе');
    expect(htmlReport).toContain('<li>${esc(step.text)}</li>');
    expect(htmlReport).not.toContain('padStart');
  });

  it('does not rewrite the frozen grid metrics', () => {
    expect(css).toContain(`  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  overflow: hidden;`);
    expect(css).toContain(`  .finish-dashboard__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .finish-card {
    padding: 26px 24px;
  }`);
    expect(css).toContain('padding: 18px 16px;');
    expect(css).toContain('.finish-dashboard__grid + .week-plan');
    expect(css).toContain('border-bottom-left-radius: 0');
  });
});
