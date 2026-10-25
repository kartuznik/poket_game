export const RESULT_BANNER_LABEL = 'Ваш расчёт';

/** Marks a finished calculation so it does not read as another question. */
export function createResultBanner(): HTMLDivElement {
  const banner = document.createElement('div');
  banner.className = 'result-banner';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '22');
  icon.setAttribute('height', '22');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('result-banner__icon');
  const mark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  mark.setAttribute('fill', 'none');
  mark.setAttribute('stroke', 'currentColor');
  mark.setAttribute('stroke-width', '2.5');
  mark.setAttribute('stroke-linecap', 'round');
  mark.setAttribute('stroke-linejoin', 'round');
  mark.setAttribute('d', 'M5 12.5 10 17.5 19 7');
  icon.append(mark);

  const label = document.createElement('p');
  label.className = 'result-banner__label';
  label.textContent = RESULT_BANNER_LABEL;

  banner.append(icon, label);
  return banner;
}
