import { useState } from 'react';
import { login } from '../api/auth';
import { useGoogleAuthError } from '../lib/useGoogleAuthError';
import AuthFrame from '../shell/AuthFrame';
import PasswordInput from '../components/PasswordInput';
import PrimaryButton from '../components/PrimaryButton';
import GoogleSignInButton from '../components/GoogleSignInButton';

function LoginPage({ onLoginSuccess, onSwitchToRegister }) {
  const googleAuthError = useGoogleAuthError();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const displayedError = error || googleAuthError;

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    login(username, password)
      .then((data) => {
        onLoginSuccess(data);
      })
      .catch((err) => {
        setError(err.status === 401 ? 'Invalid username or password' : 'Something went wrong. Try again.');
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <AuthFrame>
        <form onSubmit={handleSubmit}>
          <p className="caps">Welcome back</p>
          <h1 className="mb-6 mt-2 text-[34px] font-bold leading-none tracking-[-0.05em] text-text">Sign in</h1>

          {displayedError && (
            <p id="login-error" role="alert" className="mb-4 text-sm text-error">
              {displayedError}
            </p>
          )}

          <GoogleSignInButton label="Continue with Google" />

          <div className="caps my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/[0.08]" />
            or
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <label className="mb-1 block text-sm text-text-muted" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            className="mb-4 w-full rounded-xl border px-3 py-2.5 text-text outline-none transition"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            aria-describedby={displayedError ? 'login-error' : undefined}
          />
          <label className="mb-1 block text-sm text-text-muted" htmlFor="password">
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            className="mb-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-describedby={displayedError ? 'login-error' : undefined}
          />
          <PrimaryButton type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in...' : 'Sign in'}
          </PrimaryButton>
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="mt-4 w-full text-center text-sm text-text-muted hover:text-text"
          >
            Don't have an account? Sign up
          </button>
        </form>
    </AuthFrame>
  );
}

export default LoginPage;
