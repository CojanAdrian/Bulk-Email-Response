import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PrimaryButton from '../../src/components/PrimaryButton';

describe('PrimaryButton', () => {
  test('renders its children and responds to clicks', () => {
    const onClick = vi.fn();
    render(<PrimaryButton onClick={onClick}>Save</PrimaryButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('applies the gold-gradient primary styling', () => {
    render(<PrimaryButton>Save</PrimaryButton>);
    expect(screen.getByRole('button').className).toContain('from-gold-light');
  });

  test('respects the disabled prop', () => {
    render(<PrimaryButton disabled>Save</PrimaryButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
