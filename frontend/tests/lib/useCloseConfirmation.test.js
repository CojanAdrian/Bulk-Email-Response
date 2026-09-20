import { describe, test, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCloseConfirmation } from '../../src/lib/useCloseConfirmation';

describe('useCloseConfirmation', () => {
  test('requestClose calls onClose immediately when not dirty', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useCloseConfirmation());
    act(() => result.current.requestClose(false, onClose));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.confirming).toBe(false);
  });

  test('requestClose does not call onClose when dirty, and sets confirming', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useCloseConfirmation());
    act(() => result.current.requestClose(true, onClose));
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.confirming).toBe(true);
  });

  test('confirmDiscard calls the pending onClose and clears confirming', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useCloseConfirmation());
    act(() => result.current.requestClose(true, onClose));
    act(() => result.current.confirmDiscard());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.confirming).toBe(false);
  });

  test('cancelDiscard clears confirming without calling onClose', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useCloseConfirmation());
    act(() => result.current.requestClose(true, onClose));
    act(() => result.current.cancelDiscard());
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.confirming).toBe(false);
  });
});
