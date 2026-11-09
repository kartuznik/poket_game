import { formatNumber, formatRubles, formatWorkHours } from '../lib/format';
import type {
  ReadinessBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
  ToolId,
} from '../lib/types';
import { JOURNEY_LENGTH, isJourneyToolId, journeyIndex } from '../lib/wizard';

export type StickyMetricKey = 'risk' | 'recoverable' | 'hours' | 'readiness';

export interface StickyScoreSources {
  readonly revenue: RevenueRiskBridgeSnapshot | null;
  readonly routine: RoutineBridgeSnapshot | null;
  readonly readiness: ReadinessBridgeSnapshot | null;
}

export interface StickyScoreModel {
  readonly visible: boolean;
  readonly progressLabel: string;
  readonly risk: string;
  readonly recoverable: string;
  readonly hours: string;
  readonly readiness: string;
  readonly summaryBarValue: string;
}

export function buildStickyScoreModel(
  sources: StickyScoreSources,
  activeToolId: ToolId,
  hasStarted: boolean,
): StickyScoreModel {
  const isFinalScreen = activeToolId === 'audit-finish' || activeToolId === 'final-report';
  const hasAnyConfirmed = Boolean(sources.revenue || sources.routine || sources.readiness);
  const visible = !isFinalScreen && (hasStarted || hasAnyConfirmed);

  const stepIndex = isJourneyToolId(activeToolId) ? journeyIndex(activeToolId) : JOURNEY_LENGTH;
  const progressLabel = `${String(stepIndex)}/${String(JOURNEY_LENGTH)}`;

  const risk = sources.revenue ? formatRubles(sources.revenue.results.revenueAtRiskMax) : '—';
  const recoverable = sources.revenue
    ? formatRubles(sources.revenue.results.recoverableRevenue)
    : '—';
  const hours = sources.routine ? formatWorkHours(sources.routine.results.hoursPerMonth) : '—';
  const readiness = sources.readiness
    ? `${formatNumber(sources.readiness.results.score)} / 9`
    : '—';

  const summaryBarValue =
    risk !== '—'
      ? `Риск: ${risk}`
      : hours !== '—'
        ? `Рутина: ${hours}`
        : readiness !== '—'
          ? `Чек‑лист: ${readiness}`
          : 'Ещё не посчитано';

  return {
    visible,
    progressLabel,
    risk,
    recoverable,
    hours,
    readiness,
    summaryBarValue,
  };
}

export function diffStickyMetrics(
  previous: StickyScoreModel | null,
  next: StickyScoreModel,
): readonly StickyMetricKey[] {
  if (!previous) return [];
  const changed: StickyMetricKey[] = [];
  if (previous.risk !== next.risk && next.risk !== '—') changed.push('risk');
  if (previous.recoverable !== next.recoverable && next.recoverable !== '—') {
    changed.push('recoverable');
  }
  if (previous.hours !== next.hours && next.hours !== '—') changed.push('hours');
  if (previous.readiness !== next.readiness && next.readiness !== '—') {
    changed.push('readiness');
  }
  return changed;
}

export interface StickyScoreController {
  readonly element: HTMLElement;
  update(sources: StickyScoreSources, activeToolId: ToolId, hasStarted: boolean): StickyScoreModel;
}

const ROWS: ReadonlyArray<{ readonly key: StickyMetricKey; readonly label: string }> = [
  { key: 'risk', label: 'Под риском' },
  { key: 'recoverable', label: 'Можно вернуть' },
  { key: 'hours', label: 'Часы рутины' },
  { key: 'readiness', label: 'Готовность' },
];

export function createStickyScore(): StickyScoreController {
  let prevModel: StickyScoreModel | null = null;
  let mobileExpanded = false;

  const aside = document.createElement('aside');
  aside.className = 'sticky-score';
  aside.setAttribute('aria-label', 'Ваш счёт');
  aside.setAttribute('aria-live', 'polite');
  aside.hidden = true;

  // Compact bar (always visible on mobile <=56px, header on desktop)
  const barBtn = document.createElement('button');
  barBtn.type = 'button';
  barBtn.className = 'sticky-score__bar';
  barBtn.setAttribute('aria-expanded', 'false');

  const titleWrap = document.createElement('span');
  titleWrap.className = 'sticky-score__title-wrap';

  const title = document.createElement('span');
  title.className = 'sticky-score__title';
  title.textContent = 'Ваш счёт';

  const progress = document.createElement('span');
  progress.className = 'sticky-score__progress num';
  progress.textContent = '1/4';

  titleWrap.append(title, progress);

  const summarySpan = document.createElement('span');
  summarySpan.className = 'sticky-score__summary num';
  summarySpan.textContent = '—';

  barBtn.append(titleWrap, summarySpan);

  // Body with the 4 real user metrics
  const body = document.createElement('div');
  body.className = 'sticky-score__body';

  const rowEls = new Map<StickyMetricKey, { row: HTMLDivElement; val: HTMLSpanElement }>();
  for (const item of ROWS) {
    const row = document.createElement('div');
    row.className = 'sticky-score__row';
    row.dataset.metricKey = item.key;

    const label = document.createElement('span');
    label.className = 'sticky-score__label';
    label.textContent = item.label;

    const val = document.createElement('span');
    val.className = 'sticky-score__val num';
    val.textContent = '—';

    row.append(label, val);
    body.append(row);
    rowEls.set(item.key, { row, val });
  }

  aside.append(barBtn, body);

  barBtn.addEventListener('click', () => {
    mobileExpanded = !mobileExpanded;
    aside.classList.toggle('sticky-score--open', mobileExpanded);
    barBtn.setAttribute('aria-expanded', String(mobileExpanded));
  });

  function update(
    sources: StickyScoreSources,
    activeToolId: ToolId,
    hasStarted: boolean,
  ): StickyScoreModel {
    const next = buildStickyScoreModel(sources, activeToolId, hasStarted);
    const changed = diffStickyMetrics(prevModel, next);
    prevModel = next;

    aside.hidden = !next.visible;
    progress.textContent = next.progressLabel;
    summarySpan.textContent = next.summaryBarValue;

    const values: Record<StickyMetricKey, string> = {
      risk: next.risk,
      recoverable: next.recoverable,
      hours: next.hours,
      readiness: next.readiness,
    };

    for (const item of ROWS) {
      const entry = rowEls.get(item.key);
      if (!entry) continue;
      entry.val.textContent = values[item.key];
      if (changed.includes(item.key)) {
        entry.row.classList.remove('sticky-score__row--flash');
        void entry.row.offsetWidth;
        entry.row.classList.add('sticky-score__row--flash');
        window.setTimeout(() => {
          entry.row.classList.remove('sticky-score__row--flash');
        }, 700);
      }
    }

    return next;
  }

  return {
    element: aside,
    update,
  };
}
