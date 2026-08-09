import { useState } from 'react';
import { register } from '../api/auth';
import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import ThemeToggle from '../components/ThemeToggle';

function RegisterPage({ onRegisterSuccess, onSwitchToLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-shell-bg px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit}>
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-lg font-black text-accent-ink">B</div>
            <h1 className="text-xl font-extrabold tracking-wide text-text">Create an account</h1>
          </div>
          <label className="mb-1 block text-sm text-text-muted" htmlFor="reg-username">
            Username
          </label>
          <input
            id="reg-username"
            name="username"
            className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/50"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            aria-describedby={error ? 'register-error' : undefined}
          />
          <label className="mb-1 block text-sm text-text-muted" htmlFor="reg-password">
            Password
          </label>
          <input
            id="reg-password"
            name="password"
            type="password"
            className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/50"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby={error ? 'register-error' : undefined}
          />
          <label className="mb-1 block text-sm text-text-muted" htmlFor="reg-confirm-password">
            Confirm password
          </label>
          <input
            id="reg-confirm-password"
            name="confirmPassword"
            type="password"
            className="mb-4 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/50"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby={error ? 'register-error' : undefined}
          />
          {error && (
            <p id="register-error" role="alert" className="mb-4 text-sm text-error">
              {error}
            </p>
          )}
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
      </Card>
    </div>
  );
}

export default RegisterPage;
