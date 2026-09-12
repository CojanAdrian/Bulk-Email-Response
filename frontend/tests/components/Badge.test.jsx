import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../../src/components/Badge';

describe('Badge', () => {
  test('renders its children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test('defaults to the lavender tag variant', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active').className).toContain('bg-tag-bg');
  });

  test.each([
    ['success', 'bg-success-bg'],
    ['error', 'bg-error-bg'],
    ['warning', 'bg-warning-bg'],
    ['info', 'bg-info-bg'],
  ])('applies the %s variant styling', (variant, expectedClass) => {
    render(<Badge variant={variant}>Status</Badge>);
    expect(screen.getByText('Status').className).toContain(expectedClass);
  });

  test('falls back to the default variant for an unrecognized value', () => {
    render(<Badge variant="not-a-real-variant">Status</Badge>);
    expect(screen.getByText('Status').className).toContain('bg-tag-bg');
  });

  test('never shrinks or wraps its label, even inside a cramped flex row', () => {
    render(<Badge>Needs stops added</Badge>);
    const el = screen.getByText('Needs stops added');
    expect(el.className).toContain('shrink-0');
    expect(el.className).toContain('whitespace-nowrap');
  });

  test('forwards extra props like title', () => {
    render(<Badge title="Doesn't have the right equipment">Equipment?</Badge>);
    expect(screen.getByText('Equipment?')).toHaveAttribute('title', "Doesn't have the right equipment");
  });
});
