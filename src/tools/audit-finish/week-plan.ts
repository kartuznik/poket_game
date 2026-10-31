import type { ReportSources } from '../final-report/summary';
import { PRIORITY_PROCESSES } from '../priority-diag/calc';
import {
  computeCorridor,
  defaultUncertainty,
  shouldShowMeasureFirst,
  topUncertainInputs,
  UNCERTAINTY_INPUT_LABELS,
} from '../revenue-risk/calc';
import type { RevenueRiskBridgeSnapshot } from '../../lib/types';

export interface WeekStep {
  readonly id: string;
  readonly text: string;
}

const REVENUE_THRESHOLD = 20_000;
const ROUTINE_HOURS_THRESHOLD = 65;

const REVENUE_STEP: WeekStep = {
  id: 'revenue-response',
  text: 'Замерьте время первого ответа 5 дней подряд',
};

const ROUTINE_STEP: WeekStep = {
  id: 'routine-timing',
  text: 'Проведите хронометраж одного рабочего дня',
};

const OWNER_STEP: WeekStep = {
  id: 'readiness-owner',
  text: 'Назначьте ответственного за Telegram-канал',
};

const FILLERS: readonly WeekStep[] = [
  { id: 'filler-dialogs', text: 'Запишите 10 реальных диалогов этой недели' },
  { id: 'filler-channel', text: 'Неделю отвечайте только в одном канале' },
  { id: 'filler-remeasure', text: 'Повторите замер через 7 дней' },
];

function measureStep(revenue: RevenueRiskBridgeSnapshot): WeekStep | null {
  const tags = revenue.uncertainty ?? defaultUncertainty(revenue.inputs.mode);
  if (!shouldShowMeasureFirst(computeCorridor(revenue.inputs, tags))) return null;
  const names = topUncertainInputs(tags).map((id) => UNCERTAINTY_INPUT_LABELS[id]);
  if (names.length === 0) return null;
  return { id: 'measure', text: `Сначала уточните: ${names.join(' и ')}.` };
}

/** Three concrete actions for the week. Empty when nothing is confirmed yet. */
export function buildWeekPlan(sources: ReportSources): readonly WeekStep[] {
  const { revenue, routine, priority, readiness } = sources;
  if (!revenue && !routine && !priority && !readiness) return [];

  const steps: WeekStep[] = [];
  if (revenue) {
    const measure = measureStep(revenue);
    if (measure) steps.push(measure);
    if (revenue.results.revenueAtRiskMax >= REVENUE_THRESHOLD) steps.push(REVENUE_STEP);
  }
  if (routine && routine.results.hoursPerMonth >= ROUTINE_HOURS_THRESHOLD) steps.push(ROUTINE_STEP);
  if (readiness && readiness.inputs.owner !== 'yes') steps.push(OWNER_STEP);
  if (priority) {
    const process = PRIORITY_PROCESSES.find((item) => item.id === priority.results.topProcessId);
    if (process) steps.push({ id: `priority-${process.id}`, text: process.recommendation });
  }
  for (const filler of FILLERS) {
    if (steps.length >= 3) break;
    steps.push(filler);
  }
  return steps.slice(0, 3);
}
