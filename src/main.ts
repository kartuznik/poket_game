import './styles/main.css';
import { createToolNav } from './components/nav-tabs';
import { buildRouteHash, defaultToolBridge, parseRouteState } from './lib/bridge';
import { defaultScenarioStore } from './lib/storage';
import type { ToolId } from './lib/types';
import { renderFinalReportTool } from './tools/final-report/view';
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

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  // 1. Main Brand Header
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

  const nav = createToolNav(activeToolId, (id) => {
    navigateToTool(id, true);
  });

  // 3. Active Tool Stage
  const mainStage = document.createElement('main');
  mainStage.id = 'tool-stage';
  mainStage.setAttribute('role', 'tabpanel');

  shell.append(header, nav.element, mainStage);
  root.innerHTML = '';
  root.appendChild(shell);

  function syncUrlHash(): void {
    const targetHash = buildRouteHash(activeToolId);
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
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
      case 'final-report':
        renderFinalReportTool(mainStage, sharedCtx);
        break;
    }
  }

  function navigateToTool(toolId: ToolId, updateUrl: boolean): void {
    activeToolId = toolId;
    nav.setActive(toolId);
    if (updateUrl) {
      syncUrlHash();
    }
    renderActiveTool();
  }

  window.addEventListener('hashchange', () => {
    const next = parseRouteState(window.location.search, window.location.hash);
    if (next.toolId !== activeToolId) {
      navigateToTool(next.toolId, false);
    }
  });

  // Initial render
  navigateToTool(activeToolId, true);
}

const appRoot = document.getElementById('app');
if (appRoot) {
  mountApp(appRoot);
}
