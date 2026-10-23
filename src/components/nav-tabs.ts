import { TOOL_IDS } from '../lib/bridge';
import type { ToolId } from '../lib/types';
import { TOOLS_CATALOG } from '../tools/catalog';

export interface ToolNavController {
  readonly element: HTMLElement;
  setActive(toolId: ToolId): void;
  focus(toolId: ToolId): void;
}

/** Numbered tabs for the four tools plus the summary. */
export function createToolNav(
  activeToolId: ToolId,
  onSelect: (toolId: ToolId) => void,
): ToolNavController {
  const nav = document.createElement('nav');
  nav.className = 'tool-nav';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Инструменты расчёта');

  const tabButtons = new Map<ToolId, HTMLButtonElement>();

  TOOL_IDS.forEach((id, index) => {
    const meta = TOOLS_CATALOG[id];
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tool-nav__tab';
    tab.id = `tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(id === activeToolId));
    tab.setAttribute('aria-controls', 'tool-stage');
    tab.dataset.toolId = id;

    const indexSpan = document.createElement('span');
    indexSpan.className = 'tool-nav__tab-index';
    indexSpan.textContent = `0${index + 1}`;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tool-nav__tab-title';
    titleSpan.textContent = meta.shortTitle;

    tab.append(indexSpan, titleSpan);
    tab.addEventListener('click', () => onSelect(id));
    tab.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (index + delta + TOOL_IDS.length) % TOOL_IDS.length;
      const nextId = TOOL_IDS[nextIndex];
      if (!nextId) return;
      onSelect(nextId);
      tabButtons.get(nextId)?.focus();
    });

    tabButtons.set(id, tab);
    nav.append(tab);
  });

  return {
    element: nav,
    setActive(toolId: ToolId): void {
      for (const [id, button] of tabButtons) {
        button.setAttribute('aria-selected', String(id === toolId));
      }
    },
    focus(toolId: ToolId): void {
      tabButtons.get(toolId)?.focus();
    },
  };
}
