'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { peso } from '../../lib/money';

interface DashboardData {
  occupancy: { total: number; occupied: number; cleaning: number; maintenance: number; rate: number };
  todayRevenue: number;
  openFolios: number;
  activeStays: number;
  activity: { id: number; action: string; entity_type: string; entity_id: number | null; created_at: string; username: string | null }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then(setData)
      .catch(() => setError('Could not load dashboard data.'));
  }, []);

  if (error) return <div><h1>Dashboard</h1><div className="alert alert-error">{error}</div></div>;
  if (!data) return <div><h1>Dashboard</h1><p className="page-sub">Loading…</p></div>;

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="page-sub">Today&apos;s operation at a glance.</p>

      <div className="cards">
        <div className="card">
          <div className="stat-label">Occupancy</div>
          <div className="stat-value">{data.occupancy.occupied}/{data.occupancy.total}</div>
          <div className="stat-sub">{data.occupancy.rate}% occupied · {data.occupancy.cleaning} cleaning · {data.occupancy.maintenance} maintenance</div>
        </div>
        <div className="card">
          <div className="stat-label">Revenue today</div>
          <div className="stat-value">{peso(data.todayRevenue)}</div>
          <div className="stat-sub">Payments received today</div>
        </div>
        <div className="card">
          <div className="stat-label">Open folios</div>
          <div className="stat-value">{data.openFolios}</div>
          <div className="stat-sub">{data.activeStays} active stays</div>
        </div>
      </div>

      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Quick actions</h2>
      </div>
      <div className="btn-row" style={{ marginBottom: 24 }}>
        <Link className="btn" href="/stays">New check-in</Link>
        <Link className="btn btn-secondary" href="/rooms">Rooms board</Link>
        <Link className="btn btn-secondary" href="/services">Service queue</Link>
      </div>

      <h2>Recent activity</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th></tr></thead>
          <tbody>
            {data.activity.length === 0 && <tr><td colSpan={4} className="empty">No activity yet.</td></tr>}
            {data.activity.map(a => (
              <tr key={a.id}>
                <td>{String(a.created_at).slice(0, 19).replace('T', ' ')}</td>
                <td>{a.username ?? '—'}</td>
                <td>{a.action}</td>
                <td>{a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
