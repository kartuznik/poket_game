export interface TooltipState {
  readonly open: boolean;
  readonly pinned: boolean;
  readonly ownerId: string | null;
}

export const CLOSED_TOOLTIP: TooltipState = {
  open: false,
  pinned: false,
  ownerId: null,
};

export type TooltipSignal =
  | { readonly type: 'pointer-enter'; readonly ownerId: string }
  | { readonly type: 'pointer-leave'; readonly ownerId: string }
  | { readonly type: 'activate'; readonly ownerId: string }
  | { readonly type: 'dismiss' };

export type KeySignal = 'activate' | 'dismiss';

/**
 * Maps keyboard keys to tooltip actions.
 * Tab is intentionally unmapped so focus can move to the next control.
 */
export function signalFromKey(key: string): KeySignal | null {
  if (key === 'Enter' || key === ' ' || key === 'Spacebar') return 'activate';
  if (key === 'Escape') return 'dismiss';
  return null;
}

/**
 * Hover shows an unpinned tip. Click, Enter and Space pin it.
 * A second activation, Escape, or an outside press closes it.
 * A pinned tip stays open when the pointer leaves.
 */
export function reduceTooltip(
  state: TooltipState,
  signal: TooltipSignal,
): TooltipState {
  switch (signal.type) {
    case 'pointer-enter':
      if (state.pinned) return state;
      return { open: true, pinned: false, ownerId: signal.ownerId };
    case 'pointer-leave':
      if (state.pinned) return state;
      if (state.ownerId !== signal.ownerId) return state;
      return CLOSED_TOOLTIP;
    case 'activate':
      if (state.open && state.pinned && state.ownerId === signal.ownerId) {
        return CLOSED_TOOLTIP;
      }
      return { open: true, pinned: true, ownerId: signal.ownerId };
    case 'dismiss':
      return CLOSED_TOOLTIP;
  }
}

export interface TooltipBox {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface TooltipPlacement {
  readonly top: number;
  readonly left: number;
  readonly placement: 'above' | 'below';
}

/**
 * Prefers a spot above the trigger so the explanation does not cover
 * the input under the label. If the top edge is too tight, drops below
 * the field (the avoid box) and clamps to the viewport.
 */
function boxesOverlap(
  top: number,
  left: number,
  width: number,
  height: number,
  other: TooltipBox,
): boolean {
  return left < other.right && left + width > other.left && top < other.bottom && top + height > other.top;
}

export function placeTooltip(args: {
  readonly anchor: TooltipBox;
  readonly popup: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly avoid?: TooltipBox | null;
  readonly obstacles?: readonly TooltipBox[];
  readonly margin?: number;
}): TooltipPlacement {
  const margin = args.margin ?? 8;
  const width = Math.min(args.popup.width, Math.max(0, args.viewport.width - margin * 2));
  const height = args.popup.height;
  const obstacles = args.obstacles ?? [];

  let left = args.anchor.left;
  const maxLeft = args.viewport.width - margin - width;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;

  const aboveTop = args.anchor.top - margin - height;
  const aboveHitsField = obstacles.some((obstacle) =>
    boxesOverlap(aboveTop, left, width, height, obstacle),
  );
  if (aboveTop >= margin && !aboveHitsField) {
    return { top: aboveTop, left, placement: 'above' };
  }

  const belowEdge =
    args.avoid && args.avoid.bottom > args.anchor.bottom
      ? args.avoid.bottom
      : args.anchor.bottom;
  let top = belowEdge + margin;
  const maxTop = args.viewport.height - margin - height;
  if (top > maxTop) top = Math.max(margin, maxTop);
  return { top, left, placement: 'below' };
}

export const HELP_POPUP_ID = 'app-help-tooltip';

export interface HelpTipOptions {
  readonly avoid?: () => HTMLElement | null;
}

interface BoundTip {
  readonly button: HTMLButtonElement;
  readonly text: string;
  readonly avoid: (() => HTMLElement | null) | null;
}

const boundTips = new Map<string, BoundTip>();
let tooltipState: TooltipState = CLOSED_TOOLTIP;
let listenersReady = false;
let tipSequence = 0;

function sameState(a: TooltipState, b: TooltipState): boolean {
  return a.open === b.open && a.pinned === b.pinned && a.ownerId === b.ownerId;
}

function toBox(rect: DOMRect): TooltipBox {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function ensurePopup(): HTMLElement {
  const existing = document.getElementById(HELP_POPUP_ID);
  if (existing) return existing;

  const popup = document.createElement('div');
  popup.id = HELP_POPUP_ID;
  popup.className = 'help-popup';
  popup.setAttribute('role', 'tooltip');
  popup.setAttribute('aria-hidden', 'true');
  popup.dataset.open = 'false';
  document.body.append(popup);

  popup.addEventListener('mouseenter', () => {
    if (!tooltipState.ownerId) return;
    applySignal({ type: 'pointer-enter', ownerId: tooltipState.ownerId });
  });
  popup.addEventListener('mouseleave', (event: MouseEvent) => {
    if (!tooltipState.ownerId) return;
    const next = event.relatedTarget;
    const tip = boundTips.get(tooltipState.ownerId);
    if (next instanceof Node && tip?.button.contains(next)) return;
    applySignal({ type: 'pointer-leave', ownerId: tooltipState.ownerId });
  });

  return popup;
}

function ensureListeners(popup: HTMLElement): void {
  if (listenersReady) return;
  listenersReady = true;

  document.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!tooltipState.open) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (popup.contains(target)) return;
    const owner = tooltipState.ownerId
      ? boundTips.get(tooltipState.ownerId)?.button
      : null;
    if (owner?.contains(target)) return;
    applySignal({ type: 'dismiss' });
  });

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!tooltipState.open) return;
    if (signalFromKey(event.key) !== 'dismiss') return;
    event.preventDefault();
    applySignal({ type: 'dismiss' });
  });
}

function setExpanded(button: HTMLButtonElement, expanded: boolean): void {
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (expanded) {
    button.setAttribute('aria-describedby', HELP_POPUP_ID);
  } else {
    button.removeAttribute('aria-describedby');
  }
}

function applySignal(signal: TooltipSignal): void {
  const next = reduceTooltip(tooltipState, signal);
  if (sameState(tooltipState, next)) return;

  const previousId = tooltipState.ownerId;
  tooltipState = next;
  const popup = ensurePopup();

  if (previousId && previousId !== tooltipState.ownerId) {
    const previous = boundTips.get(previousId);
    if (previous) setExpanded(previous.button, false);
  }

  if (!tooltipState.open || !tooltipState.ownerId) {
    popup.dataset.open = 'false';
    popup.setAttribute('aria-hidden', 'true');
    if (previousId) {
      const previous = boundTips.get(previousId);
      if (previous) setExpanded(previous.button, false);
    }
    return;
  }

  const tip = boundTips.get(tooltipState.ownerId);
  if (!tip) return;

  popup.textContent = tip.text;
  popup.setAttribute('aria-hidden', 'false');
  popup.dataset.open = 'false';

  const popupRect = popup.getBoundingClientRect();
  const avoidEl = tip.avoid ? tip.avoid() : null;
  const obstacles = [
    ...document.querySelectorAll<HTMLElement>('.field-input, .segmented-control'),
  ]
    .filter((element) => element !== avoidEl && !avoidEl?.contains(element))
    .map((element) => toBox(element.getBoundingClientRect()));
  const placement = placeTooltip({
    anchor: toBox(tip.button.getBoundingClientRect()),
    popup: { width: popupRect.width, height: popupRect.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    avoid: avoidEl ? toBox(avoidEl.getBoundingClientRect()) : null,
    obstacles,
  });
  popup.style.top = `${placement.top}px`;
  popup.style.left = `${placement.left}px`;

  requestAnimationFrame(() => {
    if (tooltipState.open) popup.dataset.open = 'true';
  });
  setExpanded(tip.button, true);
}

/**
 * Creates a reusable "?" trigger. One shared popup is positioned when shown.
 * Pass `avoid` so the popup drops below that field when there is no room above.
 */
/** Drops triggers that are about to leave the document, and closes the popup if one of them is open. */
export function releaseHelpTipsWithin(root: ParentNode): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>('.help-tip');
  buttons.forEach((button) => {
    const ownerId = button.dataset.helpId;
    if (!ownerId) return;
    if (tooltipState.ownerId === ownerId) {
      applySignal({ type: 'dismiss' });
    }
    boundTips.delete(ownerId);
  });
}

/** Updates the explanation, including the popup when this trigger is the one on screen. */
export function setHelpTipText(button: HTMLButtonElement, text: string): void {
  const ownerId = button.dataset.helpId;
  if (!ownerId) return;
  const tip = boundTips.get(ownerId);
  if (!tip) return;
  boundTips.set(ownerId, { button: tip.button, text, avoid: tip.avoid });
  if (tooltipState.open && tooltipState.ownerId === ownerId) {
    const popup = document.getElementById(HELP_POPUP_ID);
    if (popup) popup.textContent = text;
  }
}

export function createHelpTip(
  text: string,
  options: HelpTipOptions = {},
): HTMLButtonElement {
  const ownerId = `help-tip-${++tipSequence}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'help-tip';
  button.dataset.helpId = ownerId;
  button.setAttribute('aria-label', 'Пояснение');
  button.setAttribute('aria-expanded', 'false');

  boundTips.set(ownerId, {
    button,
    text,
    avoid: options.avoid ?? null,
  });

  const popup = ensurePopup();
  ensureListeners(popup);

  button.addEventListener('mouseenter', () => {
    applySignal({ type: 'pointer-enter', ownerId });
  });
  button.addEventListener('mouseleave', (event: MouseEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && popup.contains(next)) return;
    applySignal({ type: 'pointer-leave', ownerId });
  });
  button.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    applySignal({ type: 'activate', ownerId });
  });

  return button;
}
