import { releaseHelpTipsWithin } from '../../components/tooltip';
import { TOOLS_CATALOG } from '../catalog';
import type { ToolStubRenderContext } from '../stub-factory';
import { EMPTY_REPORT_TEXT, buildFinalSummary } from './summary';

export function renderFinalReportTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  const meta = TOOLS_CATALOG['final-report'];
  const summary = buildFinalSummary({
    revenue: ctx.bridge.getRevenueRiskResult(),
    routine: ctx.bridge.getRoutineResult(),
    priority: ctx.bridge.getPriorityResult(),
    readiness: ctx.bridge.getReadinessResult(),
  });

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
    panel.append(card);
    container.append(panel);
    return;
  }

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

  panel.append(card, result, blocks);
  container.append(panel);
}
