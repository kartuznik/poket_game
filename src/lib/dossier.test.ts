import { describe, expect, it } from 'vitest';
import { ToolBridge } from './bridge';
import { recoveryPercentFromLossFactor } from '../tools/revenue-risk/calc';
import {
  DOSSIER_STORAGE_KEY,
  createDossierStore,
  draftStepFor,
  emptyDossier,
  hydrateBridge,
  parseDossier,
  validateContacts,
  type BusinessDossier,
} from './dossier';
import type { KeyValueStorage } from './storage';

function memoryStorage(initial = new Map<string, string>()): KeyValueStorage & {
  readonly dump: Map<string, string>;
} {
  return {
    dump: initial,
    getItem: (key) => initial.get(key) ?? null,
    setItem: (key, value) => {
      initial.set(key, value);
    },
    removeItem: (key) => {
      initial.delete(key);
    },
  };
}

describe('business dossier', () => {
  it('starts empty, so default answers are not treated as a finished tool', () => {
    const dossier = emptyDossier(10);
    expect(dossier.version).toBe(1);
    expect(dossier.revenue).toBeNull();
    expect(dossier.readiness).toBeNull();
    expect(draftStepFor(dossier, 'revenue-risk')).toBeNull();
  });

  it('persists a draft and a confirmed tool, then restores both', () => {
    const storage = memoryStorage();
    const store = createDossierStore(() => storage, () => 50);
    const written = store.update((current) => ({
      ...current,
      revenueDraft: {
        step: 2,
        leadsPerMonth: '80',
        lateSharePercent: '35',
        conversionPercent: '20',
        avgCheck: '4500',
        lossFactorPercent: '30',
        mode: 'custom',
        presetId: null,
      },
      contacts: { name: 'Анна', telegram: '@anna', phone: '', business: 'салон' },
    }));
    expect(written.persisted).toBe(true);
    expect(storage.dump.get(DOSSIER_STORAGE_KEY)).toContain('"step":2');

    const restored = createDossierStore(() => storage, () => 1).read();
    expect(restored.revenueDraft?.leadsPerMonth).toBe('80');
    expect(restored.revenue).toBeNull();
    expect(draftStepFor(restored, 'revenue-risk')).toBe(2);
    expect(restored.contacts.name).toBe('Анна');
    expect(restored.updatedAt).toBe(50);
  });

  it('keeps an unfinished visit, including a blank recovery field and a half-scored process', () => {
    const storage = memoryStorage();
    const store = createDossierStore(() => storage, () => 8);
    store.update((current) => ({
      ...current,
      revenueDraft: {
        step: 1,
        leadsPerMonth: '',
        lateSharePercent: '',
        conversionPercent: '',
        avgCheck: '',
        lossFactorPercent: '',
        mode: 'custom',
        presetId: null,
      },
      routineDraft: {
        step: 1,
        presetId: null,
        customEntry: false,
        operationsPerWeek: '',
        minutesPerOperation: '',
        automationSharePercent: '',
        hourlyRate: '',
      },
      priorityDraft: {
        step: 1,
        scores: {
          inquiries: { frequency: 5, time: null, errorCost: null },
          answers: { frequency: null, time: null, errorCost: null },
          booking: { frequency: null, time: null, errorCost: null },
          payment: { frequency: null, time: null, errorCost: null },
          reminders: { frequency: null, time: null, errorCost: null },
          reports: { frequency: null, time: null, errorCost: null },
        },
      },
      readinessDraft: {
        step: 1,
        answers: {
          repeated: 'yes',
          rules: null,
          'one-path': null,
          'one-place': null,
          faq: null,
          numbers: null,
          owner: null,
          channel: null,
          time: null,
        },
      },
    }));
    const restored = createDossierStore(() => storage, () => 1).read();
    expect(restored.revenueDraft?.lossFactorPercent).toBe('');
    expect(restored.routineDraft?.customEntry).toBe(false);
    expect(restored.priorityDraft?.scores.inquiries.frequency).toBe(5);
    expect(restored.priorityDraft?.scores.inquiries.time).toBeNull();
    expect(restored.readinessDraft?.answers.repeated).toBe('yes');
    expect(restored.readinessDraft?.answers.rules).toBeNull();
    expect(restored.priority).toBeNull();
  });

  it('keeps the session copy when storage throws', () => {
    const store = createDossierStore(
      () => ({
        getItem: () => {
          throw new Error('private');
        },
        setItem: () => {
          throw new Error('private');
        },
        removeItem: () => undefined,
      }),
      () => 3,
    );
    const written = store.update((current) => ({
      ...current,
      contacts: { ...current.contacts, name: 'Илья' },
    }));
    expect(written.persisted).toBe(false);
    expect(store.read().contacts.name).toBe('Илья');
  });

  it('ignores a broken or outdated record', () => {
    expect(parseDossier({ version: 2, updatedAt: 1 })).toBeNull();
    expect(parseDossier('{bad')).toBeNull();
    const storage = memoryStorage(new Map([[DOSSIER_STORAGE_KEY, '{bad']]));
    const store = createDossierStore(() => storage, () => 4);
    expect(store.read().revenue).toBeNull();
    expect(store.read().updatedAt).toBe(4);
  });

  it('hydrates the bridge only from confirmed tools', () => {
    const base: BusinessDossier = {
      ...emptyDossier(1),
      readinessDraft: {
        step: 2,
        answers: {
          repeated: 'no',
          rules: 'no',
          'one-path': 'no',
          'one-place': 'no',
          faq: 'no',
          numbers: 'no',
          owner: 'no',
          channel: 'no',
          time: 'no',
        },
      },
      revenue: {
        toolId: 'revenue-risk',
        updatedAt: 5,
        inputs: {
          leadsPerMonth: 100,
          lateSharePercent: 35,
          conversionPercent: 20,
          avgCheck: 4500,
          lossFactor: 0.3,
          mode: 'custom',
        },
        results: {
          lateLeads: 35,
          revenueAtRiskMax: 31500,
          recoverableRevenue: 22050,
          revenueAtRiskPerYear: 378000,
          costPerMissedDialog: 900,
        },
      },
    };
    const bridge = new ToolBridge();
    hydrateBridge(base, bridge);
    expect(bridge.getRevenueRiskResult()?.results.revenueAtRiskMax).toBe(31500);
    expect(bridge.getReadinessResult()).toBeNull();
    const restored = parseDossier(JSON.parse(JSON.stringify(base)) as unknown);
    expect(restored?.revenue?.inputs.lossFactor).toBe(0.3);
    expect(Number.isNaN(restored?.revenue?.results.recoverableRevenue)).toBe(false);
    expect(restored?.revenue?.results.recoverableRevenue).toBe(22050);
    expect(recoveryPercentFromLossFactor(restored?.revenue?.inputs.lossFactor ?? Number.NaN)).toBe(70);
    expect(restored?.revenue?.uncertainty).toBeUndefined();
  });

  it('keeps an old revenue draft and ignores a broken certainty profile', () => {
    const restored = parseDossier({
      version: 1,
      updatedAt: 3,
      revenueDraft: {
        step: 4,
        leadsPerMonth: '10',
        lateSharePercent: '20',
        conversionPercent: '15',
        avgCheck: '1000',
        lossFactorPercent: '30',
        mode: 'preset',
        presetId: 'beauty-local',
        uncertainty: { leads: 'nope' },
      },
    });
    expect(restored?.revenueDraft?.leadsPerMonth).toBe('10');
    expect(restored?.revenueDraft?.uncertainty).toBeUndefined();
    const kept = parseDossier({
      version: 1,
      updatedAt: 3,
      revenueDraft: {
        step: 2,
        leadsPerMonth: '10',
        lateSharePercent: '20',
        conversionPercent: '',
        avgCheck: '',
        lossFactorPercent: '',
        mode: 'custom',
        presetId: null,
        uncertainty: {
          leads: 'precise',
          lateShare: 'rough',
          conversion: 'guess',
          check: 'rough',
          recoveryShare: 'guess',
        },
      },
    });
    expect(kept?.revenueDraft?.uncertainty?.leads).toBe('precise');
    expect(kept?.revenueDraft?.uncertainty?.conversion).toBe('guess');
    const withCoverage = parseDossier({
      version: 1,
      updatedAt: 3,
      revenueDraft: {
        step: 4,
        leadsPerMonth: '10',
        lateSharePercent: '20',
        conversionPercent: '15',
        avgCheck: '1000',
        lossFactorPercent: '30',
        mode: 'custom',
        presetId: null,
        botCoverage: 0.5,
      },
      revenue: {
        toolId: 'revenue-risk',
        updatedAt: 3,
        inputs: {
          leadsPerMonth: 10,
          lateSharePercent: 20,
          conversionPercent: 15,
          avgCheck: 1000,
          lossFactor: 0.3,
          mode: 'custom',
        },
        results: {
          lateLeads: 2,
          revenueAtRiskMax: 300,
          recoverableRevenue: 210,
          revenueAtRiskPerYear: 3600,
          costPerMissedDialog: 150,
        },
        botCoverage: 4,
      },
    });
    expect(withCoverage?.revenueDraft?.botCoverage).toBe(0.5);
    expect(withCoverage?.revenue?.botCoverage).toBeUndefined();
  });

  it('asks for a name and at least one way to reply', () => {
    expect(validateContacts({ name: ' ', telegram: '', phone: '', business: '' }).ok).toBe(false);
    expect(validateContacts({ name: 'Анна', telegram: '', phone: '', business: '' }).errors.contact).toBeTruthy();
    const ready = validateContacts({
      name: 'Анна',
      telegram: '',
      phone: '+7 900 000-00-00',
      business: '',
    });
    expect(ready.ok).toBe(true);
    expect(ready.errors.name).toBeNull();
    expect(ready.errors.contact).toBeNull();
  });
});
