import type {
  DesignThemeId,
  PriorityBridgeSnapshot,
  ReadinessBridgeSnapshot,
  RevenueRiskBridgeSnapshot,
  RoutineBridgeSnapshot,
  ToolHandoffPayload,
  ToolId,
} from './types';

export const TOOL_IDS: readonly ToolId[] = [
  'revenue-risk',
  'routine-calc',
  'priority-diag',
  'readiness-check',
] as const;

export const DESIGN_THEME_IDS: readonly DesignThemeId[] = [
  'minimal',
  'playful',
  'editorial',
] as const;

export const DEFAULT_TOOL_ID: ToolId = 'revenue-risk';
export const DEFAULT_THEME_ID: DesignThemeId = 'minimal';

export function isValidToolId(value: string | null | undefined): value is ToolId {
  if (!value) return false;
  return (TOOL_IDS as readonly string[]).includes(value);
}

export function isValidThemeId(
  value: string | null | undefined,
): value is DesignThemeId {
  if (!value) return false;
  return (DESIGN_THEME_IDS as readonly string[]).includes(value);
}

export interface RouteState {
  readonly toolId: ToolId;
  readonly themeId: DesignThemeId;
}

/**
 * Extracts active tool ID and design direction from URL hash and/or search params.
 * Supports:
 *   - `#priority-diag` or `#/priority-diag`
 *   - `?tool=priority-diag&theme=playful`
 *   - `#priority-diag?theme=editorial`
 */
export function parseRouteState(
  search: string,
  hash: string,
): RouteState {
  const cleanHash = hash.replace(/^#\/?/, '').trim();
  const [hashPath, hashQuery] = cleanHash.split('?');

  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hashQuery ?? '');

  const candidateTool =
    hashPath ||
    hashParams.get('tool') ||
    searchParams.get('tool');

  const candidateTheme =
    hashParams.get('theme') ||
    searchParams.get('theme');

  return {
    toolId: isValidToolId(candidateTool) ? candidateTool : DEFAULT_TOOL_ID,
    themeId: isValidThemeId(candidateTheme) ? candidateTheme : DEFAULT_THEME_ID,
  };
}

/**
 * Builds a clean URL hash for sharing a direct link to a specific tool.
 */
export function buildRouteHash(
  toolId: ToolId,
  themeId: DesignThemeId = DEFAULT_THEME_ID,
): string {
  if (themeId === DEFAULT_THEME_ID) {
    return `#${toolId}`;
  }
  return `#${toolId}?theme=${themeId}`;
}

/**
 * In-memory bridge for passing calculation context and full tool snapshots between tools
 * (e.g., from Revenue Risk into Routine Calculator or Priority Diagnostics).
 * Intentionally kept in memory only so user inputs never outlive tab close.
 */
export class ToolBridge {
  private handoffByTarget = new Map<ToolId, ToolHandoffPayload>();
  private latestRevenueRiskSnapshot: RevenueRiskBridgeSnapshot | null = null;
  private latestRoutineSnapshot: RoutineBridgeSnapshot | null = null;
  private latestPrioritySnapshot: PriorityBridgeSnapshot | null = null;
  private latestReadinessSnapshot: ReadinessBridgeSnapshot | null = null;

  public send(
    payload: Omit<ToolHandoffPayload, 'timestamp'> & { timestamp?: number },
  ): ToolHandoffPayload {
    const entry: ToolHandoffPayload = {
      fromTool: payload.fromTool,
      toTool: payload.toTool,
      label: payload.label,
      suggestedValue: payload.suggestedValue,
      note: payload.note,
      timestamp: payload.timestamp ?? Date.now(),
      ...(payload.revenueRiskSnapshot
        ? { revenueRiskSnapshot: payload.revenueRiskSnapshot }
        : {}),
    };
    this.handoffByTarget.set(entry.toTool, entry);
    return entry;
  }

  public saveRevenueRiskResult(
    snapshot: Omit<RevenueRiskBridgeSnapshot, 'toolId' | 'updatedAt'> & {
      updatedAt?: number;
    },
  ): RevenueRiskBridgeSnapshot {
    const record: RevenueRiskBridgeSnapshot = {
      toolId: 'revenue-risk',
      inputs: snapshot.inputs,
      results: snapshot.results,
      updatedAt: snapshot.updatedAt ?? Date.now(),
    };
    this.latestRevenueRiskSnapshot = record;
    return record;
  }

  public getRevenueRiskResult(): RevenueRiskBridgeSnapshot | null {
    return this.latestRevenueRiskSnapshot;
  }

  public saveRoutineResult(
    snapshot: Omit<RoutineBridgeSnapshot, 'toolId' | 'updatedAt'> & {
      updatedAt?: number;
    },
  ): RoutineBridgeSnapshot {
    const record: RoutineBridgeSnapshot = {
      toolId: 'routine-calc',
      inputs: snapshot.inputs,
      results: snapshot.results,
      updatedAt: snapshot.updatedAt ?? Date.now(),
    };
    this.latestRoutineSnapshot = record;
    return record;
  }

  public getRoutineResult(): RoutineBridgeSnapshot | null {
    return this.latestRoutineSnapshot;
  }

  public savePriorityResult(
    snapshot: Omit<PriorityBridgeSnapshot, 'toolId' | 'updatedAt'> & {
      updatedAt?: number;
    },
  ): PriorityBridgeSnapshot {
    const record: PriorityBridgeSnapshot = {
      toolId: 'priority-diag',
      inputs: snapshot.inputs,
      results: snapshot.results,
      updatedAt: snapshot.updatedAt ?? Date.now(),
    };
    this.latestPrioritySnapshot = record;
    return record;
  }

  public getPriorityResult(): PriorityBridgeSnapshot | null {
    return this.latestPrioritySnapshot;
  }

  public saveReadinessResult(
    snapshot: Omit<ReadinessBridgeSnapshot, 'toolId' | 'updatedAt'> & {
      updatedAt?: number;
    },
  ): ReadinessBridgeSnapshot {
    const record: ReadinessBridgeSnapshot = {
      toolId: 'readiness-check',
      inputs: snapshot.inputs,
      results: snapshot.results,
      updatedAt: snapshot.updatedAt ?? Date.now(),
    };
    this.latestReadinessSnapshot = record;
    return record;
  }

  public getReadinessResult(): ReadinessBridgeSnapshot | null {
    return this.latestReadinessSnapshot;
  }

  public peek(targetTool: ToolId): ToolHandoffPayload | null {
    return this.handoffByTarget.get(targetTool) ?? null;
  }

  public consume(targetTool: ToolId): ToolHandoffPayload | null {
    const payload = this.handoffByTarget.get(targetTool) ?? null;
    this.handoffByTarget.delete(targetTool);
    return payload;
  }

  public clear(): void {
    this.handoffByTarget.clear();
    this.latestRevenueRiskSnapshot = null;
    this.latestRoutineSnapshot = null;
    this.latestPrioritySnapshot = null;
    this.latestReadinessSnapshot = null;
  }
}

export const defaultToolBridge = new ToolBridge();
