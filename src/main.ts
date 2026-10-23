import './styles/main.css';
import {
  TOOL_IDS,
  buildRouteHash,
  defaultToolBridge,
  parseRouteState,
} from './lib/bridge';
import { defaultScenarioStore } from './lib/storage';
import type { DesignThemeId, ToolId } from './lib/types';
import { THEME_DIRECTIONS, TOOLS_CATALOG } from './tools/catalog';
import { renderPriorityDiagTool } from './tools/priority-diag/view';
import { renderReadinessCheckTool } from './tools/readiness-check/view';
import { renderRevenueRiskTool } from './tools/revenue-risk/view';
import { renderRoutineCalcTool } from './tools/routine-calc/view';

function mountApp(root: HTMLElement): void {
  const initialRoute = parseRouteState(
    window.location.search,
    window.location.hash,
  );
  let activeToolId: ToolId = initialRoute.toolId;
  let activeThemeId: DesignThemeId = initialRoute.themeId;

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  // 1. Design direction switcher (Stage 1 owner preview bar)
  const themeBar = document.createElement('aside');
  themeBar.className = 'theme-switcher';
  themeBar.setAttribute('aria-label', 'Выбор визуального направления (Этап 1)');

  const themeLabel = document.createElement('div');
  themeLabel.className = 'theme-switcher__label';
  themeLabel.textContent = 'Дизайн-направление каркаса (выбор владельца):';

  const themeBtnsWrap = document.createElement('div');
  themeBtnsWrap.className = 'theme-switcher__buttons';

  const themeButtons = new Map<DesignThemeId, HTMLButtonElement>();

  for (const dir of THEME_DIRECTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-btn';
    btn.textContent = dir.shortName;
    btn.title = dir.description;
    btn.dataset.themeChoice = dir.id;
    btn.setAttribute('aria-pressed', String(dir.id === activeThemeId));
    btn.addEventListener('click', () => {
      setTheme(dir.id, true);
    });
    themeButtons.set(dir.id, btn);
    themeBtnsWrap.appendChild(btn);
  }

  themeBar.append(themeLabel, themeBtnsWrap);

  // 2. Main Brand Header
  const header = document.createElement('header');
  header.className = 'brand-header';

  const headerTop = document.createElement('div');
  headerTop.className = 'brand-header__top';

  const title = document.createElement('h1');
  title.className = 'brand-header__title';
  title.textContent = 'Игра в бизнес';

  const authorBadge = document.createElement('a');
  authorBadge.className = 'brand-header__author';
  authorBadge.href = 'https://www.threads.net/@_kartuzzz';
  authorBadge.target = '_blank';
  authorBadge.rel = 'noopener noreferrer';
  authorBadge.textContent = '@_kartuzzz · Threads';

  headerTop.append(title, authorBadge);

  const pitch = document.createElement('p');
  pitch.className = 'brand-header__pitch';
  pitch.textContent =
    'Четыре быстрых расчёта для малого бизнеса: где теряются время и выручка на ручной работе и с чего начать автоматизацию.';

  header.append(headerTop, pitch);

  // 3. 4-Tool Navigation
  const nav = document.createElement('nav');
  nav.className = 'tool-nav';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Инструменты расчёта');

  const tabButtons = new Map<ToolId, HTMLButtonElement>();

  TOOL_IDS.forEach((id, idx) => {
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
    indexSpan.textContent = `0${idx + 1}`;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tool-nav__tab-title';
    titleSpan.textContent = meta.shortTitle;

    tab.append(indexSpan, titleSpan);

    tab.addEventListener('click', () => {
      navigateToTool(id, true);
    });

    tab.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (idx + delta + TOOL_IDS.length) % TOOL_IDS.length;
      const nextId = TOOL_IDS[nextIndex];
      if (nextId) {
        navigateToTool(nextId, true);
        tabButtons.get(nextId)?.focus();
      }
    });

    tabButtons.set(id, tab);
    nav.appendChild(tab);
  });

  // 4. Active Tool Stage
  const mainStage = document.createElement('main');
  mainStage.id = 'tool-stage';
  mainStage.setAttribute('role', 'tabpanel');

  shell.append(themeBar, header, nav, mainStage);
  root.innerHTML = '';
  root.appendChild(shell);

  function syncUrlHash(): void {
    const targetHash = buildRouteHash(activeToolId, activeThemeId);
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }

  function setTheme(themeId: DesignThemeId, updateUrl: boolean): void {
    activeThemeId = themeId;
    document.documentElement.setAttribute('data-theme', themeId);
    for (const [id, btn] of themeButtons.entries()) {
      btn.setAttribute('aria-pressed', String(id === themeId));
    }
    if (updateUrl) {
      syncUrlHash();
    }
  }

  function renderActiveTool(): void {
    mainStage.setAttribute('aria-labelledby', `tab-${activeToolId}`);
    const sharedCtx = {
      bridge: defaultToolBridge,
      store: defaultScenarioStore,
      onNavigateTool: (target: ToolId) => navigateToTool(target, true),
    };

    switch (activeToolId) {
      case 'revenue-risk':
        renderRevenueRiskTool(mainStage, sharedCtx);
        break;
      case 'routine-calc':
        renderRoutineCalcTool(mainStage, sharedCtx);
        break;
      case 'priority-diag':
        renderPriorityDiagTool(mainStage, sharedCtx);
        break;
      case 'readiness-check':
        renderReadinessCheckTool(mainStage, sharedCtx);
        break;
    }
  }

  function navigateToTool(toolId: ToolId, updateUrl: boolean): void {
    activeToolId = toolId;
    for (const [id, btn] of tabButtons.entries()) {
      btn.setAttribute('aria-selected', String(id === toolId));
    }
    if (updateUrl) {
      syncUrlHash();
    }
    renderActiveTool();
  }

  window.addEventListener('hashchange', () => {
    const next = parseRouteState(window.location.search, window.location.hash);
    if (next.themeId !== activeThemeId) {
      setTheme(next.themeId, false);
    }
    if (next.toolId !== activeToolId) {
      navigateToTool(next.toolId, false);
    }
  });

  // Initial render
  setTheme(activeThemeId, false);
  navigateToTool(activeToolId, true);
}

const appRoot = document.getElementById('app');
if (appRoot) {
  mountApp(appRoot);
}
