import { useState } from 'react';
import { login } from '../api/auth';
import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import ThemeToggle from '../components/ThemeToggle';

function LoginPage({ onLoginSuccess, onSwitchToRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit}>
          <h1 className="mb-6 bg-gradient-to-r from-gold-light to-gold bg-clip-text text-xl font-extrabold tracking-wide text-transparent">
            BulkPosting
          </h1>
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
            aria-describedby={error ? 'login-error' : undefined}
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
            aria-describedby={error ? 'login-error' : undefined}
          />
          {error && (
            <p id="login-error" role="alert" className="mb-4 text-sm text-error">
              {error}
            </p>
          )}
          <PrimaryButton type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in...' : 'Sign in'}
          </PrimaryButton>
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="mt-4 w-full text-center text-sm text-text-muted hover:text-accent"
          >
            Don't have an account? Sign up
          </button>
        </form>
      </Card>
    </div>
  );
}

export default LoginPage;
