import { createFieldHeading } from '../../components/field-heading';
import { bindHelpTipHover, releaseHelpTipsWithin } from '../../components/tooltip';
import { copyTextToClipboard } from '../../lib/clipboard';
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
  const { bridge, store, onNavigateTool } = ctx;
  const incoming = bridge.consume('readiness-check');
  const saved = bridge.getReadinessResult();
  const answers: Record<ReadinessItemId, ReadinessStatus> = saved
    ? { ...saved.inputs }
    : defaultReadinessAnswers();

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
  badge.textContent = meta.badge;
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-readiness-check';
  title.textContent = meta.title;
  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = meta.subtitle;
  header.append(badge, title, subtitle);
  inputCard.append(header);

  if (incoming) {
    const banner = document.createElement('div');
    banner.className = 'handoff-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = `Связка инструментов: ${incoming.label}. ${incoming.note}.`;
    inputCard.append(banner);
  }

  let lastGroup = '';
  for (const item of READINESS_ITEMS) {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      const groupLabel = document.createElement('h3');
      groupLabel.className = 'check-group';
      groupLabel.textContent = item.group;
      inputCard.append(groupLabel);
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
    inputCard.append(block);
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
  const gaps = document.createElement('ul');
  gaps.className = 'rank-list';
  const diffBox = document.createElement('div');
  diffBox.className = 'scenario-diff';
  diffBox.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'result-card__actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--primary';
  copyBtn.textContent = 'Скопировать резюме готовности';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-btn action-btn--secondary';
  saveBtn.textContent = 'Сохранить «До» для сравнения';
  const handoffBtn = document.createElement('button');
  handoffBtn.type = 'button';
  handoffBtn.className = 'action-btn action-btn--handoff';
  handoffBtn.textContent = meta.nextToolCta;
  actions.append(copyBtn, saveBtn, handoffBtn);
  const toast = document.createElement('p');
  toast.className = 'status-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;

  const how = document.createElement('details');
  how.className = 'info-details';
  const howSummary = document.createElement('summary');
  howSummary.className = 'info-details__summary';
  howSummary.textContent = 'Как посчитано';
  const howBody = document.createElement('p');
  howBody.className = 'info-details__body';
  howBody.textContent =
    'Да = 1, Частично = 0,5, Нет = 0. Меньше 4 — «Рано». От 4 и до 7, не включая 7 — «Закройте пробелы». 7 и выше — «Можно начинать». Незакрытые пункты — все, где ответ не «Да».';
  how.append(howSummary, howBody);

  resultCard.append(eyebrow, valueEl, noteEl, gaps, diffBox, actions, toast, how);
  panel.append(inputCard, resultCard);
  container.append(panel);

  let latest: ReadinessResult | null = null;

  function recalculate(): void {
    const result = assessReadiness(answers);
    latest = result;
    valueEl.textContent = result.bandLabel;
    noteEl.textContent = `${formatScore(result.score)} из 9. ${result.note}`;
    gaps.replaceChildren();
    if (result.unclosed.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'Все пункты закрыты.';
      gaps.append(item);
    } else {
      for (const open of result.unclosed) {
        const item = document.createElement('li');
        const mark = open.status === 'partial' ? 'частично' : 'нет';
        item.textContent = `${open.title} — ${mark}`;
        gaps.append(item);
      }
    }

    bridge.saveReadinessResult({
      inputs: { ...answers },
      results: {
        score: result.score,
        band: result.band,
        bandLabel: result.bandLabel,
        unclosedTitles: result.unclosed.map((item) => item.title),
      },
    });

    const stored = store.load('readiness-check');
    if (stored) {
      diffBox.hidden = false;
      diffBox.textContent = `Сравнение «До / После»: было ${stored.formattedValue} → сейчас ${formatScore(result.score)} из 9.`;
    } else {
      diffBox.hidden = true;
    }
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

  handoffBtn.addEventListener('click', () => {
    recalculate();
    window.location.hash = 'final-report';
    onNavigateTool('final-report');
  });

  recalculate();
}
