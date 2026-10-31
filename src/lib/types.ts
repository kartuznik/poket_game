export type ToolId =
  | 'revenue-risk'
  | 'routine-calc'
  | 'priority-diag'
  | 'readiness-check'
  | 'final-report'
  | 'audit-finish';

export type DesignThemeId = 'minimal' | 'playful' | 'editorial';

export interface ToolMeta {
  readonly id: ToolId;
  readonly shortTitle: string;
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly inputLabel: string;
  readonly inputUnit: string;
  readonly defaultInput: number;
  readonly minInput: number;
  readonly maxInput: number;
  readonly stepInput: number;
  readonly nextToolId: ToolId;
  readonly nextToolCta: string;
}

export type UncertaintyTag = 'precise' | 'rough' | 'guess';

export type UncertaintyInputId =
  | 'leads'
  | 'lateShare'
  | 'conversion'
  | 'check'
  | 'recoveryShare';

export type UncertaintyProfile = Readonly<Record<UncertaintyInputId, UncertaintyTag>>;

export interface RevenueRiskBridgeSnapshot {
  readonly toolId: 'revenue-risk';
  readonly inputs: {
    readonly leadsPerMonth: number;
    readonly lateSharePercent: number;
    readonly conversionPercent: number;
    readonly avgCheck: number;
    readonly lossFactor: number;
    readonly mode: 'custom' | 'preset';
    readonly presetId?: string;
  };
  readonly results: {
    readonly lateLeads: number;
    readonly revenueAtRiskMax: number;
    readonly recoverableRevenue: number;
    readonly revenueAtRiskPerYear: number;
    readonly costPerMissedDialog: number;
  };
  readonly uncertainty?: UncertaintyProfile;
  /** Null until the visitor picks 30, 50 or 70 percent. Free typing is a later round. */
  readonly botCoverage?: number | null;
  readonly updatedAt: number;
}

export type RoutinePresetId = 'answers' | 'orders' | 'booking' | 'sheets';

export interface RoutineBridgeSnapshot {
  readonly toolId: 'routine-calc';
  readonly inputs: {
    readonly presetId: RoutinePresetId | null;
    readonly operationsPerWeek: number;
    readonly minutesPerOperation: number;
    readonly hourlyRate: number | null;
    readonly automationSharePercent: number;
  };
  readonly results: {
    readonly hoursPerMonth: number;
    readonly workDaysPerYear: number;
    readonly savedHoursPerMonth: number;
    readonly savedWorkDaysPerYear: number;
    readonly savedMoneyPerMonth: number | null;
  };
  readonly updatedAt: number;
}

export type PriorityProcessId =
  | 'inquiries'
  | 'answers'
  | 'booking'
  | 'payment'
  | 'reminders'
  | 'reports';

export interface PriorityScoreInput {
  readonly frequency: number;
  readonly time: number;
  readonly errorCost: number;
}

export interface PriorityBridgeSnapshot {
  readonly toolId: 'priority-diag';
  readonly inputs: Readonly<Record<PriorityProcessId, PriorityScoreInput>>;
  readonly results: {
    readonly topProcessId: PriorityProcessId;
    readonly topTitle: string;
    readonly topScore: number;
    readonly tied: boolean;
    readonly ranking: readonly {
      readonly id: PriorityProcessId;
      readonly title: string;
      readonly score: number;
    }[];
  };
  readonly updatedAt: number;
}

export type ReadinessItemId =
  | 'repeated'
  | 'rules'
  | 'one-path'
  | 'one-place'
  | 'faq'
  | 'numbers'
  | 'owner'
  | 'channel'
  | 'time';

export type ReadinessStatus = 'yes' | 'partial' | 'no';

export type ReadinessBand = 'early' | 'gaps' | 'ready';

export interface ReadinessBridgeSnapshot {
  readonly toolId: 'readiness-check';
  readonly inputs: Readonly<Record<ReadinessItemId, ReadinessStatus>>;
  readonly results: {
    readonly score: number;
    readonly band: ReadinessBand;
    readonly bandLabel: string;
    readonly unclosedTitles: readonly string[];
  };
  readonly updatedAt: number;
}

export interface ToolHandoffPayload {
  readonly fromTool: ToolId;
  readonly toTool: ToolId;
  readonly label: string;
  readonly suggestedValue: number;
  readonly note: string;
  readonly timestamp: number;
  readonly revenueRiskSnapshot?: RevenueRiskBridgeSnapshot;
}

export interface ScenarioSnapshot {
  readonly toolId: ToolId;
  readonly label: string;
  readonly primaryValue: number;
  readonly formattedValue: string;
  readonly savedAt: number;
}

export interface ScenarioComparison {
  readonly before: ScenarioSnapshot;
  readonly afterValue: number;
  readonly delta: number;
  readonly deltaPercent: number | null;
  readonly direction: 'improved' | 'worsened' | 'unchanged';
}

export interface StorageSaveResult {
  readonly snapshot: ScenarioSnapshot;
  readonly persisted: boolean;
}

export interface ClipboardResult {
  readonly ok: boolean;
  readonly method: 'clipboard-api' | 'exec-command' | 'failed';
  readonly summaryLabel: string;
  readonly message: string;
}
