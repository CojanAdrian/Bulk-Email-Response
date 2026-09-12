import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectionCircle from '../../src/components/SelectionCircle';

describe('SelectionCircle', () => {
  test('renders as an unchecked checkbox-role button with the given label', () => {
    render(<SelectionCircle selected={false} onToggle={vi.fn()} ariaLabel="Select inquiry from a@example.com" />);
    const el = screen.getByRole('checkbox', { name: 'Select inquiry from a@example.com' });
    expect(el).toHaveAttribute('aria-checked', 'false');
  });

  test('marks aria-checked true and shows a checkmark icon when selected', () => {
    render(<SelectionCircle selected onToggle={vi.fn()} ariaLabel="Select inquiry from a@example.com" />);
    const el = screen.getByRole('checkbox', { name: 'Select inquiry from a@example.com' });
    expect(el).toHaveAttribute('aria-checked', 'true');
    expect(el.querySelector('svg')).not.toBeNull();
  });

  test('renders no checkmark icon when not selected', () => {
    render(<SelectionCircle selected={false} onToggle={vi.fn()} ariaLabel="Select inquiry from a@example.com" />);
    const el = screen.getByRole('checkbox', { name: 'Select inquiry from a@example.com' });
    expect(el.querySelector('svg')).toBeNull();
  });

  test('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<SelectionCircle selected={false} onToggle={onToggle} ariaLabel="Select inquiry from a@example.com" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select inquiry from a@example.com' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('applies the accent-filled classes only when selected', () => {
    const { rerender } = render(<SelectionCircle selected={false} onToggle={vi.fn()} ariaLabel="label" />);
    expect(screen.getByRole('checkbox').className).not.toContain('bg-accent');

    rerender(<SelectionCircle selected onToggle={vi.fn()} ariaLabel="label" />);
    expect(screen.getByRole('checkbox').className).toContain('bg-accent');
  });
});
