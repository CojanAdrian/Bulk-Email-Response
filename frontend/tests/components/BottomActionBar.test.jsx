import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BottomActionBar from '../../src/components/BottomActionBar';

describe('BottomActionBar', () => {
  test('renders nothing when count is 0', () => {
    render(<BottomActionBar count={0}>content</BottomActionBar>);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  test('renders the count label and children when count is greater than 0', () => {
    render(<BottomActionBar count={3}><button>Send</button></BottomActionBar>);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  test('is translucent/blurred (reads as a floating sheet, not a plain bordered box)', () => {
    render(<BottomActionBar count={1}>content</BottomActionBar>);
    expect(screen.getByText('1 selected').closest('div').className).toContain('backdrop-blur');
  });
});
