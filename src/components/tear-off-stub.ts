/**
 * Feature flag for the Variant A perforated tear-off stub on the finish dossier.
 * Set `ENABLE_TEAR_OFF_STUB = false` to remove the perforation line and gesture
 * while keeping the standard first-level buttons («Скачать HTML», «Таблица .CSV», «Печать PDF»).
 */
export const ENABLE_TEAR_OFF_STUB = true;

/** Single canonical microcopy for the perforation line, hint, and ARIA label across all viewports. */
export const TEAR_OFF_MICROCOPY = 'СВАЙП ДЛЯ ОТРЫВА';

/** Horizontal drag distance in pixels required to trigger the tear-off save action. */
export const TEAR_OFF_THRESHOLD_PX = 72;

export function shouldCompleteTearOff(deltaX: number, threshold = TEAR_OFF_THRESHOLD_PX): boolean {
  if (!Number.isFinite(deltaX)) return false;
  return deltaX >= threshold;
}

export function clampTearOffset(deltaX: number, maxPx = 108): number {
  if (!Number.isFinite(deltaX) || deltaX <= 0) return 0;
  return Math.min(maxPx, Math.round(deltaX));
}

/**
 * Formats the editorial completion stamp printed when the calculation/audit finishes.
 * Uses Moscow date (YYYY-MM-DD) so it matches the report file date.
 */
export function formatCompletionStamp(nowMs: number, scope: 'step' | 'dossier' = 'dossier'): string {
  const safeMs = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
  const moscowMs = safeMs + 3 * 60 * 60 * 1000;
  const isoDate = new Date(moscowMs).toISOString().slice(0, 10);
  const label = scope === 'dossier' ? 'АУДИТ ПРОЙДЕН' : 'РАСЧЁТ ПОДТВЕРЖДЁН';
  return `[ ✓ ${label} · ${isoDate} ]`;
}

export interface TearOffStubOptions {
  readonly enabled?: boolean;
  readonly disabled?: boolean;
  readonly onTearOff: () => void;
}

/**
 * Mounts the Variant A bottom receipt perforation and tear-off handle.
 * Returns `null` when `enabled` is false so the caller doesn't need conditional branches.
 */
export function createTearOffStub(options: TearOffStubOptions): HTMLElement | null {
  const isEnabled = options.enabled ?? ENABLE_TEAR_OFF_STUB;
  if (!isEnabled) return null;

  const wrap = document.createElement('div');
  wrap.className = 'tear-stub print-receipt-row';
  wrap.style.setProperty('--receipt-row', '6');

  const perforation = document.createElement('div');
  perforation.className = 'tear-stub__perforation';
  perforation.setAttribute('aria-hidden', 'true');

  const ruleLeft = document.createElement('span');
  ruleLeft.className = 'tear-stub__rule';
  const hint = document.createElement('span');
  hint.className = 'tear-stub__hint';
  hint.textContent = `✂ ${TEAR_OFF_MICROCOPY}`;
  const ruleRight = document.createElement('span');
  ruleRight.className = 'tear-stub__rule';
  perforation.append(ruleLeft, hint, ruleRight);

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'tear-stub__handle';
  handle.disabled = Boolean(options.disabled);
  handle.setAttribute('aria-label', `${TEAR_OFF_MICROCOPY} — Скачать HTML`);

  const handleText = document.createElement('span');
  handleText.className = 'tear-stub__handle-text';
  handleText.textContent = `⇥ ${TEAR_OFF_MICROCOPY}`;

  const handleMeta = document.createElement('span');
  handleMeta.className = 'tear-stub__handle-meta';
  handleMeta.textContent = 'HTML · ENTER';

  handle.append(handleText, handleMeta);
  wrap.append(perforation, handle);

  let startX: number | null = null;
  let dragged = false;
  let torn = false;

  const triggerSave = (): void => {
    if (handle.disabled) return;
    torn = true;
    wrap.classList.add('tear-stub--torn');
    triggerPrintPulse(handle, '[ ✓ ДОСЬЕ ОТКРЕПЛЕНО · HTML ]');
    options.onTearOff();
    window.setTimeout(() => {
      torn = false;
      wrap.classList.remove('tear-stub--torn');
      handle.style.removeProperty('--tear-offset');
    }, 640);
  };

  handle.addEventListener('pointerdown', (event: PointerEvent) => {
    if (handle.disabled || event.button !== 0) return;
    startX = event.clientX;
    dragged = false;
    handle.setPointerCapture?.(event.pointerId);
  });

  handle.addEventListener('pointermove', (event: PointerEvent) => {
    if (startX === null || handle.disabled || torn) return;
    const delta = event.clientX - startX;
    if (delta > 6) dragged = true;
    const offset = clampTearOffset(delta);
    handle.style.setProperty('--tear-offset', `${String(offset)}px`);
    if (shouldCompleteTearOff(delta)) {
      startX = null;
      triggerSave();
    }
  });

  const endPointer = (): void => {
    if (startX === null) return;
    startX = null;
    if (!torn) {
      handle.style.removeProperty('--tear-offset');
    }
  };

  handle.addEventListener('pointerup', endPointer);
  handle.addEventListener('pointercancel', endPointer);

  handle.addEventListener('click', () => {
    if (handle.disabled) return;
    if (dragged) {
      dragged = false;
      return;
    }
    triggerSave();
  });

  return wrap;
}

/**
 * Point C micro-interaction: runs a discrete print head sweep across an export control.
 */
export function triggerPrintPulse(button: HTMLButtonElement, statusLabel?: string): void {
  button.setAttribute('data-printing', 'true');
  const textSpan = button.querySelector('span');
  const previousText = textSpan?.textContent ?? null;
  if (textSpan && statusLabel) {
    textSpan.textContent = statusLabel;
  }
  window.setTimeout(() => {
    button.removeAttribute('data-printing');
    if (textSpan && previousText !== null && statusLabel) {
      textSpan.textContent = previousText;
    }
  }, 480);
}
