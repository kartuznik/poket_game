import type { PriorityProcessId } from '../../lib/types';
import type { RankSource } from './calc';

export const NO_DEFAULT_LINE = 'Дефолта нет: баллы равны, деньги процессы не разводят';

/** Secondary-button affordance. Pressed state is CSS on aria-pressed. */
export const CHIP_CLASS_NAMES = ['priority-chip'] as const;

export interface ChipModel {
  readonly id: PriorityProcessId;
  readonly label: string;
  readonly pressed: boolean;
  readonly classNames: readonly string[];
}

export interface ChipBoardModel {
  readonly chips: readonly ChipModel[];
  readonly persistedPick: PriorityProcessId | null;
  readonly defaultLine: string | null;
}

/**
 * Money highlights a chip without becoming a stored pick.
 * Open explains that there is no default. A click is the only persisted pick.
 */
export function chipBoardModel(input: {
  readonly peers: readonly { readonly id: PriorityProcessId; readonly title: string }[];
  readonly source: RankSource;
  readonly processId: PriorityProcessId | null;
  readonly pickedProcessId: PriorityProcessId | null;
}): ChipBoardModel {
  const persistedPick = input.pickedProcessId;
  return {
    persistedPick,
    defaultLine: input.source === 'open' ? NO_DEFAULT_LINE : null,
    chips: input.peers.map((peer) => {
      const pressed =
        persistedPick === peer.id ||
        (persistedPick === null && input.source === 'money' && input.processId === peer.id);
      return {
        id: peer.id,
        label: pressed ? `✓ ${peer.title}` : peer.title,
        pressed,
        classNames: CHIP_CLASS_NAMES,
      };
    }),
  };
}
