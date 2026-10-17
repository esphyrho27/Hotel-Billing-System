'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { peso } from '../../lib/money';

interface Txn {
  kind: 'charge' | 'payment';
  id: number;
  at: string;
  label: string;
  detail: string;
  amount: unknown;
  folio_number: string;
  stay_code: string;
  room_number: string;
  by_user: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TransactionsPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [type, setType] = useState('all');
  const [rows, setRows] = useState<Txn[]>([]);
  const [totals, setTotals] = useState({ charges: 0, payments: 0 });
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(f: string, t: string, ty: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/transactions?from=${f}&to=${t}&type=${ty}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || 'Could not load transactions.');
      else {
        setRows(d.transactions ?? []);
        setTotals(d.totals ?? { charges: 0, payments: 0 });
        setCount(d.count ?? 0);
      }
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(from, to, type).catch(() => setError('Could not load transactions.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1>Transactions</h1>
      <p className="page-sub">Every charge and payment across all folios, newest first.</p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <div className="form-grid" style={{ maxWidth: 640 }}>
          <div className="field"><span>From</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="field"><span>To</span><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="field"><span>Type</span>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="all">Charges + payments</option>
              <option value="charge">Charges only</option>
              <option value="payment">Payments only</option>
            </select>
          </div>
        </div>
        <button className="btn" onClick={() => load(from, to, type)} disabled={loading}>
          {loading ? 'Loading…' : 'Run'}
        </button>
      </div>

      <div className="cards">
        <div className="card"><div className="stat-label">Charges in range</div><div className="stat-value">{peso(totals.charges)}</div></div>
        <div className="card"><div className="stat-label">Payments in range</div><div className="stat-value">{peso(totals.payments)}</div></div>
        <div className="card"><div className="stat-label">Net</div><div className="stat-value">{peso(totals.charges - totals.payments)}</div><div className="stat-sub">{count} transaction(s)</div></div>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date/time</th><th>Type</th><th>Description</th><th>Folio</th><th>Stay / Room</th><th>By</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="empty">{loading ? 'Loading…' : 'No transactions in this range.'}</td></tr>}
            {rows.map(r => (
              <tr key={`${r.kind}-${r.id}`}>
                <td>{String(r.at).slice(0, 16).replace('T', ' ')}</td>
                <td><span className={`badge ${r.kind === 'charge' ? 'badge-open' : 'badge-paid'}`}>{r.kind}</span><br /><span style={{ color: '#667085', fontSize: 12 }}>{r.detail}</span></td>
                <td style={{ whiteSpace: 'normal' }}>{r.label}</td>
                <td>{r.folio_number}</td>
                <td>{r.stay_code}<br /><span style={{ color: '#667085' }}>Rm {r.room_number}</span></td>
                <td>{r.by_user ?? '—'}</td>
                <td className="num">{peso(Number(r.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="page-sub" style={{ marginTop: 12 }}>
        Tip: open a <Link href="/reports">report</Link> for revenue-by-day and outstanding balances.
      </p>
    </div>
  );
}
