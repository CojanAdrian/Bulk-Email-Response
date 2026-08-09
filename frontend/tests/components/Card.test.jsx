import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card from '../../src/components/Card';

describe('Card', () => {
  test('renders its children', () => {
    render(<Card>Hello world</Card>);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  test('applies the floating rounded-card styling', () => {
    render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId('card').className).toContain('bg-surface');
    expect(screen.getByTestId('card').className).toContain('rounded-3xl');
  });

  test('merges an additional className with the base styling', () => {
    render(
      <Card data-testid="card" className="extra-class">
        content
      </Card>
    );
    expect(screen.getByTestId('card').className).toContain('extra-class');
    expect(screen.getByTestId('card').className).toContain('bg-surface');
  });
});
