import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BlastModal from '../../src/components/BlastModal';

const LOAD = {
  id: 1, load_number: '1001', origin_city: 'Chicago', origin_state: 'IL', origin_zip: '',
  dest_city: 'Dallas', dest_state: 'TX', dest_zip: '', equipment: 'V', weight: '42000', target_pay: 1500,
  early_pu: new Date(2026, 7, 10, 8, 0).toISOString(), late_pu: new Date(2026, 7, 10, 8, 0).toISOString(),
  late_del: null, stops: 0, commodity: null, temperature: null, comment: '',
};

describe('BlastModal', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  test('pre-fills the subject from the load\'s route and equipment', () => {
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/subject/i)).toHaveValue('Load Available | Chicago IL → Dallas TX | V');
  });

  test('pre-fills the message body using the initial rate-visibility setting', () => {
    render(<BlastModal load={LOAD} initialShowRate={true} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/message/i).value).toContain('Rate: $1,500');
  });

  test('toggling the rate switch updates the body', () => {
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/message/i).value).toContain('How much would you need');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByLabelText(/message/i).value).toContain('Rate: $1,500');
  });

  test('counts only well-formed emails as valid, live as the user types', () => {
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/carrier emails/i), {
      target: { value: 'good@example.com, not-an-email, also-good@example.com' },
    });
    expect(screen.getByText(/\(2 valid\)/)).toBeInTheDocument();
  });

  test('opens a Gmail compose URL with bcc/subject/body when there are valid emails', () => {
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/carrier emails/i), { target: { value: 'carrier@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /open in gmail/i }));

    expect(window.open).toHaveBeenCalledTimes(1);
    const [url, target] = window.open.mock.calls[0];
    expect(url).toContain('https://mail.google.com/mail/?view=cm');
    expect(url).toContain('bcc=carrier%40example.com');
    expect(url).toContain('su=Load%20Available');
    expect(target).toBe('_blank');
  });

  test('does not open Gmail when there are no valid emails', () => {
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /open in gmail/i }));
    expect(window.open).not.toHaveBeenCalled();
  });

  test('extracts emails from a dropped text file', async () => {
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={vi.fn()} />);
    const file = new File(['a@example.com, b@example.com\nnot an email'], 'carriers.txt', { type: 'text/plain' });
    const dropZone = screen.getByLabelText(/carrier emails/i).parentElement;

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByLabelText(/carrier emails/i).value).toContain('a@example.com');
    });
    expect(screen.getByLabelText(/carrier emails/i).value).toContain('b@example.com');
  });

  test('rejects an Excel file drop with an explanatory message', () => {
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={vi.fn()} />);
    const file = new File(['irrelevant'], 'carriers.xlsx', { type: 'application/vnd.ms-excel' });
    const dropZone = screen.getByLabelText(/carrier emails/i).parentElement;

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(screen.getByRole('alert')).toHaveTextContent(/excel files aren't supported/i);
    expect(screen.getByLabelText(/carrier emails/i).value).toBe('');
  });

  test('calls onClose when Cancel or the close button is clicked', () => {
    const onClose = vi.fn();
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('calls onClose when clicking the modal backdrop', () => {
    const onClose = vi.fn();
    render(<BlastModal load={LOAD} initialShowRate={false} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
