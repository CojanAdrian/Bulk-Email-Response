import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoadLookupPanel from '../../src/components/LoadLookupPanel';

const LOADS = [
  {
    id: 1, load_number: '1001', origin_city: 'Chicago', origin_state: 'IL', origin_zip: '',
    dest_city: 'Dallas', dest_state: 'TX', dest_zip: '', equipment: 'V', weight: '42000', target_pay: 1500,
    early_pu: new Date(2026, 7, 10, 8, 0).toISOString(), late_pu: new Date(2026, 7, 10, 8, 0).toISOString(),
    late_del: null, stops: 0, commodity: null, temperature: null, comment: '',
  },
];

describe('LoadLookupPanel', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  test('shows nothing until a query is typed', () => {
    render(<LoadLookupPanel loads={LOADS} />);
    expect(screen.queryByText(/1001/)).not.toBeInTheDocument();
    expect(screen.getByText(/select a load above/i)).toBeInTheDocument();
  });

  test('shows matching results as the user types', () => {
    render(<LoadLookupPanel loads={LOADS} />);
    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    expect(screen.getByText(/1001 — V/)).toBeInTheDocument();
  });

  test('shows a no-results message when nothing matches', () => {
    render(<LoadLookupPanel loads={LOADS} />);
    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: 'nonexistent' } });
    expect(screen.getByText(/no loads match/i)).toBeInTheDocument();
  });

  test('selecting a result shows its email-ready message', () => {
    render(<LoadLookupPanel loads={LOADS} />);
    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText(/1001 — V/));
    expect(screen.getByLabelText(/email message/i).value).toContain('PU: Chicago, IL');
  });

  test('toggling the rate switch updates the message and its label', () => {
    render(<LoadLookupPanel loads={LOADS} />);
    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText(/1001 — V/));
    expect(screen.getByLabelText(/email message/i).value).toContain('How much would you need');

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText(/rate shown/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email message/i).value).toContain('Rate: $1,500');
  });

  test('copy button copies the current message to the clipboard and shows confirmation', async () => {
    render(<LoadLookupPanel loads={LOADS} />);
    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText(/1001 — V/));
    fireEvent.click(screen.getByRole('button', { name: /copy to clipboard/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('PU: Chicago, IL'));
    await waitFor(() => expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument());
  });

  test('shows the planning comment when present', () => {
    const loadsWithComment = [{ ...LOADS[0], comment: 'drop trailer' }];
    render(<LoadLookupPanel loads={loadsWithComment} />);
    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText(/1001 — V/));
    expect(screen.getByText('drop trailer')).toBeInTheDocument();
  });

  test('shows a multi-stop warning when applicable', () => {
    const loadsWithStops = [{ ...LOADS[0], stops: 2 }];
    render(<LoadLookupPanel loads={loadsWithStops} />);
    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText(/1001 — V/));
    expect(screen.getByText(/multi-stop/i)).toBeInTheDocument();
  });

  test('renders a Blast email button and calls onOpenBlast with the selected load when clicked', () => {
    const onOpenBlast = vi.fn();
    render(<LoadLookupPanel loads={LOADS} onOpenBlast={onOpenBlast} />);
    fireEvent.change(screen.getByLabelText(/search loads/i), { target: { value: '1001' } });
    fireEvent.click(screen.getByText(/1001 — V/));
    fireEvent.click(screen.getByRole('button', { name: /blast email/i }));
    expect(onOpenBlast).toHaveBeenCalledWith(LOADS[0], false);
  });

  test('does not render a Blast email button when no load is selected', () => {
    render(<LoadLookupPanel loads={LOADS} onOpenBlast={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /blast email/i })).not.toBeInTheDocument();
  });
});
