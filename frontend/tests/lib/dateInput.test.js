import { describe, test, expect } from 'vitest';
import { isoToDatetimeLocal, datetimeLocalToMysql } from '../../src/lib/dateInput';

describe('isoToDatetimeLocal', () => {
  test('formats an ISO datetime as a datetime-local input value using local time', () => {
    const iso = new Date(2026, 7, 12, 9, 5, 0).toISOString();
    expect(isoToDatetimeLocal(iso)).toBe('2026-08-12T09:05');
  });

  test('returns an empty string for null, undefined, or invalid input', () => {
    expect(isoToDatetimeLocal(null)).toBe('');
    expect(isoToDatetimeLocal(undefined)).toBe('');
    expect(isoToDatetimeLocal('not-a-date')).toBe('');
  });
});

describe('datetimeLocalToMysql', () => {
  test('converts a datetime-local value to a MySQL DATETIME string', () => {
    expect(datetimeLocalToMysql('2026-08-12T09:05')).toBe('2026-08-12 09:05:00');
  });

  test('returns null for an empty, undefined, or malformed value', () => {
    expect(datetimeLocalToMysql('')).toBeNull();
    expect(datetimeLocalToMysql(undefined)).toBeNull();
    expect(datetimeLocalToMysql('not-a-date')).toBeNull();
  });
});
