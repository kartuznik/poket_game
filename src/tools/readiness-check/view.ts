import { TOOLS_CATALOG } from '../catalog';
import { renderToolStub, type ToolStubRenderContext } from '../stub-factory';

export function renderReadinessCheckTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  renderToolStub(container, {
    ...ctx,
    meta: TOOLS_CATALOG['readiness-check'],
    helpText:
      'Сколько из девяти условий уже выполнено. Меньше 4 баллов — рано, от 4 до 7 — закройте пробелы, 7 и больше — можно начинать.',
  });
}
