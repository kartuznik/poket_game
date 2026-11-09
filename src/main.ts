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
import { migrateRoutineStep, resolveInitialStep, stepCountFor } from './lib/wizard';
import { renderAuditFinish } from './tools/audit-finish/view';
import { renderFinalReportTool } from './tools/final-report/view';
import { renderPriorityDiagTool } from './tools/priority-diag/view';
import { renderReadinessCheckTool } from './tools/readiness-check/view';
import { renderRevenueRiskTool } from './tools/revenue-risk/view';
import { renderRoutineCalcTool } from './tools/routine-calc/view';

function buildHeroSection(
  onStartRevenue: () => void,
  onOpenNicheExample: () => void,
): HTMLElement {
  const hero = document.createElement('section');
  hero.className = 'hero';

  const left = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Четыре расчёта · без регистрации · счёт в браузере';

  const h1 = document.createElement('h1');
  h1.className = 'hero__title';
  h1.textContent = 'Сколько стоит ручная работа в\u00A0вашем бизнесе';

  const lead = document.createElement('p');
  lead.className = 'lead';
  lead.textContent =
    'Выручка, рутина, приоритет и готовность. Четыре пошаговых расчёта показывают порядок потерь и с чего начать автоматизацию.';

  const actions = document.createElement('div');
  actions.className = 'actions';

  const primaryCta = document.createElement('a');
  primaryCta.className = 'btn';
  primaryCta.href = '#revenue-risk';
  primaryCta.textContent = 'Посчитать выручку под риском';
  primaryCta.addEventListener('click', (event) => {
    event.preventDefault();
    onStartRevenue();
  });

  const secondaryCta = document.createElement('a');
  secondaryCta.className = 'ghost';
  secondaryCta.href = '#revenue-risk';
  secondaryCta.textContent = 'Взять пример ниши';
  secondaryCta.addEventListener('click', (event) => {
    event.preventDefault();
    onOpenNicheExample();
  });

  actions.append(primaryCta, secondaryCta);
  left.append(meta, h1, lead, actions);

  const figure = document.createElement('aside');
  figure.className = 'figure';
  figure.setAttribute('aria-label', 'Пример расчёта');

  const figMeta = document.createElement('div');
  figMeta.className = 'meta';
  figMeta.textContent = 'Пример · кафе и еда · сценарное допущение';

  const big = document.createElement('div');
  big.className = 'big num';
  big.textContent = '16\u00A0200\u00A0₽';

  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = 'выручки в месяц под риском из‑за поздних ответов';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', '0 0 360 56');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke-width', '1.5');
  poly.setAttribute('vector-effect', 'non-scaling-stroke');
  poly.setAttribute('points', '0,46 40,42 80,44 120,35 160,37 200,26 240,29 280,17 320,19 360,8');
  svg.append(poly);

  const foot = document.createElement('div');
  foot.className = 'foot';
  const footLabel = document.createElement('span');
  footLabel.className = 'meta';
  footLabel.textContent = 'Можно вернуть';
  const footVal = document.createElement('span');
  footVal.className = 'num';
  footVal.textContent = '8\u00A0100\u00A0₽/мес';
  foot.append(footLabel, footVal);

  figure.append(figMeta, big, sub, svg, foot);
  hero.append(left, figure);
  return hero;
}

function mountApp(root: HTMLElement): void {
  const colorScheme = createColorSchemeController({
    store: defaultColorSchemeStore,
    target: document.documentElement,
    media: window.matchMedia('(prefers-color-scheme: dark)'),
  });

  const dossier = defaultDossierStore;
  hydrateBridge(dossier.read(), defaultToolBridge);

  const hadInitialHash = window.location.hash.trim().length > 1;
  const initialRoute = parseRouteState(
    window.location.search,
    window.location.hash,
  );
  let activeToolId: ToolId = initialRoute.toolId;
  let activeStep: number | null = stepFor(initialRoute.toolId, initialRoute.step);

  function stepFor(toolId: ToolId, routeStep: number | null | undefined): number | null {
    const count = stepCountFor(toolId);
    if (!count) return null;
    const route = routeStep ?? null;
    const migrated = toolId === 'routine-calc' && route !== null ? migrateRoutineStep(route) : route;
    return resolveInitialStep(count, migrated, draftStepFor(dossier.read(), toolId));
  }

  const shell = document.createElement('div');
  shell.className = 'app-shell wrap';
  shell.id = 'top';

  // 1. Top Navigation Bar
  const header = document.createElement('header');
  header.className = 'brand-header nav';

  const wordmark = document.createElement('a');
  wordmark.className = 'brand-header__title wordmark';
  wordmark.href = '#top';
  wordmark.textContent = 'Игра в бизнес';

  const authorBadge = document.createElement('a');
  authorBadge.className = 'brand-header__author pill';
  authorBadge.href = 'https://www.threads.com/@_kartuzzz';
  authorBadge.target = '_blank';
  authorBadge.rel = 'noopener noreferrer';
  authorBadge.textContent = '@_kartuzzz';

  const themeSwitch = createThemeSwitch(colorScheme.getPreference(), (preference) => {
    colorScheme.setPreference(preference);
  });

  const headerTools = document.createElement('div');
  headerTools.className = 'brand-header__tools nav-r';
  headerTools.append(themeSwitch.element, authorBadge);

  header.append(wordmark, headerTools);

  // 2. Hero Section («Сколько стоит ручная работа в вашем бизнесе» + карточка-пример)
  const hero = buildHeroSection(
    () => {
      navigateToTool('revenue-risk', true, 1, true);
    },
    () => {
      navigateToTool('revenue-risk', true, 1, true);
      const nicheBtn = mainStage.querySelector<HTMLButtonElement>(
        '.niche-intro__btn, .niche-menu__toggle',
      );
      if (nicheBtn && nicheBtn.getAttribute('aria-expanded') === 'false') {
        nicheBtn.click();
      }
    },
  );

  // 3. Steps Strip
  const nav = createToolNav(activeToolId, (id) => {
    navigateToTool(id, true, undefined, true);
  });

  // 4. Active Tool Stage
  const mainStage = document.createElement('main');
  mainStage.id = 'tool-stage';
  mainStage.setAttribute('role', 'tabpanel');

  // 5. Footer
  const footer = document.createElement('footer');
  footer.className = 'site-foot';
  const footerNote = document.createElement('span');
  footerNote.textContent =
    'Сценарное допущение, не замер вашего бизнеса. Счёт идёт в браузере, автор цифры не получает.';
  const finishLink = document.createElement('a');
  finishLink.href = '#audit-finish';
  finishLink.textContent = 'Итоги аудита';
  finishLink.addEventListener('click', (event) => {
    event.preventDefault();
    navigateToTool('audit-finish', true, undefined, true);
  });
  footer.append(footerNote, finishLink);

  shell.append(header, hero, nav.element, mainStage, footer);
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
      onNavigateTool: (target: ToolId, step?: number) => navigateToTool(target, true, step, true),
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
    shouldScroll = false,
  ): void {
    activeToolId = toolId;
    activeStep = stepFor(toolId, routeStep);
    nav.setActive(toolId);
    if (updateUrl) {
      syncUrlHash();
    }
    renderActiveTool();
    if (!shouldScroll) return;
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
      navigateToTool(next.toolId, false, next.step, true);
    }
  });

  window.addEventListener('pagehide', () => {
    dossier.flush();
  });

  // Initial render: scroll to tool only if opened with a hash
  navigateToTool(activeToolId, hadInitialHash, undefined, hadInitialHash);
}

const appRoot = document.getElementById('app');
if (appRoot) {
  mountApp(appRoot);
}
