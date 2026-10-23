import { TOOLS_CATALOG } from '../catalog';
import { renderToolStub, type ToolStubRenderContext } from '../stub-factory';

export function renderRoutineCalcTool(
  container: HTMLElement,
  ctx: Omit<ToolStubRenderContext, 'meta'>,
): void {
  renderToolStub(container, {
    ...ctx,
    meta: TOOLS_CATALOG['routine-calc'],
    helpText:
      'Сколько минут в неделю уходит на однотипную ручную работу: ответы, заказы, записи, таблицы. Чем больше минут, тем больше часов в месяце и рабочих дней в году съедает эта рутина.',
  });
}
