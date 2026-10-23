import {
  defaultColorSchemeStore,
  type ColorSchemePreference,
  type ColorSchemeStore,
} from './storage';

export type ResolvedColorScheme = 'light' | 'dark';

export interface ColorSchemeTarget {
  setAttribute(name: string, value: string): void;
}

export interface ColorSchemeMedia {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface ColorSchemeController {
  getPreference(): ColorSchemePreference;
  setPreference(preference: ColorSchemePreference): void;
  destroy(): void;
}

export function resolveColorScheme(
  preference: ColorSchemePreference,
  systemPrefersDark: boolean,
): ResolvedColorScheme {
  if (preference === 'dark') {
    return 'dark';
  }
  if (preference === 'light') {
    return 'light';
  }
  return systemPrefersDark ? 'dark' : 'light';
}

export function createColorSchemeController(options: {
  store?: ColorSchemeStore;
  target: ColorSchemeTarget;
  media: ColorSchemeMedia;
}): ColorSchemeController {
  const store = options.store ?? defaultColorSchemeStore;
  let preference = store.read();

  const paint = (): void => {
    const resolved = resolveColorScheme(preference, options.media.matches);
    options.target.setAttribute('data-color-scheme', resolved);
  };

  const onSystemChange = (): void => {
    if (preference === 'system') {
      paint();
    }
  };

  options.media.addEventListener('change', onSystemChange);
  paint();

  return {
    getPreference(): ColorSchemePreference {
      return preference;
    },
    setPreference(next): void {
      preference = next;
      store.write(next);
      paint();
    },
    destroy(): void {
      options.media.removeEventListener('change', onSystemChange);
    },
  };
}
