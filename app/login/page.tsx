'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LOGO_DATA_URI } from '../../lib/logo';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Login failed.');
      } else {
        router.push(searchParams.get('next') || '/dashboard');
        router.refresh();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-split">
      <div className="login-brand login-brand-logo">
        <img src={LOGO_DATA_URI} alt="Shesh Dev Hotel logo" className="login-logo" />
        <p className="login-welcome">Welcome to Shesh Dev Hotel — where every stay feels like home.</p>
      </div>
      <div className="login-form-side">
        <div className="login-card">
          <h1>Welcome back</h1>
          <p className="page-sub">Sign in to the front-office console.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <span>Username</span>
              <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required autoFocus />
            </div>
            <div className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <button className="btn btn-block" disabled={busy} type="submit">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
