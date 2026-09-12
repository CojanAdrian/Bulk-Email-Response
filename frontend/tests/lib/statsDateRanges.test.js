import { describe, test, expect } from 'vitest';
import { rangeForPreset, STATS_PRESETS } from '../../src/lib/statsDateRanges';

const NOW = new Date(2026, 8, 15, 14, 30); // Sept 15, 2026, 2:30pm local

describe('rangeForPreset', () => {
  test('today is just today, both ends', () => {
    expect(rangeForPreset('today', NOW)).toEqual({ from: '2026-09-15', to: '2026-09-15' });
  });

  test('yesterday is just yesterday, both ends', () => {
    expect(rangeForPreset('yesterday', NOW)).toEqual({ from: '2026-09-14', to: '2026-09-14' });
  });

  test('last3 is a 3-day trailing window ending today (today + 2 days before)', () => {
    expect(rangeForPreset('last3', NOW)).toEqual({ from: '2026-09-13', to: '2026-09-15' });
  });

  test('lastWeek is a 7-day trailing window ending today', () => {
    expect(rangeForPreset('lastWeek', NOW)).toEqual({ from: '2026-09-09', to: '2026-09-15' });
  });

  test('lastMonth is a 30-day trailing window ending today', () => {
    expect(rangeForPreset('lastMonth', NOW)).toEqual({ from: '2026-08-17', to: '2026-09-15' });
  });

  test('all has no bounds', () => {
    expect(rangeForPreset('all', NOW)).toEqual({ from: null, to: null });
  });

  test('an unrecognized key falls back to no bounds, same as "all"', () => {
    expect(rangeForPreset('bogus', NOW)).toEqual({ from: null, to: null });
  });

  test('a trailing window correctly crosses a month boundary', () => {
    const earlyMonth = new Date(2026, 8, 2); // Sept 2, 2026
    expect(rangeForPreset('lastWeek', earlyMonth)).toEqual({ from: '2026-08-27', to: '2026-09-02' });
  });

  test('every preset has a label', () => {
    STATS_PRESETS.forEach((preset) => {
      expect(preset.label).toBeTruthy();
    });
  });
});
