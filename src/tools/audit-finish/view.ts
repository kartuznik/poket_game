import { celebrate } from '../../components/confetti';
import { showStatusToast } from '../../components/toast';
import { copyTextToClipboard } from '../../lib/clipboard';
import { downloadTextFile } from '../../lib/csv';
import { resetVisitorProgress } from '../../lib/reset-progress';
import { JOURNEY_LENGTH, globalProgressPercent } from '../../lib/wizard';
import { TOOLS_CATALOG } from '../catalog';
import { REPORT_CSV_FILENAME, buildReportCsv } from '../final-report/export';
import { collectReportSources } from '../final-report/view';
import { EMPTY_REPORT_TEXT, buildFinalSummary } from '../final-report/summary';
import type { ToolStubRenderContext } from '../stub-factory';
import {
  TELEGRAM_PROFILE_URL,
  THREADS_PROFILE_URL,
  buildAuditHandoff,
  buildTelegramSummary,
} from './report';
import { buildWeekPlan } from './week-plan';

const THREADS_GLYPH =
  'M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z';

const TELEGRAM_GLYPH =
  'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';

function paintBrandButton(button: HTMLButtonElement, label: string, glyph: string): void {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('share-brand__icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', glyph);
  icon.append(path);
  const text = document.createElement('span');
  text.textContent = label;
  button.replaceChildren(icon, text);
}

export function renderAuditFinish(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['audit-finish'];
  const { bridge, dossier, store, onNavigateTool } = ctx;
  const sources = collectReportSources(bridge);
  const summary = buildFinalSummary(sources);
  const weekPlan = buildWeekPlan(sources);

  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', 'tool-heading-audit-finish');

  const card = document.createElement('div');
  card.className = 'tool-card';

  const header = document.createElement('div');
  header.className = 'tool-card__header';
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-audit-finish';
  title.textContent = meta.title;
  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = summary.hasData
    ? meta.subtitle
    : EMPTY_REPORT_TEXT;
  header.append(title, subtitle);

  const progress = document.createElement('div');
  progress.className = 'journey-progress';
  const progressLabel = document.createElement('span');
  progressLabel.className = 'journey-progress__label';
  progressLabel.id = 'progress-audit-finish-tool';
  progressLabel.textContent = `Инструмент ${JOURNEY_LENGTH} из ${JOURNEY_LENGTH}`;
  const track = document.createElement('div');
  track.className = 'journey-progress__track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-labelledby', progressLabel.id);
  track.setAttribute('aria-valuemin', '1');
  track.setAttribute('aria-valuemax', String(JOURNEY_LENGTH));
  track.setAttribute('aria-valuenow', String(JOURNEY_LENGTH));
  track.setAttribute('aria-valuetext', 'Все четыре инструмента пройдены');
  const fill = document.createElement('span');
  fill.className = 'journey-progress__fill';
  fill.style.width = `${globalProgressPercent(JOURNEY_LENGTH)}%`;
  track.append(fill);
  const row = document.createElement('div');
  row.className = 'journey-progress__row';
  row.append(progressLabel, track);
  progress.append(row);

  card.append(header, progress);

  if (summary.hasData) {
    const lead = document.createElement('p');
    lead.className = 'result-card__note';
    lead.textContent = summary.lead;
    card.append(lead);

    const blocks = document.createElement('div');
    blocks.className = 'report-blocks';
    for (const block of summary.blocks) {
      const item = document.createElement('article');
      item.className = 'metric-box';
      const label = document.createElement('h3');
      label.className = 'metric-box__label';
      label.textContent = block.title;
      const text = document.createElement('p');
      text.className = 'report-block__text';
      text.textContent = block.text;
      item.append(label, text);
      if (block.lines && block.lines.length > 0) {
        const list = document.createElement('ul');
        list.className = 'rank-list';
        for (const line of block.lines) {
          const lineItem = document.createElement('li');
          lineItem.textContent = line;
          list.append(lineItem);
        }
        item.append(list);
      }
      if (block.sourceToolId && block.editStep) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'action-btn action-btn--secondary summary-block__edit';
        edit.textContent = 'Изменить';
        const toolId = block.sourceToolId;
        const step = block.editStep;
        edit.addEventListener('click', () => onNavigateTool(toolId, step));
        item.append(edit);
      }
      blocks.append(item);
    }
    card.append(blocks);
  }

  if (weekPlan.length > 0) {
    const plan = document.createElement('section');
    plan.className = 'week-plan';
    const planTitle = document.createElement('h3');
    planTitle.className = 'week-plan__title';
    planTitle.textContent = 'Что сделать на этой неделе';
    const planList = document.createElement('ol');
    planList.className = 'week-plan__list';
    weekPlan.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = 'week-plan__item';
      const mark = document.createElement('span');
      mark.className = 'week-plan__index';
      mark.textContent = String(index + 1);
      const text = document.createElement('p');
      text.className = 'week-plan__text';
      text.textContent = step.text;
      item.append(mark, text);
      planList.append(item);
    });
    plan.append(planTitle, planList);
    card.append(plan);
  }

  const actions = document.createElement('div');
  actions.className = 'audit-actions';
  const share = document.createElement('div');
  share.className = 'share-brand';
  const shareTitle = document.createElement('h3');
  shareTitle.className = 'share-brand__title';
  shareTitle.textContent = 'Обсудить цифры с Ефимом';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'share-brand__btn share-brand__btn--threads';
  paintBrandButton(copyBtn, 'Threads · @_kartuzzz', THREADS_GLYPH);
  const telegramBtn = document.createElement('button');
  telegramBtn.type = 'button';
  telegramBtn.className = 'share-brand__btn share-brand__btn--telegram';
  paintBrandButton(telegramBtn, 'Telegram · @kartuznik', TELEGRAM_GLYPH);
  share.append(shareTitle, copyBtn, telegramBtn);
  const csvBtn = document.createElement('button');
  csvBtn.type = 'button';
  csvBtn.className = 'action-btn action-btn--secondary';
  csvBtn.textContent = 'Скачать таблицу (.csv)';
  actions.append(share, csvBtn);

  csvBtn.disabled = !summary.hasData;

  const toast = document.createElement('p');
  toast.className = 'status-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;

  csvBtn.addEventListener('click', () => {
    if (csvBtn.disabled) return;
    downloadTextFile(
      REPORT_CSV_FILENAME,
      buildReportCsv(collectReportSources(bridge), dossier.read().history, Date.now()),
      'text/csv;charset=utf-8',
    );
    showStatusToast(toast, 'Таблица скачана: business-game-report.csv.');
  });

  telegramBtn.addEventListener('click', async () => {
    const copied = await copyTextToClipboard(
      buildTelegramSummary(collectReportSources(bridge)),
      'цифры для Telegram',
    );
    window.open(TELEGRAM_PROFILE_URL, '_blank', 'noopener,noreferrer');
    showStatusToast(toast, copied.ok ? 'скопировано — вставь в чат' : copied.message);
  });

  copyBtn.addEventListener('click', async () => {
    const copied = await copyTextToClipboard(
      buildAuditHandoff(collectReportSources(bridge)),
      'отчёт для Ефима',
    );
    window.open(THREADS_PROFILE_URL, '_blank', 'noopener,noreferrer');
    showStatusToast(
      toast,
      copied.ok
        ? 'Отчёт скопирован. Вставьте его в сообщение Ефиму.'
        : copied.message,
    );
  });

  card.append(actions, toast);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'action-btn action-btn--danger audit-reset';
  resetBtn.textContent = 'Начать заново';

  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog';
  dialog.setAttribute('aria-labelledby', 'reset-confirm-text');
  const dialogText = document.createElement('p');
  dialogText.className = 'confirm-dialog__text';
  dialogText.id = 'reset-confirm-text';
  dialogText.textContent =
    'Вы уверены, что хотите очистить все введённые данные? Это действие нельзя отменить.';
  const dialogActions = document.createElement('div');
  dialogActions.className = 'confirm-dialog__actions';
  const keepBtn = document.createElement('button');
  keepBtn.type = 'button';
  keepBtn.className = 'action-btn action-btn--secondary';
  keepBtn.textContent = 'Оставить как есть';
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'action-btn action-btn--danger';
  confirmBtn.textContent = 'Очистить данные';
  dialogActions.append(keepBtn, confirmBtn);
  dialog.append(dialogText, dialogActions);

  resetBtn.addEventListener('click', () => {
    dialog.showModal();
  });
  keepBtn.addEventListener('click', () => {
    dialog.close();
  });
  confirmBtn.addEventListener('click', () => {
    dialog.close();
    resetVisitorProgress(dossier, bridge, store);
    onNavigateTool('revenue-risk', 1);
  });

  panel.append(card, resetBtn, dialog);
  container.append(panel);

  if (sources.revenue && sources.routine && sources.priority && sources.readiness) {
    celebrate();
  }
}
