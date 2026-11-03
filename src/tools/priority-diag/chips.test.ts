import { describe, expect, it } from 'vitest';
import { CHIP_CLASS_NAMES, NO_DEFAULT_LINE, chipBoardModel } from './chips';

const peers = [
  { id: 'payment' as const, title: 'Оплата' },
  { id: 'booking' as const, title: 'Запись и заказы' },
];

describe('priority chips', () => {
  it('highlights the money fallback without storing a pick', () => {
    const model = chipBoardModel({
      peers,
      source: 'money',
      processId: 'payment',
      pickedProcessId: null,
    });
    expect(model.persistedPick).toBeNull();
    expect(model.defaultLine).toBeNull();
    expect(model.chips.find((chip) => chip.id === 'payment')).toMatchObject({
      pressed: true,
      label: '✓ Оплата',
      classNames: CHIP_CLASS_NAMES,
    });
    expect(model.chips.find((chip) => chip.id === 'booking')?.pressed).toBe(false);
  });

  it('says there is no default when the tie stays open', () => {
    const model = chipBoardModel({
      peers,
      source: 'open',
      processId: null,
      pickedProcessId: null,
    });
    expect(model.defaultLine).toBe(NO_DEFAULT_LINE);
    expect(model.persistedPick).toBeNull();
    expect(model.chips.every((chip) => !chip.pressed)).toBe(true);
  });

  it('keeps a real click as the only stored pick', () => {
    const model = chipBoardModel({
      peers,
      source: 'visitor',
      processId: 'booking',
      pickedProcessId: 'booking',
    });
    expect(model.persistedPick).toBe('booking');
    expect(model.chips.find((chip) => chip.id === 'booking')?.pressed).toBe(true);
    expect(model.chips.find((chip) => chip.id === 'payment')?.pressed).toBe(false);
    expect(model.defaultLine).toBeNull();
  });
});
