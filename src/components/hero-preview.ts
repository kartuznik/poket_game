import { formatRubles } from '../lib/format';
import {
  listNichePresets,
  nicheById,
  type BusinessNicheId,
  type NichePreset,
} from '../lib/niche-presets';
import {
  calculateRevenueRisk,
  lossFactorFromRecoveryPercent,
} from '../tools/revenue-risk/calc';

export const MAX_VISIBLE_NICHE_CHIPS = 5;
export const COUNTER_DURATION_MS = 400;

export interface NichePreviewModel {
  readonly id: BusinessNicheId;
  readonly title: string;
  readonly caption: string;
  readonly risk: number;
  readonly recoverable: number;
  readonly riskFormatted: string;
  readonly recoverableFormatted: string;
  readonly sparklinePoints: string;
}

/**
 * Computes the live preview numbers and sparkline for a niche preset
 * using the real revenue-risk calculator formulas.
 */
export function computeNichePreview(nicheId: BusinessNicheId): NichePreviewModel {
  const preset: NichePreset = nicheById(nicheId) ?? listNichePresets()[0]!;
  const calc = calculateRevenueRisk({
    leadsPerMonth: preset.leadsPerMonth,
    lateSharePercent: preset.lateSharePercent,
    conversionPercent: preset.conversionPercent,
    avgCheck: preset.avgCheck,
    lossFactor: lossFactorFromRecoveryPercent(preset.recoveryPercent),
  });

  const risk = calc.revenueAtRiskMax;
  const recoverable = calc.recoverableRevenue;
  const sparklinePoints = buildNicheSparkline(preset, risk, recoverable);

  return {
    id: preset.id,
    title: preset.title,
    caption: `Пример · ${preset.title.toLowerCase()} · примерные цифры`,
    risk,
    recoverable,
    riskFormatted: formatRubles(risk),
    recoverableFormatted: `${formatRubles(recoverable)}/мес`,
    sparklinePoints,
  };
}

/**
 * Builds a 10-point SVG polyline (viewBox 0..360 x 0..56) reflecting
 * the niche's late-response pressure and recovery slope.
 */
export function buildNicheSparkline(
  preset: NichePreset,
  risk: number,
  recoverable: number,
): string {
  if (preset.id === 'cafe-food') {
    return '0,46 40,42 80,44 120,35 160,37 200,26 240,29 280,17 320,19 360,8';
  }
  const lateRatio = Math.min(1, Math.max(0.1, preset.lateSharePercent / 60));
  const recRatio = risk > 0 ? Math.min(1, Math.max(0.15, recoverable / risk)) : 0.5;
  const convRatio = Math.min(1, Math.max(0.1, preset.conversionPercent / 35));

  const startY = Math.round(48 - lateRatio * 8);
  const endY = Math.round(22 - recRatio * 14);
  const wobble = Math.round(2 + convRatio * 4);
  const xs = [0, 40, 80, 120, 160, 200, 240, 280, 320, 360];

  return xs
    .map((x, idx) => {
      const t = idx / (xs.length - 1);
      const base = startY + (endY - startY) * t;
      const wave = idx === 0 || idx === xs.length - 1 ? 0 : idx % 2 === 1 ? -wobble : wobble;
      const y = Math.max(6, Math.min(50, Math.round(base + wave)));
      return `${String(x)},${String(y)}`;
    })
    .join(' ');
}

/**
 * Splits the niche presets into visible chips (up to maxVisible) and overflow chips under «Ещё».
 */
export function splitNicheChips<T>(
  items: readonly T[],
  maxVisible = MAX_VISIBLE_NICHE_CHIPS,
): { readonly visible: readonly T[]; readonly overflow: readonly T[] } {
  const limit = Math.max(1, maxVisible);
  return {
    visible: items.slice(0, limit),
    overflow: items.slice(limit),
  };
}

/**
 * Roving-tabindex keyboard reducer for the niche radiogroup.
 */
export function nextChipIndex(current: number, total: number, key: string): number | null {
  if (total <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return (current + 1) % total;
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return (current - 1 + total) % total;
  }
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  return null;
}

export function interpolateCounterValue(from: number, to: number, progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  const eased = 1 - Math.pow(1 - clamped, 3);
  return Math.round(from + (to - from) * eased);
}

export interface HeroPreviewController {
  readonly element: HTMLElement;
  getSelectedNiche(): BusinessNicheId;
  setSelectedNiche(id: BusinessNicheId, animate?: boolean): void;
  setCollapsed(collapsed: boolean): void;
  isCollapsed(): boolean;
}

export function createHeroPreview(options: {
  readonly initialNiche?: BusinessNicheId;
  readonly onApplyNicheAndStart: (nicheId: BusinessNicheId) => void;
}): HeroPreviewController {
  const presets = listNichePresets();
  let selectedId: BusinessNicheId = options.initialNiche ?? 'cafe-food';
  let currentModel = computeNichePreview(selectedId);
  let collapsed = false;
  let rafId: number | null = null;

  const figure = document.createElement('aside');
  figure.className = 'figure';
  figure.setAttribute('aria-label', 'Пример расчёта по нишам');

  // 1. Accessible radiogroup of niche chips above the card metrics
  const chipGroup = document.createElement('div');
  chipGroup.className = 'figure__chips';
  chipGroup.setAttribute('role', 'radiogroup');
  chipGroup.setAttribute('aria-label', 'Выбор ниши для примера');

  const { visible, overflow } = splitNicheChips(presets, MAX_VISIBLE_NICHE_CHIPS);
  const chipButtons: HTMLButtonElement[] = [];

  const createChipButton = (preset: NichePreset): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'figure__chip';
    btn.setAttribute('role', 'radio');
    btn.dataset.nicheId = preset.id;
    btn.textContent = preset.title;
    btn.addEventListener('click', () => {
      selectNiche(preset.id, true);
    });
    btn.addEventListener('keydown', (event: KeyboardEvent) => {
      const idx = chipButtons.indexOf(btn);
      const nextIdx = nextChipIndex(idx, chipButtons.length, event.key);
      if (nextIdx === null) return;
      event.preventDefault();
      const target = chipButtons[nextIdx];
      const nextPreset = presets[nextIdx];
      if (target && nextPreset) {
        selectNiche(nextPreset.id, true);
        target.focus();
      }
    });
    return btn;
  };

  for (const preset of visible) {
    const btn = createChipButton(preset);
    chipButtons.push(btn);
    chipGroup.append(btn);
  }

  if (overflow.length > 0) {
    const moreWrap = document.createElement('div');
    moreWrap.className = 'figure__more';
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'figure__chip figure__chip--more';
    moreBtn.textContent = 'Ещё';
    moreBtn.setAttribute('aria-expanded', 'false');
    const overflowList = document.createElement('div');
    overflowList.className = 'figure__more-list';
    overflowList.hidden = true;
    for (const preset of overflow) {
      const btn = createChipButton(preset);
      chipButtons.push(btn);
      overflowList.append(btn);
    }
    moreBtn.addEventListener('click', () => {
      overflowList.hidden = !overflowList.hidden;
      moreBtn.setAttribute('aria-expanded', String(!overflowList.hidden));
    });
    moreWrap.append(moreBtn, overflowList);
    chipGroup.append(moreWrap);
  }

  // 2. Caption «Пример · <ниша> · сценарное допущение»
  const figMeta = document.createElement('div');
  figMeta.className = 'meta figure__caption';
  figMeta.textContent = currentModel.caption;

  // 3. Animated numbers + sparkline
  const big = document.createElement('div');
  big.className = 'big num';
  big.setAttribute('aria-live', 'polite');
  big.textContent = currentModel.riskFormatted;

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
  poly.setAttribute('points', currentModel.sparklinePoints);
  svg.append(poly);

  const foot = document.createElement('div');
  foot.className = 'foot';
  const footLabel = document.createElement('span');
  footLabel.className = 'meta';
  footLabel.textContent = 'Можно вернуть';
  const footVal = document.createElement('span');
  footVal.className = 'num';
  footVal.setAttribute('aria-live', 'polite');
  footVal.textContent = currentModel.recoverableFormatted;
  foot.append(footLabel, footVal);

  // 4. Primary CTA under the card: «Посчитать для своего бизнеса →»
  const ctaBtn = document.createElement('button');
  ctaBtn.type = 'button';
  ctaBtn.className = 'btn figure__cta';
  ctaBtn.textContent = 'Посчитать для своего бизнеса →';
  ctaBtn.addEventListener('click', () => {
    options.onApplyNicheAndStart(selectedId);
  });

  figure.append(chipGroup, figMeta, big, sub, svg, foot, ctaBtn);

  function syncChips(): void {
    for (const btn of chipButtons) {
      const active = btn.dataset.nicheId === selectedId;
      btn.setAttribute('aria-checked', String(active));
      btn.tabIndex = active ? 0 : -1;
      btn.classList.toggle('figure__chip--active', active);
    }
  }

  function animateNumbers(fromRisk: number, toRisk: number, fromRec: number, toRec: number): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || (fromRisk === toRisk && fromRec === toRec)) {
      big.textContent = formatRubles(toRisk);
      footVal.textContent = `${formatRubles(toRec)}/мес`;
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / COUNTER_DURATION_MS);
      const curRisk = interpolateCounterValue(fromRisk, toRisk, progress);
      const curRec = interpolateCounterValue(fromRec, toRec, progress);
      big.textContent = formatRubles(curRisk);
      footVal.textContent = `${formatRubles(curRec)}/мес`;
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
        big.textContent = formatRubles(toRisk);
        footVal.textContent = `${formatRubles(toRec)}/мес`;
      }
    };
    rafId = requestAnimationFrame(step);
  }

  function selectNiche(nextId: BusinessNicheId, animate: boolean): void {
    const prevModel = currentModel;
    selectedId = nextId;
    currentModel = computeNichePreview(nextId);
    syncChips();
    figMeta.textContent = currentModel.caption;
    poly.setAttribute('points', currentModel.sparklinePoints);
    if (animate) {
      animateNumbers(
        prevModel.risk,
        currentModel.risk,
        prevModel.recoverable,
        currentModel.recoverable,
      );
    } else {
      big.textContent = currentModel.riskFormatted;
      footVal.textContent = currentModel.recoverableFormatted;
    }
  }

  function setCollapsed(nextCollapsed: boolean): void {
    collapsed = nextCollapsed;
    figure.classList.toggle('figure--collapsed', collapsed);
    figure.setAttribute('aria-hidden', String(collapsed));
    if (collapsed) {
      figure.setAttribute('inert', '');
      for (const el of figure.querySelectorAll<HTMLElement>('button, a')) {
        el.tabIndex = -1;
      }
    } else {
      figure.removeAttribute('inert');
      ctaBtn.tabIndex = 0;
      syncChips();
    }
  }

  syncChips();

  return {
    element: figure,
    getSelectedNiche: () => selectedId,
    setSelectedNiche: (id, animate = false) => selectNiche(id, animate),
    setCollapsed,
    isCollapsed: () => collapsed,
  };
}
