import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGoogleAuthError } from '../../src/lib/useGoogleAuthError';

describe('useGoogleAuthError', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  test('returns null when there is no authError param', () => {
    const { result } = renderHook(() => useGoogleAuthError());
    expect(result.current).toBeNull();
  });

  test('returns a human message for a known error code', () => {
    window.history.replaceState(null, '', '/?authError=account_exists');
    const { result } = renderHook(() => useGoogleAuthError());
    expect(result.current).toMatch(/already exists/i);
  });

  test('returns a generic fallback message for an unrecognized code', () => {
    window.history.replaceState(null, '', '/?authError=some_new_code');
    const { result } = renderHook(() => useGoogleAuthError());
    expect(result.current).toMatch(/something went wrong/i);
  });

  test('strips the authError param from the URL after reading it', () => {
    window.history.replaceState(null, '', '/?authError=missing_code');
    renderHook(() => useGoogleAuthError());
    expect(window.location.search).toBe('');
  });

  test('preserves other query params while stripping authError', () => {
    window.history.replaceState(null, '', '/?foo=bar&authError=missing_code');
    renderHook(() => useGoogleAuthError());
    expect(window.location.search).toBe('?foo=bar');
  });
});
