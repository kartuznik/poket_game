import type { ToolId } from '../lib/types';

export interface ToolNavController {
  readonly element: HTMLElement;
  setActive(toolId: ToolId): void;
  focus(toolId: ToolId): void;
}

const STEP_ITEMS: ReadonlyArray<{
  readonly id: ToolId;
  readonly meta: string;
  readonly title: string;
  readonly desc: string;
}> = [
  { id: 'revenue-risk', meta: '01', title: 'Выручка', desc: 'под риском' },
  { id: 'routine-calc', meta: '02', title: 'Рутина', desc: 'часы в месяц' },
  { id: 'priority-diag', meta: '03', title: 'Приоритет', desc: 'что первым' },
  { id: 'readiness-check', meta: '04', title: 'Готовность', desc: 'чек-лист из 9' },
];

/** Four-step 2x2 mobile / 4x1 desktop navigation strip from the Night Vault mockup. */
export function createToolNav(
  activeToolId: ToolId,
  onSelect: (toolId: ToolId) => void,
): ToolNavController {
  const nav = document.createElement('nav');
  nav.className = 'tool-nav steps';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Инструменты расчёта');

  const tabButtons = new Map<ToolId, HTMLButtonElement>();

  STEP_ITEMS.forEach((item, index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tool-nav__tab step';
    tab.id = `tab-${item.id}`;
    tab.setAttribute('role', 'tab');
    const isActive =
      item.id === activeToolId ||
      (item.id === 'readiness-check' &&
        (activeToolId === 'audit-finish' || activeToolId === 'final-report'));
    tab.setAttribute('aria-selected', String(isActive));
    if (isActive) {
      tab.setAttribute('aria-current', 'step');
    }
    tab.setAttribute('aria-controls', 'tool-stage');
    tab.dataset.toolId = item.id;

    const indexSpan = document.createElement('span');
    indexSpan.className = 'tool-nav__tab-index meta';
    indexSpan.textContent = item.meta;

    const titleSpan = document.createElement('b');
    titleSpan.className = 'tool-nav__tab-title';
    titleSpan.textContent = item.title;

    const descSpan = document.createElement('span');
    descSpan.className = 'd';
    descSpan.textContent = item.desc;

    tab.append(indexSpan, titleSpan, descSpan);
    tab.addEventListener('click', () => onSelect(item.id));
    tab.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (index + delta + STEP_ITEMS.length) % STEP_ITEMS.length;
      const nextItem = STEP_ITEMS[nextIndex];
      if (!nextItem) return;
      onSelect(nextItem.id);
      tabButtons.get(nextItem.id)?.focus();
    });

    tabButtons.set(item.id, tab);
    nav.append(tab);
  });

  // Hidden anchor for final-report aria-labelledby compatibility
  const hiddenFinal = document.createElement('span');
  hiddenFinal.id = 'tab-final-report';
  hiddenFinal.hidden = true;
  hiddenFinal.textContent = 'Итоги';
  nav.append(hiddenFinal);

  return {
    element: nav,
    setActive(toolId: ToolId): void {
      for (const [id, button] of tabButtons) {
        const isActive =
          id === toolId ||
          (id === 'readiness-check' && (toolId === 'audit-finish' || toolId === 'final-report'));
        button.setAttribute('aria-selected', String(isActive));
        if (isActive) {
          button.setAttribute('aria-current', 'step');
        } else {
          button.removeAttribute('aria-current');
        }
      }
    },
    focus(toolId: ToolId): void {
      tabButtons.get(toolId)?.focus();
    },
  };
}
