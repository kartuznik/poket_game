import { releaseHelpTipsWithin } from '../../components/tooltip';
import { copyTextToClipboard } from '../../lib/clipboard';
import { downloadTextFile } from '../../lib/csv';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import { REPORT_CSV_FILENAME, buildEfimReport, buildReportCsv } from './export';
import { EMPTY_REPORT_TEXT, buildFinalSummary } from './summary';

export function renderFinalReportTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['final-report'];
  const sources = {
    revenue: ctx.bridge.getRevenueRiskResult(),
    routine: ctx.bridge.getRoutineResult(),
    priority: ctx.bridge.getPriorityResult(),
    readiness: ctx.bridge.getReadinessResult(),
  };
  const summary = buildFinalSummary(sources);

  releaseHelpTipsWithin(container);
  container.innerHTML = '';

  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.setAttribute('aria-labelledby', 'tool-heading-final-report');

  const card = document.createElement('div');
  card.className = 'tool-card';
  const header = document.createElement('div');
  header.className = 'tool-card__header';
  const badge = document.createElement('span');
  badge.className = 'tool-card__badge';
  badge.textContent = meta.badge;
  const title = document.createElement('h2');
  title.className = 'tool-card__title';
  title.id = 'tool-heading-final-report';
  title.textContent = meta.title;
  const subtitle = document.createElement('p');
  subtitle.className = 'tool-card__subtitle';
  subtitle.textContent = meta.subtitle;
  header.append(badge, title, subtitle);
  card.append(header);

  if (!summary.hasData) {
    const empty = document.createElement('p');
    empty.className = 'report-lead';
    empty.textContent = EMPTY_REPORT_TEXT;
    card.append(empty);
  } else {
    const result = document.createElement('div');
    result.className = 'result-card';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'result-card__eyebrow';
    eyebrow.innerHTML = '<span>СВОДКА</span><span>@_kartuzzz</span>';
    const headline = document.createElement('p');
    headline.className = 'result-card__value';
    headline.textContent = summary.headline;
    const lead = document.createElement('p');
    lead.className = 'report-lead';
    lead.textContent = summary.lead;
    result.append(eyebrow, headline, lead);

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
      blocks.append(item);
    }
    card.append(result, blocks);
  }

  const actions = document.createElement('div');
  actions.className = 'result-card__actions';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'action-btn action-btn--primary';
  copyBtn.textContent = 'Скопировать отчёт для Ефима';
  copyBtn.disabled = !summary.hasData;
  const csvBtn = document.createElement('button');
  csvBtn.type = 'button';
  csvBtn.className = 'action-btn action-btn--secondary';
  csvBtn.textContent = 'Скачать таблицу (.csv)';
  csvBtn.disabled = !summary.hasData;
  actions.append(copyBtn, csvBtn);

  const toast = document.createElement('p');
  toast.className = 'status-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;

  copyBtn.addEventListener('click', async () => {
    const copied = await copyTextToClipboard(buildEfimReport(sources), 'отчёт для Ефима');
    toast.hidden = false;
    toast.textContent = copied.ok ? 'Скопирован отчёт для Ефима' : copied.message;
  });
  csvBtn.addEventListener('click', () => {
    downloadTextFile(
      REPORT_CSV_FILENAME,
      buildReportCsv(sources),
      'text/csv;charset=utf-8',
    );
    toast.hidden = false;
    toast.textContent = 'Файл business-game-report.csv сохранён в загрузки.';
  });

  card.append(actions, toast);
  panel.append(card);
  container.append(panel);
}
