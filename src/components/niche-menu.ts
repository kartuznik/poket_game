import type { DossierStore } from '../lib/dossier';
import {
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
  toggle.className = 'action-btn action-btn--secondary niche-menu__toggle';
  toggle.textContent = 'Подставить значения ниши';
  toggle.setAttribute('aria-expanded', 'false');

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
  root.append(toggle, list, undoBtn, dialog);
  return { element: root, refresh };
}
