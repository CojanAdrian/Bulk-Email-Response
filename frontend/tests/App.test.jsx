import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../src/App';
import * as authApi from '../src/api/auth';
import * as loadsApi from '../src/api/loads';

vi.mock('../src/api/auth');
vi.mock('../src/api/loads');

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loadsApi.listLoads.mockResolvedValue([]);
  });

  test('shows the login page when there is no active session', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    authApi.me.mockRejectedValue(err);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  test('logs a console error when the initial session check fails for a reason other than being unauthenticated', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Network error');
    err.status = null;
    authApi.me.mockRejectedValue(err);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('does not log a console error for a normal 401 (not logged in)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Unauthorized');
    err.status = 401;
    authApi.me.mockRejectedValue(err);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('shows the main tool page when a session is already active', async () => {
    authApi.me.mockResolvedValue({ username: 'admin' });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    });
  });

  test('logging out returns to the login page', async () => {
    authApi.me.mockResolvedValue({ username: 'admin' });
    authApi.logout.mockResolvedValue({ ok: true });
    render(<App />);

    await waitFor(() => screen.getByRole('button', { name: /log out/i }));
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  test('still returns to the login page even if the logout request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    authApi.me.mockResolvedValue({ username: 'admin' });
    authApi.logout.mockRejectedValue(new Error('Network error'));
    render(<App />);

    await waitFor(() => screen.getByRole('button', { name: /log out/i }));
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('switches from the login page to the register page and back', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    authApi.me.mockRejectedValue(err);
    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /sign in/i }));

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('registering successfully logs the user in', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    authApi.me.mockRejectedValue(err);
    authApi.register.mockResolvedValue({ username: 'newuser', role: 'user' });
    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /sign in/i }));

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenough' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('newuser')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    });
  });
});
