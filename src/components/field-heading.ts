/**
 * Label row. The optional note sits under the label, in reading order.
 * There is no separate "?" control.
 */
export function createFieldHeading(
  inputId: string,
  title: string,
  unit: string,
  note?: string,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field-label';

  const label = document.createElement('label');
  label.className = 'field-label__text';
  label.htmlFor = inputId;
  label.textContent = title;

  const unitEl = document.createElement('span');
  unitEl.className = 'field-unit';
  unitEl.textContent = unit;

  row.append(label, unitEl);
  if (!note) return row;

  const wrap = document.createElement('div');
  wrap.className = 'field-copy';
  const hint = document.createElement('p');
  hint.className = 'field-hint';
  hint.textContent = note;
  wrap.append(row, hint);
  return wrap;
}
