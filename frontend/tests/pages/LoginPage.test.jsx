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

  test('shows a generic error message for non-401 failures', async () => {
    const err = new Error('Internal server error');
    err.status = 500;
    authApi.login.mockRejectedValue(err);
    render(<LoginPage onLoginSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'changeme123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  test('disables the submit button and shows a signing-in state while the request is in flight', async () => {
    let resolveLogin;
    authApi.login.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      })
    );
    render(<LoginPage onLoginSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'changeme123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const submitButton = await screen.findByRole('button', { name: /signing in/i });
    expect(submitButton).toBeDisabled();

    resolveLogin({ username: 'admin' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^sign in$/i })).not.toBeDisabled();
    });
  });

  test('calls onSwitchToRegister when "Sign up" is clicked', () => {
    const onSwitchToRegister = vi.fn();
    render(<LoginPage onLoginSuccess={vi.fn()} onSwitchToRegister={onSwitchToRegister} />);

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(onSwitchToRegister).toHaveBeenCalled();
  });

  test('renders a "Continue with Google" button that navigates to the Google sign-in URL', () => {
    // Stubbing window.location (needed so the real navigation doesn't make
    // jsdom log "Not implemented: navigation") replaces the real Location
    // object entirely, which would otherwise break every later test in this
    // file that reads window.location.search/history -- restore it after.
    const originalLocation = window.location;
    authApi.getGoogleSignInUrl.mockReturnValue('http://localhost:4000/api/auth/google');
    delete window.location;
    window.location = { href: '' };
    render(<LoginPage onLoginSuccess={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(window.location.href).toBe('http://localhost:4000/api/auth/google');

    window.location = originalLocation;
  });

  test('shows a message when redirected back with a ?authError= from a failed Google sign-in', () => {
    window.history.replaceState(null, '', '/?authError=account_exists');
    render(<LoginPage onLoginSuccess={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
    window.history.replaceState(null, '', '/');
  });
});
