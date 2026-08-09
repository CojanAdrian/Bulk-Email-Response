import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return { ...actual, useReducedMotion: vi.fn() };
});

import { useReducedMotion } from 'framer-motion';
import { useMotionPreset } from '../../src/lib/motionConfig';

describe('useMotionPreset', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('returns spring-based, staggered, tap-scaling presets when motion is not reduced', () => {
    useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotionPreset());

    expect(result.current.reduced).toBe(false);
    expect(result.current.popIn.transition.type).toBe('spring');
    expect(result.current.stagger).toBeGreaterThan(0);
    expect(result.current.tap.scale).toBeLessThan(1);
    expect(result.current.modal.card.transition.type).toBe('spring');
  });

  test('returns near-instant, non-spring, non-staggered presets when motion is reduced', () => {
    useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotionPreset());

    expect(result.current.reduced).toBe(true);
    expect(result.current.popIn.transition.type).not.toBe('spring');
    expect(result.current.popIn.transition.duration).toBeLessThanOrEqual(0.05);
    expect(result.current.stagger).toBe(0);
    expect(result.current.modal.card.transition.type).not.toBe('spring');
  });

  test('the pop-in preset gives its exit an explicit fast duration, distinct from the spring-timed enter', () => {
    useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotionPreset());

    expect(result.current.popIn.transition.type).toBe('spring');
    expect(result.current.popIn.exit.transition.duration).toBeGreaterThan(0);
    expect(result.current.popIn.exit.transition.duration).toBeLessThan(0.25);
  });
});
