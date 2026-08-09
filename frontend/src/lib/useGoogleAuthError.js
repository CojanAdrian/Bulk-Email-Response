import { useEffect, useState } from 'react';

const AUTH_ERROR_MESSAGES = {
  missing_code: 'Google sign-in was cancelled. Please try again.',
  google_auth_failed: 'Google sign-in failed. Please try again.',
  email_not_verified: "Your Google account's email isn't verified with Google. Please verify it and try again.",
  account_exists: 'An account already exists with that email. Please log in with your username and password instead.',
};

// Reads a one-shot ?authError=<code> left by the backend's redirect after a
// failed /api/auth/google/callback, converts it to a human message, and
// strips it from the URL so refreshing the page doesn't re-show it.
export function useGoogleAuthError() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('authError');
    if (!code) return;

    setMessage(AUTH_ERROR_MESSAGES[code] || 'Something went wrong signing in with Google. Please try again.');

    params.delete('authError');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState(null, '', newUrl);
  }, []);

  return message;
}
