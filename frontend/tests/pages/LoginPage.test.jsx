import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '../../src/pages/LoginPage';
import * as authApi from '../../src/api/auth';

vi.mock('../../src/api/auth');

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('submits username and password and calls onLoginSuccess on success', async () => {
    authApi.login.mockResolvedValue({ username: 'admin' });
    const onLoginSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'changeme123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('admin', 'changeme123');
      expect(onLoginSuccess).toHaveBeenCalledWith({ username: 'admin' });
    });
  });

  test('shows an error message on invalid credentials and does not call onLoginSuccess', async () => {
    const err = new Error('Invalid credentials');
    err.status = 401;
    authApi.login.mockRejectedValue(err);
    const onLoginSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });
});
