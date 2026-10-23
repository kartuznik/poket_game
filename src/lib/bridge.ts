import type {
  DesignThemeId,
  RevenueRiskBridgeSnapshot,
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
  }
}

export const defaultToolBridge = new ToolBridge();
