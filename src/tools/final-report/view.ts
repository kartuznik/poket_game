import { releaseHelpTipsWithin } from '../../components/tooltip';
import type { ToolBridge } from '../../lib/bridge';
import { copyTextToClipboard } from '../../lib/clipboard';
import { downloadTextFile } from '../../lib/csv';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import { REPORT_CSV_FILENAME, buildEfimReport, buildReportCsv } from './export';
import { EMPTY_REPORT_TEXT, buildFinalSummary, type ReportSources } from './summary';

/** Reads the bridge at call time so a repeat visit cannot reuse an older paint. */
export function collectReportSources(bridge: ToolBridge): ReportSources {
  return {
    revenue: bridge.getRevenueRiskResult(),
    routine: bridge.getRoutineResult(),
    priority: bridge.getPriorityResult(),
    readiness: bridge.getReadinessResult(),
  };
}

export function renderFinalReportTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['final-report'];
  const sources = collectReportSources(ctx.bridge);
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
    eyebrow.innerHTML = '<span>ИТОГИ</span><span>@_kartuzzz</span>';
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
      if (block.lines && block.lines.length > 0) {
        const list = document.createElement('ul');
        list.className = 'rank-list';
        for (const line of block.lines) {
          const row = document.createElement('li');
          row.textContent = line;
          list.append(row);
        }
        item.append(list);
      }
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
    const fresh = collectReportSources(ctx.bridge);
    const copied = await copyTextToClipboard(buildEfimReport(fresh), 'отчёт для Ефима');
    toast.hidden = false;
    toast.textContent = copied.ok ? 'Скопирован отчёт для Ефима' : copied.message;
  });
  csvBtn.addEventListener('click', () => {
    downloadTextFile(
      REPORT_CSV_FILENAME,
      buildReportCsv(collectReportSources(ctx.bridge)),
      'text/csv;charset=utf-8',
    );
    toast.hidden = false;
    toast.textContent = 'Таблица скачана: business-game-report.csv.';
  });

  card.append(actions, toast);
  panel.append(card);
  container.append(panel);
}
