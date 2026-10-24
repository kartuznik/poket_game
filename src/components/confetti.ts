const COLORS = ['#1d4ed8', '#f5b942', '#f07167', '#7dcea0', '#f7f8fb', '#b7c9f7'] as const;
const DURATION_MS = 1500;
const PIECE_COUNT = 42;

/**
 * A short burst drawn on one canvas. No library: the whole effect stays
 * well under the size of a confetti package and does not catch taps.
 */
export function celebrate(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }

  const fit = (): void => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  fit();

  const pieces = Array.from({ length: PIECE_COUNT }, () => {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0];
    return {
      x: Math.random() * canvas.width,
      y: -12 - Math.random() * 80,
      w: 6 + Math.random() * 5,
      h: 8 + Math.random() * 6,
      vx: -1.4 + Math.random() * 2.8,
      vy: 2.4 + Math.random() * 2.2,
      rot: Math.random() * Math.PI,
      vr: -0.18 + Math.random() * 0.36,
      color,
    };
  });

  const started = performance.now();
  const tick = (now: number): void => {
    const elapsed = now - started;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS);
    for (const piece of pieces) {
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.vy += 0.045;
      piece.rot += piece.vr;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.rot);
      context.fillStyle = piece.color;
      context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
      context.restore();
    }
    if (elapsed < DURATION_MS) {
      requestAnimationFrame(tick);
      return;
    }
    canvas.remove();
  };
  requestAnimationFrame(tick);
}
