import { describe, test, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDirtyGuard } from '../../src/lib/useDirtyGuard';

describe('useDirtyGuard', () => {
  test('is false when the values have not changed since mount', () => {
    const { result, rerender } = renderHook(({ values }) => useDirtyGuard(values), {
      initialProps: { values: { name: 'a' } },
    });
    expect(result.current).toBe(false);
    rerender({ values: { name: 'a' } });
    expect(result.current).toBe(false);
  });

  test('is true once a value changes from the mount-time snapshot', () => {
    const { result, rerender } = renderHook(({ values }) => useDirtyGuard(values), {
      initialProps: { values: { name: 'a' } },
    });
    rerender({ values: { name: 'b' } });
    expect(result.current).toBe(true);
  });

  test('is false again if the value is restored to its original snapshot', () => {
    const { result, rerender } = renderHook(({ values }) => useDirtyGuard(values), {
      initialProps: { values: { name: 'a' } },
    });
    rerender({ values: { name: 'b' } });
    expect(result.current).toBe(true);
    rerender({ values: { name: 'a' } });
    expect(result.current).toBe(false);
  });

  test('compares arrays and nested objects, not just top-level primitives', () => {
    const { result, rerender } = renderHook(({ values }) => useDirtyGuard(values), {
      initialProps: { values: { stops: [{ city: 'Dallas' }] } },
    });
    expect(result.current).toBe(false);
    rerender({ values: { stops: [{ city: 'Dallas' }, { city: 'Waco' }] } });
    expect(result.current).toBe(true);
  });
});
