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
import { THREADS_PROFILE_URL, buildAuditHandoff, buildRecommendations, buildTelegramSummary } from './report';

export function renderAuditFinish(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['audit-finish'];
  const { bridge, dossier, store, onNavigateTool } = ctx;
  const sources = collectReportSources(bridge);
  const summary = buildFinalSummary(sources);
  const recommendations = buildRecommendations(sources);

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

  if (recommendations.length > 0) {
    const recTitle = document.createElement('h3');
    recTitle.className = 'check-group';
    recTitle.textContent = 'Что сделать дальше';
    const recList = document.createElement('ul');
    recList.className = 'rank-list';
    for (const item of recommendations) {
      const rowItem = document.createElement('li');
      rowItem.textContent = item;
      recList.append(rowItem);
    }
    card.append(recTitle, recList);
  }

  const actions = document.createElement('div');
  actions.className = 'audit-actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--primary';
  copyBtn.textContent = 'Обсудить эти цифры с Ефимом';
  const csvBtn = document.createElement('button');
  csvBtn.type = 'button';
  csvBtn.className = 'action-btn action-btn--secondary';
  csvBtn.textContent = 'Скачать таблицу (.csv)';
  const telegramBtn = document.createElement('button');
  telegramBtn.type = 'button';
  telegramBtn.className = 'action-btn action-btn--secondary';
  telegramBtn.textContent = 'Отправить цифры в Telegram';
  actions.append(copyBtn, telegramBtn, csvBtn);

  csvBtn.disabled = !summary.hasData;

  const toast = document.createElement('p');
  toast.className = 'status-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;

  csvBtn.addEventListener('click', () => {
    if (csvBtn.disabled) return;
    downloadTextFile(
      REPORT_CSV_FILENAME,
      buildReportCsv(collectReportSources(bridge)),
      'text/csv;charset=utf-8',
    );
    showStatusToast(toast, 'Таблица скачана: business-game-report.csv.');
  });

  telegramBtn.addEventListener('click', async () => {
    const copied = await copyTextToClipboard(
      buildTelegramSummary(collectReportSources(bridge)),
      'цифры для Telegram',
    );
    window.open('https://t.me/_kartuzzz', '_blank', 'noopener,noreferrer');
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
