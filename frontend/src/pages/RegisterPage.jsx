import { useState } from 'react';
import { register } from '../api/auth';

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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-6 text-xl font-semibold text-slate-100">Create an account</h1>
        <label className="mb-1 block text-sm text-slate-400" htmlFor="reg-username">
          Username
        </label>
        <input
          id="reg-username"
          name="username"
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          aria-describedby={error ? 'register-error' : undefined}
        />
        <label className="mb-1 block text-sm text-slate-400" htmlFor="reg-password">
          Password
        </label>
        <input
          id="reg-password"
          name="password"
          type="password"
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-describedby={error ? 'register-error' : undefined}
        />
        <label className="mb-1 block text-sm text-slate-400" htmlFor="reg-confirm-password">
          Confirm password
        </label>
        <input
          id="reg-confirm-password"
          name="confirmPassword"
          type="password"
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          aria-describedby={error ? 'register-error' : undefined}
        />
        {error && (
          <p id="register-error" role="alert" className="mb-4 text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-200"
        >
          Already have an account? Log in
        </button>
      </form>
    </div>
  );
}

export default RegisterPage;
