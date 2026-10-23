import { createFieldHeading } from '../../components/field-heading';
import { releaseHelpTipsWithin } from '../../components/tooltip';
import { copyTextToClipboard } from '../../lib/clipboard';
import type { PriorityProcessId, PriorityScoreInput } from '../../lib/types';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import {
  PRIORITY_PROCESSES,
  defaultPriorityInputs,
  rankProcesses,
  type PriorityResult,
} from './calc';

const HELP = {
  frequency:
    'Как часто это случается. 1 — реже раза в неделю, 5 — каждый день и по многу раз. У частоты самый большой вес в формуле, 40%.',
  time:
    'Сколько времени съедает один заход. 1 — пара минут, 5 — заметная часть дня. Вес в формуле 30%.',
  errorCost:
    'Что будет, если сделать это поздно или с ошибкой. 1 — почти ничего, 5 — потерянный клиент или деньги. Вес в формуле 30%.',
} as const;

const CRITERIA = [
  { key: 'frequency', title: 'Частота', help: HELP.frequency },
  { key: 'time', title: 'Время', help: HELP.time },
  { key: 'errorCost', title: 'Цена ошибки', help: HELP.errorCost },
] as const;

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace('.', ',');
}

export function buildPriorityShareText(result: PriorityResult): string {
  const lines = result.ranked
    .map((item, index) => `${index + 1}. ${item.title} — ${formatScore(item.score)}`)
    .join('\n');
  return [
    `Что автоматизировать первым: ${result.top.title} (${formatScore(result.top.score)} из 5).`,
    result.top.recommendation,
    '',
    lines,
    '',
    '@_kartuzzz · Игра в бизнес',
  ].join('\n');
}

export function renderPriorityDiagTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['priority-diag'];
  const { bridge, store, onNavigateTool } = ctx;
  const incoming = bridge.consume('priority-diag');
  const saved = bridge.getPriorityResult();
  const scores: Record<PriorityProcessId, PriorityScoreInput> = saved
    ? {
        inquiries: saved.inputs.inquiries,
        answers: saved.inputs.answers,
        booking: saved.inputs.booking,
        payment: saved.inputs.payment,
        reminders: saved.inputs.reminders,
        reports: saved.inputs.reports,
      }
    : defaultPriorityInputs();

  releaseHelpTipsWithin(container);
  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', 'tool-heading-priority-diag');

  const inputCard = document.createElement('div');
  inputCard.className = 'tool-card';
  const header = document.createElement('div');
  header.className = 'tool-card__header';
  const badge = document.createElement('span');
  badge.className = 'tool-card__badge';
  badge.textContent = meta.badge;
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-priority-diag';
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

  const hint = document.createElement('p');
  hint.className = 'field-hint';
  hint.textContent = 'Оцените каждый процесс от 1 до 5. Единица — почти не болит, пятёрка — болит сильно.';
  inputCard.append(hint);

  for (const process of PRIORITY_PROCESSES) {
    const card = document.createElement('article');
    card.className = 'process-card';
    const heading = document.createElement('h3');
    heading.className = 'process-card__title';
    heading.textContent = process.title;
    card.append(heading);

    for (const criterion of CRITERIA) {
      const group = document.createElement('div');
      group.className = 'field-group';
      const scale = document.createElement('div');
      scale.className = 'choice-scale';
      scale.setAttribute('role', 'group');
      scale.setAttribute('aria-label', `${process.title}: ${criterion.title}`);
      const current = scores[process.id][criterion.key];

      for (let value = 1; value <= 5; value += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice-scale__btn';
        button.textContent = String(value);
        button.setAttribute('aria-pressed', String(value === current));
        button.setAttribute('aria-label', `${process.title}, ${criterion.title}: ${value}`);
        button.addEventListener('click', () => {
          scores[process.id] = { ...scores[process.id], [criterion.key]: value };
          for (const child of scale.querySelectorAll('button')) {
            child.setAttribute('aria-pressed', String(child === button));
          }
          recalculate();
        });
        scale.append(button);
      }

      const labelId = `pd-${process.id}-${criterion.key}`;
      scale.id = labelId;
      group.append(
        createFieldHeading(
          labelId,
          criterion.title,
          '1–5',
          criterion.help,
          () => scale,
        ).row,
        scale,
      );
      card.append(group);
    }
    inputCard.append(card);
  }

  const resultCard = document.createElement('div');
  resultCard.className = 'result-card';
  resultCard.setAttribute('aria-live', 'polite');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'result-card__eyebrow';
  eyebrow.innerHTML = '<span>АВТОМАТИЗИРОВАТЬ ПЕРВЫМ</span><span>@_kartuzzz</span>';
  const valueEl = document.createElement('p');
  valueEl.className = 'result-card__value';
  const noteEl = document.createElement('p');
  noteEl.className = 'result-card__note';
  const list = document.createElement('ol');
  list.className = 'rank-list';
  const diffBox = document.createElement('div');
  diffBox.className = 'scenario-diff';
  diffBox.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'result-card__actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--primary';
  copyBtn.textContent = 'Скопировать резюме для Threads';
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
    'Балл = частота × 0,4 + время × 0,3 + цена ошибки × 0,3. При равном балле выше процесс, где дороже ошибка, затем где выше частота.';
  how.append(howSummary, howBody);

  resultCard.append(eyebrow, valueEl, noteEl, list, diffBox, actions, toast, how);
  panel.append(inputCard, resultCard);
  container.append(panel);

  let latest: PriorityResult | null = null;

  function recalculate(): void {
    const result = rankProcesses(scores);
    latest = result;
    valueEl.textContent = result.top.title;
    const tieNote = result.tied
      ? ' Такой же балл есть ещё у одного процесса: выше поставлен тот, где дороже ошибка.'
      : '';
    noteEl.textContent = `Балл ${formatScore(result.top.score)} из 5. ${result.top.recommendation}${tieNote}`;

    list.replaceChildren();
    for (const item of result.ranked) {
      const row = document.createElement('li');
      row.textContent = `${item.title} — ${formatScore(item.score)}`;
      if (item.id === result.top.id) row.className = 'rank-list__top';
      list.append(row);
    }

    bridge.savePriorityResult({
      inputs: {
        inquiries: scores.inquiries,
        answers: scores.answers,
        booking: scores.booking,
        payment: scores.payment,
        reminders: scores.reminders,
        reports: scores.reports,
      },
      results: {
        topProcessId: result.top.id,
        topTitle: result.top.title,
        topScore: result.top.score,
        tied: result.tied,
        ranking: result.ranked.map((item) => ({
          id: item.id,
          title: item.title,
          score: item.score,
        })),
      },
    });

    const stored = store.load('priority-diag');
    if (stored) {
      diffBox.hidden = false;
      diffBox.textContent = `Сравнение «До / После»: было «${stored.label}» → сейчас «${result.top.title}».`;
    } else {
      diffBox.hidden = true;
    }
  }

  copyBtn.addEventListener('click', async () => {
    if (!latest) return;
    const copied = await copyTextToClipboard(
      buildPriorityShareText(latest),
      'приоритет для Threads',
    );
    toast.hidden = false;
    toast.textContent = copied.ok ? 'Скопировано резюме для Threads' : copied.message;
  });

  saveBtn.addEventListener('click', () => {
    if (!latest) return;
    store.save('priority-diag', {
      label: latest.top.title,
      primaryValue: latest.top.score,
      formattedValue: `${latest.top.title} (${formatScore(latest.top.score)})`,
    });
    recalculate();
    toast.hidden = false;
    toast.textContent = `Сохранено «До»: ${latest.top.title}.`;
  });

  handoffBtn.addEventListener('click', () => {
    recalculate();
    window.location.hash = 'final-report';
    onNavigateTool('final-report');
  });

  recalculate();
}
