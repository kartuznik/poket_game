export const ENABLE_TEAR_OFF_STUB = true;

/**
 * Threshold in pixels (~1/3 of stub width, clamped to 84..140px as in b-vault-v2 mockup).
 */
export function computeTearThreshold(widthPx: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 84;
  return Math.min(140, Math.max(84, widthPx * 0.32));
}

export function normalizeTearProgress(deltaX: number, thresholdPx: number): number {
  if (!Number.isFinite(deltaX) || !Number.isFinite(thresholdPx) || thresholdPx <= 0) return 0;
  return Math.max(0, Math.min(1, deltaX / thresholdPx));
}

/**
 * Formats the completion stamp without brackets or unicode checkmarks:
 * «Аудит пройден · YYYY‑MM‑DD» (with non-breaking hyphens as in the mockup).
 */
export function formatCompletionStamp(nowMs: number): string {
  const safeMs = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
  const moscowMs = safeMs + 3 * 60 * 60 * 1000;
  const isoDate = new Date(moscowMs).toISOString().slice(0, 10).replace(/-/g, '\u2011');
  return `Аудит пройден · ${isoDate}`;
}

export interface DossierTicketRow {
  readonly label: string;
  readonly value: string;
  readonly numeric?: boolean;
}

export interface TearOffTicketOptions {
  readonly enabled?: boolean;
  readonly disabled?: boolean;
  readonly nicheLabel: string;
  readonly dateLabel: string;
  readonly rows: readonly DossierTicketRow[];
  readonly stampText: string;
  readonly onTearOff: () => string;
  readonly onCopyFallback: () => Promise<boolean> | boolean;
}

const ARROW_RIGHT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h12M13 7l5 5-5 5"/></svg>';

/**
 * Mounts the Night Vault Dossier Ticket + perforated tear-off stub.
 * Includes mouse/touch/pen drag with ~1/3 width threshold, keyboard (Enter/ArrowRight, Esc/ArrowLeft reset),
 * visible reduced-motion fade, reprint animation that preserves perforation notches,
 * and post-tear status line with «Скопировать текст отчёта» fallback for in-app browsers.
 */
export function createTearOffTicket(options: TearOffTicketOptions): HTMLElement | null {
  const isEnabled = options.enabled ?? ENABLE_TEAR_OFF_STUB;
  if (!isEnabled) return null;

  const wrap = document.createElement('div');
  wrap.className = 'ticket-wrap';

  const ticket = document.createElement('div');
  ticket.className = 'ticket';

  const body = document.createElement('div');
  body.className = 'ticket__body';

  const head = document.createElement('div');
  head.className = 'ticket__head';
  const headLeft = document.createElement('span');
  headLeft.textContent = options.nicheLabel;
  const headRight = document.createElement('span');
  headRight.className = 'num';
  headRight.textContent = options.dateLabel;
  head.append(headLeft, headRight);
  body.append(head);

  for (const item of options.rows) {
    const row = document.createElement('div');
    row.className = 'r';
    const keySpan = document.createElement('span');
    keySpan.textContent = item.label;
    const valSpan = document.createElement('span');
    if (item.numeric !== false) valSpan.className = 'num';
    valSpan.textContent = item.value;
    row.append(keySpan, valSpan);
    body.append(row);
  }

  const stamp = document.createElement('span');
  stamp.className = 'stamp';
  stamp.setAttribute('role', 'status');
  stamp.textContent = options.stampText;
  body.append(stamp);

  const seam = document.createElement('div');
  seam.className = 'seam';
  seam.setAttribute('aria-hidden', 'true');

  const stub = document.createElement('button');
  stub.type = 'button';
  stub.className = 'stub';
  stub.disabled = Boolean(options.disabled);
  stub.setAttribute('aria-describedby', 'stub-hint');

  const meter = document.createElement('span');
  meter.className = 'stub__meter';
  meter.setAttribute('aria-hidden', 'true');

  const stubRow = document.createElement('span');
  stubRow.className = 'stub__row';

  const textCol = document.createElement('span');
  const title = document.createElement('span');
  title.className = 'stub__title';
  title.textContent = 'Корешок досье · HTML';

  const hint = document.createElement('span');
  hint.className = 'stub__hint';
  hint.id = 'stub-hint';
  const hintTouch = document.createElement('span');
  hintTouch.className = 'h-touch';
  hintTouch.textContent = 'Потяните корешок вправо — он оторвётся, и досье сохранится.';
  const hintKey = document.createElement('span');
  hintKey.className = 'h-key';
  hintKey.textContent = 'Потяните вправо, чтобы оторвать и сохранить. Или Enter.';
  hint.append(hintTouch, hintKey);
  textCol.append(title, hint);

  const grip = document.createElement('span');
  grip.className = 'stub__grip';
  grip.setAttribute('aria-hidden', 'true');
  grip.innerHTML = `${ARROW_RIGHT_SVG}Тянуть`;

  stubRow.append(textCol, grip);
  stub.append(meter, stubRow);
  ticket.append(body, seam, stub);

  const status = document.createElement('p');
  status.className = 'tear-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  wrap.append(ticket, status);

  const placeNotches = (): void => {
    ticket.style.setProperty('--seam-y', `${String(seam.offsetTop)}px`);
  };
  queueMicrotask(placeNotches);
  window.addEventListener('resize', placeNotches);
  if (typeof document !== 'undefined' && 'fonts' in document) {
    void document.fonts.ready.then(placeNotches);
  }

  let startX: number | null = null;
  let startY = 0;
  let p = 0;
  let dragged = false;
  let busy = false;
  let pid: number | null = null;

  const setP = (value: number): void => {
    p = Math.max(0, Math.min(1, value));
    stub.style.setProperty('--p', p.toFixed(3));
  };

  const renderStatus = (filename: string): void => {
    status.replaceChildren();
    status.append(document.createTextNode('Корешок оторван — досье сохранено: '));
    const fileSpan = document.createElement('span');
    fileSpan.className = 'num';
    fileSpan.textContent = filename;
    status.append(
      fileSpan,
      document.createTextNode('. Не скачалось во встроенном браузере Threads? '),
    );
    const copyFallback = document.createElement('button');
    copyFallback.type = 'button';
    copyFallback.className = 'tear-status__copy';
    copyFallback.textContent = 'Скопировать текст отчёта';
    copyFallback.addEventListener('click', async () => {
      const ok = await options.onCopyFallback();
      if (ok) {
        copyFallback.textContent = 'Скопировано';
      }
    });
    status.append(copyFallback);
  };

  const tear = (): void => {
    if (busy || stub.disabled) return;
    busy = true;
    stub.classList.remove('is-dragging', 'is-snap');
    setP(1);
    stub.classList.add('is-torn');
    const filename = options.onTearOff();
    renderStatus(filename);
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(
      () => {
        stub.classList.remove('is-torn');
        setP(0);
        if (!reduce) {
          stub.classList.add('is-reprint');
          window.setTimeout(() => {
            stub.classList.remove('is-reprint');
          }, 560);
        }
        busy = false;
      },
      reduce ? 1400 : 1600,
    );
  };

  stub.addEventListener('pointerdown', (event: PointerEvent) => {
    if (busy || stub.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    startX = event.clientX;
    startY = event.clientY;
    dragged = false;
    pid = event.pointerId;
    stub.classList.add('is-dragging');
    stub.classList.remove('is-snap');
  });

  stub.addEventListener('pointermove', (event: PointerEvent) => {
    if (startX === null || event.pointerId !== pid) return;
    const dx = event.clientX - startX;
    const dy = Math.abs(event.clientY - startY);
    if (!dragged && dx > 6 && dx > dy) {
      dragged = true;
      try {
        stub.setPointerCapture(pid);
      } catch {
        // Ignore if capture is unsupported in synthetic events
      }
    }
    if (!dragged) return;
    event.preventDefault();
    setP(normalizeTearProgress(dx, computeTearThreshold(stub.offsetWidth)));
    if (p >= 1) {
      startX = null;
      tear();
    }
  });

  const endDrag = (): void => {
    if (startX === null) return;
    startX = null;
    stub.classList.remove('is-dragging');
    if (!busy) {
      stub.classList.add('is-snap');
      setP(0);
    }
  };

  stub.addEventListener('pointerup', endDrag);
  stub.addEventListener('pointercancel', endDrag);
  stub.addEventListener('lostpointercapture', (event: PointerEvent) => {
    // Guard against bubbling lostpointercapture from child nodes
    if (event.target === stub) {
      endDrag();
    }
  });

  stub.addEventListener('click', (event: MouseEvent) => {
    if (stub.disabled) return;
    if (dragged) {
      dragged = false;
      event.preventDefault();
      return;
    }
    tear();
  });

  stub.addEventListener('keydown', (event: KeyboardEvent) => {
    if (stub.disabled) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stub.classList.add('is-snap');
      setP(p + 0.34);
      if (p >= 1) tear();
    } else if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault();
      stub.classList.add('is-snap');
      setP(0);
    }
  });

  return wrap;
}
