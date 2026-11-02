/** Small stroke icon for a ghost action. The label stays a separate text node. */
export function actionIcon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('action-btn__icon');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

export function paintLabeledButton(
  button: HTMLButtonElement,
  label: string,
  paths: readonly string[],
): void {
  const text = document.createElement('span');
  text.textContent = label;
  button.replaceChildren(actionIcon(paths), text);
}

export function paintDisclosure(summary: HTMLElement, title: string): void {
  const label = document.createElement('span');
  label.className = 'disclosure__title';
  label.textContent = title;
  const chevron = actionIcon(['M4 6l4 4 4-4']);
  chevron.classList.remove('action-btn__icon');
  chevron.classList.add('disclosure__chev');
  summary.replaceChildren(label, chevron);
}

export const ICON_COPY = ['M6 2.5h6.5V9', 'M4 4.5h6.5V13H4z'];
export const ICON_PIN = ['M4 2.5h8V14l-4-2.2L4 14z'];
export const ICON_DOWNLOAD = ['M8 2.5v7', 'M5.2 7.2 8 10l2.8-2.8', 'M3.5 13h9'];
export const ICON_EDIT = ['M3 11.2 3.4 9 10 2.4l2.2 2.2-6.6 6.6z'];
export const ICON_ARROW = ['M3 8h10', 'M9.5 4.5 13 8l-3.5 3.5'];
