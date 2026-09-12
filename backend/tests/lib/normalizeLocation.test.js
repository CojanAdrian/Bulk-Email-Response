const { titleCaseCity, upperState } = require('../../src/lib/normalizeLocation');

describe('titleCaseCity', () => {
  test('title-cases a lowercase city name', () => {
    expect(titleCaseCity('chicago')).toBe('Chicago');
  });

  test('title-cases a multi-word city name', () => {
    expect(titleCaseCity('new york')).toBe('New York');
  });

  test('normalizes a fully-uppercase city name', () => {
    expect(titleCaseCity('CHICAGO')).toBe('Chicago');
  });

  test('title-cases each part of a hyphenated city name', () => {
    expect(titleCaseCity('winston-salem')).toBe('Winston-Salem');
  });

  test('title-cases after an apostrophe', () => {
    expect(titleCaseCity("o'fallon")).toBe("O'Fallon");
  });

  test('trims surrounding whitespace', () => {
    expect(titleCaseCity('  chicago  ')).toBe('Chicago');
  });

  test('passes null and undefined through unchanged', () => {
    expect(titleCaseCity(null)).toBeNull();
    expect(titleCaseCity(undefined)).toBeUndefined();
  });

  test('returns an empty string for an empty or whitespace-only input', () => {
    expect(titleCaseCity('')).toBe('');
    expect(titleCaseCity('   ')).toBe('');
  });
});

describe('upperState', () => {
  test('uppercases a lowercase state code', () => {
    expect(upperState('il')).toBe('IL');
  });

  test('trims surrounding whitespace', () => {
    expect(upperState(' il ')).toBe('IL');
  });

  test('passes null and undefined through unchanged', () => {
    expect(upperState(null)).toBeNull();
    expect(upperState(undefined)).toBeUndefined();
  });

  test('returns an empty string for an empty or whitespace-only input', () => {
    expect(upperState('')).toBe('');
    expect(upperState('   ')).toBe('');
  });
});
