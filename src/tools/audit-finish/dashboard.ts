import { formatNumber, formatRubles, formatWorkHours } from '../../lib/format';
import type { ReportSources } from '../final-report/summary';

export interface DashboardCard {
  readonly id: 'risk' | 'recoverable' | 'hours' | 'readiness';
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

const UNMEASURED = 'не замерено';

/** Four confirmed metrics. A missing tool is an em dash, never a zero. */
export function buildDashboard(sources: ReportSources): readonly DashboardCard[] {
  const revenue = sources.revenue;
  const routine = sources.routine;
  const readiness = sources.readiness;
  return [
    {
      id: 'risk',
      label: 'Риск выручки',
      value: revenue ? formatRubles(revenue.results.revenueAtRiskMax) : '—',
      note: revenue ? 'в месяц' : UNMEASURED,
    },
    {
      id: 'recoverable',
      label: 'Можно вернуть',
      value: revenue ? formatRubles(revenue.results.recoverableRevenue) : '—',
      note: revenue ? 'в месяц' : UNMEASURED,
    },
    {
      id: 'hours',
      label: 'Рутина',
      value: routine ? formatWorkHours(routine.results.hoursPerMonth) : '—',
      note: routine ? 'в месяц' : UNMEASURED,
    },
    {
      id: 'readiness',
      label: 'Готовность',
      value: readiness ? `${formatNumber(readiness.results.score)}/9` : '—',
      note: readiness ? readiness.results.bandLabel : UNMEASURED,
    },
  ];
}
