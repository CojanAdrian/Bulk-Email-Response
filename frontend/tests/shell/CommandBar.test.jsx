import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CommandBar from '../../src/shell/CommandBar';

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderBar(props, start = '/loads') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <CommandBar {...props} />
      <Where />
    </MemoryRouter>
  );
}

describe('CommandBar', () => {
  test('marks the tab for the current address as the current page', () => {
    renderBar({}, '/carriers/42');
    expect(screen.getByRole('button', { name: 'Carriers' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Loads' })).not.toHaveAttribute('aria-current');
  });

  test('an unknown address counts as Loads', () => {
    renderBar({}, '/');
    expect(screen.getByRole('button', { name: 'Loads' })).toHaveAttribute('aria-current', 'page');
  });

  test('clicking a tab changes the address', () => {
    renderBar({});
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/stats');
  });

  test('shows how many inquiries are waiting without changing the tab name', () => {
    renderBar({ pendingCount: 6, gmailConnected: true });
    expect(screen.getByTestId('pending-review-badge')).toHaveTextContent('6');
    expect(screen.getByRole('button', { name: 'Inquiries' })).toBeInTheDocument();
  });

  test('caps the count at 99+', () => {
    renderBar({ pendingCount: 140, gmailConnected: true });
    expect(screen.getByTestId('pending-review-badge')).toHaveTextContent('99+');
  });

  test('shows the Gmail nudge instead of a count when Gmail is not connected', () => {
    renderBar({ pendingCount: 6, gmailConnected: false });
    expect(screen.getByTestId('gmail-nudge-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-review-badge')).not.toBeInTheDocument();
  });

  test('puts the waiting count in the browser tab title', () => {
    renderBar({ pendingCount: 3 });
    expect(document.title).toBe('(3) BulkPosting');
  });

  test('the Search button calls onSearch', () => {
    const onSearch = vi.fn();
    renderBar({ onSearch });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(onSearch).toHaveBeenCalled();
  });
});
