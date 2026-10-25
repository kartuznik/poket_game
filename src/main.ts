import './styles/main.css';
import { createToolNav } from './components/nav-tabs';
import { createThemeSwitch } from './components/theme-switch';
import {
  DEFAULT_THEME_ID,
  buildRouteHash,
  defaultToolBridge,
  parseRouteState,
  shouldRedrawOnRoute,
} from './lib/bridge';
import { createColorSchemeController } from './lib/color-scheme';
import { defaultDossierStore, draftStepFor, hydrateBridge } from './lib/dossier';
import { defaultColorSchemeStore, defaultScenarioStore } from './lib/storage';
import type { ToolId } from './lib/types';
import { resolveInitialStep, stepCountFor } from './lib/wizard';
import { renderAuditFinish } from './tools/audit-finish/view';
import { renderFinalReportTool } from './tools/final-report/view';
import { renderPriorityDiagTool } from './tools/priority-diag/view';
import { renderReadinessCheckTool } from './tools/readiness-check/view';
import { renderRevenueRiskTool } from './tools/revenue-risk/view';
import { renderRoutineCalcTool } from './tools/routine-calc/view';

function mountApp(root: HTMLElement): void {
  const colorScheme = createColorSchemeController({
    store: defaultColorSchemeStore,
    target: document.documentElement,
    media: window.matchMedia('(prefers-color-scheme: dark)'),
  });

  const dossier = defaultDossierStore;
  hydrateBridge(dossier.read(), defaultToolBridge);

  const initialRoute = parseRouteState(
    window.location.search,
    window.location.hash,
  );
  let activeToolId: ToolId = initialRoute.toolId;
  let activeStep: number | null = stepFor(initialRoute.toolId, initialRoute.step);

  function stepFor(toolId: ToolId, routeStep: number | null | undefined): number | null {
    const count = stepCountFor(toolId);
    if (!count) return null;
    return resolveInitialStep(count, routeStep ?? null, draftStepFor(dossier.read(), toolId));
  }

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
  authorBadge.href = 'https://www.threads.com/@_kartuzzz';
  authorBadge.target = '_blank';
  authorBadge.rel = 'noopener noreferrer';
  authorBadge.textContent = '@_kartuzzz · Threads';

  const themeSwitch = createThemeSwitch(colorScheme.getPreference(), (preference) => {
    colorScheme.setPreference(preference);
  });

  const headerTools = document.createElement('div');
  headerTools.className = 'brand-header__tools';
  headerTools.append(themeSwitch.element, authorBadge);

  headerTop.append(title, headerTools);

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
    const targetHash = buildRouteHash(activeToolId, DEFAULT_THEME_ID, activeStep);
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  }

  function renderActiveTool(): void {
    mainStage.setAttribute(
      'aria-labelledby',
      activeToolId === 'audit-finish' ? 'tool-heading-audit-finish' : `tab-${activeToolId}`,
    );
    const sharedCtx = {
      bridge: defaultToolBridge,
      store: defaultScenarioStore,
      dossier,
      initialStep: activeStep,
      onWizardStep: (step: number) => {
        activeStep = step;
        syncUrlHash();
      },
      onNavigateTool: (target: ToolId, step?: number) => navigateToTool(target, true, step),
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
      case 'audit-finish':
        renderAuditFinish(mainStage, sharedCtx);
        break;
    }
  }

  function navigateToTool(
    toolId: ToolId,
    updateUrl: boolean,
    routeStep?: number | null,
  ): void {
    activeToolId = toolId;
    activeStep = stepFor(toolId, routeStep);
    nav.setActive(toolId);
    if (updateUrl) {
      syncUrlHash();
    }
    renderActiveTool();
    const result = [...mainStage.querySelectorAll<HTMLElement>('.result-card')].find(
      (card) => !card.hidden && card.querySelector('.result-banner'),
    );
    const target =
      result ??
      mainStage.querySelector<HTMLElement>('.journey-progress__step') ??
      mainStage.querySelector<HTMLElement>('.tool-card__title');
    if (target) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({
        block: 'start',
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    }
  }

  window.addEventListener('hashchange', () => {
    const next = parseRouteState(window.location.search, window.location.hash);
    if (shouldRedrawOnRoute(activeToolId, next.toolId, activeStep, next.step)) {
      navigateToTool(next.toolId, false, next.step);
    }
  });

  window.addEventListener('pagehide', () => {
    dossier.flush();
  });

  // Initial render
  navigateToTool(activeToolId, true);
}

const appRoot = document.getElementById('app');
if (appRoot) {
  mountApp(appRoot);
}
