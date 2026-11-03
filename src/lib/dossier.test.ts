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
  recordMetricSnapshot,
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
    expect(dossier.version).toBe(2);
    expect(dossier.history).toEqual([]);
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
    expect(parseDossier({ version: 99, updatedAt: 1 })).toBeNull();
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
    expect(bridge.getRevenueRiskResult()?.uncertainty).toBeUndefined();
    expect(bridge.getRevenueRiskResult()?.botCoverage).toBeUndefined();
    expect(bridge.getReadinessResult()).toBeNull();
    const restored = parseDossier(JSON.parse(JSON.stringify(base)) as unknown);
    expect(restored?.revenue?.inputs.lossFactor).toBe(0.3);
    expect(Number.isNaN(restored?.revenue?.results.recoverableRevenue)).toBe(false);
    expect(restored?.revenue?.results.recoverableRevenue).toBe(22050);
    expect(recoveryPercentFromLossFactor(restored?.revenue?.inputs.lossFactor ?? Number.NaN)).toBe(70);
    expect(restored?.revenue?.uncertainty).toBeUndefined();
  });

  it('puts the saved certainty and bot coverage back on the bridge', () => {
    const uncertainty = {
      leads: 'precise' as const,
      lateShare: 'precise' as const,
      conversion: 'precise' as const,
      check: 'precise' as const,
      recoveryShare: 'precise' as const,
    };
    const base: BusinessDossier = {
      ...emptyDossier(1),
      revenue: {
        toolId: 'revenue-risk',
        updatedAt: 5,
        inputs: {
          leadsPerMonth: 40,
          lateSharePercent: 50,
          conversionPercent: 30,
          avgCheck: 1300,
          lossFactor: 0.2,
          mode: 'preset',
        },
        results: {
          lateLeads: 20,
          revenueAtRiskMax: 7800,
          recoverableRevenue: 1560,
          revenueAtRiskPerYear: 93600,
          costPerMissedDialog: 260,
        },
        uncertainty,
        botCoverage: 0.7,
      },
    };
    const bridge = new ToolBridge();
    hydrateBridge(base, bridge);
    expect(bridge.getRevenueRiskResult()?.uncertainty).toEqual(uncertainty);
    expect(bridge.getRevenueRiskResult()?.botCoverage).toBe(0.7);
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

  it('reads a version 1 dossier as the current visit with an empty history', () => {
    const restored = parseDossier({
      version: 1,
      updatedAt: 9,
      contacts: { name: 'Анна', telegram: '@anna', phone: '', business: 'салон' },
      revenueDraft: {
        step: 2,
        leadsPerMonth: '80',
        lateSharePercent: '10',
        conversionPercent: '20',
        avgCheck: '500',
        lossFactorPercent: '30',
        mode: 'custom',
        presetId: null,
      },
      revenue: {
        toolId: 'revenue-risk',
        updatedAt: 9,
        inputs: {
          leadsPerMonth: 80,
          lateSharePercent: 10,
          conversionPercent: 20,
          avgCheck: 500,
          lossFactor: 0.3,
          mode: 'custom',
        },
        results: {
          lateLeads: 8,
          revenueAtRiskMax: 800,
          recoverableRevenue: 560,
          revenueAtRiskPerYear: 9600,
          costPerMissedDialog: 100,
        },
      },
    });
    expect(restored?.version).toBe(2);
    expect(restored?.history).toEqual([]);
    expect(restored?.contacts.name).toBe('Анна');
    expect(restored?.revenueDraft?.leadsPerMonth).toBe('80');
    expect(restored?.revenue?.results.revenueAtRiskMax).toBe(800);
  });

  it('drops a broken history entry and keeps the confirmed tools', () => {
    const restored = parseDossier({
      version: 2,
      updatedAt: 4,
      history: [
        { savedAt: 1, revenueAtRiskPerMonth: 100, routineHoursPerMonth: null, readinessScore: null },
        { savedAt: 'вчера', revenueAtRiskPerMonth: 1 },
        { revenueAtRiskPerMonth: 5 },
      ],
      contacts: { name: 'Илья', telegram: '', phone: '1', business: '' },
    });
    expect(restored?.contacts.name).toBe('Илья');
    expect(restored?.history).toEqual([
      { savedAt: 1, revenueAtRiskPerMonth: 100, routineHoursPerMonth: null, readinessScore: null },
    ]);
  });

  it('reads a v1 record and writes version 2 without dropping the visit', () => {
    const raw = JSON.stringify({
      version: 1,
      updatedAt: 4,
      contacts: { name: 'Анна', telegram: '@anna', phone: '', business: 'цех' },
      revenue: {
        toolId: 'revenue-risk',
        updatedAt: 4,
        inputs: {
          leadsPerMonth: 80,
          lateSharePercent: 10,
          conversionPercent: 20,
          avgCheck: 500,
          lossFactor: 0.3,
          mode: 'custom',
        },
        results: {
          lateLeads: 8,
          revenueAtRiskMax: 800,
          recoverableRevenue: 560,
          revenueAtRiskPerYear: 9600,
          costPerMissedDialog: 100,
        },
      },
    });
    const storage = memoryStorage(new Map([[DOSSIER_STORAGE_KEY, raw]]));
    const store = createDossierStore(() => storage, () => 8);
    const opened = store.read();
    expect(DOSSIER_STORAGE_KEY).toBe('poket_game:dossier:v1');
    expect(opened.version).toBe(2);
    expect(opened.history).toEqual([]);
    expect(opened.revenue?.results.revenueAtRiskMax).toBe(800);
    expect(opened.contacts.name).toBe('Анна');
    const written = store.update((current) => ({
      ...current,
      contacts: { ...current.contacts, phone: '1' },
    }));
    expect(written.persisted).toBe(true);
    const saved = JSON.parse(storage.dump.get(DOSSIER_STORAGE_KEY) ?? '{}') as {
      version: number;
      history: unknown[];
      contacts: { name: string; phone: string };
      revenue: { results: { revenueAtRiskMax: number } };
    };
    expect(saved.version).toBe(2);
    expect(saved.history).toEqual([]);
    expect(saved.contacts.name).toBe('Анна');
    expect(saved.contacts.phone).toBe('1');
    expect(saved.revenue.results.revenueAtRiskMax).toBe(800);
  });

  it('reads a missing or unknown niche as своя and keeps the visit', () => {
    const revenue = {
      toolId: 'revenue-risk',
      updatedAt: 4,
      inputs: {
        leadsPerMonth: 80,
        lateSharePercent: 10,
        conversionPercent: 20,
        avgCheck: 500,
        lossFactor: 0.3,
        mode: 'custom',
      },
      results: {
        lateLeads: 8,
        revenueAtRiskMax: 800,
        recoverableRevenue: 560,
        revenueAtRiskPerYear: 9600,
        costPerMissedDialog: 100,
      },
    };
    const missing = parseDossier({
      version: 2,
      updatedAt: 4,
      contacts: { name: 'Анна', telegram: '', phone: '', business: '' },
      revenue,
    });
    expect(missing?.niche).toBeNull();
    expect(missing?.revenue?.results.revenueAtRiskMax).toBe(800);
    expect(missing?.contacts.name).toBe('Анна');

    const unknown = parseDossier({
      version: 2,
      updatedAt: 4,
      niche: 'not-a-niche',
      contacts: { name: 'Анна', telegram: '', phone: '', business: '' },
      revenue,
    });
    expect(unknown?.niche).toBeNull();
    expect(unknown?.revenue?.results.revenueAtRiskMax).toBe(800);

    const known = parseDossier({
      version: 2,
      updatedAt: 4,
      niche: 'cafe-food',
      contacts: { name: 'Анна', telegram: '', phone: '', business: '' },
    });
    expect(known?.niche).toBe('cafe-food');
    expect(known?.version).toBe(2);
  });

  it('does not overwrite a dossier whose version it does not know', () => {
    const raw = JSON.stringify({ version: 99, updatedAt: 1, contacts: { name: 'Анна' } });
    const storage = memoryStorage(new Map([[DOSSIER_STORAGE_KEY, raw]]));
    const store = createDossierStore(() => storage, () => 6);
    store.update((current) => ({ ...current, contacts: { ...current.contacts, name: 'Пётр' } }));
    expect(storage.dump.get(DOSSIER_STORAGE_KEY)).toBe(raw);
  });

  it('records a metric snapshot, skips an unchanged one, and keeps the last ten', () => {
    let dossier = emptyDossier(1);
    dossier = {
      ...dossier,
      revenue: {
        toolId: 'revenue-risk',
        updatedAt: 1,
        inputs: {
          leadsPerMonth: 10,
          lateSharePercent: 10,
          conversionPercent: 10,
          avgCheck: 100,
          lossFactor: 0.5,
          mode: 'custom',
        },
        results: {
          lateLeads: 1,
          revenueAtRiskMax: 100,
          recoverableRevenue: 50,
          revenueAtRiskPerYear: 1200,
          costPerMissedDialog: 10,
        },
      },
    };
    dossier = recordMetricSnapshot(dossier, 10);
    const again = recordMetricSnapshot(dossier, 11);
    expect(again.history).toHaveLength(1);
    expect(again.history[0]?.savedAt).toBe(10);
    for (let index = 0; index < 12; index += 1) {
      const revenue = dossier.revenue;
      if (!revenue) break;
      dossier = recordMetricSnapshot(
        {
          ...dossier,
          revenue: {
            ...revenue,
            results: { ...revenue.results, revenueAtRiskMax: 200 + index },
          },
        },
        20 + index,
      );
    }
    expect(dossier.history).toHaveLength(10);
    expect(dossier.history[0]?.revenueAtRiskPerMonth).toBe(202);
    expect(dossier.history[9]?.revenueAtRiskPerMonth).toBe(211);
    expect(recordMetricSnapshot(emptyDossier(1), 5).history).toEqual([]);
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

  it('hides a fake priority leader from an old all-ones or tied record', () => {
    const scores = {
      inquiries: { frequency: 1, time: 1, errorCost: 1 },
      answers: { frequency: 1, time: 1, errorCost: 1 },
      booking: { frequency: 1, time: 1, errorCost: 1 },
      payment: { frequency: 1, time: 1, errorCost: 1 },
      reminders: { frequency: 1, time: 1, errorCost: 1 },
      reports: { frequency: 1, time: 1, errorCost: 1 },
    };
    const quiet = parseDossier({
      version: 2,
      updatedAt: 4,
      priority: {
        toolId: 'priority-diag',
        updatedAt: 4,
        inputs: scores,
        results: {
          topProcessId: 'inquiries',
          topTitle: 'Приём обращений',
          topScore: 1,
          tied: true,
          ranking: [{ id: 'inquiries', title: 'Приём обращений', score: 1 }],
        },
      },
    });
    expect(quiet?.priority?.results.board).toBe('quiet');
    expect(quiet?.priority?.results.topProcessId).toBeNull();
    expect(quiet?.priority?.results.topTitle).not.toBe('Приём обращений');
    expect(quiet?.priority?.results.resolutionReason).toContain('Ранга нет');

    const tied = parseDossier({
      version: 2,
      updatedAt: 4,
      priority: {
        toolId: 'priority-diag',
        updatedAt: 4,
        inputs: {
          ...scores,
          inquiries: { frequency: 5, time: 5, errorCost: 5 },
          answers: { frequency: 5, time: 5, errorCost: 5 },
        },
        results: {
          topProcessId: 'inquiries',
          topTitle: 'Приём обращений',
          topScore: 5,
          tied: true,
          ranking: [{ id: 'inquiries', title: 'Приём обращений', score: 5 }],
        },
      },
    });
    expect(tied?.priority?.results.board).toBe('tied');
    expect(tied?.priority?.results.topProcessId).toBeNull();
    expect(tied?.priority?.results.resolution).toBe('open');

    const leader = parseDossier({
      version: 2,
      updatedAt: 4,
      priority: {
        toolId: 'priority-diag',
        updatedAt: 4,
        inputs: { ...scores, payment: { frequency: 5, time: 5, errorCost: 5 } },
        results: {
          topProcessId: 'inquiries',
          topTitle: 'Приём обращений',
          topScore: 1,
          tied: false,
          ranking: [],
        },
      },
    });
    expect(leader?.priority?.results.topProcessId).toBe('payment');
    expect(leader?.priority?.results.resolution).toBe('unique');
  });

  it('reads an old single routine as one list item and keeps the stored numbers', () => {
    const restored = parseDossier({
      version: 2,
      updatedAt: 8,
      routine: {
        toolId: 'routine-calc',
        updatedAt: 8,
        inputs: {
          presetId: 'answers',
          operationsPerWeek: 40,
          minutesPerOperation: 6,
          hourlyRate: 500,
          automationSharePercent: 70,
        },
        results: {
          hoursPerMonth: 99,
          workDaysPerYear: 1,
          savedHoursPerMonth: 2,
          savedWorkDaysPerYear: 3,
          savedMoneyPerMonth: 4,
        },
      },
    });
    expect(restored?.routine?.inputs.items).toEqual([
      {
        presetId: 'answers',
        operationsPerWeek: 40,
        minutesPerOperation: 6,
        automationSharePercent: 70,
      },
    ]);
    expect(restored?.routine?.results.hoursPerMonth).toBe(99);
    expect(restored?.routine?.results.savedMoneyPerMonth).toBe(4);
  });

  it('does not let a stale visitor chip become the leader again', () => {
    const restored = parseDossier({
      version: 2,
      updatedAt: 4,
      priority: {
        toolId: 'priority-diag',
        updatedAt: 4,
        inputs: {
          inquiries: { frequency: 1, time: 1, errorCost: 1 },
          answers: { frequency: 5, time: 5, errorCost: 5 },
          booking: { frequency: 5, time: 5, errorCost: 5 },
          payment: { frequency: 5, time: 5, errorCost: 5 },
          reminders: { frequency: 5, time: 5, errorCost: 5 },
          reports: { frequency: 5, time: 5, errorCost: 5 },
        },
        results: {
          topProcessId: 'inquiries',
          topTitle: 'Приём обращений',
          topScore: 5,
          tied: true,
          ranking: [],
          board: 'tied',
          resolution: 'visitor',
          resolutionReason: 'Лидер — «Приём обращений»: вы выбрали, что сгорит первым.',
        },
      },
    });
    expect(restored?.priority?.results.topProcessId).not.toBe('inquiries');
    expect(restored?.priority?.results.resolution).not.toBe('visitor');
  });
});
