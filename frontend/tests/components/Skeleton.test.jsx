import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Skeleton from '../../src/components/Skeleton';

describe('Skeleton', () => {
  test('renders a single pulsing block by default', () => {
    render(<Skeleton />);
    const blocks = screen.getAllByTestId('skeleton-block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveClass('animate-pulse');
  });

  test('renders the requested number of rows', () => {
    render(<Skeleton count={4} />);
    expect(screen.getAllByTestId('skeleton-block')).toHaveLength(4);
  });

  test('applies a custom height and width to each block', () => {
    render(<Skeleton height="2rem" width="50%" />);
    expect(screen.getByTestId('skeleton-block')).toHaveStyle({ height: '2rem', width: '50%' });
  });
});
