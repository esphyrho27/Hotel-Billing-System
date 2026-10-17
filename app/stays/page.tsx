'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stay {
  id: number;
  stay_code: string;
  room_id: number;
  room_number: string;
  type_name: string;
  guest_count: number;
  checkin_at: string;
  planned_checkout: string;
  folio_id: number | null;
  folio_number: string | null;
  created_by_name: string | null;
}

interface Room {
  id: number;
  room_number: string;
  type_name: string;
}

export default function StaysPage() {
  const [stays, setStays] = useState<Stay[]>([]);
  const [availRooms, setAvailRooms] = useState<Room[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [roomId, setRoomId] = useState('');
  const [guests, setGuests] = useState('2');
  const [checkout, setCheckout] = useState('');
  const [portalUrl, setPortalUrl] = useState('');
  const [copied, setCopied] = useState(false);

  async function load() {
    const [sRes, rRes] = await Promise.all([
      fetch('/api/stays?status=ACTIVE'),
      fetch('/api/rooms'),
    ]);
    if (sRes.ok) setStays((await sRes.json()).stays);
    if (rRes.ok) {
      const all = (await rRes.json()).rooms as Room[];
      setAvailRooms(all.filter(r => (r as unknown as { status: string }).status === 'AVAILABLE'));
    }
  }

  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setCheckout(d.toISOString().slice(0, 10));
    load().catch(() => setError('Could not load stays.'));
  }, []);

  async function checkin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setPortalUrl('');
    setCopied(false);
    const res = await fetch('/api/stays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: Number(roomId), guest_count: Number(guests), planned_checkout: checkout }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Check-in failed.');
    else {
      setNotice(`Checked in — stay ${data.stayCode}, folio ${data.folioNumber}.`);
      if (data.portalToken) {
        setPortalUrl(`${window.location.origin}/portal/${data.portalToken}`);
      }
      setRoomId('');
      load();
    }
  }

  async function copyPortal() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <h1>Stays & Check-in</h1>
      <p className="page-sub">Active stays. Checking in creates the stay, opens a folio, and marks the room OCCUPIED.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}
      {portalUrl && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>Guest portal link — share with the guest</h3>
          <p className="page-sub">The guest opens this link on their phone — no sign-in needed. It shows their stay, live bill, and lets them request services.</p>
          <div className="btn-row" style={{ alignItems: 'center' }}>
            <input value={portalUrl} readOnly onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 240 }} />
            <button className="btn btn-secondary" type="button" onClick={copyPortal}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>New check-in</h3>
        <form onSubmit={checkin}>
          <div className="form-grid">
            <div className="field">
              <span>Room (available only)</span>
              <select value={roomId} onChange={e => setRoomId(e.target.value)} required>
                <option value="">Select room…</option>
                {availRooms.map(r => (
                  <option key={r.id} value={r.id}>{r.room_number} — {r.type_name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <span>Guests</span>
              <input type="number" min={1} max={20} value={guests} onChange={e => setGuests(e.target.value)} required />
            </div>
            <div className="field">
              <span>Planned checkout</span>
              <input type="date" value={checkout} onChange={e => setCheckout(e.target.value)} required />
            </div>
          </div>
          <button className="btn" type="submit">Check in</button>
        </form>
      </div>

      <h2>Active stays</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Stay code</th><th>Room</th><th>Guests</th><th>Check-in</th><th>Planned checkout</th><th>Folio</th><th></th></tr>
          </thead>
          <tbody>
            {stays.length === 0 && <tr><td colSpan={7} className="empty">No active stays.</td></tr>}
            {stays.map(s => (
              <tr key={s.id}>
                <td>{s.stay_code}</td>
                <td>{s.room_number} <span style={{ color: '#667085' }}>({s.type_name})</span></td>
                <td>{s.guest_count}</td>
                <td>{String(s.checkin_at).slice(0, 16).replace('T', ' ')}</td>
                <td>{String(s.planned_checkout).slice(0, 10)}</td>
                <td>{s.folio_number ?? '—'}</td>
                <td>
                  <div className="btn-row">
                    {s.folio_id && <Link className="btn btn-secondary btn-sm" href={`/folio/${s.folio_id}`}>Folio</Link>}
                    <Link className="btn btn-sm" href={`/checkout/${s.id}`}>Check out</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
