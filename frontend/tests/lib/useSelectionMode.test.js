import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelectionMode } from '../../src/lib/useSelectionMode';

describe('useSelectionMode', () => {
  test('starts inactive with no selected ids', () => {
    const { result } = renderHook(() => useSelectionMode());
    expect(result.current.active).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  test('enter() activates selection mode without selecting anything', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.enter());
    expect(result.current.active).toBe(true);
    expect(result.current.selectedIds.size).toBe(0);
  });

  test('toggle() adds an id, toggling again removes it', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.toggle(1));
    expect(result.current.isSelected(1)).toBe(true);
    act(() => result.current.toggle(1));
    expect(result.current.isSelected(1)).toBe(false);
  });

  test('selectAll() selects every given id when none are fully selected yet', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.selectAll([1, 2, 3]));
    expect(result.current.selectedIds).toEqual(new Set([1, 2, 3]));
  });

  test('selectAll() clears the selection when every given id is already selected', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.selectAll([1, 2, 3]));
    act(() => result.current.selectAll([1, 2, 3]));
    expect(result.current.selectedIds.size).toBe(0);
  });

  test('remove() drops one id without touching the rest or exiting selection mode', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.enter());
    act(() => result.current.selectAll([1, 2, 3]));
    act(() => result.current.remove(2));
    expect(result.current.selectedIds).toEqual(new Set([1, 3]));
    expect(result.current.active).toBe(true);
  });

  test('clear() empties the selection but stays active', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.enter());
    act(() => result.current.selectAll([1, 2]));
    act(() => result.current.clear());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.active).toBe(true);
  });

  test('exit() empties the selection and deactivates', () => {
    const { result } = renderHook(() => useSelectionMode());
    act(() => result.current.enter());
    act(() => result.current.selectAll([1, 2]));
    act(() => result.current.exit());
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.active).toBe(false);
  });

  test('isSelected() reflects current membership', () => {
    const { result } = renderHook(() => useSelectionMode());
    expect(result.current.isSelected(5)).toBe(false);
    act(() => result.current.toggle(5));
    expect(result.current.isSelected(5)).toBe(true);
  });
});
