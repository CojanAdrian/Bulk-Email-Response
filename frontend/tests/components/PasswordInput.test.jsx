import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordInput from '../../src/components/PasswordInput';

function Harness() {
  return (
    <>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" value="" onChange={() => {}} />
    </>
  );
}

describe('PasswordInput', () => {
  test('toggles between hidden and visible characters', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/^password$/i);
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: /show characters/i }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide characters/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('warns when Caps Lock is on', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/^password$/i);
    fireEvent.keyUp(input, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText(/caps lock is on/i)).toBeInTheDocument();
    expect(input.getAttribute('aria-describedby')).toContain('pw-caps');
  });
});
