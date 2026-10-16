'use client';

import { useEffect, useState } from 'react';
import { peso } from '../../lib/money';

interface Room {
  id: number;
  room_number: string;
  room_type_id: number;
  floor_number: number;
  status: string;
  type_name: string;
  nightly_rate: string;
  capacity: number;
}

interface RoomType {
  id: number;
  name: string;
  nightly_rate: string;
  capacity: number;
}

const STATUS_CLASS: Record<string, string> = {
  AVAILABLE: 'badge-available',
  OCCUPIED: 'badge-occupied',
  CLEANING: 'badge-cleaning',
  MAINTENANCE: 'badge-maintenance',
};

const NEXT_STATUS: Record<string, string[]> = {
  AVAILABLE: ['CLEANING', 'MAINTENANCE'],
  CLEANING: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE', 'CLEANING'],
  OCCUPIED: [],
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [types, setTypes] = useState<RoomType[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [me, setMe] = useState<{ role: string } | null>(null);

  // add-room form
  const [roomNo, setRoomNo] = useState('');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [floorNo, setFloorNo] = useState('1');
  // add-type form
  const [typeName, setTypeName] = useState('');
  const [typeRate, setTypeRate] = useState('');
  const [typeCap, setTypeCap] = useState('2');

  async function load() {
    const [rRes, tRes, meRes] = await Promise.all([
      fetch('/api/rooms'),
      fetch('/api/room-types'),
      fetch('/api/auth/me'),
    ]);
    if (rRes.ok) setRooms((await rRes.json()).rooms);
    if (tRes.ok) setTypes((await tRes.json()).roomTypes);
    if (meRes.ok) setMe((await meRes.json()).user);
  }

  useEffect(() => {
    load().catch(() => setError('Could not load rooms.'));
  }, []);

  async function setStatus(id: number, status: string) {
    setError('');
    setNotice('');
    const res = await fetch(`/api/rooms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not update status.');
    else {
      setNotice(`Room status updated to ${status}.`);
      load();
    }
  }

  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_number: roomNo, room_type_id: Number(roomTypeId), floor_number: Number(floorNo) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not add room.');
    else {
      setRoomNo('');
      setNotice('Room added.');
      load();
    }
  }

  async function addType(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/room-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: typeName, nightly_rate: Number(typeRate), capacity: Number(typeCap) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not add room type.');
    else {
      setTypeName('');
      setTypeRate('');
      setNotice('Room type added.');
      load();
    }
  }

  const floors = Array.from(new Set(rooms.map(r => r.floor_number))).sort((a, b) => a - b);
  const canManage = me && (me.role === 'admin' || me.role === 'manager');

  return (
    <div>
      <h1>Rooms</h1>
      <p className="page-sub">Room status board. OCCUPIED is managed by check-in / check-out.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {floors.map(f => (
        <div className="floor-group" key={f}>
          <div className="floor-title">Floor {f}</div>
          <div className="room-grid">
            {rooms.filter(r => r.floor_number === f).map(r => (
              <div className="room-card" key={r.id}>
                <div className="room-no">{r.room_number}</div>
                <div className="room-meta">{r.type_name} · {peso(Number(r.nightly_rate))}/night · {r.capacity} pax</div>
                <span className={`badge ${STATUS_CLASS[r.status] ?? ''}`}>{r.status}</span>
                <div className="btn-row">
                  {(NEXT_STATUS[r.status] ?? []).map(s => (
                    <button key={s} className="btn btn-secondary btn-sm" onClick={() => setStatus(r.id, s)}>
                      → {s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {rooms.length === 0 && <div className="empty">No rooms yet.</div>}

      {canManage && (
        <div className="two-col" style={{ marginTop: 8 }}>
          <div className="panel">
            <h3>Add room</h3>
            <form onSubmit={addRoom}>
              <div className="form-grid">
                <div className="field"><span>Room number</span><input value={roomNo} onChange={e => setRoomNo(e.target.value)} required /></div>
                <div className="field"><span>Floor</span><input type="number" min={0} value={floorNo} onChange={e => setFloorNo(e.target.value)} required /></div>
                <div className="field">
                  <span>Room type</span>
                  <select value={roomTypeId} onChange={e => setRoomTypeId(e.target.value)} required>
                    <option value="">Select…</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name} — {peso(Number(t.nightly_rate))}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn" type="submit">Add room</button>
            </form>
          </div>
          <div className="panel">
            <h3>Room types</h3>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="data">
                <thead><tr><th>Name</th><th className="num">Nightly rate</th><th className="num">Capacity</th></tr></thead>
                <tbody>
                  {types.map(t => (
                    <tr key={t.id}><td>{t.name}</td><td className="num">{peso(Number(t.nightly_rate))}</td><td className="num">{t.capacity}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={addType}>
              <div className="form-grid">
                <div className="field"><span>Name</span><input value={typeName} onChange={e => setTypeName(e.target.value)} required /></div>
                <div className="field"><span>Nightly rate (₱)</span><input type="number" min={0} step="0.01" value={typeRate} onChange={e => setTypeRate(e.target.value)} required /></div>
                <div className="field"><span>Capacity</span><input type="number" min={1} value={typeCap} onChange={e => setTypeCap(e.target.value)} required /></div>
              </div>
              <button className="btn" type="submit">Add type</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
