import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Island from '../../src/shell/Island';

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderIsland(props) {
  return render(
    <MemoryRouter initialEntries={['/loads']}>
      <Island {...props} />
      <Where />
    </MemoryRouter>
  );
}

const INQUIRY = { from_address: 'dispatch@carrierco.com', subject: 'Re: Load 0084341' };

describe('Island', () => {
  test('at rest shows the inbox state and how many inquiries are waiting', () => {
    renderIsland({ pendingCount: 6, gmailConnected: true });
    expect(screen.getByText('Inbox live')).toBeInTheDocument();
    expect(screen.getByText('6 waiting')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('says so when Gmail is not connected', () => {
    renderIsland({ gmailConnected: false });
    expect(screen.getByText('Gmail not connected')).toBeInTheDocument();
  });

  test('at rest, clicking it opens Inquiries', () => {
    renderIsland({ gmailConnected: true });
    fireEvent.click(screen.getByRole('button', { name: /open inquiries/i }));
    expect(screen.getByTestId('path')).toHaveTextContent('/inquiries');
  });

  test('opens for a new inquiry with the sender and subject', () => {
    renderIsland({ inquiry: INQUIRY });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('New inquiry from dispatch@carrierco.com');
    expect(alert).toHaveTextContent('Re: Load 0084341');
  });

  test('View dismisses it and opens Inquiries', () => {
    const onDismiss = vi.fn();
    renderIsland({ inquiry: INQUIRY, onDismiss });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByTestId('path')).toHaveTextContent('/inquiries');
  });

  test('Later dismisses it and stays on the current screen', () => {
    const onDismiss = vi.fn();
    renderIsland({ inquiry: INQUIRY, onDismiss });
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.getByTestId('path')).toHaveTextContent('/loads');
  });
});
