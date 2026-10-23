import { createHelpTip } from './tooltip';

/**
 * Label row with a separate "?" button.
 * The button stays outside the <label> so a tap on the title still focuses the field.
 */
export function createFieldHeading(
  inputId: string,
  title: string,
  unit: string,
  helpText: string,
  avoid: () => HTMLElement | null,
): { readonly row: HTMLDivElement; readonly tip: HTMLButtonElement } {
  const row = document.createElement('div');
  row.className = 'field-label';

  const label = document.createElement('label');
  label.className = 'field-label__text';
  label.htmlFor = inputId;
  label.textContent = title;

  const tip = createHelpTip(helpText, { avoid });

  const unitEl = document.createElement('span');
  unitEl.className = 'field-unit';
  unitEl.textContent = unit;

  row.append(label, tip, unitEl);
  return { row, tip };
}
