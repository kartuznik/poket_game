import './styles/main.css';
import { createHeroPreview, type HeroPreviewController } from './components/hero-preview';
import { createToolNav } from './components/nav-tabs';
import { createStickyScore } from './components/sticky-score';
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
import {
  applyNicheGuess,
  nicheById,
  nicheConversionPresetId,
  type BusinessNicheId,
} from './lib/niche-presets';
import { defaultColorSchemeStore, defaultScenarioStore } from './lib/storage';
import { applyTypographyToSubtree } from './lib/typography';
import type { ToolId } from './lib/types';
import { migrateRoutineStep, resolveInitialStep, stepCountFor } from './lib/wizard';
import { renderAuditFinish } from './tools/audit-finish/view';
import { renderFinalReportTool } from './tools/final-report/view';
import { renderPriorityDiagTool } from './tools/priority-diag/view';
import { renderReadinessCheckTool } from './tools/readiness-check/view';
import { defaultUncertainty } from './tools/revenue-risk/calc';
import { renderRevenueRiskTool } from './tools/revenue-risk/view';
import { renderRoutineCalcTool } from './tools/routine-calc/view';

function buildHeroSection(options: {
  readonly initialNiche: BusinessNicheId;
  readonly onStartRevenue: () => void;
  readonly onApplyNicheAndStart: (nicheId: BusinessNicheId) => void;
}): { readonly element: HTMLElement; readonly preview: HeroPreviewController } {
  const hero = document.createElement('section');
  hero.className = 'hero';

  const left = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'Без регистрации · расчёт сразу на экране';

  const h1 = document.createElement('h1');
  h1.className = 'hero__title';
  h1.textContent = 'Сколько стоит ручная работа в\u00A0вашем бизнесе';

  const lead = document.createElement('p');
  lead.className = 'lead';
  lead.textContent =
    'Выручка, рутина, приоритет и готовность — покажем, где теряются деньги и что автоматизировать первым';

  const actions = document.createElement('div');
  actions.className = 'actions';

  const primaryCta = document.createElement('a');
  primaryCta.className = 'btn';
  primaryCta.href = '#revenue-risk';
  primaryCta.textContent = 'Посчитать выручку под риском';
  primaryCta.addEventListener('click', (event) => {
    event.preventDefault();
    options.onStartRevenue();
  });

  const secondaryCta = document.createElement('a');
  secondaryCta.className = 'ghost';
  secondaryCta.href = '#revenue-risk';
  secondaryCta.textContent = 'Взять пример ниши';
  secondaryCta.addEventListener('click', (event) => {
    event.preventDefault();
    options.onApplyNicheAndStart(preview.getSelectedNiche());
  });

  actions.append(primaryCta, secondaryCta);
  left.append(meta, h1, lead, actions);

  const preview = createHeroPreview({
    initialNiche: options.initialNiche,
    onApplyNicheAndStart: options.onApplyNicheAndStart,
  });

  hero.append(left, preview.element);
  return { element: hero, preview };
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

  const hasConfirmedTools = (): boolean =>
    Boolean(
      defaultToolBridge.getRevenueRiskResult() ||
        defaultToolBridge.getRoutineResult() ||
        defaultToolBridge.getPriorityResult() ||
        defaultToolBridge.getReadinessResult(),
    );

  let hasStarted =
    hadInitialHash ||
    hasConfirmedTools() ||
    (activeStep !== null && activeStep > 1);

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
  wordmark.addEventListener('click', (event) => {
    event.preventDefault();
    if (!hasConfirmedTools()) {
      hasStarted = false;
      syncPreviewAndScore();
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

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

  function applyNichePresetToStepOne(nicheId: BusinessNicheId): void {
    const preset = nicheById(nicheId);
    if (!preset) return;
    dossier.update((current) => ({
      ...current,
      niche: preset.id,
      revenueDraft: {
        step: 1,
        leadsPerMonth: String(preset.leadsPerMonth),
        lateSharePercent: String(preset.lateSharePercent),
        conversionPercent: String(preset.conversionPercent),
        avgCheck: String(preset.avgCheck),
        lossFactorPercent: String(Math.round(100 - preset.recoveryPercent)),
        mode: 'preset',
        presetId: nicheConversionPresetId(preset.id),
        uncertainty: applyNicheGuess(current.revenueDraft?.uncertainty ?? defaultUncertainty('preset')),
        botCoverage: current.revenueDraft?.botCoverage ?? null,
      },
      routineDraft: {
        step: current.routineDraft?.step ?? 1,
        presetId:
          preset.routinePresetIds.length === 1 ? preset.routinePresetIds[0]! : null,
        presetIds: [...preset.routinePresetIds],
        customEntry: false,
        operationsPerWeek: current.routineDraft?.operationsPerWeek ?? '',
        minutesPerOperation: current.routineDraft?.minutesPerOperation ?? '',
        automationSharePercent: current.routineDraft?.automationSharePercent ?? '',
        hourlyRate: current.routineDraft?.hourlyRate ?? '',
      },
    }));
  }

  // 2. Hero Section («Сколько стоит ручная работа в вашем бизнесе» + живая карточка-пример)
  const hero = buildHeroSection({
    initialNiche: dossier.read().niche ?? 'cafe-food',
    onStartRevenue: () => {
      hasStarted = true;
      navigateToTool('revenue-risk', true, 1, true);
    },
    onApplyNicheAndStart: (nicheId) => {
      applyNichePresetToStepOne(nicheId);
      hasStarted = true;
      navigateToTool('revenue-risk', true, 1, true);
    },
  });

  // 3. Steps Strip
  const nav = createToolNav(activeToolId, (id) => {
    hasStarted = true;
    navigateToTool(id, true, undefined, true);
  });

  // 4. Active Tool Stage + Sticky Score Panel
  const stageLayout = document.createElement('div');
  stageLayout.className = 'stage-layout';

  const mainStage = document.createElement('div');
  mainStage.id = 'tool-stage';
  mainStage.setAttribute('role', 'tabpanel');

  const stickyScore = createStickyScore();
  stageLayout.append(mainStage, stickyScore.element);

  mainStage.addEventListener('input', () => {
    if (!hasStarted) {
      hasStarted = true;
      syncPreviewAndScore();
    }
  });

  // 5. Footer
  const footer = document.createElement('footer');
  footer.className = 'site-foot';
  const footerNote = document.createElement('span');
  footerNote.textContent =
    'Сценарное допущение, не замер вашего бизнеса. Счёт идёт в браузере, автор цифры не получает.';
  const finishLink = document.createElement('a');
  finishLink.href = '#audit-finish';
  finishLink.textContent = 'Итоги';
  finishLink.addEventListener('click', (event) => {
    event.preventDefault();
    navigateToTool('audit-finish', true, undefined, true);
  });
  footer.append(footerNote, finishLink);

  const pageMain = document.createElement('main');
  pageMain.className = 'page-main';
  pageMain.append(hero.element, nav.element, stageLayout);

  shell.append(header, pageMain, footer);
  root.innerHTML = '';
  root.appendChild(shell);

  let applyingTypography = false;
  const runTypography = (): void => {
    if (applyingTypography) return;
    applyingTypography = true;
    try {
      applyTypographyToSubtree(shell);
    } finally {
      applyingTypography = false;
    }
  };
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      runTypography();
    });
    observer.observe(shell, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria-description', 'placeholder', 'title', 'alt'],
    });
  }

  function syncPreviewAndScore(): void {
    const isFinal = activeToolId === 'audit-finish' || activeToolId === 'final-report';
    const collapsePreview = (hasStarted || hasConfirmedTools()) && !isFinal;
    hero.preview.setCollapsed(collapsePreview);
    const model = stickyScore.update(
      {
        revenue: defaultToolBridge.getRevenueRiskResult(),
        routine: defaultToolBridge.getRoutineResult(),
        readiness: defaultToolBridge.getReadinessResult(),
      },
      activeToolId,
      hasStarted,
    );
    stageLayout.classList.toggle('stage-layout--with-score', model.visible);
  }

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
        if (step > 1) hasStarted = true;
        syncUrlHash();
        syncPreviewAndScore();
      },
      onNavigateTool: (target: ToolId, step?: number) => {
        hasStarted = true;
        navigateToTool(target, true, step, true);
      },
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
    syncPreviewAndScore();
    runTypography();
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
    if (window.location.hash === '' || window.location.hash === '#top') {
      if (!hasConfirmedTools()) {
        hasStarted = false;
        syncPreviewAndScore();
      }
      return;
    }
    const next = parseRouteState(window.location.search, window.location.hash);
    if (shouldRedrawOnRoute(activeToolId, next.toolId, activeStep, next.step)) {
      hasStarted = true;
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
