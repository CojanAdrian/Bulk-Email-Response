import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SecondaryButton from '../../src/components/SecondaryButton';

describe('SecondaryButton', () => {
  test('renders its children and responds to clicks', () => {
    const onClick = vi.fn();
    render(<SecondaryButton onClick={onClick}>Cancel</SecondaryButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('applies the outlined pill secondary styling', () => {
    render(<SecondaryButton>Cancel</SecondaryButton>);
    expect(screen.getByRole('button').className).toContain('rounded-full');
    expect(screen.getByRole('button').className).toContain('border-border');
  });

  test('respects the disabled prop', () => {
    render(<SecondaryButton disabled>Cancel</SecondaryButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
