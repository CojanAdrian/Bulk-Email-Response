import { describe, test, expect } from 'vitest';
import {
  splitDatetimeLocal, combineDatetimeLocal, formatShort, buildMonthGrid, monthLabel,
} from '../../src/lib/dateTimeLocal';

describe('splitDatetimeLocal', () => {
  test('splits a full "YYYY-MM-DDTHH:mm" value into date and time parts', () => {
    expect(splitDatetimeLocal('2026-08-14T16:00')).toEqual({ datePart: '2026-08-14', timePart: '16:00' });
  });

  test('returns nulls for a blank value', () => {
    expect(splitDatetimeLocal('')).toEqual({ datePart: null, timePart: null });
    expect(splitDatetimeLocal(undefined)).toEqual({ datePart: null, timePart: null });
  });

  test('returns nulls for a malformed value', () => {
    expect(splitDatetimeLocal('not-a-date')).toEqual({ datePart: null, timePart: null });
  });
});

describe('combineDatetimeLocal', () => {
  test('joins a date and time part', () => {
    expect(combineDatetimeLocal('2026-08-14', '16:00')).toBe('2026-08-14T16:00');
  });

  test('defaults to 8am when no time part is given yet', () => {
    expect(combineDatetimeLocal('2026-08-14', null)).toBe('2026-08-14T08:00');
  });

  test('returns an empty string when there is no date part', () => {
    expect(combineDatetimeLocal(null, '16:00')).toBe('');
  });
});

describe('formatShort', () => {
  test('formats a full value as "Mon D, h:mma"', () => {
    expect(formatShort('2026-08-24T14:00')).toBe('Aug 24, 2pm');
  });

  test('formats a value with non-zero minutes', () => {
    expect(formatShort('2026-08-24T14:30')).toBe('Aug 24, 2:30pm');
  });

  test('returns null for a blank value', () => {
    expect(formatShort('')).toBeNull();
  });
});

describe('buildMonthGrid', () => {
  test('returns 42 cells (6 full weeks)', () => {
    expect(buildMonthGrid(2026, 7)).toHaveLength(42);
  });

  test('flags days outside the requested month', () => {
    const grid = buildMonthGrid(2026, 7); // August 2026
    const outside = grid.filter((d) => !d.inMonth);
    expect(outside.length).toBeGreaterThan(0);
    const inside = grid.filter((d) => d.inMonth);
    expect(inside).toHaveLength(31);
  });
});

describe('monthLabel', () => {
  test('formats a year/month pair as "Month YYYY"', () => {
    expect(monthLabel(2026, 7)).toBe('August 2026');
  });
});
