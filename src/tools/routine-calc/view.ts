import { TOOLS_CATALOG } from '../catalog';
import { renderToolStub, type ToolStubRenderContext } from '../stub-factory';

export function renderRoutineCalcTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  renderToolStub(container, {
    ...ctx,
    meta: TOOLS_CATALOG['routine-calc'],
  });
}
