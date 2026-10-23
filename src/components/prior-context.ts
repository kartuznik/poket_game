import { formatRubles, formatWorkHours } from '../lib/format';
import type {
  PriorityBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
} from '../lib/types';

export type PriorContextStep = 'routine-calc' | 'priority-diag' | 'readiness-check';

export interface PriorContextSources {
  readonly revenue: RevenueRiskBridgeSnapshot | null;
  readonly routine: RoutineBridgeSnapshot | null;
  readonly priority: PriorityBridgeSnapshot | null;
}

export interface PriorContextLine {
  readonly label: string;
  readonly text: string;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function scoreText(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
}

/**
 * Compact lines for the steps the user has already saved.
 * The current step is never included, and a skipped tool is simply absent.
 */
export function buildPriorContextLines(
  sources: PriorContextSources,
  step: PriorContextStep,
): readonly PriorContextLine[] {
  const lines: PriorContextLine[] = [];

  const risk = sources.revenue?.results.revenueAtRiskMax;
  if (finite(risk)) {
    lines.push({
      label: 'Выручка',
      text: `${formatRubles(risk)} в месяц под риском`,
    });
  }

  if (step !== 'routine-calc') {
    const hours = sources.routine?.results.hoursPerMonth;
    const saved = sources.routine?.results.savedHoursPerMonth;
    if (finite(hours) && finite(saved)) {
      const money = sources.routine?.results.savedMoneyPerMonth;
      const moneyText = finite(money) ? `, ${formatRubles(money)}` : '';
      lines.push({
        label: 'Рутина',
        text: `${formatWorkHours(hours)} в месяц, можно вернуть ${formatWorkHours(saved)}${moneyText}`,
      });
    }
  }

  if (step === 'readiness-check') {
    const title = sources.priority?.results.topTitle?.trim() ?? '';
    const score = sources.priority?.results.topScore;
    if (title.length > 0 && finite(score)) {
      lines.push({
        label: 'Что первым',
        text: `${title}, балл ${scoreText(score)}`,
      });
    }
  }

  return lines;
}

/** Renders nothing when no earlier step has a saved snapshot. */
export function appendPriorContext(
  parent: HTMLElement,
  sources: PriorContextSources,
  step: PriorContextStep,
): void {
  const lines = buildPriorContextLines(sources, step);
  if (lines.length === 0) return;

  const box = document.createElement('aside');
  box.className = 'prior-context';
  box.setAttribute('aria-label', 'Уже посчитано');

  const title = document.createElement('p');
  title.className = 'prior-context__title';
  title.textContent = 'Уже посчитано';

  const list = document.createElement('ul');
  list.className = 'prior-context__list';
  for (const line of lines) {
    const item = document.createElement('li');
    item.className = 'prior-context__row';
    const label = document.createElement('span');
    label.className = 'prior-context__label';
    label.textContent = line.label;
    const text = document.createElement('span');
    text.className = 'prior-context__text';
    text.textContent = line.text;
    item.append(label, text);
    list.append(item);
  }

  box.append(title, list);
  parent.append(box);
}
