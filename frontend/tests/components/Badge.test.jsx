import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../../src/components/Badge';

describe('Badge', () => {
  test('renders its children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test('defaults to the navy/gold variant', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active').className).toContain('bg-accent');
  });

  test.each([
    ['success', 'bg-success-bg'],
    ['error', 'bg-error-bg'],
    ['warning', 'bg-warning-bg'],
  ])('applies the %s variant styling', (variant, expectedClass) => {
    render(<Badge variant={variant}>Status</Badge>);
    expect(screen.getByText('Status').className).toContain(expectedClass);
  });

  test('falls back to the default variant for an unrecognized value', () => {
    render(<Badge variant="not-a-real-variant">Status</Badge>);
    expect(screen.getByText('Status').className).toContain('bg-accent');
  });
});
