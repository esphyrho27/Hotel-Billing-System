'use client';

import { useCallback, useEffect, useState } from 'react';

interface Totals {
  chargesTotal: number;
  discountTotal: number;
  paymentsTotal: number;
  balance: number;
}

interface PortalData {
  stay: {
    stay_code: string;
    room_number: string;
    type_name: string;
    nightly_rate: unknown;
    guest_count: number;
    checkin_at: string;
    planned_checkout: string;
    actual_checkout: string | null;
    status: string;
  };
  folio: {
    folio_number: string;
    status: string;
    charges: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    discounts: Record<string, unknown>[];
    totals: Totals;
  } | null;
  catalog: { id: number; name: string; category: string; description: string | null; price: unknown }[];
  requests: {
    id: number;
    request_code: string;
    service_type: string;
    description: string;
    status: string;
    price: unknown;
    created_at: string;
  }[];
  link_expires_at: string;
}

const SERVICE_TYPES = ['HOUSEKEEPING', 'FOOD_BEVERAGE', 'MAINTENANCE', 'FRONT_DESK', 'OTHER'] as const;

function money(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return `₱${(Number.isFinite(n) ? n : 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(v: string): string {
  return String(v).slice(0, 16).replace('T', ' ');
}

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Received',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function GuestPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [reqType, setReqType] = useState<string>('OTHER');
  const [reqDesc, setReqDesc] = useState('');
  const [reqBusy, setReqBusy] = useState(false);
  const [reqMsg, setReqMsg] = useState('');

  const [moveReason, setMoveReason] = useState('');
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveMsg, setMoveMsg] = useState('');

  const foodItems = (data?.catalog ?? []).filter(i => i.category === 'FOOD_BEVERAGE');
  const otherItems = (data?.catalog ?? []).filter(i => i.category !== 'FOOD_BEVERAGE');

  useEffect(() => {
    params.then(p => setToken(p.token)).catch(() => setError('Could not open this link.'));
  }, [params]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || 'Could not load your stay.');
      else setData(d as PortalData);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function submitMove(e: React.FormEvent) {
    e.preventDefault();
    if (!token || moveBusy || !moveReason.trim()) return;
    setMoveBusy(true);
    setMoveMsg('');
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_kind: 'ROOM_TRANSFER', description: moveReason.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMoveMsg(d.error || 'Request failed.');
      } else {
        setMoveMsg(`Room change requested ✓ (${d.request_code}). The front desk will arrange it and confirm with you.`);
        setMoveReason('');
        await load();
      }
    } catch {
      setMoveMsg('Network error. Please try again.');
    } finally {
      setMoveBusy(false);
    }
  }

  function catalogCard(item: { id: number; name: string; description: string | null; category: string; price: unknown }) {
    return (
      <div className="card" key={item.id}>
        <div style={{ fontWeight: 600 }}>{item.name}</div>
        <div className="stat-sub">{item.description || String(item.category).replace(/_/g, ' ')}</div>
        <div style={{ fontWeight: 700, margin: '6px 0' }}>{money(item.price)}</div>
        <button
          className="btn btn-secondary btn-sm btn-block"
          disabled={reqBusy}
          onClick={() => {
            setReqDesc(`1x ${item.name}`);
            submitRequest({ preventDefault() {} } as React.FormEvent, item.id);
          }}
        >
          Request
        </button>
      </div>
    );
  }

  async function submitRequest(e: React.FormEvent, catalogId?: number) {
    e.preventDefault();
    if (!token || reqBusy) return;
    setReqBusy(true);
    setReqMsg('');
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog_id: catalogId, service_type: reqType, description: reqDesc }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReqMsg(d.error || 'Request failed.');
      } else {
        setReqMsg(`Request sent ✓ (${d.request_code})${d.chargeable ? ` — ${money(d.price)} will be added to your bill.` : ''}`);
        setReqDesc('');
        await load();
      }
    } catch {
      setReqMsg('Network error. Please try again.');
    } finally {
      setReqBusy(false);
    }
  }

  return (
    <div className="login-wrap" style={{ placeItems: 'start center' }}>
      <div style={{ width: 'min(720px, 100%)', padding: '28px 0' }}>
        <div className="login-card" style={{ width: '100%', marginBottom: 16 }}>
          <h1>Guest Portal</h1>
          <p className="page-sub">Your stay, bill and service requests — no sign-in needed.</p>

          {loading && <p>Loading your stay…</p>}
          {!loading && error && (
            <div>
              <p className="form-error">{error}</p>
              <p className="page-sub">If this link expired, please ask the front desk for a new one.</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              <h2 style={{ fontSize: 17, margin: '6px 0 10px' }}>
                Room {data.stay.room_number} <span className="page-sub">· {data.stay.type_name}</span>
              </h2>
              <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <div className="card"><div className="stat-label">Check-in</div><div style={{ fontWeight: 600 }}>{fmtDate(data.stay.checkin_at)}</div></div>
                <div className="card"><div className="stat-label">Planned checkout</div><div style={{ fontWeight: 600 }}>{String(data.stay.planned_checkout).slice(0, 10)}</div></div>
                <div className="card"><div className="stat-label">Guests</div><div style={{ fontWeight: 600 }}>{data.stay.guest_count}</div></div>
                <div className="card"><div className="stat-label">Stay code</div><div style={{ fontWeight: 600 }}>{data.stay.stay_code}</div></div>
              </div>

              {data.folio && (
                <>
                  <h2 style={{ fontSize: 17, margin: '18px 0 10px' }}>Your bill <span className="page-sub">· Folio {data.folio.folio_number}</span></h2>
                  {data.folio.charges.length === 0 && data.folio.payments.length === 0 ? (
                    <p className="page-sub">No charges yet.</p>
                  ) : (
                    <>
                      <div className="table-wrap" style={{ marginBottom: 12 }}>
                        <table>
                          <thead><tr><th>Description</th><th>Qty</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                          <tbody>
                            {data.folio.charges.map(c => (
                              <tr key={String(c.id)}>
                                <td>{String(c.description)}<br /><span className="page-sub">{String(c.category).replace(/_/g, ' ')}</span></td>
                                <td>{String(c.quantity)}</td>
                                <td style={{ textAlign: 'right' }}>{money(c.amount)}</td>
                              </tr>
                            ))}
                            {data.folio.discounts.filter(d => d.status === 'APPLIED').map(d => (
                              <tr key={`d-${String(d.id)}`}>
                                <td>Discount — {String(d.name ?? d.discount_name ?? '')}</td>
                                <td></td>
                                <td style={{ textAlign: 'right' }}>−{money(d.amount)}</td>
                              </tr>
                            ))}
                            {data.folio.payments.map(p => (
                              <tr key={`p-${String(p.id)}`}>
                                <td>Payment — {String(p.method)} <span className="page-sub">({String(p.receipt_number)})</span></td>
                                <td></td>
                                <td style={{ textAlign: 'right' }}>−{money(p.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><div className="stat-label">Balance due</div><div className="stat-value">{money(data.folio.totals.balance)}</div></div>
                        <span className={`badge badge-${data.folio.status === 'PAID' ? 'paid' : 'open'}`}>{data.folio.status}</span>
                      </div>
                    </>
                  )}
                </>
              )}

              {data.stay.status === 'ACTIVE' && (
                <>
                  {foodItems.length > 0 && (
                    <>
                      <h2 style={{ fontSize: 17, margin: '18px 0 10px' }}>🍽️ Order food & drinks</h2>
                      <p className="page-sub">Ordered items are prepared by our team and charged to your room bill.</p>
                      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        {foodItems.map(catalogCard)}
                      </div>
                    </>
                  )}
                  {otherItems.length > 0 && (
                    <>
                      <h2 style={{ fontSize: 17, margin: '18px 0 10px' }}>Request a service</h2>
                      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        {otherItems.map(catalogCard)}
                      </div>
                    </>
                  )}
                  {data.catalog.length === 0 && (
                    <h2 style={{ fontSize: 17, margin: '18px 0 10px' }}>Request a service</h2>
                  )}
                  <form onSubmit={submitRequest} style={{ marginTop: 12 }}>
                    <div className="field">
                      <label htmlFor="gp-type">Type of request</label>
                      <select id="gp-type" value={reqType} onChange={e => setReqType(e.target.value)}>
                        {SERVICE_TYPES.map(t => (
                          <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="gp-desc">Describe what you need</label>
                      <textarea
                        id="gp-desc"
                        rows={3}
                        value={reqDesc}
                        onChange={e => setReqDesc(e.target.value)}
                        placeholder="e.g. Extra towels and pillows, please."
                        maxLength={500}
                      />
                    </div>
                    <button className="btn btn-block" type="submit" disabled={reqBusy || !reqDesc.trim()}>
                      {reqBusy ? 'Sending…' : 'Send request'}
                    </button>
                  </form>
                  {reqMsg && <p style={{ marginTop: 10 }}>{reqMsg}</p>}

                  <h2 style={{ fontSize: 17, margin: '18px 0 10px' }}>Request a room change</h2>
                  <p className="page-sub">Tell us why — the front desk will arrange a new room and confirm with you.</p>
                  <form onSubmit={submitMove}>
                    <div className="field">
                      <label htmlFor="gp-move">Reason for the change</label>
                      <textarea
                        id="gp-move"
                        rows={2}
                        value={moveReason}
                        onChange={e => setMoveReason(e.target.value)}
                        placeholder="e.g. Too noisy — would like a quieter room."
                        maxLength={500}
                      />
                    </div>
                    <button className="btn btn-secondary btn-block" type="submit" disabled={moveBusy || !moveReason.trim()}>
                      {moveBusy ? 'Sending…' : 'Request room change'}
                    </button>
                  </form>
                  {moveMsg && <p style={{ marginTop: 10 }}>{moveMsg}</p>}
                </>
              )}

              <h2 style={{ fontSize: 17, margin: '18px 0 10px' }}>My requests</h2>
              {data.requests.length === 0 ? (
                <p className="page-sub">No requests yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Code</th><th>Request</th><th>Status</th></tr></thead>
                    <tbody>
                      {data.requests.map(r => (
                        <tr key={r.id}>
                          <td>{r.request_code}</td>
                          <td>{r.description}<br /><span className="page-sub">{r.service_type.replace(/_/g, ' ')}{Number(r.price) > 0 ? ` · ${money(r.price)}` : ''}</span></td>
                          <td><span className={`badge badge-${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="page-sub" style={{ marginTop: 18, marginBottom: 0 }}>
                This link expires {fmtDate(data.link_expires_at)}. For anything urgent, please call the front desk.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
