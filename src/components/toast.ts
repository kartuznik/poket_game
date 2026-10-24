const VISIBLE_MS = 4000;
const LEAVE_MS = 180;

interface ToastState {
  timer: number;
  leaveTimer: number;
  generation: number;
  listening: boolean;
  onDoc: (event: Event) => void;
}

const states = new WeakMap<HTMLElement, ToastState>();

function prefersStill(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function hideStatusToast(toast: HTMLElement): void {
  const state = states.get(toast);
  if (state) {
    window.clearTimeout(state.timer);
    if (state.listening) {
      document.removeEventListener('pointerdown', state.onDoc);
      state.listening = false;
    }
  }
  if (toast.hidden) return;
  const generation = state ? ++state.generation : 0;
  if (prefersStill()) {
    toast.hidden = true;
    toast.classList.remove('is-shown', 'is-leaving');
    return;
  }
  toast.classList.add('is-leaving');
  if (!state) return;
  window.clearTimeout(state.leaveTimer);
  state.leaveTimer = window.setTimeout(() => {
    if (state.generation !== generation) return;
    toast.hidden = true;
    toast.classList.remove('is-shown', 'is-leaving');
  }, LEAVE_MS);
}

/** Shows a status line, then hides it. A tap outside or the close button dismisses it sooner. */
export function showStatusToast(toast: HTMLElement, message: string): void {
  let text = toast.querySelector<HTMLElement>('.status-toast__text');
  let close = toast.querySelector<HTMLButtonElement>('.status-toast__close');
  if (!text || !close) {
    toast.textContent = '';
    text = document.createElement('span');
    text.className = 'status-toast__text';
    close = document.createElement('button');
    close.type = 'button';
    close.className = 'status-toast__close';
    close.setAttribute('aria-label', 'Закрыть сообщение');
    close.textContent = '×';
    toast.append(text, close);
    close.addEventListener('click', () => hideStatusToast(toast));
  }

  let state = states.get(toast);
  if (!state) {
    state = {
      timer: 0,
      leaveTimer: 0,
      generation: 0,
      listening: false,
      onDoc: (event) => {
        const target = event.target;
        if (target instanceof Node && toast.contains(target)) return;
        hideStatusToast(toast);
      },
    };
    states.set(toast, state);
  }

  text.textContent = message;
  state.generation += 1;
  window.clearTimeout(state.leaveTimer);
  toast.classList.remove('is-leaving');
  toast.hidden = false;
  toast.classList.add('is-shown');
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => hideStatusToast(toast), VISIBLE_MS);
  if (!state.listening) {
    document.addEventListener('pointerdown', state.onDoc);
    state.listening = true;
  }
}
