import { describe, expect, it } from 'vitest';
import { TOOLS_CATALOG } from './catalog';

describe('tool sequence', () => {
  it('walks revenue, routine, priority and readiness before the report', () => {
    expect(TOOLS_CATALOG['revenue-risk'].nextToolId).toBe('routine-calc');
    expect(TOOLS_CATALOG['routine-calc'].nextToolId).toBe('priority-diag');
    expect(TOOLS_CATALOG['priority-diag'].nextToolId).toBe('readiness-check');
    expect(TOOLS_CATALOG['readiness-check'].nextToolId).toBe('audit-finish');
    expect(TOOLS_CATALOG['readiness-check'].nextToolCta).toBe('Посмотреть сводку');
  });
});
