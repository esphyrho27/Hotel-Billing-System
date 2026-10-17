'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
      <div className="login-brand">
        <span className="brand-mark">H</span>
        <h1>Hotel Billing System</h1>
        <p>Front-office billing for rooms, folios, payments and guest services — all in one place.</p>
        <ul className="login-feats">
          <li><span className="tick">✓</span>Rooms, check-in and folio management</li>
          <li><span className="tick">✓</span>Guest self-service portal with menu ordering</li>
          <li><span className="tick">✓</span>Payments, discounts, voids and receipts</li>
          <li><span className="tick">✓</span>Reports and a full audit trail</li>
        </ul>
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
