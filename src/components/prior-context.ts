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

export const PRIOR_CONTEXT_TITLE = 'Данные из предыдущего шага';

export const PRIOR_CONTEXT_NOTE =
  'Эти цифры мы посчитали на прошлом шаге. Они помогут точнее оценить следующий расчёт.';

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
  box.setAttribute('aria-label', PRIOR_CONTEXT_TITLE);

  const head = document.createElement('div');
  head.className = 'prior-context__head';
  head.append(createChartIcon(), titleElement());

  const note = document.createElement('p');
  note.className = 'prior-context__note';
  note.textContent = PRIOR_CONTEXT_NOTE;

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

  box.append(head, note, list);
  parent.append(box);
}

function titleElement(): HTMLParagraphElement {
  const title = document.createElement('p');
  title.className = 'prior-context__title';
  title.textContent = PRIOR_CONTEXT_TITLE;
  return title;
}

function createChartIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('prior-context__icon');
  const bars = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bars.setAttribute('fill', 'currentColor');
  bars.setAttribute(
    'd',
    'M4 20h16v2H2V2h2v18zm3-3h3V10H7v7zm5 0h3V6h-3v11zm5 0h3v-6h-3v6z',
  );
  svg.append(bars);
  return svg;
}
