import type { ToolId } from './types';
import type { RevenueRiskFieldErrors } from '../tools/revenue-risk/calc';
import type { RoutineFieldErrors } from '../tools/routine-calc/calc';

/** Tools the visitor walks in order. The summary tab stays outside this count. */
export const JOURNEY_TOOL_IDS = [
  'revenue-risk',
  'routine-calc',
  'priority-diag',
  'readiness-check',
] as const;

export type JourneyToolId = (typeof JOURNEY_TOOL_IDS)[number];

export const JOURNEY_LENGTH = JOURNEY_TOOL_IDS.length;

/**
 * Step counts follow the fields, not a fixed four.
 * Revenue: leads, late share, conversion, check + loss.
 * Routine: preset, operations, minutes, automation + optional rate.
 * Priority: one process per step.
 * Readiness: three groups of three items.
 */
export const STEP_COUNTS: Readonly<Record<JourneyToolId, number>> = {
  'revenue-risk': 4,
  'routine-calc': 4,
  'priority-diag': 6,
  'readiness-check': 3,
};

export function isJourneyToolId(toolId: ToolId): toolId is JourneyToolId {
  return (JOURNEY_TOOL_IDS as readonly string[]).includes(toolId);
}

export function stepCountFor(toolId: ToolId): number | null {
  return isJourneyToolId(toolId) ? STEP_COUNTS[toolId] : null;
}

export function journeyIndex(toolId: JourneyToolId): number {
  return JOURNEY_TOOL_IDS.indexOf(toolId) + 1;
}

export function clampStep(step: number, count: number): number {
  if (!Number.isFinite(step) || count < 1) return 1;
  return Math.min(count, Math.max(1, Math.trunc(step)));
}

export type StepMove = 'stay' | 'advance' | 'finish';

/** Next is refused while the current step is invalid. Finish only on the last valid step. */
export function nextMove(step: number, count: number, valid: boolean): StepMove {
  if (!valid) return 'stay';
  if (step >= count) return 'finish';
  return 'advance';
}

export function globalProgressPercent(toolIndex: number): number {
  const safe = Math.min(JOURNEY_LENGTH, Math.max(0, toolIndex));
  return (safe / JOURNEY_LENGTH) * 100;
}

export function localProgressPercent(step: number, count: number): number {
  if (count < 1) return 0;
  return (clampStep(step, count) / count) * 100;
}

/**
 * A route step wins so «Изменить» can land on a chosen step.
 * Otherwise the saved draft step is restored. A missing draft starts at 1.
 */
export function resolveInitialStep(
  count: number,
  routeStep: number | null,
  draftStep: number | null,
): number {
  if (routeStep !== null) return clampStep(routeStep, count);
  if (draftStep !== null) return clampStep(draftStep, count);
  return 1;
}

/** «Изменить» opens the last step of that tool, where the result is, not the start of the path. */
export function editStepFor(toolId: JourneyToolId): number {
  return STEP_COUNTS[toolId];
}

export function isRevenueStepValid(step: number, errors: RevenueRiskFieldErrors): boolean {
  if (step <= 1) return errors.leadsPerMonth === undefined;
  if (step === 2) return errors.lateSharePercent === undefined;
  if (step === 3) return errors.conversionPercent === undefined;
  return (
    errors.leadsPerMonth === undefined &&
    errors.lateSharePercent === undefined &&
    errors.conversionPercent === undefined &&
    errors.avgCheck === undefined &&
    errors.lossFactorPercent === undefined
  );
}

/** Step 1 stays closed until a scenario card or «Введу свои цифры» is chosen. */
export function isRoutineStartChosen(presetChosen: boolean, customEntry: boolean): boolean {
  return presetChosen || customEntry;
}

export function isRoutineStepValid(step: number, errors: RoutineFieldErrors): boolean {
  if (step <= 1) return true;
  if (step === 2) return errors.operationsPerWeek === undefined;
  if (step === 3) return errors.minutesPerOperation === undefined;
  return errors.automationSharePercent === undefined && errors.hourlyRate === undefined;
}
