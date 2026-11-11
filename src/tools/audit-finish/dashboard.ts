import { formatNumber, formatRubles, formatWorkHours } from '../../lib/format';
import type { ReportSources } from '../final-report/summary';

export interface DashboardCard {
  readonly id: 'risk' | 'recoverable' | 'hours' | 'readiness';
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

const UNMEASURED = 'не замерено';

/**
 * Four confirmed metrics. Tile labels are the approved short set.
 * Values keep their units, including the hour noun. Threads, Telegram,
 * CSV, HTML and the tear-off stub read the same value strings.
 */
export function buildDashboard(sources: ReportSources): readonly DashboardCard[] {
  const revenue = sources.revenue;
  const routine = sources.routine;
  const readiness = sources.readiness;
  return [
    {
      id: 'risk',
      label: 'Риск за мес',
      value: revenue ? formatRubles(revenue.results.revenueAtRiskMax) : '—',
      note: revenue ? '' : UNMEASURED,
    },
    {
      id: 'recoverable',
      label: 'Вернуть за мес',
      value: revenue ? formatRubles(revenue.results.recoverableRevenue) : '—',
      note: revenue ? '' : UNMEASURED,
    },
    {
      id: 'hours',
      label: 'Ручная работа',
      value: routine ? formatWorkHours(routine.results.hoursPerMonth) : '—',
      note: routine ? '' : UNMEASURED,
    },
    {
      id: 'readiness',
      label: 'Чек-лист',
      value: readiness ? `${formatNumber(readiness.results.score)}/9` : '—',
      note: readiness ? readiness.results.bandLabel : UNMEASURED,
    },
  ];
}
