import { describe, expect, it } from 'vitest';
import {
  createColorSchemeController,
  resolveColorScheme,
  type ColorSchemeMedia,
} from './color-scheme';
import {
  COLOR_SCHEME_STORAGE_KEY,
  createColorSchemeStore,
  type KeyValueStorage,
} from './storage';

class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

class FakeMedia implements ColorSchemeMedia {
  matches = false;
  private readonly listeners = new Set<() => void>();

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

describe('color scheme preference', () => {
  it('follows the system until the visitor chooses, then keeps that choice', () => {
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
    expect(resolveColorScheme('dark', false)).toBe('dark');
    expect(resolveColorScheme('light', true)).toBe('light');

    const storage = new MemoryStorage();
    const store = createColorSchemeStore(() => storage);
    expect(store.read()).toBe('system');

    expect(store.write('dark')).toEqual({ preference: 'dark', persisted: true });
    expect(storage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark');
    expect(createColorSchemeStore(() => storage).read()).toBe('dark');

    storage.setItem(COLOR_SCHEME_STORAGE_KEY, 'nope');
    expect(createColorSchemeStore(() => storage).read()).toBe('system');
  });

  it('keeps the choice in memory when storage throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const store = createColorSchemeStore(() => broken);
    expect(store.read()).toBe('system');
    expect(store.write('light').persisted).toBe(false);
    expect(store.read()).toBe('light');
  });

  it('applies the resolved scheme and ignores the OS after a manual choice', () => {
    const storage = new MemoryStorage();
    const media = new FakeMedia();
    media.matches = true;
    const attributes = new Map<string, string>();
    const controller = createColorSchemeController({
      store: createColorSchemeStore(() => storage),
      target: {
        setAttribute: (name, value) => {
          attributes.set(name, value);
        },
      },
      media,
    });

    expect(controller.getPreference()).toBe('system');
    expect(attributes.get('data-color-scheme')).toBe('dark');

    media.setMatches(false);
    expect(attributes.get('data-color-scheme')).toBe('light');

    controller.setPreference('dark');
    media.setMatches(false);
    expect(attributes.get('data-color-scheme')).toBe('dark');
    expect(storage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark');

    controller.setPreference('system');
    expect(attributes.get('data-color-scheme')).toBe('light');

    controller.destroy();
    media.setMatches(true);
    expect(attributes.get('data-color-scheme')).toBe('light');
  });
});
