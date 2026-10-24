import { describe, expect, it } from 'vitest';
import { ToolBridge } from './bridge';
import { DOSSIER_STORAGE_KEY, createDossierStore } from './dossier';
import { resetVisitorProgress } from './reset-progress';
import {
  COLOR_SCHEME_STORAGE_KEY,
  createScenarioStore,
  type KeyValueStorage,
} from './storage';

describe('resetVisitorProgress', () => {
  it('clears the dossier, confirmed results, and «До», and leaves the color scheme', () => {
    const map = new Map<string, string>([[COLOR_SCHEME_STORAGE_KEY, 'dark']]);
    const storage: KeyValueStorage = {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
    };
    const dossier = createDossierStore(() => storage, () => 9);
    dossier.update((current) => ({
      ...current,
      revenueDraft: {
        step: 4,
        leadsPerMonth: '120',
        lateSharePercent: '40',
        conversionPercent: '20',
        avgCheck: '4500',
        lossFactorPercent: '25',
        mode: 'custom',
        presetId: null,
      },
      contacts: { name: 'Анна', telegram: '@anna', phone: '', business: '' },
    }));
    const scenarios = createScenarioStore(() => storage);
    scenarios.save('revenue-risk', {
      label: 'До',
      primaryValue: 37800,
      formattedValue: '37 800 ₽',
      now: 1,
    });
    const bridge = new ToolBridge();
    bridge.saveRevenueRiskResult({
      inputs: {
        leadsPerMonth: 120,
        lateSharePercent: 40,
        conversionPercent: 20,
        avgCheck: 4500,
        lossFactor: 0.25,
        mode: 'custom',
      },
      results: {
        lateLeads: 48,
        revenueAtRiskMax: 43200,
        recoverableRevenue: 32400,
        revenueAtRiskPerYear: 518400,
        costPerMissedDialog: 900,
      },
    });

    resetVisitorProgress(dossier, bridge, scenarios);

    expect(dossier.read().revenueDraft).toBeNull();
    expect(dossier.read().contacts.name).toBe('');
    expect(bridge.getRevenueRiskResult()).toBeNull();
    expect(scenarios.load('revenue-risk')).toBeNull();
    expect(map.get(COLOR_SCHEME_STORAGE_KEY)).toBe('dark');
    expect(map.get(DOSSIER_STORAGE_KEY)).toContain('"revenue":null');
  });
});