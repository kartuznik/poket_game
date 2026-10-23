import { createFieldHeading } from '../../components/field-heading';
import { appendPriorContext } from '../../components/prior-context';
import { bindHelpTipHover, releaseHelpTipsWithin } from '../../components/tooltip';
import { createWizard } from '../../components/wizard';
import { copyTextToClipboard } from '../../lib/clipboard';
import { resolveInitialStep } from '../../lib/wizard';
import type { ReadinessItemId, ReadinessStatus } from '../../lib/types';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import {
  READINESS_ITEMS,
  assessReadiness,
  defaultReadinessAnswers,
  type ReadinessResult,
} from './calc';

const STATUS_OPTIONS: readonly { readonly id: ReadinessStatus; readonly label: string }[] = [
  { id: 'yes', label: 'Да' },
  { id: 'partial', label: 'Частично' },
  { id: 'no', label: 'Нет' },
];

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace('.', ',');
}

export function buildReadinessShareText(result: ReadinessResult): string {
  const gaps =
    result.unclosed.length === 0
      ? 'Незакрытых пунктов нет.'
      : result.unclosed.map((item) => `• ${item.title}`).join('\n');
  return [
    `Чек-лист готовности: ${result.bandLabel} (${formatScore(result.score)} из 9).`,
    result.note,
    '',
    gaps,
    '',
    '@_kartuzzz · Игра в бизнес',
  ].join('\n');
}

export function renderReadinessCheckTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['readiness-check'];
  const { bridge, store, dossier, onNavigateTool, onWizardStep, initialStep } = ctx;
  bridge.consume('readiness-check');
  const saved = bridge.getReadinessResult();
  const draft = dossier.read().readinessDraft;
  const answers: Record<ReadinessItemId, ReadinessStatus> = {
    ...(draft?.answers ?? saved?.inputs ?? defaultReadinessAnswers()),
  };
  const openedStep = resolveInitialStep(3, initialStep, draft?.step ?? null);

  releaseHelpTipsWithin(container);
  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', 'tool-heading-readiness-check');

  const inputCard = document.createElement('div');
  inputCard.className = 'tool-card';
  const header = document.createElement('div');
  header.className = 'tool-card__header';
  const badge = document.createElement('span');
  badge.className = 'tool-card__badge';
  badge.hidden = true;
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-readiness-check';
  title.textContent = meta.title;
  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = meta.subtitle;
  header.append(badge, title, subtitle);
  inputCard.append(header);
  appendPriorContext(
    inputCard,
    {
      revenue: bridge.getRevenueRiskResult(),
      routine: bridge.getRoutineResult(),
      priority: bridge.getPriorityResult(),
    },
    'readiness-check',
  );

  const groupPanels = new Map<string, HTMLElement>();
  const readinessPanels: HTMLElement[] = [];
  for (const item of READINESS_ITEMS) {
    let groupPanel = groupPanels.get(item.group);
    if (!groupPanel) {
      groupPanel = document.createElement('div');
      groupPanel.className = 'step-panel';
      const groupLabel = document.createElement('h3');
      groupLabel.className = 'check-group';
      groupLabel.textContent = item.group;
      groupPanel.append(groupLabel);
      groupPanels.set(item.group, groupPanel);
      readinessPanels.push(groupPanel);
    }

    const block = document.createElement('div');
    block.className = 'field-group';
    const scale = document.createElement('div');
    scale.className = 'choice-scale choice-scale--3';
    scale.id = `rc-item-${item.id}`;
    scale.setAttribute('role', 'group');
    scale.setAttribute('aria-label', item.title);

    for (const option of STATUS_OPTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-scale__btn';
      button.textContent = option.label;
      button.setAttribute('aria-pressed', String(answers[item.id] === option.id));
      button.addEventListener('click', () => {
        answers[item.id] = option.id;
        for (const child of scale.querySelectorAll('button')) {
          child.setAttribute('aria-pressed', String(child === button));
        }
        recalculate();
      });
      scale.append(button);
    }

    const heading = createFieldHeading(scale.id, item.title, '', item.help, () => scale);
    bindHelpTipHover(heading.tip, heading.row);
    block.append(heading.row, scale);
    groupPanel.append(block);
  }

  const resultCard = document.createElement('div');
  resultCard.className = 'result-card';
  resultCard.setAttribute('aria-live', 'polite');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'result-card__eyebrow';
  eyebrow.innerHTML = '<span>ГОТОВНОСТЬ К АВТОМАТИЗАЦИИ</span><span>@_kartuzzz</span>';
  const valueEl = document.createElement('p');
  valueEl.className = 'result-card__value';
  const noteEl = document.createElement('p');
  noteEl.className = 'result-card__note';
  const gapsTitle = document.createElement('p');
  gapsTitle.className = 'field-hint';
  gapsTitle.textContent = 'Не закрыто';
  const gaps = document.createElement('ul');
  gaps.className = 'rank-list';
  const diffBox = document.createElement('div');
  diffBox.className = 'scenario-diff';
  diffBox.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'result-card__actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--secondary';
  copyBtn.textContent = 'Скопировать резюме готовности';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn action-btn--secondary';
  saveBtn.textContent = 'Сохранить «До» для сравнения';
  actions.append(copyBtn, saveBtn);
  const toast = document.createElement('p');
  toast.className = 'status-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;

  const how = document.createElement('details');
  how.className = 'info-details';
  const howSummary = document.createElement('summary');
  howSummary.className = 'info-details__summary';
  howSummary.textContent = 'Как посчитано';
  const howBody = document.createElement('div');
  howBody.className = 'info-details__body';
  const howList = document.createElement('ul');
  howList.className = 'rank-list';
  for (const line of [
    '«Да» — 1 балл, «Частично» — 0,5, «Нет» — 0.',
    'Меньше 4 — «Рано».',
    'От 4 до 6,5 — «Закройте пробелы».',
    '7 и выше — «Можно начинать».',
    'В списке ниже всё, где ответ не «Да».',
  ]) {
    const item = document.createElement('li');
    item.textContent = line;
    howList.append(item);
  }
  howBody.append(howList);
  how.append(howSummary, howBody);

  resultCard.append(eyebrow, valueEl, noteEl, gapsTitle, gaps, diffBox, actions, toast, how);
  panel.append(inputCard);
  container.append(panel);

  let latest: ReadinessResult | null = null;

  function recalculate(): void {
    const result = assessReadiness(answers);
    latest = result;
    valueEl.textContent = result.bandLabel;
    noteEl.textContent = `${formatScore(result.score)} из 9. ${result.note}`;
    gaps.replaceChildren();
    if (result.unclosed.length === 0) {
      gapsTitle.hidden = true;
      const item = document.createElement('li');
      item.textContent = 'Все пункты закрыты.';
      gaps.append(item);
    } else {
      gapsTitle.hidden = false;
      for (const open of result.unclosed) {
        const item = document.createElement('li');
        const mark = open.status === 'partial' ? 'Частично' : 'Нет';
        item.textContent = `${open.title} — ${mark}`;
        gaps.append(item);
      }
    }

    const stored = store.load('readiness-check');
    if (stored) {
      diffBox.hidden = false;
      diffBox.textContent = `Сравнение «До / После»: было ${stored.formattedValue} → сейчас ${formatScore(result.score)} из 9.`;
    } else {
      diffBox.hidden = true;
    }
    refreshSteps();
  }

  copyBtn.addEventListener('click', async () => {
    if (!latest) return;
    const copied = await copyTextToClipboard(
      buildReadinessShareText(latest),
      'резюме готовности',
    );
    toast.hidden = false;
    toast.textContent = copied.ok ? 'Скопировано резюме готовности' : copied.message;
  });

  saveBtn.addEventListener('click', () => {
    if (!latest) return;
    store.save('readiness-check', {
      label: latest.bandLabel,
      primaryValue: latest.score,
      formattedValue: `${latest.bandLabel} (${formatScore(latest.score)} из 9)`,
    });
    recalculate();
    toast.hidden = false;
    toast.textContent = `Сохранено «До»: ${latest.bandLabel}.`;
  });

  function persistReadinessDraft(step: number): void {
    dossier.update((current) => ({
      ...current,
      readinessDraft: { step, answers: { ...answers } },
    }));
  }

  function finishReadiness(): void {
    recalculate();
    if (!latest) return;
    const snapshot = bridge.saveReadinessResult({
      inputs: { ...answers },
      results: {
        score: latest.score,
        band: latest.band,
        bandLabel: latest.bandLabel,
        unclosedTitles: latest.unclosed.map((item) => item.title),
      },
    });
    dossier.update((current) => ({ ...current, readiness: snapshot }));
    window.location.hash = meta.nextToolId;
    onNavigateTool(meta.nextToolId);
  }

  let refreshSteps = (): void => {};
  const wizard = createWizard({
    toolId: 'readiness-check',
    initialStep: openedStep,
    panels: readinessPanels,
    extras: [resultCard],
    isStepValid: () => true,
    finishLabel: meta.nextToolCta,
    onStep: (step) => {
      onWizardStep(step);
      persistReadinessDraft(step);
    },
    onFinish: finishReadiness,
  });
  refreshSteps = () => wizard.refresh();
  inputCard.append(wizard.progress, ...readinessPanels, resultCard, wizard.nav);

  recalculate();
}
