# Frontend Registration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the frontend a working "Sign up" flow on top of the already-built (and already-merged) backend `POST /api/auth/register` endpoint, so a new user can create their own account through the website instead of only via the login screen with credentials they don't have.

**Architecture:** A new `RegisterPage` component, structurally mirroring the existing `LoginPage`, calls a new `register()` function in `api/auth.js`. `LoginPage` gains a "Sign up" link and `RegisterPage` gains a "Log in" link, both calling a callback the parent provides — `App.jsx` tracks which of the two logged-out views to show (`authView: 'login' | 'register'`) alongside its existing `status` state machine, and treats a successful registration exactly like a successful login (both endpoints auto-log-in and return `{username, role}`).

**Tech Stack:** Same as the existing frontend (React 18, Vite, Tailwind, Vitest + React Testing Library).

**Relationship to other plans:** Builds on `docs/superpowers/plans/2026-08-05-frontend-foundation.md` (Phase 1, merged) and `docs/superpowers/plans/2026-08-07-backend-multi-user-accounts.md` (merged — the backend already has a working, tested `POST /api/auth/register` endpoint; this plan is purely the frontend surface for it).

**Scope note:** This does NOT add any admin-specific UI (e.g., an "owner" column in the loads table, or a way to promote a user to admin from the app) — the backend's `role` field is captured nowhere new by this plan beyond what registration/login already return. That's future work if/when it's needed.

**Prerequisite:** The backend must be running locally with the multi-user migration already applied (`cd backend && npm run setup-db && npm start`).

---

## Task 1: `register()` in the auth API module

**Files:**
- Modify: `frontend/src/api/auth.js`
- Modify: `frontend/tests/api/auth.test.js`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('auth api', ...)` block in `frontend/tests/api/auth.test.js`:
```js
  test('register posts username and password to /api/auth/register', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ username: 'newuser', role: 'user' }) });
    const result = await register('newuser', 'longenough');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/auth/register');
    expect(JSON.parse(options.body)).toEqual({ username: 'newuser', password: 'longenough' });
    expect(result).toEqual({ username: 'newuser', role: 'user' });
  });

  test('register rejects with the server error message and status on failure', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ error: 'Username already taken' }) });
    await expect(register('taken', 'longenough')).rejects.toMatchObject({ status: 400, message: 'Username already taken' });
  });
```
And add `register` to the existing import line at the top of the file:
```js
import { login, logout, me, register } from '../../src/api/auth';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/api/auth.test.js`
Expected: FAIL — `register is not a function` (or similar) since it isn't exported yet

- [ ] **Step 3: Add `register` to the auth module**

In `frontend/src/api/auth.js`, add alongside the existing exports:
```js
export function register(username, password) {
  return post('/api/auth/register', { username, password });
}
```
(The file already imports `{ get, post }` from `./client` — no new import needed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/auth.test.js`
Expected: PASS (6 passed — 4 original + 2 new)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/auth.js frontend/tests/api/auth.test.js
git commit -m "feat: add register() to the auth API module"
```

---

## Task 2: RegisterPage component

**Files:**
- Create: `frontend/src/pages/RegisterPage.jsx`
- Test: `frontend/tests/pages/RegisterPage.test.jsx`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/pages/RegisterPage.test.jsx`:
```jsx
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/pages/RegisterPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/RegisterPage'`

- [ ] **Step 3: Write the component**

`frontend/src/pages/RegisterPage.jsx`:
```jsx
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/pages/RegisterPage.test.jsx`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/RegisterPage.jsx frontend/tests/pages/RegisterPage.test.jsx
git commit -m "feat: add RegisterPage component"
```

---

## Task 3: Add a "Sign up" link to LoginPage

**Files:**
- Modify: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/tests/pages/LoginPage.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to the `describe('LoginPage', ...)` block in `frontend/tests/pages/LoginPage.test.jsx`:
```js
  test('calls onSwitchToRegister when "Sign up" is clicked', () => {
    const onSwitchToRegister = vi.fn();
    render(<LoginPage onLoginSuccess={vi.fn()} onSwitchToRegister={onSwitchToRegister} />);

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(onSwitchToRegister).toHaveBeenCalled();
  });
```
(Existing tests in this file don't pass `onSwitchToRegister` and don't need to — they never click that button, and a missing `onClick` handler prop simply means nothing happens if it were clicked, which none of the existing tests do.)

- [ ] **Step 2: Run the tests to verify the new one fails**

Run (from `frontend/`): `npx vitest run tests/pages/LoginPage.test.jsx`
Expected: FAIL — no "Sign up" button exists yet (the new test's `getByRole` throws)

- [ ] **Step 3: Add the link**

In `frontend/src/pages/LoginPage.jsx`, change the function signature from:
```jsx
function LoginPage({ onLoginSuccess }) {
```
to:
```jsx
function LoginPage({ onLoginSuccess, onSwitchToRegister }) {
```
And add this button right after the existing `<button type="submit" ...>Sign in</button>` closes (before the closing `</form>`):
```jsx
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-200"
        >
          Don't have an account? Sign up
        </button>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/pages/LoginPage.test.jsx`
Expected: PASS (5 passed — 4 original + 1 new)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.jsx frontend/tests/pages/LoginPage.test.jsx
git commit -m "feat: add sign-up link to LoginPage"
```

---

## Task 4: Wire the register flow into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/tests/App.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to the `describe('App', ...)` block in `frontend/tests/App.test.jsx` (add `register` to the existing `import * as authApi from '../src/api/auth';` mock usage — no new import line needed since `vi.mock('../src/api/auth')` already auto-mocks the whole module including `register`):
```js
  test('switches from the login page to the register page and back', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    authApi.me.mockRejectedValue(err);
    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /sign in/i }));

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('registering successfully logs the user in', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    authApi.me.mockRejectedValue(err);
    authApi.register.mockResolvedValue({ username: 'newuser', role: 'user' });
    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /sign in/i }));

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenough' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('newuser')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/App.test.jsx`
Expected: FAIL — no "Sign up" button reachable from `App` yet (since `LoginPage` isn't given a real `onSwitchToRegister` handler, and there's no register view to switch to)

- [ ] **Step 3: Rewrite App.jsx**

`frontend/src/App.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { me, logout } from './api/auth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainToolPage from './pages/MainToolPage';

function App() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'loggedOut' | 'loggedIn'
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState(null);

  useEffect(() => {
    me()
      .then((data) => {
        setUsername(data.username);
        setStatus('loggedIn');
      })
      .catch((err) => {
        if (err.status !== 401) {
          console.error('Session check failed:', err);
        }
        setStatus('loggedOut');
      });
  }, []);

  function handleAuthSuccess(data) {
    setUsername(data.username);
    setStatus('loggedIn');
  }

  function handleLogout() {
    logout()
      .catch((err) => {
        console.error('Logout request failed:', err);
      })
      .finally(() => {
        setUsername(null);
        setAuthView('login');
        setStatus('loggedOut');
      });
  }

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  if (status === 'loggedOut') {
    if (authView === 'register') {
      return <RegisterPage onRegisterSuccess={handleAuthSuccess} onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onLoginSuccess={handleAuthSuccess} onSwitchToRegister={() => setAuthView('register')} />;
  }

  return <MainToolPage username={username} onLogout={handleLogout} />;
}

export default App;
```

Note: `handleLoginSuccess` is renamed to `handleAuthSuccess` since it's now shared between login and registration success (both endpoints return the identical `{username, role}` shape and both auto-log-in) — this isn't new behavior, just a rename to reflect the new dual purpose.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/App.test.jsx`
Expected: PASS (all tests — the 6 existing plus the 2 new ones)

- [ ] **Step 5: Run the full test suite**

Run (from `frontend/`): `npm test`
Expected: all suites pass, zero failures

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/tests/App.test.jsx
git commit -m "feat: wire registration into App's session state machine"
```

---

## Task 5: Manual verification and README update

**Files:**
- Modify: `frontend/README.md`

- [ ] **Step 1: Update the README**

Read the current `frontend/README.md` first. Add a short note in the appropriate section (near wherever login is currently documented) that the login screen now has a "Sign up" link leading to a registration form, and that a newly-registered account is a regular (`role: 'user'`) account, auto-logged-in on success — mirroring the backend README's "Accounts and roles" section. Update the manual-verification walkthrough to include registering a brand-new account (rather than only logging in with the seeded admin) as one of the steps.

- [ ] **Step 2: Perform real manual verification**

With the backend running (`cd backend && npm start`, MySQL up, migration applied) and this frontend running (`cd frontend && npm run dev`):

1. Open the app — you should see the login form with a "Don't have an account? Sign up" link.
2. Click it — you should see the registration form with a "Already have an account? Log in" link.
3. Register a brand-new account (a username you haven't used before, a password at least 8 characters, matching confirm-password). You should land directly on the main tool shell, logged in as the new user.
4. Confirm the loads table is empty (a fresh account has no loads yet) — this is expected and correct given per-user load isolation.
5. Log out, then click "Sign up" again and try registering the SAME username — confirm you see a clear "Username already taken" error and stay on the registration form.
6. Log back in as the account you just created (not the admin) to confirm the credentials actually persisted.

If any step doesn't work as described, investigate and fix it — don't just note it as a known issue.

- [ ] **Step 3: Commit**

```bash
git add frontend/README.md
git commit -m "docs: document the registration flow"
```

---

## Definition of Done

- `npm test` passes in `frontend/` with zero failures.
- `npm run build` succeeds.
- The manual verification in Task 5 was actually performed against the real backend, including the duplicate-username error case, not just described.
