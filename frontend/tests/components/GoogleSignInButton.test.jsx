import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GoogleSignInButton from '../../src/components/GoogleSignInButton';
import * as authApi from '../../src/api/auth';

vi.mock('../../src/api/auth');

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete window.location;
    window.location = { href: '' };
  });

  test('renders the default label', () => {
    render(<GoogleSignInButton />);
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  test('renders a custom label when given one', () => {
    render(<GoogleSignInButton label="Sign up with Google" />);
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument();
  });

  test('navigates the browser to the Google sign-in URL when clicked', () => {
    authApi.getGoogleSignInUrl.mockReturnValue('http://localhost:4000/api/auth/google');
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole('button'));
    expect(window.location.href).toBe('http://localhost:4000/api/auth/google');
  });
});
