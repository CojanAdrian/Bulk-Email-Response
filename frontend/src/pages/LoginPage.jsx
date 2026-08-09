import { useState } from 'react';
import { login } from '../api/auth';
import { useGoogleAuthError } from '../lib/useGoogleAuthError';
import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import GoogleSignInButton from '../components/GoogleSignInButton';
import ThemeToggle from '../components/ThemeToggle';
import AuroraBackground from '../components/AuroraBackground';
import logoIcon from '../assets/logo-icon.png';

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-shell-bg px-4">
      <AuroraBackground />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <Card className="relative z-10 w-full max-w-sm">
        <form onSubmit={handleSubmit}>
          <div className="mb-6 flex items-center gap-3">
            <img src={logoIcon} alt="" className="h-10 w-10 shrink-0" />
            <h1 className="text-xl font-extrabold tracking-wide text-text">BulkPosting</h1>
          </div>

          {displayedError && (
            <p id="login-error" role="alert" className="mb-4 text-sm text-error">
              {displayedError}
            </p>
          )}

          <GoogleSignInButton label="Continue with Google" />

          <div className="my-4 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-text-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <label className="mb-1 block text-sm text-text-muted" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/50"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            aria-describedby={displayedError ? 'login-error' : undefined}
          />
          <label className="mb-1 block text-sm text-text-muted" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/50"
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
      </Card>
    </div>
  );
}

export default LoginPage;
