import type { ToolBridge } from './bridge';
import type { KeyValueStorage } from './storage';
import { resolveKeyValueStorage } from './storage';
import type {
  PriorityBridgeSnapshot,
  PriorityProcessId,
  PriorityScoreInput,
  ReadinessBridgeSnapshot,
  ReadinessItemId,
  ReadinessStatus,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
  UncertaintyProfile,
  UncertaintyTag,
  RoutinePresetId,
  ToolId,
} from './types';
export const DOSSIER_VERSION = 1 as const;
export const DOSSIER_STORAGE_KEY = 'poket_game:dossier:v1';

export interface RevenueDraft {
  readonly step: number;
  readonly leadsPerMonth: string;
  readonly lateSharePercent: string;
  readonly conversionPercent: string;
  readonly avgCheck: string;
  readonly lossFactorPercent: string;
  readonly mode: 'custom' | 'preset';
  readonly presetId: string | null;
  readonly uncertainty?: UncertaintyProfile;
  readonly botCoverage?: number | null;
}

export interface RoutineDraft {
  readonly step: number;
  readonly presetId: RoutinePresetId | null;
  /** True after «Введу свои цифры» or a typed number, so step 1 is no longer blank. */
  readonly customEntry: boolean;
  readonly operationsPerWeek: string;
  readonly minutesPerOperation: string;
  readonly automationSharePercent: string;
  readonly hourlyRate: string;
}

export interface PriorityScoreDraft {
  readonly frequency: number | null;
  readonly time: number | null;
  readonly errorCost: number | null;
}

export interface PriorityDraft {
  readonly step: number;
  readonly scores: Readonly<Record<PriorityProcessId, PriorityScoreDraft>>;
}

export interface ReadinessDraft {
  readonly step: number;
  readonly answers: Readonly<Record<ReadinessItemId, ReadinessStatus | null>>;
}

export interface ContactDraft {
  readonly name: string;
  readonly telegram: string;
  readonly phone: string;
  readonly business: string;
}

export interface ContactErrors {
  readonly name: string | null;
  readonly contact: string | null;
}

export interface BusinessDossier {
  readonly version: typeof DOSSIER_VERSION;
  readonly updatedAt: number;
  readonly revenueDraft: RevenueDraft | null;
  readonly routineDraft: RoutineDraft | null;
  readonly priorityDraft: PriorityDraft | null;
  readonly readinessDraft: ReadinessDraft | null;
  readonly revenue: RevenueRiskBridgeSnapshot | null;
  readonly routine: RoutineBridgeSnapshot | null;
  readonly priority: PriorityBridgeSnapshot | null;
  readonly readiness: ReadinessBridgeSnapshot | null;
  readonly contacts: ContactDraft;
}

export interface DossierWriteResult {
  readonly dossier: BusinessDossier;
  readonly persisted: boolean;
}

export interface DossierStore {
  read(): BusinessDossier;
  update(mutator: (current: BusinessDossier) => BusinessDossier): DossierWriteResult;
  flush(): DossierWriteResult;
}

const PRIORITY_IDS: readonly PriorityProcessId[] = [
  'inquiries',
  'answers',
  'booking',
  'payment',
  'reminders',
  'reports',
];

const READINESS_IDS: readonly ReadinessItemId[] = [
  'repeated',
  'rules',
  'one-path',
  'one-place',
  'faq',
  'numbers',
  'owner',
  'channel',
  'time',
];

const ROUTINE_PRESETS: readonly RoutinePresetId[] = ['answers', 'orders', 'booking', 'sheets'];

export function emptyContacts(): ContactDraft {
  return { name: '', telegram: '', phone: '', business: '' };
}

export function emptyDossier(now = 0): BusinessDossier {
  return {
    version: DOSSIER_VERSION,
    updatedAt: now,
    revenueDraft: null,
    routineDraft: null,
    priorityDraft: null,
    readinessDraft: null,
    revenue: null,
    routine: null,
    priority: null,
    readiness: null,
    contacts: emptyContacts(),
  };
}

export function validateContacts(input: ContactDraft): { ok: boolean; errors: ContactErrors } {
  const name = input.name.trim();
  const telegram = input.telegram.trim();
  const phone = input.phone.trim();
  const errors: ContactErrors = {
    name: name ? null : 'Напишите, как к вам обращаться.',
    contact: telegram || phone ? null : 'Оставьте Telegram или телефон — так Ефим сможет ответить.',
  };
  return { ok: errors.name === null && errors.contact === null, errors };
}

export function draftStepFor(dossier: BusinessDossier, toolId: ToolId): number | null {
  switch (toolId) {
    case 'revenue-risk':
      return dossier.revenueDraft?.step ?? null;
    case 'routine-calc':
      return dossier.routineDraft?.step ?? null;
    case 'priority-diag':
      return dossier.priorityDraft?.step ?? null;
    case 'readiness-check':
      return dossier.readinessDraft?.step ?? null;
    default:
      return null;
  }
}

/** Copies only finished tools into the in-memory bridge. Drafts stay out of the summary. */
export function hydrateBridge(dossier: BusinessDossier, bridge: ToolBridge): void {
  if (dossier.revenue) {
    bridge.saveRevenueRiskResult({
      inputs: dossier.revenue.inputs,
      results: dossier.revenue.results,
      updatedAt: dossier.revenue.updatedAt,
    });
  }
  if (dossier.routine) {
    bridge.saveRoutineResult({
      inputs: dossier.routine.inputs,
      results: dossier.routine.results,
      updatedAt: dossier.routine.updatedAt,
    });
  }
  if (dossier.priority) {
    bridge.savePriorityResult({
      inputs: dossier.priority.inputs,
      results: dossier.priority.results,
      updatedAt: dossier.priority.updatedAt,
    });
  }
  if (dossier.readiness) {
    bridge.saveReadinessResult({
      inputs: dossier.readiness.inputs,
      results: dossier.readiness.results,
      updatedAt: dossier.readiness.updatedAt,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function stepIn(value: unknown, max: number): number | null {
  const parsed = finite(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
}

function score(value: unknown): number | null {
  const parsed = finite(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 1 || parsed > 5) return null;
  return parsed;
}

/** null means not answered yet. A present but illegal value is corrupt. */
function draftScore(value: unknown): number | null | 'bad' {
  if (value === null || value === undefined) return null;
  const parsed = score(value);
  return parsed === null ? 'bad' : parsed;
}

function draftStatus(value: unknown): ReadinessStatus | null | 'bad' {
  if (value === null || value === undefined) return null;
  const status = readinessStatus(value);
  return status === null ? 'bad' : status;
}

function readinessStatus(value: unknown): ReadinessStatus | null {
  if (value === 'yes' || value === 'partial' || value === 'no') return value;
  return null;
}

function readContacts(value: unknown): ContactDraft {
  if (!isRecord(value)) return emptyContacts();
  return {
    name: text(value.name) ?? '',
    telegram: text(value.telegram) ?? '',
    phone: text(value.phone) ?? '',
    business: text(value.business) ?? '',
  };
}

const UNCERTAINTY_IDS = [
  'leads',
  'lateShare',
  'conversion',
  'check',
  'recoveryShare',
] as const;

function uncertaintyTag(value: unknown): UncertaintyTag | null {
  if (value === 'precise' || value === 'rough' || value === 'guess') return value;
  return null;
}

function readUncertainty(value: unknown): UncertaintyProfile | null {
  if (!isRecord(value)) return null;
  const tags = {} as Record<(typeof UNCERTAINTY_IDS)[number], UncertaintyTag>;
  for (const id of UNCERTAINTY_IDS) {
    const tag = uncertaintyTag(value[id]);
    if (tag === null) return null;
    tags[id] = tag;
  }
  return tags;
}

function readBotCoverage(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) return value;
  return undefined;
}

function readRevenueDraft(value: unknown): RevenueDraft | null {
  if (!isRecord(value)) return null;
  const step = stepIn(value.step, 4);
  const leadsPerMonth = text(value.leadsPerMonth);
  const lateSharePercent = text(value.lateSharePercent);
  const conversionPercent = text(value.conversionPercent);
  const avgCheck = text(value.avgCheck);
  const lossFactorPercent = text(value.lossFactorPercent);
  const mode = value.mode === 'custom' || value.mode === 'preset' ? value.mode : null;
  if (
    step === null ||
    leadsPerMonth === null ||
    lateSharePercent === null ||
    conversionPercent === null ||
    avgCheck === null ||
    lossFactorPercent === null ||
    mode === null
  ) {
    return null;
  }
  const presetId = text(value.presetId);
  const uncertainty = readUncertainty(value.uncertainty);
  const botCoverage = readBotCoverage(value.botCoverage);
  return {
    step,
    leadsPerMonth,
    lateSharePercent,
    conversionPercent,
    avgCheck,
    lossFactorPercent,
    mode,
    presetId,
    ...(uncertainty ? { uncertainty } : {}),
    ...(botCoverage !== undefined ? { botCoverage } : {}),
  };
}

function readRoutineDraft(value: unknown): RoutineDraft | null {
  if (!isRecord(value)) return null;
  const step = stepIn(value.step, 4);
  const operationsPerWeek = text(value.operationsPerWeek);
  const minutesPerOperation = text(value.minutesPerOperation);
  const automationSharePercent = text(value.automationSharePercent);
  const hourlyRate = text(value.hourlyRate);
  if (
    step === null ||
    operationsPerWeek === null ||
    minutesPerOperation === null ||
    automationSharePercent === null ||
    hourlyRate === null
  ) {
    return null;
  }
  const presetRaw = value.presetId;
  const presetId =
    presetRaw === null
      ? null
      : ROUTINE_PRESETS.find((id) => id === presetRaw) ?? null;
  if (presetRaw !== null && presetId === null) return null;
  const typedOwnNumbers =
    operationsPerWeek !== '' ||
    minutesPerOperation !== '' ||
    automationSharePercent !== '';
  const customEntry =
    value.customEntry === true || (presetId === null && typedOwnNumbers);
  return {
    step,
    presetId,
    customEntry,
    operationsPerWeek,
    minutesPerOperation,
    automationSharePercent,
    hourlyRate,
  };
}

function readPriorityDraft(value: unknown): PriorityDraft | null {
  if (!isRecord(value) || !isRecord(value.scores)) return null;
  const step = stepIn(value.step, 6);
  if (step === null) return null;
  const scores = {} as Record<PriorityProcessId, PriorityScoreDraft>;
  for (const id of PRIORITY_IDS) {
    const row = value.scores[id];
    if (row === undefined || row === null) {
      scores[id] = { frequency: null, time: null, errorCost: null };
      continue;
    }
    if (!isRecord(row)) return null;
    const frequency = draftScore(row.frequency);
    const time = draftScore(row.time);
    const errorCost = draftScore(row.errorCost);
    if (frequency === 'bad' || time === 'bad' || errorCost === 'bad') return null;
    scores[id] = { frequency, time, errorCost };
  }
  return { step, scores };
}

function readReadinessDraft(value: unknown): ReadinessDraft | null {
  if (!isRecord(value) || !isRecord(value.answers)) return null;
  const step = stepIn(value.step, 3);
  if (step === null) return null;
  const answers = {} as Record<ReadinessItemId, ReadinessStatus | null>;
  for (const id of READINESS_IDS) {
    const status = draftStatus(value.answers[id]);
    if (status === 'bad') return null;
    answers[id] = status;
  }
  return { step, answers };
}

function readRevenue(value: unknown): RevenueRiskBridgeSnapshot | null {
  if (!isRecord(value) || value.toolId !== 'revenue-risk') return null;
  if (!isRecord(value.inputs) || !isRecord(value.results)) return null;
  const leadsPerMonth = finite(value.inputs.leadsPerMonth);
  const lateSharePercent = finite(value.inputs.lateSharePercent);
  const conversionPercent = finite(value.inputs.conversionPercent);
  const avgCheck = finite(value.inputs.avgCheck);
  const lossFactor = finite(value.inputs.lossFactor);
  const mode = value.inputs.mode === 'custom' || value.inputs.mode === 'preset' ? value.inputs.mode : null;
  const lateLeads = finite(value.results.lateLeads);
  const revenueAtRiskMax = finite(value.results.revenueAtRiskMax);
  const recoverableRevenue = finite(value.results.recoverableRevenue);
  const revenueAtRiskPerYear = finite(value.results.revenueAtRiskPerYear);
  const costPerMissedDialog = finite(value.results.costPerMissedDialog);
  const updatedAt = finite(value.updatedAt);
  if (
    leadsPerMonth === null ||
    lateSharePercent === null ||
    conversionPercent === null ||
    avgCheck === null ||
    lossFactor === null ||
    mode === null ||
    lateLeads === null ||
    revenueAtRiskMax === null ||
    recoverableRevenue === null ||
    revenueAtRiskPerYear === null ||
    costPerMissedDialog === null ||
    updatedAt === null
  ) {
    return null;
  }
  const presetId = text(value.inputs.presetId);
  const uncertainty = readUncertainty(value.uncertainty);
  const botCoverage = readBotCoverage(value.botCoverage);
  return {
    toolId: 'revenue-risk',
    updatedAt,
    ...(uncertainty ? { uncertainty } : {}),
    ...(botCoverage !== undefined ? { botCoverage } : {}),
    inputs: {
      leadsPerMonth,
      lateSharePercent,
      conversionPercent,
      avgCheck,
      lossFactor,
      mode,
      ...(presetId ? { presetId } : {}),
    },
    results: {
      lateLeads,
      revenueAtRiskMax,
      recoverableRevenue,
      revenueAtRiskPerYear,
      costPerMissedDialog,
    },
  };
}

function readRoutine(value: unknown): RoutineBridgeSnapshot | null {
  if (!isRecord(value) || value.toolId !== 'routine-calc') return null;
  if (!isRecord(value.inputs) || !isRecord(value.results)) return null;
  const operationsPerWeek = finite(value.inputs.operationsPerWeek);
  const minutesPerOperation = finite(value.inputs.minutesPerOperation);
  const automationSharePercent = finite(value.inputs.automationSharePercent);
  const hourlyRate =
    value.inputs.hourlyRate === null ? null : finite(value.inputs.hourlyRate);
  const hoursPerMonth = finite(value.results.hoursPerMonth);
  const workDaysPerYear = finite(value.results.workDaysPerYear);
  const savedHoursPerMonth = finite(value.results.savedHoursPerMonth);
  const savedWorkDaysPerYear = finite(value.results.savedWorkDaysPerYear);
  const savedMoneyPerMonth =
    value.results.savedMoneyPerMonth === null ? null : finite(value.results.savedMoneyPerMonth);
  const updatedAt = finite(value.updatedAt);
  const rateMissing = hourlyRate === null && value.inputs.hourlyRate !== null;
  const moneyMissing = savedMoneyPerMonth === null && value.results.savedMoneyPerMonth !== null;
  if (
    operationsPerWeek === null ||
    minutesPerOperation === null ||
    automationSharePercent === null ||
    rateMissing ||
    hoursPerMonth === null ||
    workDaysPerYear === null ||
    savedHoursPerMonth === null ||
    savedWorkDaysPerYear === null ||
    moneyMissing ||
    updatedAt === null
  ) {
    return null;
  }
  const presetRaw = value.inputs.presetId;
  const presetId =
    presetRaw === null ? null : ROUTINE_PRESETS.find((id) => id === presetRaw) ?? null;
  if (presetRaw !== null && presetId === null) return null;
  return {
    toolId: 'routine-calc',
    updatedAt,
    inputs: {
      presetId,
      operationsPerWeek,
      minutesPerOperation,
      hourlyRate,
      automationSharePercent,
    },
    results: {
      hoursPerMonth,
      workDaysPerYear,
      savedHoursPerMonth,
      savedWorkDaysPerYear,
      savedMoneyPerMonth,
    },
  };
}

function readPriority(value: unknown): PriorityBridgeSnapshot | null {
  if (!isRecord(value) || value.toolId !== 'priority-diag') return null;
  const inputs = value.inputs;
  const results = value.results;
  if (!isRecord(inputs) || !isRecord(results)) return null;
  const draftLike = readPriorityDraft({ step: 1, scores: inputs });
  if (!draftLike) return null;
  const completeScores = {} as Record<PriorityProcessId, PriorityScoreInput>;
  for (const id of PRIORITY_IDS) {
    const row = draftLike.scores[id];
    if (row.frequency === null || row.time === null || row.errorCost === null) return null;
    completeScores[id] = {
      frequency: row.frequency,
      time: row.time,
      errorCost: row.errorCost,
    };
  }
  const topProcessId = PRIORITY_IDS.find((id) => id === results.topProcessId);
  const topTitle = text(results.topTitle);
  const topScore = finite(results.topScore);
  const updatedAt = finite(value.updatedAt);
  if (!topProcessId || topTitle === null || topScore === null || updatedAt === null) return null;
  if (typeof results.tied !== 'boolean' || !Array.isArray(results.ranking)) return null;
  const ranking: { id: PriorityProcessId; title: string; score: number }[] = [];
  for (const row of results.ranking) {
    if (!isRecord(row)) return null;
    const id = PRIORITY_IDS.find((item) => item === row.id);
    const title = text(row.title);
    const rowScore = finite(row.score);
    if (!id || title === null || rowScore === null) return null;
    ranking.push({ id, title, score: rowScore });
  }
  return {
    toolId: 'priority-diag',
    updatedAt,
    inputs: completeScores,
    results: {
      topProcessId,
      topTitle,
      topScore,
      tied: results.tied,
      ranking,
    },
  };
}

function readReadiness(value: unknown): ReadinessBridgeSnapshot | null {
  if (!isRecord(value) || value.toolId !== 'readiness-check') return null;
  const inputs = value.inputs;
  const results = value.results;
  if (!isRecord(inputs) || !isRecord(results)) return null;
  const draftLike = readReadinessDraft({ step: 1, answers: inputs });
  if (!draftLike) return null;
  const completeAnswers = {} as Record<ReadinessItemId, ReadinessStatus>;
  for (const id of READINESS_IDS) {
    const status = draftLike.answers[id];
    if (status === null) return null;
    completeAnswers[id] = status;
  }
  const scoreValue = finite(results.score);
  const band =
    results.band === 'early' || results.band === 'gaps' || results.band === 'ready'
      ? results.band
      : null;
  const bandLabel = text(results.bandLabel);
  const updatedAt = finite(value.updatedAt);
  if (scoreValue === null || band === null || bandLabel === null || updatedAt === null) return null;
  if (!Array.isArray(results.unclosedTitles)) return null;
  const unclosedTitles: string[] = [];
  for (const line of results.unclosedTitles) {
    if (typeof line !== 'string') return null;
    unclosedTitles.push(line);
  }
  return {
    toolId: 'readiness-check',
    updatedAt,
    inputs: completeAnswers,
    results: {
      score: scoreValue,
      band,
      bandLabel,
      unclosedTitles,
    },
  };
}

export function parseDossier(value: unknown): BusinessDossier | null {
  if (!isRecord(value) || value.version !== DOSSIER_VERSION) return null;
  const updatedAt = finite(value.updatedAt);
  if (updatedAt === null) return null;
  return {
    version: DOSSIER_VERSION,
    updatedAt,
    revenueDraft: readRevenueDraft(value.revenueDraft),
    routineDraft: readRoutineDraft(value.routineDraft),
    priorityDraft: readPriorityDraft(value.priorityDraft),
    readinessDraft: readReadinessDraft(value.readinessDraft),
    revenue: readRevenue(value.revenue),
    routine: readRoutine(value.routine),
    priority: readPriority(value.priority),
    readiness: readReadiness(value.readiness),
    contacts: readContacts(value.contacts),
  };
}

/**
 * Remembers drafts and only the tools the visitor finished.
 * Falls back to memory when localStorage throws, including private mode.
 */
export function createDossierStore(
  storageProvider?: () => KeyValueStorage | null,
  now: () => number = Date.now,
): DossierStore {
  let memory: BusinessDossier | null = null;

  const write = (dossier: BusinessDossier): DossierWriteResult => {
    memory = dossier;
    const storage = resolveKeyValueStorage(storageProvider);
    if (!storage) return { dossier, persisted: false };
    try {
      storage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify(dossier));
      return { dossier, persisted: true };
    } catch {
      return { dossier, persisted: false };
    }
  };

  return {
    read(): BusinessDossier {
      const storage = resolveKeyValueStorage(storageProvider);
      if (storage) {
        try {
          const raw = storage.getItem(DOSSIER_STORAGE_KEY);
          if (raw) {
            const parsed = parseDossier(JSON.parse(raw) as unknown);
            if (parsed) {
              memory = parsed;
              return parsed;
            }
          }
        } catch {
          // Corrupted JSON or SecurityError — use the session copy.
        }
      }
      return memory ?? emptyDossier(now());
    },

    update(mutator): DossierWriteResult {
      const next = mutator(this.read());
      return write({ ...next, version: DOSSIER_VERSION, updatedAt: now() });
    },

    flush(): DossierWriteResult {
      return write(this.read());
    },
  };
}

export const defaultDossierStore = createDossierStore();
