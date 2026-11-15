import { describe, test, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import NeedsReply from '../../../src/screens/loads/NeedsReply';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const inquiries = [1, 2, 3, 4, 5].map((n) => ({
  id: n,
  matched_load_id: null,
  from_address: `Carrier ${n} <c${n}@x.com>`,
  subject: `Q${n}`,
  received_at: `2026-11-14T0${n}:00:00Z`,
}));

describe('NeedsReply', () => {
  test('shows only the 3 newest emails, newest on top', () => {
    render(
      <MemoryRouter>
        <NeedsReply inquiries={inquiries} onHoverLoad={vi.fn()} />
      </MemoryRouter>
    );
    const card = screen.getByRole('region', { name: 'Inquiries waiting for a reply' });
    const items = within(card).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Carrier 5');
    expect(within(card).getByText('and 2 more')).toBeInTheDocument();
  });

  test('clicking an email opens it', () => {
    render(
      <MemoryRouter>
        <NeedsReply inquiries={inquiries} onHoverLoad={vi.fn()} />
        <Where />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Carrier 5'));
    expect(screen.getByTestId('where')).toHaveTextContent('/inquiries/5');
  });
});
