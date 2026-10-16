'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { peso } from '../../../lib/money';

interface Totals { chargesTotal: number; discountTotal: number; paymentsTotal: number; balance: number; }
interface Detail {
  folio: { id: number; folio_number: string; status: string; stay_id: number };
  stay: { id: number; stay_code: string; guest_count: number; checkin_at: string; planned_checkout: string } | null;
  room: { room_number: string; type_name: string } | null;
  charges: { id: number; category: string; description: string; quantity: string; unit_price: string; amount: string; created_at: string; created_by_name: string | null }[];
  payments: { id: number; receipt_number: string; method: string; amount: string; received_amount: string; change_amount: string; reference_note: string | null; created_at: string; received_by_name: string | null }[];
  discounts: { id: number; name: string; discount_type: string; discount_value: string; amount: string; status: string; reason: string | null }[];
  totals: Totals;
}

const CHARGE_CATEGORIES = ['ROOM', 'FOOD', 'LAUNDRY', 'MINIBAR', 'SERVICE', 'OTHER', 'ADJUSTMENT', 'DAMAGE', 'MISSING_ITEM', 'EXTRA_PERSON', 'LATE_CHECKOUT', 'ROOM_SERVICE'];
const PAY_METHODS = ['CASH', 'CARD', 'GCASH', 'BANK_TRANSFER', 'MAYA', 'QR_PH', 'OTHER'];

export default function FolioPage({ params }: { params: Promise<{ id: string }> }) {
  const [folioId, setFolioId] = useState<string>('');
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [me, setMe] = useState<{ role: string } | null>(null);
  const [catalog, setCatalog] = useState<{ id: number; name: string; category: string; price: string }[]>([]);
  const [policies, setPolicies] = useState<{ id: number; name: string; requires_manager: number }[]>([]);

  // charge form
  const [cCat, setCCat] = useState('FOOD');
  const [cDesc, setCDesc] = useState('');
  const [cQty, setCQty] = useState('1');
  const [cPrice, setCPrice] = useState('');
  // payment form
  const [pMethod, setPMethod] = useState('CASH');
  const [pAmount, setPAmount] = useState('');
  const [pTendered, setPTendered] = useState('');
  const [pRef, setPRef] = useState('');
  // discount form
  const [dPolicy, setDPolicy] = useState('');
  const [dReason, setDReason] = useState('');

  useEffect(() => {
    params.then(p => setFolioId(p.id));
  }, [params]);

  async function load(id: string) {
    const [fRes, meRes, catRes] = await Promise.all([
      fetch(`/api/folios/${id}`),
      fetch('/api/auth/me'),
      fetch('/api/service-catalog'),
    ]);
    if (!fRes.ok) {
      setError('Folio not found.');
      return;
    }
    setD(await fRes.json());
    if (meRes.ok) setMe((await meRes.json()).user);
    if (catRes.ok) setCatalog((await catRes.json()).items);
  }

  useEffect(() => {
    if (!folioId) return;
    load(folioId).catch(() => setError('Could not load folio.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folioId]);

  // load discount policies once (admin/manager/frontdesk/cashier can all view)
  useEffect(() => {
    fetch('/api/discount-policies')
      .then(r => (r.ok ? r.json() : { policies: [] }))
      .then(j => setPolicies(j.policies ?? []))
      .catch(() => {});
  }, []);

  async function postCharge(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const res = await fetch(`/api/folios/${folioId}/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cCat, description: cDesc, quantity: Number(cQty), unit_price: Number(cPrice) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not add charge.');
    else {
      setCDesc('');
      setCPrice('');
      setNotice(`Charge posted: ${peso(data.amount)}.`);
      load(folioId);
    }
  }

  async function quickAdd(item: { name: string; category: string; price: string }) {
    setError('');
    setNotice('');
    const catMap: Record<string, string> = {
      FOOD_BEVERAGE: 'FOOD', HOUSEKEEPING: 'SERVICE', SERVICE: 'SERVICE',
      LAUNDRY: 'LAUNDRY', MINIBAR: 'MINIBAR', OTHER: 'OTHER',
    };
    const res = await fetch(`/api/folios/${folioId}/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: catMap[item.category] ?? 'OTHER',
        description: item.name,
        quantity: 1,
        unit_price: Number(item.price),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not add charge.');
    else {
      setNotice(`Added ${item.name} (${peso(Number(item.price))}).`);
      load(folioId);
    }
  }

  async function postPayment(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const res = await fetch(`/api/folios/${folioId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: pMethod,
        amount: Number(pAmount),
        received_amount: Number(pTendered),
        reference_note: pRef || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not record payment.');
    else {
      setPAmount('');
      setPTendered('');
      setPRef('');
      setNotice(`Payment recorded. Change: ${peso(data.change_amount)}.`);
      load(folioId);
    }
  }

  async function applyDiscount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const res = await fetch(`/api/folios/${folioId}/discounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy_id: Number(dPolicy), reason: dReason || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not apply discount.');
    else {
      setDReason('');
      setNotice(data.pendingApproval ? 'Discount submitted for manager approval.' : `Discount applied: ${peso(data.amount)}.`);
      load(folioId);
    }
  }

  async function decideDiscount(discountId: number, action: 'approve' | 'reject') {
    setError('');
    const res = await fetch(`/api/folios/${folioId}/discounts`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discount_id: discountId, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not decide discount.');
    else {
      setNotice(`Discount ${action}d.`);
      load(folioId);
    }
  }

  async function voidFolio() {
    const reason = window.prompt('Reason for voiding this folio:');
    if (!reason) return;
    setError('');
    const res = await fetch(`/api/folios/${folioId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Could not void folio.');
    else {
      setNotice('Folio voided.');
      load(folioId);
    }
  }

  if (error && !d) return <div><h1>Folio</h1><div className="alert alert-error">{error}</div></div>;
  if (!d) return <div><h1>Folio</h1><p className="page-sub">Loading…</p></div>;

  const t = d.totals;
  const isOpen = d.folio.status === 'OPEN';
  const canCharge = me && ['admin', 'manager', 'frontdesk'].includes(me.role);
  const canPay = me && ['admin', 'manager', 'cashier'].includes(me.role);
  const canManage = me && ['admin', 'manager'].includes(me.role);
  const changePreview = pAmount && pTendered ? Number(pTendered) - Number(pAmount) : 0;

  return (
    <div>
      <h1>Folio {d.folio.folio_number}</h1>
      <p className="page-sub">
        Stay {d.stay?.stay_code} · Room {d.room?.room_number} ({d.room?.type_name}) ·{' '}
        {d.stay?.guest_count} guest(s) · Check-in {String(d.stay?.checkin_at).slice(0, 16).replace('T', ' ')} ·{' '}
        Planned checkout {String(d.stay?.planned_checkout).slice(0, 10)}{' '}
        <span className={`badge badge-${d.folio.status.toLowerCase()}`}>{d.folio.status}</span>
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="cards">
        <div className="card"><div className="stat-label">Charges</div><div className="stat-value">{peso(t.chargesTotal)}</div></div>
        <div className="card"><div className="stat-label">Discounts</div><div className="stat-value">−{peso(t.discountTotal)}</div></div>
        <div className="card"><div className="stat-label">Payments</div><div className="stat-value">{peso(t.paymentsTotal)}</div></div>
        <div className="card"><div className="stat-label">Balance due</div><div className="stat-value">{peso(t.balance)}</div>
          <div className="stat-sub">{d.stay && <Link href={`/checkout/${d.stay.id}`}>Go to checkout →</Link>}</div>
        </div>
      </div>

      <div className="two-col">
        <div>
          <h2>Charges</h2>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table className="data">
              <thead><tr><th>Category</th><th>Description</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {d.charges.length === 0 && <tr><td colSpan={5} className="empty">No charges yet.</td></tr>}
                {d.charges.map(c => (
                  <tr key={c.id}>
                    <td><span className="badge badge-open">{c.category}</span></td>
                    <td style={{ whiteSpace: 'normal' }}>{c.description}</td>
                    <td className="num">{c.quantity}</td>
                    <td className="num">{peso(Number(c.unit_price))}</td>
                    <td className="num">{peso(Number(c.amount))}</td>
                  </tr>
                ))}
                <tr className="total-row"><td colSpan={4}>Total charges</td><td className="num">{peso(t.chargesTotal)}</td></tr>
              </tbody>
            </table>
          </div>

          {isOpen && canCharge && (
            <div className="panel">
              <h3>Add charge</h3>
              <form onSubmit={postCharge}>
                <div className="form-grid">
                  <div className="field"><span>Category</span>
                    <select value={cCat} onChange={e => setCCat(e.target.value)}>
                      {CHARGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field"><span>Qty</span><input type="number" min="0.01" step="0.01" value={cQty} onChange={e => setCQty(e.target.value)} required /></div>
                  <div className="field"><span>Unit price (₱)</span><input type="number" min="0" step="0.01" value={cPrice} onChange={e => setCPrice(e.target.value)} required /></div>
                </div>
                <div className="field"><span>Description</span><input value={cDesc} onChange={e => setCDesc(e.target.value)} required maxLength={255} /></div>
                <button className="btn" type="submit">Post charge</button>
              </form>
              <h3 style={{ marginTop: 18 }}>Quick add from catalog</h3>
              <div className="btn-row">
                {catalog.slice(0, 12).map(item => (
                  <button key={item.id} className="btn btn-secondary btn-sm" onClick={() => quickAdd(item)} title={item.category}>
                    {item.name} · {peso(Number(item.price))}
                  </button>
                ))}
              </div>
            </div>
          )}

          <h2>Discounts</h2>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table className="data">
              <thead><tr><th>Name</th><th>Status</th><th className="num">Amount</th><th></th></tr></thead>
              <tbody>
                {d.discounts.length === 0 && <tr><td colSpan={4} className="empty">No discounts.</td></tr>}
                {d.discounts.map(x => (
                  <tr key={x.id}>
                    <td style={{ whiteSpace: 'normal' }}>{x.name}</td>
                    <td><span className={`badge badge-${x.status.toLowerCase()}`}>{x.status}</span></td>
                    <td className="num">−{peso(Number(x.amount))}</td>
                    <td>
                      {x.status === 'PENDING' && canManage && (
                        <div className="btn-row">
                          <button className="btn btn-sm" onClick={() => decideDiscount(x.id, 'approve')}>Approve</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => decideDiscount(x.id, 'reject')}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isOpen && canCharge && (
            <div className="panel">
              <h3>Apply discount</h3>
              <form onSubmit={applyDiscount}>
                <div className="form-grid">
                  <div className="field"><span>Policy</span>
                    <select value={dPolicy} onChange={e => setDPolicy(e.target.value)} required>
                      <option value="">Select…</option>
                      {policies.map(p => <option key={p.id} value={p.id}>{p.name}{p.requires_manager ? ' (mgr approval)' : ''}</option>)}
                    </select>
                  </div>
                  <div className="field"><span>Reason (optional)</span><input value={dReason} onChange={e => setDReason(e.target.value)} maxLength={255} /></div>
                </div>
                <button className="btn" type="submit">Apply discount</button>
              </form>
            </div>
          )}
        </div>

        <div>
          <h2>Payments</h2>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table className="data">
              <thead><tr><th>Receipt</th><th>Method</th><th className="num">Amount</th><th className="num">Tendered</th><th className="num">Change</th></tr></thead>
              <tbody>
                {d.payments.length === 0 && <tr><td colSpan={5} className="empty">No payments yet.</td></tr>}
                {d.payments.map(p => (
                  <tr key={p.id}>
                    <td>{p.receipt_number}</td>
                    <td>{p.method}</td>
                    <td className="num">{peso(Number(p.amount))}</td>
                    <td className="num">{peso(Number(p.received_amount))}</td>
                    <td className="num">{peso(Number(p.change_amount))}</td>
                  </tr>
                ))}
                <tr className="total-row"><td colSpan={2}>Total paid</td><td className="num">{peso(t.paymentsTotal)}</td><td colSpan={2}></td></tr>
              </tbody>
            </table>
          </div>

          {isOpen && canPay && (
            <div className="panel">
              <h3>Record payment</h3>
              <form onSubmit={postPayment}>
                <div className="form-grid">
                  <div className="field"><span>Method</span>
                    <select value={pMethod} onChange={e => setPMethod(e.target.value)}>
                      {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="field"><span>Amount (₱)</span><input type="number" min="0.01" step="0.01" value={pAmount} onChange={e => setPAmount(e.target.value)} required /></div>
                  <div className="field"><span>Amount tendered (₱)</span><input type="number" min="0.01" step="0.01" value={pTendered} onChange={e => setPTendered(e.target.value)} required /></div>
                </div>
                <div className="field"><span>Reference note (optional)</span><input value={pRef} onChange={e => setPRef(e.target.value)} maxLength={120} /></div>
                {pAmount && pTendered && (
                  <p className="page-sub">Change due: <strong>{peso(changePreview)}</strong>{changePreview < 0 ? ' — tendered is less than amount!' : ''}</p>
                )}
                <button className="btn" type="submit">Record payment</button>
              </form>
            </div>
          )}

          {isOpen && canManage && (
            <div className="panel">
              <h3>Danger zone</h3>
              <p className="page-sub">Void this folio (only when it has no payments).</p>
              <button className="btn btn-danger" onClick={voidFolio}>Void folio</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
