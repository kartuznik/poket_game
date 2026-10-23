import { TOOLS_CATALOG } from '../catalog';
import { renderToolStub, type ToolStubRenderContext } from '../stub-factory';

export function renderPriorityDiagTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  renderToolStub(container, {
    ...ctx,
    meta: TOOLS_CATALOG['priority-diag'],
    helpText:
      'Насколько сильно узкое место мешает бизнесу. Дальше частота, время и цена ошибки сложатся в приоритет: что автоматизировать первым.',
  });
}
