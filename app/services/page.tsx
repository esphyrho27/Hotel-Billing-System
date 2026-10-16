'use client';

import { useEffect, useState } from 'react';

interface SvcReq {
  id: number;
  request_code: string;
  stay_id: number;
  stay_code: string;
  room_number: string;
  service_type: string;
  request_kind: string;
  requested_room_id: number | null;
  description: string;
  status: string;
  chargeable: number;
  price: string;
  created_at: string;
  completed_by_name: string | null;
}

interface Stay { id: number; stay_code: string; room_number: string; }

const STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const NEXT: Record<string, string[]> = {
  NEW: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export default function ServicesPage() {
  const [items, setItems] = useState<SvcReq[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [rooms, setRooms] = useState<{ id: number; room_number: string }[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [stayId, setStayId] = useState('');
  const [svcType, setSvcType] = useState('HOUSEKEEPING');
  const [kind, setKind] = useState('SERVICE');
  const [desc, setDesc] = useState('');
  const [chargeable, setChargeable] = useState(false);
  const [price, setPrice] = useState('0');
  const [reqRoomId, setReqRoomId] = useState('');

  async function load(status: string) {
    const q = status ? `?status=${status}` : '';
    const [rRes, sRes, rmRes] = await Promise.all([
      fetch(`/api/service-requests${q}`),
      fetch('/api/stays?status=ACTIVE'),
      fetch('/api/rooms'),
    ]);
    if (rRes.ok) setItems((await rRes.json()).requests);
    if (sRes.ok) setStays((await sRes.json()).stays);
    if (rmRes.ok) {
      const all = (await rmRes.json()).rooms as { id: number; room_number: string; status: string }[];
      setRooms(all.filter(r => r.status === 'AVAILABLE'));
    }
  }

  useEffect(() => {
    load(filter).catch(() => setError('Could not load service requests.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function move(id: number, status: string) {
    setError('');
    setNotice('');
    const res = await fetch(`/api/service-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not update request.');
    else {
      if (data.notes?.length) setNotice(data.notes.join(' '));
      load(filter);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const res = await fetch('/api/service-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stay_id: Number(stayId),
        service_type: svcType,
        request_kind: kind,
        description: desc,
        chargeable,
        price: Number(price),
        requested_room_id: kind === 'ROOM_TRANSFER' && reqRoomId ? Number(reqRoomId) : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not create request.');
    else {
      setDesc('');
      setNotice(`Request ${data.request_code} created.`);
      load(filter);
    }
  }

  return (
    <div>
      <h1>Service Requests</h1>
      <p className="page-sub">Completing a chargeable request posts the charge to the folio automatically.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="toolbar">
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="data">
          <thead>
            <tr><th>Code</th><th>Stay / Room</th><th>Type</th><th>Description</th><th>Status</th><th>Charge</th><th></th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={7} className="empty">No service requests.</td></tr>}
            {items.map(r => (
              <tr key={r.id}>
                <td>{r.request_code}</td>
                <td>{r.stay_code}<br /><span style={{ color: '#667085' }}>Rm {r.room_number}</span></td>
                <td>{r.service_type}<br /><span style={{ color: '#667085' }}>{r.request_kind}</span></td>
                <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>{r.description}</td>
                <td><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></td>
                <td>{r.chargeable ? `₱${Number(r.price).toFixed(2)}` : '—'}</td>
                <td>
                  <div className="btn-row">
                    {(NEXT[r.status] ?? []).map(s => (
                      <button key={s} className="btn btn-secondary btn-sm" onClick={() => move(r.id, s)}>
                        {s === 'IN_PROGRESS' ? 'Start' : s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>New service request</h3>
        <form onSubmit={create}>
          <div className="form-grid">
            <div className="field"><span>Stay</span>
              <select value={stayId} onChange={e => setStayId(e.target.value)} required>
                <option value="">Select stay…</option>
                {stays.map(s => <option key={s.id} value={s.id}>{s.stay_code} — Rm {s.room_number}</option>)}
              </select>
            </div>
            <div className="field"><span>Service type</span>
              <select value={svcType} onChange={e => setSvcType(e.target.value)}>
                {['HOUSEKEEPING', 'FOOD_BEVERAGE', 'MAINTENANCE', 'FRONT_DESK', 'OTHER'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><span>Kind</span>
              <select value={kind} onChange={e => setKind(e.target.value)}>
                <option value="SERVICE">SERVICE</option>
                <option value="ROOM_TRANSFER">ROOM_TRANSFER</option>
              </select>
            </div>
            {kind === 'ROOM_TRANSFER' && (
              <div className="field"><span>Requested room</span>
                <select value={reqRoomId} onChange={e => setReqRoomId(e.target.value)} required>
                  <option value="">Select room…</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.room_number}</option>)}
                </select>
              </div>
            )}
            <div className="field"><span>Chargeable</span>
              <select value={chargeable ? '1' : '0'} onChange={e => setChargeable(e.target.value === '1')}>
                <option value="0">No</option><option value="1">Yes</option>
              </select>
            </div>
            {chargeable && (
              <div className="field"><span>Price (₱)</span>
                <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
              </div>
            )}
          </div>
          <div className="field"><span>Description</span>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} required maxLength={500} rows={2} />
          </div>
          <button className="btn" type="submit">Create request</button>
        </form>
      </div>
    </div>
  );
}
