'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { peso } from '../../../lib/money';

interface Totals { chargesTotal: number; discountTotal: number; paymentsTotal: number; balance: number; }
interface StayDetail {
  stay: { id: number; stay_code: string; guest_count: number; checkin_at: string; planned_checkout: string; status: string };
  folio: { id: number; folio_number: string; status: string } | null;
  room: { room_number: string; type_name: string } | null;
  charges: { id: number; category: string; description: string; amount: string }[];
  payments: { id: number; receipt_number: string; method: string; amount: string; received_amount: string; change_amount: string }[];
  discounts: { id: number; name: string; amount: string; status: string }[];
  totals: Totals | null;
}

interface ReceiptData {
  folio_number: string;
  nights: number;
  vatRate: number;
  vatAmount: number;
  totals: Totals;
  charges: StayDetail['charges'];
  payments: StayDetail['payments'];
  discounts: StayDetail['discounts'];
}

export default function CheckoutPage({ params }: { params: Promise<{ stayId: string }> }) {
  const [stayId, setStayId] = useState('');
  const [d, setD] = useState<StayDetail | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then(p => setStayId(p.stayId));
  }, [params]);

  async function load(id: string) {
    const res = await fetch(`/api/stays/${id}`);
    if (!res.ok) {
      setError('Stay not found.');
      return;
    }
    setD(await res.json());
  }

  useEffect(() => {
    if (stayId) load(stayId).catch(() => setError('Could not load stay.'));
  }, [stayId]);

  async function postRoomCharges() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/stays/${stayId}/room-charges`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Could not post room charges.');
      else await load(stayId);
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/stays/${stayId}/checkout`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Checkout failed.');
      } else {
        setReceipt(data);
        await load(stayId);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div><h1>Checkout</h1><p className="page-sub">Loading…</p></div>;
  const t = d.totals;
  const alreadyOut = d.stay.status !== 'ACTIVE';

  return (
    <div>
      <div className="no-print">
        <h1>Checkout — {d.stay.stay_code}</h1>
        <p className="page-sub">
          Room {d.room?.room_number} ({d.room?.type_name}) · {d.stay.guest_count} guest(s) ·{' '}
          Folio {d.folio?.folio_number} · <span className={`badge badge-${(d.folio?.status ?? '').toLowerCase()}`}>{d.folio?.status}</span>
        </p>
        {error && <div className="alert alert-error">{error}</div>}

        {!alreadyOut && !receipt && (
          <>
            <div className="panel">
              <h3>1. Post nightly room charges</h3>
              <p className="page-sub">Room charges are posted automatically at check-in. Use this button only if any nights are missing — nights already charged are skipped. (Checkout also posts missing charges automatically, so the room amount can never be left off the bill.)</p>
              <button className="btn btn-secondary" onClick={postRoomCharges} disabled={busy}>
                {busy ? 'Working…' : 'Post room charges'}
              </button>
            </div>

            {t && (
              <div className="panel">
                <h3>2. Review balance</h3>
                <div className="cards">
                  <div className="card"><div className="stat-label">Charges</div><div className="stat-value">{peso(t.chargesTotal)}</div></div>
                  <div className="card"><div className="stat-label">Discounts</div><div className="stat-value">−{peso(t.discountTotal)}</div></div>
                  <div className="card"><div className="stat-label">Payments</div><div className="stat-value">{peso(t.paymentsTotal)}</div></div>
                  <div className="card"><div className="stat-label">Balance due</div><div className="stat-value">{peso(t.balance)}</div></div>
                </div>
                {t.balance > 0.005 && (
                  <div className="alert alert-error">
                    Outstanding balance of {peso(t.balance)}. Record payment on the{' '}
                    <Link href={d.folio ? `/folio/${d.folio.id}` : '#'}>folio page</Link> before checkout.
                  </div>
                )}
                {t.balance < -0.005 && (
                  <div className="alert alert-error">Overpaid by {peso(Math.abs(t.balance))}. Issue a refund before checkout.</div>
                )}
                <h3 style={{ marginTop: 16 }}>3. Finalize</h3>
                <p className="page-sub">Marks the folio PAID, checks out the stay, and sets the room to CLEANING.</p>
                <button className="btn" onClick={finalize} disabled={busy || Math.abs(t.balance) > 0.005}>
                  {busy ? 'Working…' : 'Finalize checkout'}
                </button>
              </div>
            )}
          </>
        )}
        {alreadyOut && !receipt && (
          <div className="alert alert-info">This stay is already checked out.</div>
        )}
      </div>

      {receipt && (
        <>
          <div className="toolbar no-print">
            <button className="btn" onClick={() => window.print()}>Print receipt</button>
            <Link className="btn btn-secondary" href="/stays">Back to stays</Link>
          </div>
          <div className="print-area">
            <div className="receipt">
              <h2>HOTEL BILLING</h2>
              <p className="r-center r-muted">Official Receipt</p>
              <hr />
              <div className="r-row"><span>Folio:</span><span>{receipt.folio_number}</span></div>
              <div className="r-row"><span>Stay:</span><span>{d.stay.stay_code}</span></div>
              <div className="r-row"><span>Room:</span><span>{d.room?.room_number} ({d.room?.type_name})</span></div>
              <div className="r-row"><span>Nights:</span><span>{receipt.nights}</span></div>
              <div className="r-row"><span>Date:</span><span>{new Date().toLocaleString('en-PH')}</span></div>
              <hr />
              {receipt.charges.map(c => (
                <div className="r-row" key={c.id}>
                  <span>{c.description.slice(0, 30)}</span>
                  <span>{peso(Number(c.amount))}</span>
                </div>
              ))}
              {receipt.discounts.filter(x => x.status === 'APPLIED').map(x => (
                <div className="r-row" key={'d' + x.id}>
                  <span>Discount: {x.name.slice(0, 22)}</span>
                  <span>−{peso(Number(x.amount))}</span>
                </div>
              ))}
              <hr />
              <div className="r-row total"><span>TOTAL</span><span>{peso(receipt.totals.chargesTotal - receipt.totals.discountTotal)}</span></div>
              <div className="r-row r-muted"><span>VAT-inclusive ({receipt.vatRate}%)</span><span>{peso(receipt.vatAmount)}</span></div>
              <hr />
              {receipt.payments.map(p => (
                <div key={p.id}>
                  <div className="r-row"><span>{p.method} {p.receipt_number}</span><span>{peso(Number(p.amount))}</span></div>
                  {Number(p.change_amount) > 0 && (
                    <div className="r-row r-muted"><span>Change</span><span>{peso(Number(p.change_amount))}</span></div>
                  )}
                </div>
              ))}
              <div className="r-row total"><span>PAID</span><span>{peso(receipt.totals.paymentsTotal)}</span></div>
              <div className="r-row"><span>Balance</span><span>{peso(receipt.totals.balance)}</span></div>
              <hr />
              <p className="r-center">Thank you for staying with us!</p>
              <p className="r-center r-muted">This serves as an official receipt.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
