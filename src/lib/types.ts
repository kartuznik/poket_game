export type ToolId =
  | 'revenue-risk'
  | 'routine-calc'
  | 'priority-diag'
  | 'readiness-check';

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
