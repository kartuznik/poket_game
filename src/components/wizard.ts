import { celebrate } from './confetti';
import {
  JOURNEY_LENGTH,
  globalProgressPercent,
  journeyIndex,
  localProgressPercent,
  nextMove,
  type JourneyToolId,
} from '../lib/wizard';

export interface WizardController {
  readonly progress: HTMLElement;
  readonly nav: HTMLElement;
  refresh(): void;
  currentStep(): number;
}

export function createWizard(options: {
  readonly toolId: JourneyToolId;
  readonly initialStep: number;
  readonly panels: readonly HTMLElement[];
  readonly extras?: readonly HTMLElement[];
  readonly isStepValid: (step: number) => boolean;
  readonly finishLabel: string;
  readonly onStep: (step: number) => void;
  readonly onFinish: () => void;
}): WizardController {
  const count = options.panels.length;
  let step = Math.min(count, Math.max(1, options.initialStep));
  const toolIndex = journeyIndex(options.toolId);

  const progress = document.createElement('div');
  progress.className = 'journey-progress';

  const toolLabel = document.createElement('span');
  toolLabel.className = 'journey-progress__label';
  toolLabel.id = `progress-${options.toolId}-tool`;
  toolLabel.textContent = `Инструмент ${toolIndex} из ${JOURNEY_LENGTH}`;

  const toolTrack = document.createElement('div');
  toolTrack.className = 'journey-progress__track';
  toolTrack.setAttribute('role', 'progressbar');
  toolTrack.setAttribute('aria-labelledby', toolLabel.id);
  toolTrack.setAttribute('aria-valuemin', '1');
  toolTrack.setAttribute('aria-valuemax', String(JOURNEY_LENGTH));
  toolTrack.setAttribute('aria-valuenow', String(toolIndex));
  const toolFill = document.createElement('span');
  toolFill.className = 'journey-progress__fill';
  toolFill.style.width = `${globalProgressPercent(toolIndex)}%`;
  toolTrack.append(toolFill);

  const stepLabel = document.createElement('span');
  stepLabel.className = 'journey-progress__label';
  stepLabel.id = `progress-${options.toolId}-step`;

  const stepTrack = document.createElement('div');
  stepTrack.className = 'journey-progress__track';
  stepTrack.setAttribute('role', 'progressbar');
  stepTrack.setAttribute('aria-labelledby', stepLabel.id);
  stepTrack.setAttribute('aria-valuemin', '1');
  stepTrack.setAttribute('aria-valuemax', String(count));
  const stepFill = document.createElement('span');
  stepFill.className = 'journey-progress__fill';
  stepTrack.append(stepFill);

  const toolRow = document.createElement('div');
  toolRow.className = 'journey-progress__row';
  toolRow.append(toolLabel, toolTrack);
  const stepRow = document.createElement('div');
  stepRow.className = 'journey-progress__row journey-progress__step';
  stepRow.append(stepLabel, stepTrack);
  progress.append(toolRow, stepRow);

  const backTop = document.createElement('button');
  backTop.type = 'button';
  backTop.className = 'action-btn action-btn--secondary wizard-nav__back wizard-nav__back--top';
  backTop.textContent = '← Назад';
  progress.append(backTop);

  const nav = document.createElement('div');
  nav.className = 'wizard-nav';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Переход между шагами');

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'action-btn action-btn--secondary wizard-nav__back';
  back.textContent = '← Назад';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'action-btn action-btn--primary wizard-nav__next';

  nav.append(back, next);

  /**
   * Prefer the text or number field. A range slider often sits before the
   * number in the same step, and focusing it pulls the cursor off the field
   * the visitor is typing in.
   */
  function stepFocusTarget(panel: HTMLElement): HTMLElement | null {
    return (
      panel.querySelector<HTMLElement>(
        'input[type="number"], input[type="text"], input[type="tel"], textarea',
      ) ??
      panel.querySelector<HTMLElement>(
        'select, .choice-scale__btn[aria-pressed="true"], .preset-card[aria-pressed="true"]',
      )
    );
  }

  function paint(moveFocus: boolean): void {
    options.panels.forEach((panel, index) => {
      panel.hidden = index !== step - 1;
    });
    for (const extra of options.extras ?? []) {
      extra.hidden = step !== count;
    }
    stepLabel.textContent = `Шаг ${step} из ${count}`;
    stepTrack.setAttribute('aria-valuenow', String(step));
    stepTrack.setAttribute('aria-valuetext', `Шаг ${step} из ${count}`);
    stepFill.style.width = `${localProgressPercent(step, count)}%`;
    back.hidden = step === 1;
    backTop.hidden = step === 1;
    const valid = options.isStepValid(step);
    next.disabled = !valid;
    next.textContent = step === count ? options.finishLabel : 'Дальше →';
    options.onStep(step);
    if (!moveFocus) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stepRow.scrollIntoView({
      block: 'start',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    const panel = options.panels[step - 1];
    if (!panel || panel.contains(document.activeElement)) return;
    const target = stepFocusTarget(panel);
    if (!target) return;
    target.focus({ preventScroll: true });
  }

  const goBack = (): void => {
    if (step === 1) return;
    step -= 1;
    paint(true);
  };
  back.addEventListener('click', goBack);
  backTop.addEventListener('click', goBack);

  next.addEventListener('click', () => {
    const move = nextMove(step, count, options.isStepValid(step));
    if (move === 'stay') {
      paint(false);
      return;
    }
    if (move === 'finish') {
      options.onFinish();
      return;
    }
    step += 1;
    paint(true);
    if (step === count) celebrate();
  });

  paint(false);

  return {
    progress,
    nav,
    refresh: () => paint(false),
    currentStep: () => step,
  };
}
