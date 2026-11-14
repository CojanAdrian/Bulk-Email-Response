import { useState } from 'react';
import { register } from '../api/auth';
import { useGoogleAuthError } from '../lib/useGoogleAuthError';
import AuthFrame from '../shell/AuthFrame';
import PasswordInput from '../components/PasswordInput';
import PrimaryButton from '../components/PrimaryButton';
import GoogleSignInButton from '../components/GoogleSignInButton';

function RegisterPage({ onRegisterSuccess, onSwitchToLogin }) {
  const googleAuthError = useGoogleAuthError();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const displayedError = error || googleAuthError;

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    register(username, password)
      .then((data) => {
        onRegisterSuccess(data);
      })
      .catch((err) => {
        setError(err.message || 'Something went wrong. Try again.');
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <AuthFrame>
        <form onSubmit={handleSubmit}>
          <p className="caps">New here</p>
          <h1 className="mb-6 mt-2 text-[34px] font-bold leading-none tracking-[-0.05em] text-text">Create an account</h1>

          {displayedError && (
            <p id="register-error" role="alert" className="mb-4 text-sm text-error">
              {displayedError}
            </p>
          )}

          <GoogleSignInButton label="Sign up with Google" />

          <div className="caps my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/[0.08]" />
            or
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <label className="mb-1 block text-sm text-text-muted" htmlFor="reg-username">
            Username
          </label>
          <input
            id="reg-username"
            name="username"
            className="mb-4 w-full rounded-xl border px-3 py-2.5 text-text outline-none transition"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            aria-describedby={displayedError ? 'register-error' : undefined}
          />
          <label className="mb-1 block text-sm text-text-muted" htmlFor="reg-password">
            Password
          </label>
          <PasswordInput
            id="reg-password"
            name="password"
            className="mb-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby={displayedError ? 'register-error' : undefined}
          />
          <label className="mb-1 block text-sm text-text-muted" htmlFor="reg-confirm-password">
            Confirm password
          </label>
          <PasswordInput
            id="reg-confirm-password"
            name="confirmPassword"
            className="mb-4"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby={displayedError ? 'register-error' : undefined}
          />
          <PrimaryButton type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creating account...' : 'Create account'}
          </PrimaryButton>
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="mt-4 w-full text-center text-sm text-text-muted hover:text-text"
          >
            Already have an account? Log in
          </button>
        </form>
    </AuthFrame>
  );
}

export default RegisterPage;
