import { normalizeFiniteNumber } from './format';
import type {
  ScenarioComparison,
  ScenarioSnapshot,
  StorageSaveResult,
  ToolId,
} from './types';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = 'poket_game:scenario:v1:';

export const COLOR_SCHEME_STORAGE_KEY = 'poket_game:color-scheme:v1';

export type ColorSchemePreference = 'system' | 'light' | 'dark';

export interface ColorSchemeSaveResult {
  readonly preference: ColorSchemePreference;
  readonly persisted: boolean;
}

export interface ColorSchemeStore {
  read(): ColorSchemePreference;
  write(preference: ColorSchemePreference): ColorSchemeSaveResult;
}

export function isColorSchemePreference(
  value: string | null | undefined,
): value is ColorSchemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Resolves localStorage, or null when it is missing or throws
 * (private mode, disabled storage, restricted WebView).
 */
export function resolveKeyValueStorage(
  storageProvider?: () => KeyValueStorage | null,
): KeyValueStorage | null {
  if (storageProvider) {
    try {
      return storageProvider();
    } catch {
      return null;
    }
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Remembers a manual color-scheme choice. Falls back to an in-memory value
 * for the current session when localStorage rejects the write.
 * Absence of a stored value means "follow the system".
 */
export function createColorSchemeStore(
  storageProvider?: () => KeyValueStorage | null,
): ColorSchemeStore {
  let memory: ColorSchemePreference | null = null;

  return {
    read(): ColorSchemePreference {
      const storage = resolveKeyValueStorage(storageProvider);
      if (storage) {
        try {
          const raw = storage.getItem(COLOR_SCHEME_STORAGE_KEY);
          if (isColorSchemePreference(raw)) {
            memory = raw;
            return raw;
          }
        } catch {
          // SecurityError — use the session memory below
        }
      }
      return memory ?? 'system';
    },

    write(preference): ColorSchemeSaveResult {
      memory = preference;
      const storage = resolveKeyValueStorage(storageProvider);
      if (!storage) {
        return { preference, persisted: false };
      }
      try {
        storage.setItem(COLOR_SCHEME_STORAGE_KEY, preference);
        return { preference, persisted: true };
      } catch {
        return { preference, persisted: false };
      }
    },
  };
}

export const defaultColorSchemeStore = createColorSchemeStore();

function isValidSnapshot(data: unknown): data is ScenarioSnapshot {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    typeof record.toolId === 'string' &&
    typeof record.label === 'string' &&
    typeof record.primaryValue === 'number' &&
    Number.isFinite(record.primaryValue) &&
    typeof record.formattedValue === 'string' &&
    typeof record.savedAt === 'number' &&
    Number.isFinite(record.savedAt)
  );
}

export interface ScenarioStore {
  save(
    toolId: ToolId,
    input: {
      label: string;
      primaryValue: number;
      formattedValue: string;
      now?: number;
    },
  ): StorageSaveResult;
  load(toolId: ToolId): ScenarioSnapshot | null;
  clear(toolId: ToolId): void;
  compare(
    toolId: ToolId,
    currentValue: number,
    lowerIsBetter?: boolean,
  ): ScenarioComparison | null;
}

/**
 * Creates a resilient scenario store for "Before / After" comparisons.
 * Degrades gracefully to an in-memory Map when localStorage is blocked
 * (e.g. iOS Safari Private Browsing or restricted Threads WebView).
 */
export function createScenarioStore(
  storageProvider?: () => KeyValueStorage | null,
): ScenarioStore {
  const memoryFallback = new Map<string, ScenarioSnapshot>();

  const resolveStorage = (): KeyValueStorage | null =>
    resolveKeyValueStorage(storageProvider);

  const keyFor = (toolId: ToolId): string => `${STORAGE_PREFIX}${toolId}`;

  return {
    save(toolId, input): StorageSaveResult {
      const snapshot: ScenarioSnapshot = {
        toolId,
        label: input.label.trim() || 'Базовый сценарий',
        primaryValue: normalizeFiniteNumber(input.primaryValue, 0),
        formattedValue: input.formattedValue,
        savedAt: input.now ?? Date.now(),
      };

      const key = keyFor(toolId);
      memoryFallback.set(key, snapshot);

      const storage = resolveStorage();
      if (!storage) {
        return { snapshot, persisted: false };
      }

      try {
        storage.setItem(key, JSON.stringify(snapshot));
        return { snapshot, persisted: true };
      } catch {
        // QuotaExceededError or SecurityError in private mode
        return { snapshot, persisted: false };
      }
    },

    load(toolId): ScenarioSnapshot | null {
      const key = keyFor(toolId);
      const storage = resolveStorage();

      if (storage) {
        try {
          const raw = storage.getItem(key);
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (isValidSnapshot(parsed) && parsed.toolId === toolId) {
              memoryFallback.set(key, parsed);
              return parsed;
            }
          }
        } catch {
          // Corrupted JSON or SecurityError — fall back to memory
        }
      }

      return memoryFallback.get(key) ?? null;
    },

    clear(toolId): void {
      const key = keyFor(toolId);
      memoryFallback.delete(key);
      const storage = resolveStorage();
      if (storage) {
        try {
          storage.removeItem(key);
        } catch {
          // Ignore storage removal errors in restricted contexts
        }
      }
    },

    compare(
      toolId,
      currentValue,
      lowerIsBetter = true,
    ): ScenarioComparison | null {
      const before = this.load(toolId);
      if (!before) {
        return null;
      }

      const safeAfter = normalizeFiniteNumber(currentValue, 0);
      const delta = safeAfter - before.primaryValue;

      const deltaPercent =
        before.primaryValue !== 0
          ? Math.round((delta / Math.abs(before.primaryValue)) * 100)
          : null;

      let direction: ScenarioComparison['direction'] = 'unchanged';
      if (Math.abs(delta) > 1e-6) {
        if (lowerIsBetter) {
          direction = delta < 0 ? 'improved' : 'worsened';
        } else {
          direction = delta > 0 ? 'improved' : 'worsened';
        }
      }

      return {
        before,
        afterValue: safeAfter,
        delta,
        deltaPercent,
        direction,
      };
    },
  };
}

export const defaultScenarioStore = createScenarioStore();
