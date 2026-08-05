# Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React (Vite) frontend that authenticates against the existing backend API and renders a session-gated app shell — the foundation the rest of the tool's ported features (upload, lookup, rate editing, DAT export, blast) will be built into in follow-up plans.

**Architecture:** A single-page React app (`frontend/`) with two top-level views — `LoginPage` and `MainToolPage` — selected by `App.jsx` based on session state (checked via `GET /api/auth/me` on load). All backend calls go through a small `api/` module (`client.js` for the fetch wrapper, `auth.js` for auth-specific calls) so later phases can add `api/loads.js` without touching the request/auth plumbing. Styled with Tailwind CSS for a fast, consistent modern look.

**Tech Stack:** React 18, Vite, Tailwind CSS, Vitest + React Testing Library for tests.

**Relationship to other plans:** This is Phase 1 of the frontend rebuild (of 3). It does NOT include CSV upload, the loads table, rate editing, DAT export, or the blast modal — those are ported from `IGT_DAT_Processor.html` in Phase 2 (load persistence UI) and Phase 3 (DAT export/lookup/blast), once this auth shell exists to build them into. It also does not include sub-projects 2-4 (email integration, matching, dashboard) from `docs/superpowers/specs/2026-08-04-backend-foundation-design.md`.

**Prerequisite:** The backend from `docs/superpowers/plans/2026-08-04-backend-foundation-api.md` must be running locally (`cd backend && npm start`, listening on port 4000) with a MySQL server up and `npm run setup-db` already run, so there's a real `admin` user to log in with. `backend/.env`'s `FRONTEND_ORIGIN` must be `http://localhost:5173` (Vite's default dev port) for CORS/cookies to work — check this is already the case before starting.

---

## Task 1: Frontend project scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/.env.example`
- Create: `frontend/.gitignore`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/index.css`
- Create: `frontend/tests/setup.js`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "bulkposting-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.9",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `frontend/vite.config.js`** (includes Vitest config — no separate config file needed)

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    globals: true,
  },
});
```

- [ ] **Step 3: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BulkPosting</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `frontend/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 5: Create `frontend/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create `frontend/.env.example`**

```
VITE_API_URL=http://localhost:4000
```

- [ ] **Step 7: Create `frontend/.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 8: Create `frontend/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 10: Create `frontend/tests/setup.js`**

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 11: Copy the example env file and install dependencies**

Run (from `frontend/`):
```bash
cp .env.example .env
npm install
```
Expected: `node_modules/` created, `package-lock.json` generated, no errors. (`App.jsx` doesn't exist yet — that's fine, `npm install` doesn't need it. Don't run `npm run dev` yet, it'll fail until Task 5 adds `App.jsx`.)

- [ ] **Step 12: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/index.html frontend/tailwind.config.js frontend/postcss.config.js frontend/.env.example frontend/.gitignore frontend/src/main.jsx frontend/src/index.css frontend/tests/setup.js
git commit -m "chore: scaffold frontend project"
```

---

## Task 2: API client module

**Files:**
- Create: `frontend/src/api/client.js`
- Test: `frontend/tests/api/client.test.js`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/api/client.test.js`:
```js
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { get, post, patch } from '../../src/api/client';

describe('api client', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('get() sends a GET request with credentials included', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hello: 'world' }),
    });
    const result = await get('/api/health');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/health'),
      expect.objectContaining({ credentials: 'include' })
    );
    expect(result).toEqual({ hello: 'world' });
  });

  test('post() sends a POST request with a JSON body', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    await post('/api/auth/login', { username: 'a', password: 'b' });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ username: 'a', password: 'b' });
  });

  test('patch() sends a PATCH request with a JSON body', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });
    await patch('/api/loads/1', { target_pay: 1700 });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ target_pay: 1700 });
  });

  test('throws an error with the server-provided message when the response is not ok', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
    await expect(get('/api/loads')).rejects.toThrow('Unauthorized');
  });

  test('the thrown error carries the response status code', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Load not found' }),
    });
    await expect(get('/api/loads/999')).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npx vitest run tests/api/client.test.js`
Expected: FAIL — `Cannot find module '../../src/api/client'`

- [ ] **Step 3: Write the client module**

`frontend/src/api/client.js`:
```js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error((body && body.error) || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return body;
}

export function get(path) {
  return request(path);
}

export function post(path, data) {
  return request(path, { method: 'POST', body: JSON.stringify(data) });
}

export function patch(path, data) {
  return request(path, { method: 'PATCH', body: JSON.stringify(data) });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/client.test.js`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.js frontend/tests/api/client.test.js
git commit -m "feat: add API client with get/post/patch helpers"
```

---

## Task 3: Auth API module

**Files:**
- Create: `frontend/src/api/auth.js`
- Test: `frontend/tests/api/auth.test.js`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/api/auth.test.js`:
```js
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { login, logout, me } from '../../src/api/auth';

describe('auth api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('login posts username and password to /api/auth/login', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ username: 'admin' }) });
    const result = await login('admin', 'secret');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/auth/login');
    expect(JSON.parse(options.body)).toEqual({ username: 'admin', password: 'secret' });
    expect(result).toEqual({ username: 'admin' });
  });

  test('logout posts to /api/auth/logout', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    await logout();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/auth/logout');
    expect(options.method).toBe('POST');
  });

  test('me gets /api/auth/me', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ username: 'admin' }) });
    const result = await me();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/auth/me');
    expect(result).toEqual({ username: 'admin' });
  });

  test('me rejects when not logged in', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Unauthorized' }) });
    await expect(me()).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/api/auth.test.js`
Expected: FAIL — `Cannot find module '../../src/api/auth'`

- [ ] **Step 3: Write the auth module**

`frontend/src/api/auth.js`:
```js
import { get, post } from './client';

export function login(username, password) {
  return post('/api/auth/login', { username, password });
}

export function logout() {
  return post('/api/auth/logout', {});
}

export function me() {
  return get('/api/auth/me');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/auth.test.js`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/auth.js frontend/tests/api/auth.test.js
git commit -m "feat: add auth API module (login, logout, me)"
```

---

## Task 4: LoginPage component

**Files:**
- Create: `frontend/src/pages/LoginPage.jsx`
- Test: `frontend/tests/pages/LoginPage.test.jsx`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/pages/LoginPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '../../src/pages/LoginPage';
import * as authApi from '../../src/api/auth';

vi.mock('../../src/api/auth');

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('submits username and password and calls onLoginSuccess on success', async () => {
    authApi.login.mockResolvedValue({ username: 'admin' });
    const onLoginSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'changeme123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('admin', 'changeme123');
      expect(onLoginSuccess).toHaveBeenCalledWith({ username: 'admin' });
    });
  });

  test('shows an error message on invalid credentials and does not call onLoginSuccess', async () => {
    const err = new Error('Invalid credentials');
    err.status = 401;
    authApi.login.mockRejectedValue(err);
    const onLoginSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/pages/LoginPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/LoginPage'`

- [ ] **Step 3: Write the component**

`frontend/src/pages/LoginPage.jsx`:
```jsx
import { useState } from 'react';
import { login } from '../api/auth';

function LoginPage({ onLoginSuccess }) {
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-6 text-xl font-semibold text-slate-100">BulkPosting</h1>
        <label className="mb-1 block text-sm text-slate-400" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <label className="mb-1 block text-sm text-slate-400" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/pages/LoginPage.test.jsx`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.jsx frontend/tests/pages/LoginPage.test.jsx
git commit -m "feat: add LoginPage component"
```

---

## Task 5: App shell with session-gated routing

**Files:**
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/pages/MainToolPage.jsx`
- Test: `frontend/tests/App.test.jsx`

- [ ] **Step 1: Write the failing tests**

`frontend/tests/App.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../src/App';
import * as authApi from '../src/api/auth';

vi.mock('../src/api/auth');

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('shows the login page when there is no active session', async () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    authApi.me.mockRejectedValue(err);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });

  test('shows the main tool page when a session is already active', async () => {
    authApi.me.mockResolvedValue({ username: 'admin' });
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    });
  });

  test('logging out returns to the login page', async () => {
    authApi.me.mockResolvedValue({ username: 'admin' });
    authApi.logout.mockResolvedValue({ ok: true });
    render(<App />);

    await waitFor(() => screen.getByRole('button', { name: /log out/i }));
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/App.test.jsx`
Expected: FAIL — `Cannot find module '../src/App'`

- [ ] **Step 3: Write `MainToolPage.jsx`**

`frontend/src/pages/MainToolPage.jsx`:
```jsx
function MainToolPage({ username, onLogout }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">BulkPosting</h1>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{username}</span>
          <button
            onClick={onLogout}
            className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="p-6 text-slate-400">Load management tools coming soon.</main>
    </div>
  );
}

export default MainToolPage;
```

- [ ] **Step 4: Write `App.jsx`**

`frontend/src/App.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { me, logout } from './api/auth';
import LoginPage from './pages/LoginPage';
import MainToolPage from './pages/MainToolPage';

function App() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'loggedOut' | 'loggedIn'
  const [username, setUsername] = useState(null);

  useEffect(() => {
    me()
      .then((data) => {
        setUsername(data.username);
        setStatus('loggedIn');
      })
      .catch(() => {
        setStatus('loggedOut');
      });
  }, []);

  function handleLoginSuccess(data) {
    setUsername(data.username);
    setStatus('loggedIn');
  }

  function handleLogout() {
    logout().finally(() => {
      setUsername(null);
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
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return <MainToolPage username={username} onLogout={handleLogout} />;
}

export default App;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/App.test.jsx`
Expected: PASS (3 passed)

- [ ] **Step 6: Run the full test suite**

Run (from `frontend/`): `npm test`
Expected: all test files pass (client, auth, LoginPage, App — 14 tests total)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/MainToolPage.jsx frontend/tests/App.test.jsx
git commit -m "feat: add App shell with session-gated routing"
```

---

## Task 6: End-to-end manual verification and README

**Files:**
- Create: `frontend/README.md`

- [ ] **Step 1: Write the README**

`frontend/README.md`:
```markdown
# BulkPosting Frontend

React (Vite) frontend for the BulkPosting backend. This is Phase 1 (auth
shell only) — CSV upload, the loads table, rate editing, DAT export, and
the blast modal are not implemented yet; they land in follow-up phases
that build on this shell.

## Setup

1. Make sure the backend is running (see `../backend/README.md`) with
   `FRONTEND_ORIGIN=http://localhost:5173` in `backend/.env`.
2. Copy `.env.example` to `.env` (defaults to `http://localhost:4000` for
   the API, matching the backend's default port).
3. Install dependencies: `npm install`
4. Start the dev server: `npm run dev` — opens on `http://localhost:5173`.

## Running tests

`npm test` runs the Vitest suite (mocked API calls, no backend required).

## Manual verification

With both the backend (`cd backend && npm start`) and this dev server
(`npm run dev`) running:

1. Open `http://localhost:5173` — you should see the login form.
2. Log in with the admin credentials from `backend/.env`
   (`ADMIN_USERNAME`/`ADMIN_PASSWORD`, default `admin` / `changeme123`).
3. You should land on the main tool shell showing your username and a
   "Log out" button.
4. Refresh the page — you should stay logged in (the session cookie
   persists), landing directly on the shell instead of the login form.
5. Click "Log out" — you should return to the login form.
```

- [ ] **Step 2: Perform the manual verification**

With the backend running (`cd backend && npm start`, MySQL container up, `npm run setup-db` already run) and this frontend's dev server running (`cd frontend && npm run dev`), follow the 5 steps in the README yourself and confirm each one actually works. If the login form doesn't appear, or login fails, or the session doesn't persist across refresh, don't just note it — investigate (likely causes: `FRONTEND_ORIGIN` mismatch in `backend/.env`, wrong `VITE_API_URL` in `frontend/.env`, or the backend not running) and fix before proceeding. Stop both dev processes when done verifying.

- [ ] **Step 3: Commit**

```bash
git add frontend/README.md
git commit -m "docs: add frontend README with setup and manual verification steps"
```

---

## Definition of Done

- `npm test` passes in `frontend/` (14 tests: client, auth, LoginPage, App).
- `npm run dev` boots a working dev server that can log in against the real backend, persist the session across a refresh, and log out — manually verified end-to-end, not just unit-tested.
- No loads/CSV/DAT/blast functionality is included in this phase — that's Phase 2 and Phase 3, separate plans.
