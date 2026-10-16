'use client';

import { useEffect, useState } from 'react';

interface User {
  id: number;
  username: string;
  role: string;
  active: number;
  created_at: string;
}

const ROLES = ['admin', 'manager', 'frontdesk', 'cashier', 'service'];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<{ id: number } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [uName, setUName] = useState('');
  const [uPass, setUPass] = useState('');
  const [uRole, setURole] = useState('frontdesk');

  const [myPass, setMyPass] = useState('');
  const [myPass2, setMyPass2] = useState('');

  async function load() {
    const [uRes, meRes] = await Promise.all([fetch('/api/users'), fetch('/api/auth/me')]);
    if (uRes.ok) setUsers((await uRes.json()).users);
    else {
      const d = await uRes.json().catch(() => ({}));
      setError(d.error || 'Could not load users.');
    }
    if (meRes.ok) setMe((await meRes.json()).user);
  }

  useEffect(() => {
    load().catch(() => setError('Could not load users.'));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uName, password: uPass, role: uRole }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not create user.');
    else {
      setUName('');
      setUPass('');
      setNotice(`User ${uName} created.`);
      load();
    }
  }

  async function toggleActive(u: User) {
    setError('');
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !u.active }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not update user.');
    else load();
  }

  async function resetPassword(u: User) {
    const pw = window.prompt(`New password for ${u.username} (min 8 chars):`);
    if (!pw) return;
    setError('');
    setNotice('');
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not reset password.');
    else setNotice(`Password reset for ${u.username}. Their other sessions were signed out.`);
  }

  async function changeMine(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (myPass !== myPass2) {
      setError('Passwords do not match.');
      return;
    }
    if (!me) return;
    const res = await fetch(`/api/users/${me.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: myPass }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not change password.');
    else {
      setMyPass('');
      setMyPass2('');
      setNotice('Your password was changed. Other sessions were signed out — please log in again.');
    }
  }

  return (
    <div>
      <h1>Users</h1>
      <p className="page-sub">Admin only. Deactivating a user blocks their login immediately.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="two-col">
        <div>
          <h2>All users</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.role}</td>
                    <td><span className={`badge ${u.active ? 'badge-paid' : 'badge-void'}`}>{u.active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    <td>
                      <div className="btn-row">
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(u)}>
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => resetPassword(u)}>Reset password</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="panel">
            <h3>Create user</h3>
            <form onSubmit={create}>
              <div className="field"><span>Username</span><input value={uName} onChange={e => setUName(e.target.value)} required minLength={3} /></div>
              <div className="field"><span>Password (min 8 chars)</span><input type="password" value={uPass} onChange={e => setUPass(e.target.value)} required minLength={8} /></div>
              <div className="field"><span>Role</span>
                <select value={uRole} onChange={e => setURole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button className="btn" type="submit">Create user</button>
            </form>
          </div>
          <div className="panel">
            <h3>Change my password</h3>
            <form onSubmit={changeMine}>
              <div className="field"><span>New password</span><input type="password" value={myPass} onChange={e => setMyPass(e.target.value)} required minLength={8} /></div>
              <div className="field"><span>Confirm new password</span><input type="password" value={myPass2} onChange={e => setMyPass2(e.target.value)} required minLength={8} /></div>
              <button className="btn btn-secondary" type="submit">Change password</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
