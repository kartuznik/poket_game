import type { ColorSchemePreference } from '../lib/storage';

export const THEME_CHOICES = [
  { value: 'system', label: 'Системная' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
] as const satisfies ReadonlyArray<{
  value: ColorSchemePreference;
  label: string;
}>;

const THEME_ORDER: readonly ColorSchemePreference[] = ['system', 'light', 'dark'];

export interface ThemeMenuState {
  readonly open: boolean;
  readonly selected: ColorSchemePreference;
  readonly active: ColorSchemePreference;
}

export type ThemeMenuAction =
  | { type: 'open' }
  | { type: 'toggle' }
  | { type: 'close' }
  | { type: 'cancel' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'commit' }
  | { type: 'commit-value'; value: ColorSchemePreference }
  | { type: 'highlight'; value: ColorSchemePreference };

function step(current: ColorSchemePreference, delta: number): ColorSchemePreference {
  const index = THEME_ORDER.indexOf(current);
  const next = (index + delta + THEME_ORDER.length) % THEME_ORDER.length;
  return THEME_ORDER[next] ?? 'system';
}

export function reduceThemeMenu(
  state: ThemeMenuState,
  action: ThemeMenuAction,
): ThemeMenuState {
  switch (action.type) {
    case 'open':
      return { open: true, selected: state.selected, active: state.selected };
    case 'toggle':
      return state.open
        ? { open: false, selected: state.selected, active: state.selected }
        : { open: true, selected: state.selected, active: state.selected };
    case 'close':
    case 'cancel':
      return { open: false, selected: state.selected, active: state.selected };
    case 'next':
      if (!state.open) {
        return { open: true, selected: state.selected, active: state.selected };
      }
      return { ...state, active: step(state.active, 1) };
    case 'prev':
      if (!state.open) {
        return { open: true, selected: state.selected, active: state.selected };
      }
      return { ...state, active: step(state.active, -1) };
    case 'commit':
      return { open: false, selected: state.active, active: state.active };
    case 'commit-value':
      return { open: false, selected: action.value, active: action.value };
    case 'highlight':
      return state.open ? { ...state, active: action.value } : state;
    default:
      return state;
  }
}

/** Maps a key to a menu action. Tab only closes; it must not be cancelled. */
export function themeKeyAction(
  key: string,
  open: boolean,
): ThemeMenuAction | null {
  if (key === 'Enter' || key === ' ') {
    return open ? { type: 'commit' } : { type: 'open' };
  }
  if (key === 'ArrowDown') {
    return { type: 'next' };
  }
  if (key === 'ArrowUp') {
    return { type: 'prev' };
  }
  if (key === 'Escape' && open) {
    return { type: 'cancel' };
  }
  if (key === 'Home' && open) {
    return { type: 'highlight', value: 'system' };
  }
  if (key === 'End' && open) {
    return { type: 'highlight', value: 'dark' };
  }
  if (key === 'Tab' && open) {
    return { type: 'close' };
  }
  return null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Readonly<Record<string, string>>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function createIcon(preference: ColorSchemePreference): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 24 24',
    class: 'theme-switch__icon',
    'aria-hidden': 'true',
    focusable: 'false',
  });

  if (preference === 'light') {
    svg.append(
      svgEl('circle', {
        cx: '12',
        cy: '12',
        r: '4',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
      }),
    );
    const rays = [
      ['12', '2.5', '12', '5'],
      ['12', '19', '12', '21.5'],
      ['2.5', '12', '5', '12'],
      ['19', '12', '21.5', '12'],
      ['5.2', '5.2', '6.9', '6.9'],
      ['17.1', '17.1', '18.8', '18.8'],
      ['18.8', '5.2', '17.1', '6.9'],
      ['6.9', '17.1', '5.2', '18.8'],
    ];
    for (const [x1, y1, x2, y2] of rays) {
      svg.append(
        svgEl('line', {
          x1: x1 ?? '0',
          y1: y1 ?? '0',
          x2: x2 ?? '0',
          y2: y2 ?? '0',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
        }),
      );
    }
    return svg;
  }

  if (preference === 'dark') {
    // Crescent ink centroid sits on the viewBox center, same as the sun.
    svg.append(
      svgEl('path', {
        d: 'M20.08 4.6A8.6 8.6 0 1 0 20.08 19.4A7.4 7.4 0 0 1 20.08 4.6Z',
        fill: 'currentColor',
        stroke: 'none',
      }),
    );
    return svg;
  }

  // Half-disk is heavier on the left, so the whole mark is shifted right
  // until its ink centroid lands on the viewBox center.
  svg.append(
    svgEl('circle', {
      cx: '13.29',
      cy: '12',
      r: '8',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
    }),
    svgEl('path', {
      d: 'M13.29 4a8 8 0 0 0 0 16z',
      fill: 'currentColor',
      stroke: 'none',
    }),
  );
  return svg;
}

export interface ThemeSwitchController {
  readonly element: HTMLElement;
  getPreference(): ColorSchemePreference;
}

let themeSwitchSeq = 0;

export function createThemeSwitch(
  preference: ColorSchemePreference,
  onChange: (preference: ColorSchemePreference) => void,
): ThemeSwitchController {
  const listId = `theme-switch-list-${themeSwitchSeq}`;
  themeSwitchSeq += 1;

  let state: ThemeMenuState = {
    open: false,
    selected: preference,
    active: preference,
  };

  const root = document.createElement('div');
  root.className = 'theme-switch';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-switch__button';
  button.setAttribute('aria-label', 'Выбор темы оформления');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-controls', listId);

  const menu = document.createElement('ul');
  menu.id = listId;
  menu.className = 'theme-switch__menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Выбор темы оформления');

  const options = new Map<ColorSchemePreference, HTMLLIElement>();
  for (const choice of THEME_CHOICES) {
    const option = document.createElement('li');
    option.id = `${listId}-${choice.value}`;
    option.className = 'theme-switch__option';
    option.setAttribute('role', 'option');
    option.dataset.value = choice.value;
    const label = document.createElement('span');
    label.textContent = choice.label;
    option.append(createIcon(choice.value), label);
    option.addEventListener('pointerenter', () => {
      apply(reduceThemeMenu(state, { type: 'highlight', value: choice.value }));
    });
    option.addEventListener('click', () => {
      apply(reduceThemeMenu(state, { type: 'commit-value', value: choice.value }));
    });
    options.set(choice.value, option);
    menu.append(option);
  }

  root.append(button, menu);

  function paint(): void {
    button.replaceChildren(createIcon(state.selected));
    button.setAttribute('aria-expanded', String(state.open));
    if (state.open) {
      menu.hidden = false;
      button.setAttribute('aria-activedescendant', `${listId}-${state.active}`);
    } else {
      menu.hidden = true;
      button.removeAttribute('aria-activedescendant');
    }
    for (const choice of THEME_CHOICES) {
      const option = options.get(choice.value);
      if (!option) continue;
      option.setAttribute('aria-selected', String(choice.value === state.selected));
      option.classList.toggle('theme-switch__option--active', state.open && choice.value === state.active);
    }
  }

  function apply(next: ThemeMenuState): void {
    const previous = state.selected;
    state = next;
    paint();
    if (state.selected !== previous) {
      onChange(state.selected);
    }
  }

  button.addEventListener('click', () => {
    apply(reduceThemeMenu(state, { type: 'toggle' }));
  });

  button.addEventListener('keydown', (event) => {
    const action = themeKeyAction(event.key, state.open);
    if (!action) return;
    if (event.key !== 'Tab') {
      event.preventDefault();
    }
    apply(reduceThemeMenu(state, action));
  });

  document.addEventListener('pointerdown', (event) => {
    if (!state.open) return;
    if (event.target instanceof Node && root.contains(event.target)) return;
    apply(reduceThemeMenu(state, { type: 'close' }));
  });

  paint();

  return {
    element: root,
    getPreference: () => state.selected,
  };
}
