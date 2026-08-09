import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContactMethodModal from '../../src/components/ContactMethodModal';

describe('ContactMethodModal', () => {
  test('defaults to phone contact, no contact line, and no rate', () => {
    const onConfirm = vi.fn();
    render(<ContactMethodModal onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith({ contactMethod: 'phone', commentContact: '', rateChoice: 'none' });
  });

  test('reports the chosen contact method', () => {
    const onConfirm = vi.fn();
    render(<ContactMethodModal onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('radio', { name: /email/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ contactMethod: 'email' }));
  });

  test('only includes the contact line text when the checkbox is checked', () => {
    const onConfirm = vi.fn();
    render(<ContactMethodModal onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /include a contact line/i }));
    fireEvent.change(screen.getByLabelText(/contact line text/i), { target: { value: 'Call John 555-1234' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ commentContact: 'Call John 555-1234' }));
  });

  test('discards typed contact-line text if the checkbox is unchecked before confirming', () => {
    const onConfirm = vi.fn();
    render(<ContactMethodModal onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /include a contact line/i }));
    fireEvent.change(screen.getByLabelText(/contact line text/i), { target: { value: 'Call John' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /include a contact line/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ commentContact: '' }));
  });

  test('reports the chosen rate choice', () => {
    const onConfirm = vi.fn();
    render(<ContactMethodModal onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('radio', { name: /include for all loads/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ rateChoice: 'all' }));
  });

  test('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<ContactMethodModal onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
