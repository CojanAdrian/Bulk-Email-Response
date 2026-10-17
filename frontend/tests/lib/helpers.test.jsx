import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { formatMoney, orDash } from '../../src/lib/formatMoney';
import { usePersistentState } from '../../src/lib/usePersistentState';
import { useHotkeys } from '../../src/lib/useHotkeys';

describe('formatMoney', () => {
  test('formats whole dollars without cents and keeps real cents', () => {
    expect(formatMoney(1980)).toBe('$1,980');
    expect(formatMoney('1980.50')).toBe('$1,980.50');
    expect(formatMoney('$2,450.00')).toBe('$2,450');
  });
  test('shows an em dash for missing or invalid values', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney('')).toBe('—');
    expect(formatMoney('abc')).toBe('—');
  });
});

describe('orDash', () => {
  test('replaces blank and "null" with an em dash', () => {
    expect(orDash('  ')).toBe('—');
    expect(orDash('null')).toBe('—');
    expect(orDash(null)).toBe('—');
    expect(orDash('Van')).toBe('Van');
  });
});

function PersistentCounter() {
  const [count, setCount] = usePersistentState('test-count', 0);
  return <button onClick={() => setCount((c) => c + 1)}>count {count}</button>;
}

describe('usePersistentState', () => {
  beforeEach(() => localStorage.clear());
  test('restores the saved value on the next mount', () => {
    const { unmount } = render(<PersistentCounter />);
    fireEvent.click(screen.getByRole('button'));
    unmount();
    render(<PersistentCounter />);
    expect(screen.getByRole('button')).toHaveTextContent('count 1');
  });
});

function HotkeyHarness({ onSlash }) {
  useHotkeys({ '/': onSlash });
  return <input aria-label="field" />;
}

describe('useHotkeys', () => {
  test('fires outside inputs and is ignored while typing in one', () => {
    const onSlash = vi.fn();
    render(<HotkeyHarness onSlash={onSlash} />);
    act(() => {
      fireEvent.keyDown(window, { key: '/' });
    });
    expect(onSlash).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('field'), { key: '/' });
    expect(onSlash).toHaveBeenCalledTimes(1);
  });
});
