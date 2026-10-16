'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { peso } from '../../lib/money';

interface Summary {
  from: string;
  to: string;
  revenue: {
    total: number;
    count: number;
    byDay: { day: string; total: number; count: number }[];
    byMethod: { method: string; total: number; count: number }[];
  };
  occupancy: { totalRooms: number; occupied: number; rate: number; staysInRange: number };
  outstanding: { folio_id: number; folio_number: string; stay_code: string; room_number: string; balance: number }[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  async function load(f: string, t: string) {
    const res = await fetch(`/api/reports/summary?from=${f}&to=${t}`);
    if (!res.ok) {
      setError('Could not load reports.');
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    load(from, to).catch(() => setError('Could not load reports.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1>Reports</h1>
      <p className="page-sub">Revenue, occupancy and outstanding balances.</p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <div className="form-grid" style={{ maxWidth: 520 }}>
          <div className="field"><span>From</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="field"><span>To</span><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <button className="btn" onClick={() => load(from, to)}>Run report</button>
      </div>

      {data && (
        <>
          <div className="cards">
            <div className="card">
              <div className="stat-label">Revenue ({data.from} → {data.to})</div>
              <div className="stat-value">{peso(data.revenue.total)}</div>
              <div className="stat-sub">{data.revenue.count} payment(s)</div>
            </div>
            <div className="card">
              <div className="stat-label">Occupancy now</div>
              <div className="stat-value">{data.occupancy.occupied}/{data.occupancy.totalRooms}</div>
              <div className="stat-sub">{data.occupancy.rate}% · {data.occupancy.staysInRange} stay(s) in range</div>
            </div>
            <div className="card">
              <div className="stat-label">Outstanding balances</div>
              <div className="stat-value">{peso(data.outstanding.reduce((s, o) => s + o.balance, 0))}</div>
              <div className="stat-sub">{data.outstanding.length} open folio(s)</div>
            </div>
          </div>

          <div className="two-col">
            <div>
              <h2>Revenue by day</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Date</th><th className="num">Payments</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {data.revenue.byDay.length === 0 && <tr><td colSpan={3} className="empty">No revenue in range.</td></tr>}
                    {data.revenue.byDay.map(r => (
                      <tr key={r.day}><td>{r.day}</td><td className="num">{r.count}</td><td className="num">{peso(r.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h2>Revenue by method</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Method</th><th className="num">Payments</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {data.revenue.byMethod.length === 0 && <tr><td colSpan={3} className="empty">No revenue in range.</td></tr>}
                    {data.revenue.byMethod.map(r => (
                      <tr key={r.method}><td>{r.method}</td><td className="num">{r.count}</td><td className="num">{peso(r.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <h2 style={{ marginTop: 24 }}>Outstanding balances</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Folio</th><th>Stay</th><th>Room</th><th className="num">Balance</th><th></th></tr></thead>
              <tbody>
                {data.outstanding.length === 0 && <tr><td colSpan={5} className="empty">Nothing outstanding.</td></tr>}
                {data.outstanding.map(o => (
                  <tr key={o.folio_id}>
                    <td>{o.folio_number}</td>
                    <td>{o.stay_code}</td>
                    <td>{o.room_number}</td>
                    <td className="num">{peso(o.balance)}</td>
                    <td><Link className="btn btn-secondary btn-sm" href={`/folio/${o.folio_id}`}>Open folio</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
