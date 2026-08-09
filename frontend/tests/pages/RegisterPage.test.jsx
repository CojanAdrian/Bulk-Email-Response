import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from '../../src/pages/RegisterPage';
import * as authApi from '../../src/api/auth';

vi.mock('../../src/api/auth');

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('submits username and password and calls onRegisterSuccess on success', async () => {
    authApi.register.mockResolvedValue({ username: 'newuser', role: 'user' });
    const onRegisterSuccess = vi.fn();
    render(<RegisterPage onRegisterSuccess={onRegisterSuccess} onSwitchToLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenough' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith('newuser', 'longenough');
      expect(onRegisterSuccess).toHaveBeenCalledWith({ username: 'newuser', role: 'user' });
    });
  });

  test('shows an error and does not call the API when passwords do not match', async () => {
    render(<RegisterPage onRegisterSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenough' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    expect(authApi.register).not.toHaveBeenCalled();
  });

  test('shows the server error message when registration fails', async () => {
    const err = new Error('Username already taken');
    err.status = 400;
    authApi.register.mockRejectedValue(err);
    render(<RegisterPage onRegisterSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: 'taken' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenough' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/username already taken/i)).toBeInTheDocument();
    });
  });

  test('calls onSwitchToLogin when "Already have an account?" is clicked', () => {
    const onSwitchToLogin = vi.fn();
    render(<RegisterPage onRegisterSuccess={vi.fn()} onSwitchToLogin={onSwitchToLogin} />);

    fireEvent.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(onSwitchToLogin).toHaveBeenCalled();
  });

  test('renders a "Sign up with Google" button that navigates to the Google sign-in URL', () => {
    // See the equivalent LoginPage.test.jsx test for why window.location is restored.
    const originalLocation = window.location;
    authApi.getGoogleSignInUrl.mockReturnValue('http://localhost:4000/api/auth/google');
    delete window.location;
    window.location = { href: '' };
    render(<RegisterPage onRegisterSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /sign up with google/i }));
    expect(window.location.href).toBe('http://localhost:4000/api/auth/google');

    window.location = originalLocation;
  });

  test('shows a message when redirected back with a ?authError= from a failed Google sign-in', () => {
    window.history.replaceState(null, '', '/?authError=email_not_verified');
    render(<RegisterPage onRegisterSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/isn't verified/i);
    window.history.replaceState(null, '', '/');
  });

  test('disables the submit button while the request is in flight', async () => {
    let resolveRegister;
    authApi.register.mockReturnValue(
      new Promise((resolve) => {
        resolveRegister = resolve;
      })
    );
    render(<RegisterPage onRegisterSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenough' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    const submitButton = await screen.findByRole('button', { name: /creating account/i });
    expect(submitButton).toBeDisabled();

    resolveRegister({ username: 'newuser', role: 'user' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^create account$/i })).not.toBeDisabled();
    });
  });
});
