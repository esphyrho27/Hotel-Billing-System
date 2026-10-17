'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { peso } from '../../lib/money';

interface DashboardData {
  occupancy: { total: number; occupied: number; cleaning: number; maintenance: number; rate: number };
  todayRevenue: number;
  openFolios: number;
  activeStays: number;
  available: number;
  openBalance: number;
  requestsNew: number;
  requestsActive: number;
  activity: { id: number; action: string; entity_type: string; entity_id: number | null; created_at: string; username: string | null }[];
}

function Chip({ icon, tone }: { icon: string; tone: string }) {
  return <span className={`stat-chip ${tone}`}>{icon}</span>;
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

  const openRequests = data.requestsNew + data.requestsActive;

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="page-sub">Operations overview</p>

      <div className="stat-grid">
        <div className="stat-card">
          <Chip icon="🛏️" tone="green" />
          <div><div className="stat-card-label">Available rooms</div><div className="stat-card-value text-green">{data.available}</div></div>
        </div>
        <div className="stat-card">
          <Chip icon="🏢" tone="blue" />
          <div><div className="stat-card-label">Occupied rooms</div><div className="stat-card-value text-blue">{data.occupancy.occupied}</div></div>
        </div>
        <div className="stat-card">
          <Chip icon="✨" tone="amber" />
          <div><div className="stat-card-label">Cleaning</div><div className="stat-card-value text-amber">{data.occupancy.cleaning}</div></div>
        </div>
        <div className="stat-card">
          <Chip icon="🛠️" tone="gray" />
          <div><div className="stat-card-label">Maintenance</div><div className="stat-card-value text-gray">{data.occupancy.maintenance}</div></div>
        </div>
        <div className="stat-card">
          <Chip icon="👥" tone="slate" />
          <div><div className="stat-card-label">Active stays</div><div className="stat-card-value">{data.activeStays}</div></div>
        </div>
        <div className="stat-card">
          <Chip icon="🧾" tone="red" />
          <div><div className="stat-card-label">Open balance</div><div className="stat-card-value text-red">{peso(data.openBalance)}</div></div>
        </div>
        <div className="stat-card">
          <Chip icon="🔔" tone="green" />
          <div><div className="stat-card-label">Open requests</div><div className="stat-card-value text-green">{openRequests}</div></div>
        </div>
        <div className="stat-card">
          <Chip icon="💵" tone="green" />
          <div><div className="stat-card-label">Today&apos;s collections</div><div className="stat-card-value text-green">{peso(data.todayRevenue)}</div></div>
        </div>
      </div>

      <div className="notice-card">
        <div className="notice-left">
          <span className="notice-bell">🔔</span>
          <div>
            <strong>Guest requests need attention</strong>
            <div className="page-sub" style={{ margin: 0 }}>{data.requestsNew} new · {data.requestsActive} accepted or in progress</div>
          </div>
        </div>
        <Link className="btn btn-secondary btn-sm" href="/services">Review requests</Link>
      </div>

      <div className="quick-actions">
        <Link className="btn btn-dark" href="/stays">＋ Walk-In Check-In</Link>
        <Link className="btn btn-secondary" href="/stays">View Active Stays</Link>
        <Link className="btn btn-secondary" href="/rooms">Room Board</Link>
        <Link className="btn btn-secondary" href="/reports">View Reports</Link>
        <Link className="btn btn-secondary" href="/stays">Guest Links</Link>
      </div>

      <div className="info-box">
        <strong>Guest details are optional.</strong>{' '}
        Guests may share their name and contact details through the portal link — it appears on their folio and stay record. Details are only collected with the guest&apos;s consent and never shared.
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
