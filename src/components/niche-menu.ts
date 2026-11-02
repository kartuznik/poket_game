import type { DossierStore } from '../lib/dossier';
import {
  NICHE_ACCENT_BUTTON,
  NICHE_ACCENT_TEXT,
  NICHE_ACCENT_TITLE,
  NICHE_QUIET_BUTTON,
  formatFieldChange,
  listNichePresets,
  planNicheApply,
  type BusinessNicheId,
  type NichePreset,
  type NumberField,
} from '../lib/niche-presets';

export interface NicheMenuController {
  readonly element: HTMLElement;
  refresh(): void;
}

/** Shared picker for the first revenue step and the first routine step. */
export function mountNicheMenu(options: {
  readonly dossier: DossierStore;
  /** Chosen once from the draft. Re-renders do not swap the prompt. */
  readonly prompt: 'accent' | 'quiet';
  readonly readFields: (preset: NichePreset) => readonly NumberField[];
  readonly applyNumbers: (preset: NichePreset) => void;
  readonly applyLabel: (id: BusinessNicheId | null) => void;
  readonly undo: () => void;
  readonly hasUndo: () => boolean;
}): NicheMenuController {
  const root = document.createElement('div');
  root.className = 'niche-menu';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  let opener: HTMLElement = toggle;
  if (options.prompt === 'accent') {
    toggle.className = 'action-btn action-btn--primary niche-intro__btn';
    toggle.append(nicheTagIcon(), Object.assign(document.createElement('span'), { textContent: NICHE_ACCENT_BUTTON }));
    const intro = document.createElement('div');
    intro.className = 'niche-intro';
    const title = document.createElement('h3');
    title.className = 'niche-intro__title';
    title.textContent = NICHE_ACCENT_TITLE;
    const text = document.createElement('p');
    text.className = 'niche-intro__text';
    text.textContent = NICHE_ACCENT_TEXT;
    intro.append(title, text, toggle);
    opener = intro;
  } else {
    toggle.className = 'action-btn action-btn--secondary niche-menu__toggle';
    toggle.textContent = NICHE_QUIET_BUTTON;
  }

  const list = document.createElement('div');
  list.className = 'niche-menu__list';
  list.hidden = true;

  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog';
  const dialogText = document.createElement('p');
  dialogText.className = 'confirm-dialog__text';
  const dialogLines = document.createElement('ul');
  dialogLines.className = 'confirm-dialog__lines';
  const dialogActions = document.createElement('div');
  dialogActions.className = 'confirm-dialog__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'action-btn action-btn--secondary';
  cancelBtn.textContent = 'Оставить как есть';
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'action-btn action-btn--primary';
  confirmBtn.textContent = 'Подставить';
  dialogActions.append(cancelBtn, confirmBtn);
  dialog.append(dialogText, dialogLines, dialogActions);

  let pending: NichePreset | null = null;

  function closeDialog(): void {
    pending = null;
    if (dialog.open) dialog.close();
  }

  function apply(preset: NichePreset): void {
    const fields = options.readFields(preset);
    const plan = planNicheApply(options.dossier.read().niche, preset.id, fields);
    if (plan === 'noop') return;
    if (plan === 'label') {
      options.applyLabel(preset.id);
      list.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      return;
    }
    if (plan === 'confirm') {
      pending = preset;
      dialogText.textContent = `Подставить «${preset.title}» вместо текущих чисел?`;
      dialogLines.replaceChildren();
      for (const field of fields) {
        const item = document.createElement('li');
        item.textContent = formatFieldChange(field);
        dialogLines.append(item);
      }
      dialog.showModal();
      return;
    }
    options.applyNumbers(preset);
    list.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    refresh();
  }

  for (const preset of listNichePresets()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-btn action-btn--secondary';
    button.textContent = preset.title;
    button.addEventListener('click', () => apply(preset));
    list.append(button);
  }

  const own = document.createElement('button');
  own.type = 'button';
  own.className = 'action-btn action-btn--secondary';
  own.textContent = 'Своя ниша';
  own.addEventListener('click', () => {
    options.applyLabel(null);
    list.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    refresh();
  });
  list.append(own);

  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'action-btn action-btn--secondary';
  undoBtn.textContent = 'Вернуть свои цифры';
  undoBtn.addEventListener('click', () => {
    options.undo();
    refresh();
  });

  toggle.addEventListener('click', () => {
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
  });
  cancelBtn.addEventListener('click', closeDialog);
  confirmBtn.addEventListener('click', () => {
    const preset = pending;
    closeDialog();
    if (!preset) return;
    options.applyNumbers(preset);
    list.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    refresh();
  });

  function refresh(): void {
    undoBtn.hidden = !options.hasUndo();
  }

  refresh();
  root.append(opener, list, undoBtn, dialog);
  return { element: root, refresh };
}

function nicheTagIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute(
    'd',
    'M3.2 12.4 12.4 3.2H20.8v8.4l-9.2 9.2-8.4-8.4Zm12.9-5.1a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z',
  );
  svg.append(path);
  return svg;
}
