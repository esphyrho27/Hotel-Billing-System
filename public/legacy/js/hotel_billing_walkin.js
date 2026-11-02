/* Operations controller: retains the uploaded Bootstrap dashboard and connects it to the privacy-first stay/folio API. */

(() => {

  const $ = id => document.getElementById(id);

  const api = (...args) => window.HotelAuth.request(...args);

  let activeModule = 'dashboard', rooms = [], stays = [], selectedRoom = null; let roomsCalTab = 'board';
  let checkoutHistoryFilters = { search: '', from: '', to: '', page: 1 };

  const php = n => '₱' + Number(n || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const discountDisplayName = discount => {
    const name=String(discount?.name||discount?.category||'Discount');
    const type=String(discount?.discount_type||'').toUpperCase();
    const rate=Number(discount?.discount_value);
    return type==='PERCENT'&&Number.isFinite(rate)&&!/\d+(?:\.\d+)?\s*%/.test(name)
      ? `${name} (${rate}%)`
      : name;
  };
  const groupPendingCheckinPayments = rows => {
    const groups = new Map();
    for (const row of rows || []) {
      const key = row.group_booking_id ? `group:${row.group_booking_id}` : `payment:${row.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return Array.from(groups.values()).map(payments => ({
      group_booking_id: payments.length > 1 ? Number(payments[0].group_booking_id) : 0,
      group_code: payments[0].group_code || '',
      payments
    }));
  };

  const DISCOUNT_RATE_RULES = {
    SENIOR_CITIZEN: { min: 20, max: 20, eligibleId: true },
    PWD: { min: 20, max: 20, eligibleId: true },
    EARLY_BOOKING: { min: 5, max: 15 },
    LONG_STAY: { min: 10, max: 20 },
    GROUP: { min: 5, max: 15 },
    LOYALTY: { min: 5, max: 10 },
    WALK_IN: { min: 5, max: 10 },
    BIRTHDAY: { min: 5, max: 10 },
    EMPLOYEE: { min: 10, max: 30 },
    CORPORATE: { min: 5, max: 15 },
    OFF_SEASON: { min: 10, max: 25 },
  };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const STATUS_STYLES = {

    'PENDING': 'background-color:#fffbeb;color:#b45309;border:1px solid #fde68a;',

    'NEW': 'background-color:#fffbeb;color:#b45309;border:1px solid #fde68a;',

    'REQUESTED': 'background-color:#fffbeb;color:#b45309;border:1px solid #fde68a;',

    'FOR_PAYMENT': 'background-color:#fffbeb;color:#b45309;border:1px solid #fde68a;',

    'PENDING_PAYMENT': 'background-color:#fffbeb;color:#b45309;border:1px solid #fde68a;',

    'ASSIGNED': 'background-color:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;',

    'ACKNOWLEDGED': 'background-color:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;',

    'ACCEPTED': 'background-color:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;',

    'IN_PROGRESS': 'background-color:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;',

    'PROCESSING': 'background-color:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;',

    'ON_HOLD': 'background-color:#f8fafc;color:#475569;border:1px solid #e2e8f0;',

    'COMPLETED': 'background-color:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;',

    'PAID': 'background-color:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;',

    'AVAILABLE': 'background-color:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;',

    'FINALIZED': 'background-color:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;',

    'APPROVED': 'background-color:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;',

    'CONFIRMED': 'background-color:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;',

    'ACTIVE': 'background-color:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;',

    'CANCELLED': 'background-color:#f8fafc;color:#64748b;border:1px solid #e2e8f0;',

    'REJECTED': 'background-color:#f8fafc;color:#475569;border:1px solid #e2e8f0;',

    'INACTIVE': 'background-color:#f8fafc;color:#64748b;border:1px solid #e2e8f0;',

    'OCCUPIED': 'background-color:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;',
    'RESERVED': 'background-color:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe;',

    'CLEANING': 'background-color:#fefce8;color:#a16207;border:1px solid #fde047;',

    'MAINTENANCE': 'background-color:#f8fafc;color:#475569;border:1px solid #e2e8f0;',

    'ERROR': 'background-color:#fef2f2;color:#b91c1c;border:1px solid #fecaca;',

    'FAILED': 'background-color:#fef2f2;color:#b91c1c;border:1px solid #fecaca;'

  };

  const pill = s => {

    const key = String(s || '').toUpperCase();

    const style = STATUS_STYLES[key] || 'background-color:#f3f4f6;color:#4b5563;border:1px solid #e5e7eb;';

    return `<span class="badge rounded-pill d-inline-flex align-items-center justify-content-center px-2 py-1 text-nowrap fw-semibold" style="${style}">${esc(s)}</span>`;

  };

  function notify(msg, bad=false) {

    if (window.HotelDialogs?.toast) {

      window.HotelDialogs.toast({ title: msg, icon: bad ? 'error' : 'success' });

      return;

    }

    const el=document.createElement('div');

    el.className='alert '+(bad?'alert-danger':'alert-success')+' shadow position-fixed';

    el.style.cssText='right:20px;bottom:20px;z-index:3000;max-width:420px';

    el.textContent=msg;

    document.body.appendChild(el);

    setTimeout(()=>el.remove(),4200);

  }

  function setModule(id) {

    activeModule=id;

    const map={'dashboard':'panel-dashboard','walkin-checkin':'panel-walkin-checkin','active-stays':'panel-active-stays','checkout-history':'panel-checkout-history','checkout':'panel-checkout','early-checkout-requests':'panel-early-checkout-requests','rooms':'panel-rooms','catalog':'panel-catalog','transactions':'panel-transactions','billing':'panel-billing','payments':'panel-payments','service-requests':'panel-service-requests','early-checkouts':'panel-early-checkouts','guest-chats':'panel-guest-chats','reports':'panel-reports','audit-logs':'panel-audit-logs','users':'panel-users','discount-approvals':'panel-discount-approvals','settings':'panel-settings','dept-reports':'panel-dept-reports','dept-inventory':'panel-dept-inventory'};

    document.querySelectorAll('.panel-section').forEach(p=>p.classList.remove('active'));

    let target=$(map[id]);

    if (!target && id==='walkin-checkin') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="walkin-checkin-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

    if (!target && id==='checkout-history') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="checkout-history-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

    if (!target && id==='checkout') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="checkout-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

    if (!target && id==='early-checkout-requests') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="early-checkout-requests-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

    if (!target && id==='service-requests') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="service-requests-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); } if (!target && id==='guest-chats') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="guest-chats-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); } if (!target && id==='early-checkouts') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="early-checkouts-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); } if (!target && id==='users') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="users-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); } if (!target && id==='discount-approvals') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="discount-approvals-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

    target?.classList.add('active');

    const curRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();

    const info = window.HotelModulesHelper?.getModuleInfo?.(curRole, id);

    if (info) {

      const infoTitle = Array.isArray(info) ? info[2] : info.title;

      const infoSub = Array.isArray(info) ? info[3] : info.sub;

      if ($('module-title-text')) $('module-title-text').textContent = infoTitle;

      if ($('module-sub-text')) $('module-sub-text').textContent = infoSub;

    } else {

      const mod=(window.HotelModules||[]).find(x=>x[0]===id);

      if ($('module-title-text')) $('module-title-text').textContent=mod?.[2]||'Dashboard';

      if ($('module-sub-text')) $('module-sub-text').textContent=mod?.[3]||'';

    }

    document.querySelectorAll('#sidebar-nav [data-module]').forEach(b=>b.classList.toggle('active',b.dataset.module===id));

    const crumbEl=$('crumb-current'); if (crumbEl) crumbEl.textContent=$('module-title-text')?.textContent||'Dashboard';

  }

  async function open(id) {

    document.getElementById('sidebar-col')?.classList.remove('show');

    document.getElementById('sidebar-backdrop')?.classList.remove('show');

    const curRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();

    const allowed = window.HotelModulesHelper?.getAllowedModules?.(curRole);

    if (allowed && !allowed.has(id)) {

      const fallback = allowed.has('dashboard')

        ? 'dashboard'

        : (allowed.has('service-requests')

          ? 'service-requests'

          : (allowed.has('rooms') ? 'rooms' : ([...allowed][0] || 'settings')));

      if (fallback !== id) {

        return open(fallback);

      }

    }

    setModule(id);

    try {

      if(id==='users') await window.HotelUsers?.render();

      else if(id==='discount-approvals') await window.HotelApprovals?.renderDiscounts();

      else if(id==='dept-inventory') await window.HotelDeptManager?.renderInventory();

      else if(id==='dept-reports') await window.HotelDeptManager?.renderReports();

      else await render(id);

    } catch(e) {

      notify(e.message,true);

    }

  }

  const seenRequestIds = () => { try { return new Set(JSON.parse(localStorage.getItem('pv_seen_new_request_ids')||'[]').map(Number)); } catch (_) { return new Set(); } };

  function markRequestsViewed(rows) { const seen=seenRequestIds(); (rows||[]).filter(r=>['NEW','PENDING'].includes(r.status)).forEach(r=>seen.add(Number(r.id))); try { localStorage.setItem('pv_seen_new_request_ids',JSON.stringify([...seen].slice(-2000))); } catch (_) {} window.HotelRequestBadge?.set(0); }

  async function refreshRequestBadge() {

    try {

      // The requests feed requires service_requests.view; accounts without

      // it (e.g. cashier) skip the call entirely instead of polling a 403.

      const perms = window.HotelAuth.getUser()?.permissions || [];

      if (perms.length && !perms.includes('*') && !perms.includes('service_requests.view')) { window.HotelRequestBadge?.set(0); return; }

      const d = await api('requests', {}, 'GET');

      const rows = d.requests || [];

      const seen = seenRequestIds();

      const unread = rows.filter(r => ['NEW','PENDING'].includes(r.status) && !seen.has(Number(r.id)));

      window.HotelRequestBadge?.set(unread.length);

    } catch (_) {}

  }

  function table(headers, rows, empty='No records found.') { const minW = Math.max(540, (headers||[]).length * 115); return `<div class="card border-0 shadow-sm"><div class="table-responsive"><table class="table table-hover align-middle mb-0" style="min-width: ${minW}px;"><thead class="table-light"><tr>${headers.map(h=>`<th class="text-nowrap">${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="text-center text-muted py-4">${empty}</td></tr>`}</tbody></table></div></div>`; }

  async function renderCheckoutHistory() {
    const host = $('checkout-history-content');
    if (!host) return;
    host.innerHTML = '<div class="text-muted py-4">Loading checkout history…</div>';
    try {
      const data = await api('checkout_history', checkoutHistoryFilters, 'GET');
      const records = data.checkouts || [];
      const rows = records.map(record => {
        const guestName = [record.first_name, record.middle_name, record.last_name].filter(Boolean).join(' ') || 'Guest';
        return `<tr>
          <td><strong>${esc(guestName)}</strong><div class="small text-muted">${esc(record.stay_code)} · ${esc(record.folio_number)}</div></td>
          <td><strong>${esc(record.room_number)}</strong><div class="small text-muted">${Number(record.guest_count)} guest(s)</div></td>
          <td><div>Scheduled: ${esc(record.checkin_at || '—')}</div><div class="small text-muted">Actual: ${esc(record.actual_checkin_at || 'Not recorded')}</div></td>
          <td><strong>${esc(record.actual_checkout_at || record.actual_checkout || '—')}</strong><div class="small text-muted">Scheduled: ${esc(record.scheduled_checkout_at || record.planned_checkout || '—')}</div></td>
          <td>${Number(record.nights_stayed)} night(s)</td>
          <td class="text-end"><strong>${php(record.final_amount)}</strong><div class="small text-muted">Paid ${php(record.payments_received)}</div></td>
          <td>${Number(record.folio_id) ? `<button type="button" class="btn btn-sm btn-outline-dark" onclick="HotelBilling.showCheckoutReceipts(${Number(record.folio_id)}, '${esc(record.stay_code)}')"><i class="bi bi-printer me-1"></i>Receipts</button>` : '<span class="text-muted">—</span>'}</td>
        </tr>`;
      }).join('');
      const page = Number(data.page) || 1;
      const pages = Number(data.pages) || 1;
      const start = Number(data.total) ? ((page - 1) * Number(data.page_size)) + 1 : 0;
      const end = Math.min(page * Number(data.page_size), Number(data.total) || 0);

      host.innerHTML = `
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div><h3 class="h4 fw-bold mb-1">Checked-Out Guests</h3><p class="text-muted mb-0">Completed stays are kept here separately from Active Stays.</p></div>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="checkout-history-refresh"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>
        </div>
        <form id="checkout-history-filter" class="card card-body border-0 shadow-sm mb-3">
          <div class="row g-2 align-items-end">
            <div class="col-lg-5"><label class="form-label small" for="checkout-history-search">Search guest, room, stay, folio or contact</label><input id="checkout-history-search" class="form-control" type="search" maxlength="100" value="${esc(checkoutHistoryFilters.search)}"></div>
            <div class="col-sm-5 col-lg-2"><label class="form-label small" for="checkout-history-from">Checkout from</label><input id="checkout-history-from" class="form-control" type="date" value="${esc(checkoutHistoryFilters.from)}"></div>
            <div class="col-sm-5 col-lg-2"><label class="form-label small" for="checkout-history-to">Checkout to</label><input id="checkout-history-to" class="form-control" type="date" value="${esc(checkoutHistoryFilters.to)}"></div>
            <div class="col-sm-7 col-lg-3 d-flex gap-2"><button class="btn btn-primary flex-grow-1" type="submit">Search</button><button class="btn btn-outline-secondary" type="button" id="checkout-history-clear">Clear</button></div>
          </div>
        </form>
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2"><span class="small text-muted">Showing ${start}–${end} of ${Number(data.total) || 0} completed checkout(s)</span><span class="small text-muted">Final bill includes recorded charges, discounts and VAT.</span></div>
        ${table(['Guest / Stay', 'Room', 'Scheduled / Actual Check-in', 'Checked out', 'Nights', 'Final / Paid', 'Receipts'], rows, 'No checked-out guests match these filters.')}
        <div class="d-flex justify-content-end align-items-center gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-checkout-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="small text-muted">Page ${page} of ${pages}</span>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-checkout-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button>
        </div>`;

      $('checkout-history-filter').addEventListener('submit', event => {
        event.preventDefault();
        checkoutHistoryFilters = {
          search: $('checkout-history-search').value.trim(),
          from: $('checkout-history-from').value,
          to: $('checkout-history-to').value,
          page: 1,
        };
        renderCheckoutHistory();
      });
      $('checkout-history-clear').addEventListener('click', () => {
        checkoutHistoryFilters = { search: '', from: '', to: '', page: 1 };
        renderCheckoutHistory();
      });
      $('checkout-history-refresh').addEventListener('click', () => renderCheckoutHistory());
      host.querySelectorAll('[data-checkout-page]').forEach(button => button.addEventListener('click', () => {
        checkoutHistoryFilters.page = Number(button.dataset.checkoutPage);
        renderCheckoutHistory();
      }));
    } catch (error) {
      host.innerHTML = `<div class="alert alert-danger" role="alert">${esc(error.message || 'Checkout history could not be loaded.')}</div>`;
    }
  }

  // Checked-Out Guests: list the individual payment receipts for one folio.
  // Uses the existing folio endpoint (billing.view, so frontdesk can use it)
  // rather than payment_history, which is admin/manager/cashier only. Each
  // row opens the existing official receipt viewer, which already prints.
  // The list modal is hidden first, matching the checkout flow's
  // hide-then-open pattern, so two Bootstrap modals never stack.
  async function showCheckoutReceipts(folioId, stayCode) {
    const id = Number(folioId);
    if (!id) return;
    try {
      const d = await api('folio', { folio_id: id });
      const payments = d.payments || [];
      if (!payments.length) {
        modal(`Payment receipts · ${esc(stayCode || '')}`, '<div class="text-muted">No payment receipts recorded for this stay.</div>');
        return;
      }
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const rows = payments.map(p => `<tr>
        <td>${esc(p.created_at)}</td>
        <td><strong>${esc(p.receipt_number)}</strong></td>
        <td>${esc(p.method)}</td>
        <td class="text-end">${php(p.amount)}</td>
        <td><button type="button" class="btn btn-sm btn-outline-dark" onclick="HotelBilling.viewCheckoutReceipt('${esc(p.receipt_number)}')"><i class="bi bi-printer me-1"></i>View receipt</button></td>
      </tr>`).join('');
      const listModal = modal(`Payment receipts · ${esc(stayCode || '')} · Folio ${esc(d.folio?.folio_number || '')}`,
        `${table(['Date / Time', 'Receipt', 'Method', 'Amount', ''], rows, 'No payment receipts recorded for this stay.')}
         <div class="d-flex justify-content-between align-items-center mt-3"><span class="small text-muted">Each receipt opens the official payment receipt, which can be printed.</span><strong>Total of receipts: ${php(totalPaid)}</strong></div>`);
      window.HotelBilling.checkoutReceiptsModal = listModal;
    } catch (error) {
      notify('Unable to load payment receipts: ' + (error.message || 'Unknown error'), true);
    }
  }

  async function viewCheckoutReceipt(receiptNumber) {
    const listModal = window.HotelBilling.checkoutReceiptsModal;
    if (listModal && listModal.root && listModal.root.classList.contains('show')) {
      const closed = new Promise(resolve => listModal.root.addEventListener('hidden.bs.modal', resolve, { once: true }));
      listModal.m.hide();
      await closed;
    }
    window.HotelBilling.checkoutReceiptsModal = null;
    // showReceiptModal fetches receipt_details (frontdesk included) and
    // renders the official receipt only: its Check-Out button requires a
    // stay_id, which receipt_details never returns, so no checkout action
    // can leak into this checked-out view. The folio button it offers is
    // safe too: the folio modal disables checkout and payment and hides
    // Add charge for a PAID folio.
    await showReceiptModal(receiptNumber);
  }

  let serviceDashboardLastRender = 0;
  let serviceDashboardDialogOpen = false;

  // Shared action vocabulary for request rows. Amenity bookings (flagged by
  // the requests endpoint via amenity_category) use booking words; every
  // other row keeps its current words, except the department queue's
  // "Reject Order", which is factually wrong for non-food rows and becomes
  // "Decline Request". Only visible label text changes — option values,
  // button actions, and status values are untouched.
  function requestActionLabel(request, action, context) {
    const isAmenity = Boolean(request && request.amenity_category);
    if (isAmenity) {
      return {
        acknowledge: 'Confirm Booking',
        start: 'Begin Service',
        hold: 'Put On Hold',
        resume: 'Resume Service',
        complete: 'Mark Complete',
        reject: 'Decline Booking',
      }[action] || action;
    }
    if (context === 'queue') {
      return {
        acknowledge: 'Acknowledge',
        start: 'Start Work',
        hold: 'Put On Hold',
        resume: 'Resume Work',
        complete: 'Complete / Fulfill',
        reject: 'Decline Request',
      }[action] || action;
    }
    return {
      acknowledge: 'Acknowledge',
      start: 'Start',
      hold: 'Hold',
      resume: 'Resume',
      complete: 'Complete',
      reject: 'Reject',
    }[action] || action;
  }

  function serviceDashboardActions(request) {
    const st = String(request.status || '').toUpperCase();
    const id = Number(request.id) || 0;
    if (!id) return '';
    const btn = (label, status, kind) => `<button type="button" class="btn btn-sm ${kind}" data-service-dashboard-action="${status}" data-service-dashboard-id="${id}">${label}</button>`;
    if (['NEW', 'PENDING', 'ASSIGNED'].includes(st)) {
      return btn(requestActionLabel(request, 'acknowledge', 'dashboard'), 'ACKNOWLEDGED', 'btn-outline-primary') + btn(requestActionLabel(request, 'start', 'dashboard'), 'IN_PROGRESS', 'btn-outline-primary') + btn(requestActionLabel(request, 'reject', 'dashboard'), 'REJECT', 'btn-outline-danger');
    }
    if (st === 'ACKNOWLEDGED') {
      return btn(requestActionLabel(request, 'start', 'dashboard'), 'IN_PROGRESS', 'btn-outline-primary') + btn(requestActionLabel(request, 'hold', 'dashboard'), 'ON_HOLD', 'btn-outline-warning') + btn(requestActionLabel(request, 'reject', 'dashboard'), 'REJECT', 'btn-outline-danger');
    }
    if (st === 'IN_PROGRESS') {
      return btn(requestActionLabel(request, 'complete', 'dashboard'), 'COMPLETED', 'btn-success') + btn(requestActionLabel(request, 'hold', 'dashboard'), 'ON_HOLD', 'btn-outline-warning');
    }
    if (st === 'ON_HOLD') {
      return btn(requestActionLabel(request, 'resume', 'dashboard'), 'IN_PROGRESS', 'btn-outline-primary') + btn(requestActionLabel(request, 'complete', 'dashboard'), 'COMPLETED', 'btn-success');
    }
    return '';
  }

  async function serviceDashboardAskReason(title, text, label, placeholder, validationMessage) {
    serviceDashboardDialogOpen = true;
    try {
      if (window.HotelDialogs?.input) {
        return await window.HotelDialogs.input({ title, text, label, placeholder, required: true, validationMessage });
      }
      const value = window.prompt(text);
      if (value === null) return '';
      const trimmed = String(value).trim();
      if (!trimmed) { notify(validationMessage, true); return ''; }
      return trimmed;
    } finally {
      serviceDashboardDialogOpen = false;
    }
  }

  async function serviceDashboardApplyStatus(id, status, button) {
    let reason = '';
    if (status === 'REJECT') {
      reason = await serviceDashboardAskReason('Reject Request', 'Enter the reason for rejecting this request:', 'Rejection Reason', 'e.g. Item unavailable / Service hours ended', 'A rejection reason is required.');
      if (!reason) return;
      status = 'REJECTED';
    } else if (status === 'ON_HOLD') {
      reason = await serviceDashboardAskReason('Put Request On Hold', 'Enter the reason for placing this request on hold:', 'Reason for Hold', 'e.g. Waiting for guest confirmation / restocking supplies', 'A hold reason is required.');
      if (!reason) return;
    } else if (status === 'COMPLETED') {
      serviceDashboardDialogOpen = true;
      let confirmed = false;
      try {
        if (window.HotelDialogs?.confirm) {
          confirmed = await window.HotelDialogs.confirm({ title: 'Complete & Fulfill Request?', text: `Mark request #${id} as completed? If chargeable, the amount will be posted once to the guest folio.`, confirmButtonText: 'Complete Request' });
        } else {
          confirmed = window.confirm(`Mark request #${id} as completed? If chargeable, the amount will be posted once to the guest folio.`);
        }
      } finally {
        serviceDashboardDialogOpen = false;
      }
      if (!confirmed) return;
    }
    const row = button?.closest?.('.service-dashboard-request');
    row?.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      await api('request_status', { request_id: id, status, reason });
      notify(status === 'COMPLETED' ? 'Request fulfilled; any chargeable amount was posted once.' : 'Request updated.');
      await refreshRequestBadge();
      await renderServiceDashboard(true);
    } catch (e) {
      notify(e.message, true);
      row?.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  }

  function onServiceDashboardAction(event) {
    const historyButton = event.target?.closest?.('[data-service-dashboard-history]');
    if (historyButton) {
      const historyId = Number(historyButton.getAttribute('data-service-dashboard-history')) || 0;
      if (historyId) viewHistory(historyId);
      return;
    }
    const button = event.target?.closest?.('[data-service-dashboard-action]');
    if (!button || button.disabled) return;
    const status = button.getAttribute('data-service-dashboard-action');
    const id = Number(button.getAttribute('data-service-dashboard-id')) || 0;
    if (!id || !status) return;
    serviceDashboardApplyStatus(id, status, button);
  }

  async function renderServiceDashboard(force = false) {
    const host = $('dashboard-content');
    if (!host) return;
    if (!force) {
      if (serviceDashboardDialogOpen || document.querySelector('.modal.show')) return;
      if (Date.now() - serviceDashboardLastRender < 2000) return;
    }
    const roleKey = (window.HotelAuth?.getUser()?.role || '').toLowerCase().replace(/[&\s_-]/g, '');
    const departmentNames = {
      service: 'Guest Services',
      housekeeping: 'Housekeeping',
      laundry: 'Laundry',
      maintenance: 'Maintenance',
      valet: 'Valet',
      parking: 'Valet',
      parkingvalet: 'Valet',
      other: 'Guest Services',
      concierge: 'Guest Services',
    };
    const departmentName = departmentNames[roleKey] || 'Guest Services';

    host.innerHTML = `<div class="service-dashboard-loading"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span><span>Loading ${esc(departmentName)} requests…</span></div>`;

    try {
      const data = await api('requests', {}, 'GET');
      const requests = Array.isArray(data.requests) ? data.requests : [];
      const needsAction = requests.filter(request => ['NEW', 'PENDING', 'ASSIGNED'].includes(String(request.status || '').toUpperCase()));
      const inProgress = requests.filter(request => ['ACKNOWLEDGED', 'IN_PROGRESS'].includes(String(request.status || '').toUpperCase()));
      const onHold = requests.filter(request => String(request.status || '').toUpperCase() === 'ON_HOLD');
      // Service dashboard is now the service role's only request list, so it
      // shows every active request, oldest first like the queue did — not
      // just the newest five.
      const allRequests = [...requests]
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

      const liveFallback = window.HotelRealtime?.isConnected?.() === false;
      const requestRows = allRequests.map(request => {
        const createdAt = String(request.created_at || '');
        const parsedDate = new Date(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T'));
        const submitted = Number.isNaN(parsedDate.getTime())
          ? 'Recently submitted'
          : parsedDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const chargeText = Number(request.chargeable) === 1 ? php(request.price) : 'No charge';
        const noteLines = [];
        if (Number(request.safety_flag || 0) === 1) noteLines.push(`<span class="text-danger">URGENT SAFETY${request.safety_note ? `: ${esc(request.safety_note)}` : ''}</span>`);
        else if (request.safety_note) noteLines.push(`<span class="text-danger">${esc(request.safety_note)}</span>`);
        if (request.on_hold_reason) noteLines.push(`<span>On hold: ${esc(request.on_hold_reason)}</span>`);
        if (request.rejection_reason) noteLines.push(`<span>Rejection: ${esc(request.rejection_reason)}</span>`);
        return `
          <article class="service-dashboard-request">
            <div class="service-dashboard-request-room"><i class="bi bi-door-closed" aria-hidden="true"></i><span>Room ${esc(request.room_number || '—')}</span></div>
            <div class="service-dashboard-request-detail">
              <strong>${esc(request.description || 'Guest service request')}</strong>
              <span>${esc(request.request_code || 'Request')} · ${esc(request.guest_name || 'Guest')} · ${esc(submitted)}</span>
              <span>Charge: ${chargeText}</span>
              ${noteLines.join('')}
            </div>
            <div class="service-dashboard-request-status">${pill(request.status)}</div>
            <div class="service-dashboard-request-actions">${serviceDashboardActions(request)}<button type="button" class="btn btn-sm btn-outline-secondary" data-service-dashboard-history="${Number(request.id) || 0}">History</button></div>
          </article>`;
      }).join('');

      // Only roles that still have the queue module get a link to it. The
      // service role's queue nav was removed, so its dashboard must not
      // offer a button that would just bounce back to the dashboard.
      const hasQueue = window.HotelModulesHelper
        ? window.HotelModulesHelper.isAllowed(roleKey, 'service-requests')
        : roleKey !== 'service';
      host.innerHTML = `
        <section class="service-dashboard" aria-labelledby="service-dashboard-title">
          <header class="service-dashboard-header">
            <div class="service-dashboard-brand">
              <span class="service-dashboard-mark" aria-hidden="true"><i class="bi bi-headset"></i></span>
              <div>
                <span class="service-dashboard-eyebrow">${esc(departmentName.toUpperCase())} · LIVE QUEUE</span>
                <h2 id="service-dashboard-title">${esc(departmentName)} Service Desk</h2>
                <p>Review and fulfill guest requests assigned to your department.</p>
              </div>
            </div>
            <div class="service-dashboard-controls">
              <button type="button" class="btn service-dashboard-refresh" id="service-dashboard-refresh" aria-label="Refresh guest service queue" title="Refresh queue">
                <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
              </button>
              ${hasQueue ? `<button type="button" class="btn service-dashboard-primary" id="service-dashboard-open-queue">
                Open service queue <i class="bi bi-arrow-right" aria-hidden="true"></i>
              </button>` : ''}
            </div>
          </header>
          <div class="service-dashboard-metrics" aria-label="Guest service request counts">
            <article class="service-dashboard-metric service-dashboard-metric-new">
              <span>Needs attention</span><strong>${needsAction.length}</strong><small>New and assigned requests</small>
            </article>
            <article class="service-dashboard-metric service-dashboard-metric-progress">
              <span>In progress</span><strong>${inProgress.length}</strong><small>Requests being handled</small>
            </article>
            <article class="service-dashboard-metric service-dashboard-metric-hold">
              <span>On hold</span><strong>${onHold.length}</strong><small>Waiting for follow-up</small>
            </article>
          </div>
          <section class="service-dashboard-work" aria-labelledby="service-dashboard-work-title">
            <div class="service-dashboard-section-heading">
              <div><span class="service-dashboard-eyebrow-dark">YOUR TEAM</span><h3 id="service-dashboard-work-title">Active guest requests</h3></div>
              <span class="service-dashboard-live${liveFallback ? ' service-dashboard-live-fallback' : ''}"${liveFallback ? ' title="Live connection unavailable — refreshing on fallback"' : ''}><i class="bi bi-circle-fill" aria-hidden="true"></i> ${requests.length} active</span>
            </div>
            ${requestRows || '<div class="service-dashboard-empty"><i class="bi bi-check2-circle" aria-hidden="true"></i><div><strong>All caught up</strong><span>There are no active guest service requests right now.</span></div></div>'}
            ${hasQueue
              ? `<div class="service-dashboard-footer"><span>Full history is available in the service queue.</span><button type="button" class="btn btn-link p-0" id="service-dashboard-view-all">View all requests <i class="bi bi-arrow-right" aria-hidden="true"></i></button></div>`
              : `<div class="service-dashboard-footer"><span>Showing all ${requests.length} active guest request${requests.length === 1 ? '' : 's'}.</span></div>`}
          </section>
        </section>`;

      const openQueue = () => window.HotelBilling?.open('service-requests');
      $('service-dashboard-refresh')?.addEventListener('click', () => renderServiceDashboard(true));
      $('service-dashboard-open-queue')?.addEventListener('click', openQueue);
      $('service-dashboard-view-all')?.addEventListener('click', openQueue);
      host.querySelector('.service-dashboard')?.addEventListener('click', onServiceDashboardAction);
      serviceDashboardLastRender = Date.now();
    } catch (error) {
      host.innerHTML = `
        <section class="service-dashboard-error" role="alert">
          <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
          <div><strong>Guest service queue unavailable</strong><p>${esc(error.message || 'The request list could not be loaded. Check your connection and try again.')}</p></div>
          <button type="button" class="btn btn-outline-danger btn-sm" id="service-dashboard-retry">Try again</button>
        </section>`;
      $('service-dashboard-retry')?.addEventListener('click', () => renderServiceDashboard(true));
    }
  }

  async function render(id) {

    const roleKey = (window.HotelAuth?.getUser()?.role || '').toLowerCase().replace(/[&\s_-]/g, '');
    const isFoodServiceRole = ['bar', 'bartender', 'minibar', 'restaurant', 'foodbeverage', 'food'].includes(roleKey);
    if (isFoodServiceRole && ['dashboard', 'catalog'].includes(id) && window.HotelRestaurantDashboard?.render) {
      const targetId = id === 'catalog' ? 'catalog-content' : 'dashboard-content';
      await window.HotelRestaurantDashboard.render(targetId, id === 'catalog' ? 'menu' : 'orders');
      return;
    }

    if (id==='checkout-history') {

      await renderCheckoutHistory();

    } else if (id==='dashboard') {

      const curUserRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();
      const roleKey = curUserRole.replace(/[\s_-]/g,'');
      if (['service', 'housekeeping', 'laundry', 'maintenance', 'valet', 'parking', 'parkingvalet', 'other', 'concierge'].includes(roleKey)) {
        await renderServiceDashboard();
        return;
      }

      const d=await api('dashboard',{},'GET'); const counts=d.rooms||{}; await refreshRequestBadge();

      const isCashier = (roleKey === 'cashier');

      const isManager = (roleKey === 'manager');

      const isAdmin = (roleKey === 'admin');

      const isFrontdesk = (roleKey === 'frontdesk');

      const canViewFinancialSummary=['admin','manager','cashier'].includes(roleKey);

      // RBAC: dashboard blocks follow the user's actual permissions (which

      // reflect Staff Accounts role-permission overrides), not just the role

      // name. When the permission list is unavailable, fall back to the

      // role defaults above.

      const userPerms = new Set(window.HotelAuth.getUser()?.permissions || []);

      const canPerm = p => userPerms.size ? (userPerms.has('*') || userPerms.has(p)) : null;

      const canFinancial = canPerm('payments.process') ?? canViewFinancialSummary;
      const canProcessPayments = canPerm('payments.process') ?? ['admin','manager','cashier'].includes(roleKey);
      const canViewStays = canPerm('stays.view') ?? ['admin','manager','cashier','frontdesk'].includes(roleKey);

      const canCheckin = canPerm('stays.checkin') ?? (isFrontdesk || isManager || isAdmin);

      const canRequests = canPerm('service_requests.view') ?? true;

      const canReports = canPerm('reports.financial.view') ?? canViewFinancialSummary;

      const deptLabels = {restaurant:'Restaurant',bar:'Bar',housekeeping:'Housekeeping',laundry:'Laundry',maintenance:'Maintenance',valet:'Valet & Parking',parking:'Valet & Parking',parkingvalet:'Valet & Parking',service:'Service',foodbeverage:'Food & Beverage',minibar:'Minibar',other:'Service'};

      const statCard = (x)=>`<div class="col-6 col-md-4 col-xxl-3"><div class="card border-0 shadow-sm h-100 dashboard-stat"><div class="card-body p-2 p-sm-3 d-flex align-items-center gap-2 gap-sm-3"><div class="dashboard-stat-icon text-${x[2]}"><i class="bi bi-${x[3]}"></i></div><div class="min-w-0 flex-grow-1"><div class="text-muted small text-truncate dashboard-stat-label">${x[0]}</div><div class="dashboard-stat-value text-${x[2]} ${String(x[1]).includes('₱')?'is-currency':''}" title="${esc(String(x[1]))}">${x[1]}</div></div></div></div></div>`;

      const statsRow = (stats)=>`<div class="row g-2 g-sm-3 mb-4">${stats.map(statCard).join('')}</div>`;
      const cashierMetric = (label, value, icon, tone, note = '') => `
        <div class="col-6 col-xl-3">
          <div class="cashier-overview-metric cashier-overview-metric-${tone}">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <span class="cashier-overview-label">${label}</span>
              <i class="bi bi-${icon}" aria-hidden="true"></i>
            </div>
            <strong>${value}</strong>
            ${note ? `<span class="cashier-overview-note">${note}</span>` : ''}
          </div>
        </div>`;

      const moduleBtn = (module,label,icon,cls='btn-outline-secondary')=>{

        if (window.HotelModulesHelper && !window.HotelModulesHelper.isAllowed(curUserRole,module)) return '';

        return `<button class="btn ${cls} btn-sm" onclick="HotelBilling.open('${module}')"><i class="bi bi-${icon} me-1"></i>${label}</button>`;

      };



      if (['restaurant', 'foodbeverage', 'food', 'bar', 'bartender'].includes(roleKey)) {

        if (window.HotelRestaurantDashboard?.render) {

          await window.HotelRestaurantDashboard.render();

          return;

        }

        for (let i = 0; i < 10; i++) {

          await new Promise(r => setTimeout(r, 100));

          if (window.HotelRestaurantDashboard?.render) {

            await window.HotelRestaurantDashboard.render();

            return;

          }

        }

        notify('Restaurant module is loading...', false);

      }



      // Department dashboards (restaurant, bar, housekeeping, laundry, maintenance, valet, service):

      // queue-focused home fed by the department block of the dashboard API.

      if (d.department) {

        const dep=d.department;

        const deptName=deptLabels[roleKey]||'Department';

        const stats=[

          ['New requests',dep.queue_new||0,(dep.queue_new||0)?'danger':'success','bell'],

          ['In progress',dep.queue_active||0,'primary','hourglass-split'],

          ['Completed today',dep.completed_today||0,'success','check2-circle']

        ];

        const isFoodOrBar = ['restaurant', 'food_beverage', 'bar', 'minibar'].includes(roleKey);

        let roomsCard='';

        if (Array.isArray(dep.rooms_attention) && !isFoodOrBar) {

          const rowsHtml=dep.rooms_attention.map(r=>`<tr><td class="fw-semibold">${esc(r.room_number)}</td><td>${esc(r.type||'')}</td><td><span class="badge ${r.status==='CLEANING'?'text-bg-warning text-dark':'text-bg-secondary'}">${esc(r.status)}</span></td></tr>`).join('');

          const roomWorkLabel = roleKey === 'maintenance' ? 'Rooms under maintenance' : 'Rooms needing cleaning';
          roomsCard=`<div class="card border-0 shadow-sm mb-3"><div class="card-body"><h6 class="fw-bold mb-3"><i class="bi bi-door-open me-2"></i>${roomWorkLabel}</h6>${dep.rooms_attention.length?`<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Room</th><th>Type</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`:`<div class="text-muted small">No rooms currently need ${roleKey === 'maintenance' ? 'maintenance' : 'cleaning'}.</div>`}</div></div>`;

        }

        const catalogBtnLabel = roleKey.includes('bar') ? "Bar Drinks Menu" : "Food & Drink Menu";

        const catalogBtnIcon = roleKey.includes('bar') ? "cup-straw" : "cup-hot";



        const actions=[

          isFoodOrBar ? `<button class="btn btn-success fw-semibold" onclick="HotelDeptManager.openCreateOrderModal('${roleKey.includes('bar') ? 'bar' : roleKey}')"><i class="bi bi-cart-plus me-1"></i>Take New Order</button>` : null,

          moduleBtn("service-requests", `${deptName} Queue`, "bell", "btn-primary"),

          isFoodOrBar ? moduleBtn("catalog", catalogBtnLabel, catalogBtnIcon, "btn-outline-dark") : null,

          roleKey === 'maintenance'
            ? moduleBtn("dept-inventory", "Parts & Supplies", "boxes", "btn-outline-secondary")
            : roleKey !== 'service' ? moduleBtn("dept-inventory", "Inventory & Stocks", "boxes", "btn-outline-secondary") : null,

          !['service', 'maintenance'].includes(roleKey) ? moduleBtn("dept-reports", "Reports & Analytics", "graph-up-arrow", "btn-outline-primary") : null,

          isFoodOrBar ? `<button class="btn btn-outline-secondary fw-semibold" onclick="HotelDeptManager.openAddCategoryModal('${roleKey.includes('bar') ? 'bar' : 'restaurant'}')"><i class="bi bi-tag me-1"></i>+ Category</button>` : null,

          isFoodOrBar ? `<button class="btn btn-outline-secondary fw-semibold" onclick="HotelDeptManager.openAddProductModal('${roleKey.includes('bar') ? 'bar' : 'restaurant'}')"><i class="bi bi-plus-circle me-1"></i>+ Menu Item</button>` : null,

          !isFoodOrBar && roleKey !== 'service'
            ? moduleBtn("rooms", roleKey === 'maintenance' ? "Room Status Board" : "Room Board", "door-open")
            : null

        ].filter(Boolean).join("");

        $('dashboard-content').innerHTML=statsRow(stats)+roomsCard+`<div class="d-flex flex-wrap gap-2 mb-3">${actions}</div>`;

        return;

      }



      let stats;

      if (isCashier) {

        stats = canFinancial ? [

          ['Active stays', d.active_stays||0, 'dark', 'people'],

          ['Open balance', php(d.open_balance), 'danger', 'wallet2'],

          ["Today's collections", php(d.today_collections), 'success', 'cash-coin'],

          ['Occupied rooms', counts.OCCUPIED||0, 'primary', 'building'],

          ['Reserved rooms', counts.RESERVED||0, 'info', 'bookmark']

        ] : [

          ['Active stays', d.active_stays||0, 'dark', 'people'],

          ['Occupied rooms', counts.OCCUPIED||0, 'primary', 'building'],

          ['Reserved rooms', counts.RESERVED||0, 'info', 'bookmark'],

          ['Available rooms', counts.AVAILABLE||0, 'success', 'door-open'],

          ['Cleaning', counts.CLEANING||0, 'warning', 'stars']

        ];

        if (d.billing_summary && canFinancial) {

          stats.push(['Payments today', d.billing_summary.payments_today||0, 'info', 'receipt']);

          stats.push(['Folios with balance', d.billing_summary.unpaid_folio_count||0, 'warning', 'journal-text']);

          if (d.billing_summary.checkin_payments_pending) stats.push(['Check-ins for payment', d.billing_summary.checkin_payments_pending, 'danger', 'hourglass-split']);

        }

      } else {

        stats=[['Available rooms',counts.AVAILABLE||0,'success','door-open'],['Occupied rooms',counts.OCCUPIED||0,'primary','building'],['Reserved rooms',counts.RESERVED||0,'info','bookmark'],['Cleaning',counts.CLEANING||0,'warning','stars'],['Maintenance',counts.MAINTENANCE||0,'secondary','tools'],['Active stays',d.active_stays||0,'dark','people'],['Open balance',php(d.open_balance),'danger','wallet2'],['Open requests',d.pending_requests||0,(d.pending_requests||0)?'danger':'success','bell'],["Today's collections",php(d.today_collections),'success','cash-coin']];

        if (!canFinancial) stats = stats.filter(([label])=>!['Open balance',"Today's collections"].includes(label));

        if (!canRequests || isFrontdesk) stats = stats.filter(([label])=>label!=='Open requests');

        if (d.frontdesk && canCheckin) {

          stats.push(['Check-ins today', d.frontdesk.checkins_today||0, 'info', 'person-plus']);

          stats.push(['Departures due today', d.frontdesk.departures_today||0, 'warning', 'box-arrow-right']);

          stats.push(['Check-outs today', d.frontdesk.checkouts_today||0, 'success', 'clipboard-check']);

          if (d.frontdesk.pending_payments) stats.push(['Pending payments', d.frontdesk.pending_payments, 'danger', 'hourglass-split']);

          if (d.frontdesk.payments_to_confirm) stats.push(['Payments to confirm', d.frontdesk.payments_to_confirm, 'info', 'patch-check']);

        }

        if (d.approvals) {

          stats.push(['Pending approvals', d.approvals.total||0, (d.approvals.total||0)?'danger':'success', 'check2-square']);

        }

        if (d.admin) {

          stats.push(['Occupancy rate', `${d.occupancy_rate||0}%`, 'primary', 'pie-chart']);

          stats.push(['Staff accounts', `${d.admin.staff_active||0} active`, 'dark', 'people-fill']);

          stats.push(['Audit entries today', d.admin.audit_today||0, 'secondary', 'shield-check']);

        }

      }



      // Approvals inbox: shown to whoever actually holds an approval

      // permission (the API only returns the block in that case).

      let approvalsCard='';

      if (d.approvals) {

        const a=d.approvals;

        const approvalRow=(label,count,module,icon)=>`<div class="d-flex align-items-center justify-content-between gap-3 py-2 border-bottom"><div><i class="bi bi-${icon} me-2"></i>${label}</div><div class="d-flex align-items-center gap-2"><span class="badge ${count?'text-bg-warning text-dark':'text-bg-light text-muted'}">${count||0} pending</span>${count?moduleBtn(module,'Review',icon,'btn-outline-primary'):''}</div></div>`;

        const rowsHtml=[

          ('discounts' in a && (window.HotelAuth.getUser()?.role || '').toLowerCase() !== 'manager') ? approvalRow('Discount approvals', a.discounts, 'discount-approvals', 'percent') : '',

          ('early_checkouts' in a) ? approvalRow('Early checkout approvals', a.early_checkouts, 'early-checkouts', 'clock-history') : '',
          ('stay_extensions' in a) ? approvalRow('Stay extension approvals', a.stay_extensions, 'early-checkouts', 'calendar-plus') : '',

        ].join('');

        approvalsCard=`<div class="card border-0 shadow-sm mb-3"><div class="card-body"><h6 class="fw-bold mb-1"><i class="bi bi-check2-square me-2"></i>Approvals inbox</h6><div class="text-muted small mb-2">${a.total||0} item(s) waiting for a decision</div>${rowsHtml}</div></div>`;

      }

      const managerTransferCount = Number(d.room_transfer_approvals || 0);
      const managerTransferApprovalCard = isManager ? `
        <div class="card border-primary border-start border-4 shadow-sm mb-3">
          <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h6 class="fw-bold mb-1"><i class="bi bi-arrow-left-right me-2"></i>Room Transfer Approvals</h6>
              <div class="small text-muted">Review guest requests and approve transfers to available rooms.</div>
            </div>
            <div class="d-flex align-items-center gap-3">
              <span class="badge ${managerTransferCount ? 'text-bg-warning text-dark' : 'text-bg-light border text-muted'}">${managerTransferCount} pending</span>
              <button class="btn btn-sm btn-primary" onclick="HotelBilling.open('service-requests')"><i class="bi bi-list-check me-1"></i>Review requests</button>
            </div>
          </div>
        </div>` : '';

      let managerRoomChart = '';
      if (isManager) {
        const roomSlices = [
          ['Occupied', Number(counts.OCCUPIED || 0), '#2563eb'],
          ['Reserved', Number(counts.RESERVED || 0), '#7c3aed'],
          ['Available', Number(counts.AVAILABLE || 0), '#16a34a'],
          ['Cleaning', Number(counts.CLEANING || 0), '#eab308'],
          ['Maintenance', Number(counts.MAINTENANCE || 0), '#64748b'],
        ];
        const roomCount = roomSlices.reduce((sum, [, count]) => sum + count, 0);
        const circumference = 2 * Math.PI * 48;
        let consumed = 0;
        const arcs = roomCount
          ? roomSlices.map(([, count, color]) => {
              const length = circumference * count / roomCount;
              const arc = `<circle cx="60" cy="60" r="48" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-consumed}" transform="rotate(-90 60 60)"/>`;
              consumed += length;
              return arc;
            }).join('')
          : `<circle cx="60" cy="60" r="48" fill="none" stroke="#e2e8f0" stroke-width="14"/>`;
        const occupancy = roomCount ? Math.round((Number(counts.OCCUPIED || 0) / roomCount) * 100) : 0;
        managerRoomChart = `
          <section class="card border-0 shadow-sm mb-3" aria-labelledby="manager-room-analytics-title">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
                <div><h6 id="manager-room-analytics-title" class="fw-bold mb-1"><i class="bi bi-pie-chart me-2"></i>Room Occupancy Analytics</h6><div class="small text-muted">Current inventory distribution</div></div>
                <span class="badge text-bg-primary">${occupancy}% occupied</span>
              </div>
              <div class="d-flex align-items-center gap-4 flex-wrap">
                <svg viewBox="0 0 120 120" width="144" height="144" role="img" aria-label="${occupancy}% occupancy, ${counts.OCCUPIED || 0} of ${roomCount} rooms occupied">
                  ${arcs}
                  <text x="60" y="57" text-anchor="middle" font-size="21" font-weight="700" fill="#0f172a">${counts.OCCUPIED || 0}</text>
                  <text x="60" y="75" text-anchor="middle" font-size="10" fill="#64748b">of ${roomCount} rooms</text>
                </svg>
                <div class="d-flex flex-column gap-2">
                  ${roomSlices.map(([label, count, color]) => `<div class="d-flex align-items-center gap-2 small"><span aria-hidden="true" style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block"></span><span class="text-muted">${label}</span><strong>${count}</strong></div>`).join('')}
                </div>
              </div>
            </div>
          </section>`;
      }



      // Cashier check-in payment approvals queue card

      let checkinPaymentsCard = '';
      const canApproveCheckinPayments = isCashier && canProcessPayments;
      if ((canApproveCheckinPayments || (!isCashier && canFinancial)) && canViewStays) {

        let cpList = [];
        try {
          const cpd = await api('checkin_payments', {}, 'GET');
          cpList = (cpd.checkin_payments || []).filter(x => x.status === 'FOR_PAYMENT');
        } catch (err) {
          notify(`Could not load check-in payment queue: ${err.message}`, true);
        }
        const cpGroups = groupPendingCheckinPayments(cpList);

        if (cpGroups.length > 0) {

          checkinPaymentsCard = `

            <div class="card border-0 shadow-sm mb-4 border-start border-4 border-warning">

              <div class="card-header bg-warning-subtle py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">

                <div class="d-flex align-items-center gap-2">

                  <span class="spinner-grow spinner-grow-sm text-warning" role="status"></span>

                  <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-bell-fill text-warning me-2"></i>Front Desk Check-in Payments · Awaiting Cashier Approval (${cpGroups.length})</h6>

                </div>

                <span class="badge text-bg-warning text-dark fw-bold px-3 py-1">Guest at Counter · Payment Required</span>

              </div>

              <div class="card-body p-0">

                <div class="table-responsive">

                  <table class="table table-hover align-middle mb-0">

                    <thead class="table-light">

                      <tr>

                        <th>Stay / Guest</th>

                        <th>Room &amp; Duration</th>

                        <th>Total Billing</th>

                        <th>Discount</th>

                        <th>Net Bill</th>

                        <th>Due at Check-in</th>

                        <th>Pass to Balance</th>

                        ${canApproveCheckinPayments ? '<th class="text-end pe-3">Action</th>' : ''}

                      </tr>

                    </thead>

                    <tbody>

                      ${cpGroups.map(group => {
                        if (group.group_booking_id) {
                          const groupGross = group.payments.reduce((sum, row) => sum + Number(row.gross_amount || row.total_amount || 0), 0);
                          const groupDiscount = group.payments.reduce((sum, row) => sum + Number(row.discount_amount || 0), 0);
                          const groupNet = group.payments.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
                          const groupRequired = group.payments.reduce((sum, row) => sum + Number(row.required_amount || 0), 0);
                          const roomList = group.payments.map(row => `Room ${esc(row.room_number)}`).join(', ');
                          return `<tr>
                            <td><strong>${esc(group.group_code || `Group ${group.group_booking_id}`)}</strong><div class="fw-semibold text-primary">${esc(group.payments[0].guest_name || 'Group Guest')}</div><div class="small text-muted">${group.payments.length} separate folios; one group payment</div></td>
                            <td><strong>${roomList}</strong><div class="small text-muted">${group.payments.map(row => Number(row.nights || row.payment_nights || 1)).join(', ')} night(s)</div></td>
                            <td><div class="fw-bold">${php(groupGross)}</div></td>
                            <td>${groupDiscount > 0 ? `<span class="badge text-bg-success">− ${php(groupDiscount)}</span>` : '<span class="text-muted small">None (₱0.00)</span>'}</td>
                            <td><div class="fw-bold">${php(groupNet)}</div></td>
                            <td><div class="fw-bold text-success">${php(groupRequired)}</div><span class="small text-muted">Combined room requirements</span></td>
                            <td><span class="text-muted small">Calculated per room policy</span></td>
                            ${canApproveCheckinPayments ? `<td class="text-end pe-3"><button class="btn btn-sm btn-success fw-bold shadow-sm px-3 py-2" onclick="HotelBilling.approveGroupCheckinPayment(${group.group_booking_id})"><i class="bi bi-cash-stack me-1"></i>Receive Group Payment</button></td>` : ''}
                          </tr>`;
                        }
                        const cp = group.payments[0];
                        const cpNights = Number(cp.nights || cp.payment_nights || 1);
                        const is5Days = cpNights >= 5;
                        const grossAmt = Number(cp.gross_amount) > 0 ? Number(cp.gross_amount) : (Number(cp.total_amount) + Number(cp.discount_amount || 0));
                        const discAmt = Number(cp.discount_amount || 0);
                        const balAmt = is5Days ? (Number(cp.balance_amount) || Math.max(0, Number(cp.total_amount) - Number(cp.required_amount))) : 0;
                        return `

                        <tr>

                          <td>

                            <strong>${esc(cp.stay_code)}</strong>

                            <div class="small text-muted">Folio ${esc(cp.folio_number)}</div>

                            <div class="fw-semibold text-primary" style="font-size:13px;">

                              <i class="bi bi-person-fill me-1"></i>${esc(cp.guest_name || 'Walk-in Guest')}

                            </div>

                            ${cp.contact_number ? `<div class="small text-muted"><i class="bi bi-telephone me-1"></i>${esc(cp.contact_number)}</div>` : ''}

                          </td>

                          <td>

                            <strong class="fs-6">Room ${esc(cp.room_number)}</strong>

                            <div class="small text-muted">${cpNights} night(s)</div>

                            <span class="badge ${is5Days ? 'text-bg-warning text-dark' : 'text-bg-light border text-muted'}" style="font-size:10px;">

                              ${is5Days ? '5+ Days Stay' : 'Short Stay'}

                            </span>

                          </td>

                          <td>

                            <div class="fw-bold text-dark">${php(grossAmt)}</div>

                          </td>

                          <td>

                            ${discAmt > 0 ? `<span class="badge text-bg-success">-${php(discAmt)}</span><div class="small text-muted" style="font-size:11px;">${esc(cp.discount_reason || 'Check-in Discount')}</div>` : '<span class="text-muted small">None (₱0.00)</span>'}

                          </td>

                          <td>

                            <div class="fw-bold text-dark">${php(cp.total_amount)}</div>

                          </td>

                          <td>

                            <div class="fw-bold text-success fs-6">${php(cp.required_amount)}</div>

                            <span class="badge ${is5Days ? 'text-bg-warning text-dark' : 'text-bg-primary'}" style="font-size:10px;">

                              ${is5Days ? '60% Downpayment' : '100% Full Payment'}

                            </span>

                          </td>

                          <td>

                            ${is5Days ? `<strong class="text-danger fs-6">${php(balAmt)}</strong><div class="badge bg-danger-subtle text-danger" style="font-size:10px;">Passes to Folio</div>` : '<span class="text-muted small">₱0.00 (Settled)</span>'}

                          </td>

                          ${canApproveCheckinPayments ? `<td class="text-end pe-3"><button class="btn btn-sm btn-success fw-bold shadow-sm px-3 py-2" onclick="HotelBilling.approveCheckinPayment(${cp.id || cp.checkin_payment_id})"><i class="bi bi-cash-stack me-1"></i>Receive &amp; Approve</button></td>` : ''}

                        </tr>

                      `;}).join('')}

                    </tbody>

                  </table>

                </div>

              </div>

            </div>

          `;

        } else if (canApproveCheckinPayments) {

          checkinPaymentsCard = `

            <div class="card border-0 shadow-sm mb-3 bg-white">

              <div class="card-body py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">

                <div class="d-flex align-items-center gap-3">

                  <div class="dashboard-stat-icon text-success" style="background:#f0fdf4;">

                    <i class="bi bi-shield-check fs-5"></i>

                  </div>

                  <div>

                    <h6 class="fw-bold mb-0 text-dark">Check-in Payment Approvals Queue is Clear</h6>

                    <div class="small text-muted">When Front Desk saves a walk-in check-in, the payment approval request will appear here immediately in real time.</div>

                  </div>

                </div>

              </div>

            </div>

          `;

        }

      }



      // Cashier billing detail: collections by method + folios still carrying a balance.

      let billingCard='';

      if (isCashier && d.billing_summary && canFinancial) {

        const b=d.billing_summary;

        const methodRows=(b.collections_by_method||[]).map(m=>`<tr><td class="fw-semibold">${esc(m.method)}</td><td class="text-end">${m.payments_count}</td><td class="text-end">${php(m.total)}</td></tr>`).join('');

        const unpaidRows=(b.unpaid_folios||[]).map(f=>`<tr><td class="fw-semibold">${esc(f.folio_number)}<div class="small text-muted">Room ${esc(f.room_number)} · ${esc(f.stay_code)}</div></td><td class="text-end fw-semibold">${php(f.balance)}</td></tr>`).join('');

        billingCard=`<div class="row g-3 mb-3"><div class="col-lg-6"><div class="card border-0 shadow-sm h-100"><div class="card-body"><h6 class="fw-bold mb-3"><i class="bi bi-cash-coin me-2"></i>Today's collections by method</h6>${methodRows?`<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Method</th><th class="text-end">Payments</th><th class="text-end">Total</th></tr></thead><tbody>${methodRows}</tbody></table></div>`:'<div class="text-muted small">No payments collected yet today.</div>'}</div></div></div><div class="col-lg-6"><div class="card border-0 shadow-sm h-100"><div class="card-body"><h6 class="fw-bold mb-3"><i class="bi bi-journal-text me-2"></i>Folios with balance</h6>${unpaidRows?`<div class="table-responsive"><table class="table table-sm align-middle mb-0"><tbody>${unpaidRows}</tbody></table></div><div class="text-muted small mt-2">${b.unpaid_folio_count||0} open folio(s) with balance</div>`:'<div class="text-muted small">All open folios are settled.</div>'}</div></div></div></div>`;

      }



      let quickActions;

      if (isCashier) {

        quickActions = `

          <button class="btn btn-primary btn-sm" onclick="HotelBilling.open('payments')"><i class="bi bi-cash-coin me-1"></i>Open Cashier Payment Desk</button>

        `;

      } else {

        const moduleAllowed = mid => !window.HotelModulesHelper || window.HotelModulesHelper.isAllowed(curUserRole, mid);

        const reportsShortcut = (canReports && moduleAllowed('reports')) ? `<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('reports')"><i class="bi bi-bar-chart me-1"></i>Reports</button>` : '';

        const walkinBtn = (canCheckin && !isFrontdesk)

          ? `<button class="btn btn-primary btn-sm" onclick="HotelBilling.checkin()"><i class="bi bi-person-plus me-1"></i>Walk-in Check-in</button>`

          : '';

        const roomBoardBtn = (moduleAllowed('rooms') && !isFrontdesk)

          ? `<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('rooms')"><i class="bi bi-door-open me-1"></i>Room Board</button>`

          : '';

        const staysBtn = (moduleAllowed('active-stays') && !isFrontdesk)

          ? `<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('active-stays')"><i class="bi bi-people me-1"></i>Active Stays</button>`

          : '';

        const guestLinksBtn = moduleAllowed('active-stays')

          ? `<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.savedGuestLinks()"><i class="bi bi-qr-code me-1"></i>Guest Links</button>`

          : '';

        const earlyCheckoutBtn = (isAdmin || isManager)

          ? `<button class="btn btn-outline-warning btn-sm text-dark fw-semibold" onclick="HotelBilling.earlyCheckout()"><i class="bi bi-clock-history me-1 text-warning"></i>Early Checkout</button>`

          : '';

        quickActions = `

          ${walkinBtn}

          ${staysBtn}

          ${roomBoardBtn}

          ${earlyCheckoutBtn}

          ${guestLinksBtn}

          ${reportsShortcut}

        `;

      }



      // Frontdesk dashboard: guest requests banner is removed per RBAC requirements.
      const requestBanner = '';



      let fdNoticeCard = '';
      if (isFrontdesk && d.frontdesk) {
        const pPay = Number(d.frontdesk.pending_payments || 0);
        const pConf = Number(d.frontdesk.payments_to_confirm || 0);
        if (pPay > 0 || pConf > 0) {
          fdNoticeCard = `
            <div class="row g-2 mb-3">
              ${pPay > 0 ? `
                <div class="col-md-6">
                  <div class="card border-warning shadow-sm h-100 bg-warning-subtle">
                    <div class="card-body p-3 d-flex justify-content-between align-items-center">
                      <div>
                        <strong class="text-dark"><i class="bi bi-hourglass-split me-1 text-warning"></i>Check-in Payments at Cashier (${pPay})</strong>
                        <div class="small text-muted">Awaiting Cashier payment approval</div>
                      </div>
                      <button class="btn btn-sm btn-warning text-dark fw-bold" onclick="HotelBilling.open('active-stays')">View Queue</button>
                    </div>
                  </div>
                </div>
              ` : ''}
              ${pConf > 0 ? `
                <div class="col-md-6">
                  <div class="card border-info shadow-sm h-100 bg-info-subtle">
                    <div class="card-body p-3 d-flex justify-content-between align-items-center">
                      <div>
                        <strong class="text-dark"><i class="bi bi-patch-check me-1 text-info"></i>Approved Payments to Confirm (${pConf})</strong>
                        <div class="small text-muted">Cashier approved; click to acknowledge</div>
                      </div>
                      <button class="btn btn-sm btn-success fw-bold" onclick="HotelBilling.open('active-stays')">Confirm Now</button>
                    </div>
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }
      }

      if (isCashier) {
        const summary = d.billing_summary || {};
        const waitingCheckins = Number(summary.checkin_payments_pending || 0);
        const openBalances = Number(summary.unpaid_folio_count || 0);
        $('dashboard-content').innerHTML = `
          <section class="cashier-overview">
            <header class="cashier-overview-header">
              <div>
                <span class="cashier-overview-eyebrow">SHESH DEV HOTEL · FRONT OF HOUSE FINANCE</span>
                <h2>Cashier station</h2>
                <p>Review incoming check-in payments, collect open folio balances, and issue receipts.</p>
              </div>
              <button class="btn cashier-overview-primary" onclick="HotelBilling.open('payments')">
                <i class="bi bi-arrow-up-right-circle me-2"></i>Open payment desk
              </button>
            </header>
            <div class="row g-2 g-lg-3 cashier-overview-metrics">
              ${cashierMetric('Active folios', d.active_stays || 0, 'journal-text', 'slate', 'Current in-house guests')}
              ${cashierMetric('Balances to collect', php(d.open_balance || 0), 'wallet2', 'amber', `${openBalances} folio(s) with a balance`)}
              ${cashierMetric('Collected today', php(d.today_collections || 0), 'cash-coin', 'green', `${Number(summary.payments_today || 0)} payment(s) posted`)}
              ${cashierMetric('Check-in queue', waitingCheckins, 'hourglass-split', 'blue', waitingCheckins ? 'Waiting for cashier approval' : 'No check-ins waiting')}
            </div>
            <div class="cashier-overview-work">
              <div class="cashier-overview-section-heading">
                <div><span class="cashier-overview-eyebrow">NEXT ACTION</span><h3>Payment work queue</h3></div>
                <span class="cashier-overview-live"><i class="bi bi-circle-fill me-1"></i>Live folio data</span>
              </div>
              ${checkinPaymentsCard || `<div class="cashier-overview-empty"><i class="bi bi-check2-circle"></i><div><strong>Check-in queue is clear</strong><span>Open the payment desk to find an active folio or review receipts.</span></div></div>`}
              <div class="cashier-overview-footer">
                <span>Checkout and room release are handled by Front Desk.</span>
              </div>
            </div>
          </section>`;
        return;
      }

      // Frontdesk dashboard: Next checkouts card, directly under the stat cards.
      // Same gate as the frontdesk stat cards (frontdesk block + check-in
      // permission). Renders its empty state when the list is empty.
      const nextCheckoutsCard = (() => {
        if (!d.frontdesk || !canCheckin) return '';
        const fmtCheckoutAt = (v) => {
          const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
          if (!m) return esc(String(v || ''));
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
          let h = Number(m[4]); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
          return `${days[dt.getDay()]}, ${months[Number(m[2]) - 1]} ${Number(m[3])} \u00b7 ${h}:${m[5]} ${ap}`;
        };
        const badgeFor = (row) => {
          if (row.is_early_departure || row.label === 'Early departure') return '<span class="badge text-bg-info">Early departure</span>';
          if (row.label === 'Overdue') return '<span class="badge text-bg-danger">Overdue</span>';
          if (row.label === 'Today') return '<span class="badge text-bg-warning text-dark">Today</span>';
          return `<span class="badge text-bg-light border text-muted">${esc(row.label)}</span>`;
        };
        const ncRows = (d.frontdesk.next_checkouts || []);
        const ncCanCheckout = ['admin', 'frontdesk'].includes(roleKey);
        const ncBody = ncRows.length ? ncRows.map((row, i) => `
          <div class="d-flex justify-content-between align-items-center gap-2 py-2${i === ncRows.length - 1 ? '' : ' border-bottom'}">
            <div class="min-w-0">
              <div class="fw-bold text-truncate">${esc(row.guest_name || 'Guest')}</div>
              <div class="small text-muted">Room ${esc(row.room_number)} \u00b7 Folio ${esc(row.folio_number)}</div>
            </div>
            <div class="text-end flex-shrink-0">
              <div class="small fw-semibold">${fmtCheckoutAt(row.checkout_at)}</div>
              <div>${badgeFor(row)}</div>
            </div>
            ${ncCanCheckout ? `<button class="btn btn-sm btn-outline-success flex-shrink-0" onclick="HotelBilling.checkout(${Number(row.stay_id)})"><i class="bi bi-box-arrow-right me-1"></i>Checkout</button>` : ''}
          </div>`).join('') : '<div class="text-muted py-2">No upcoming checkouts.</div>';
        return `
          <div class="card border-0 shadow-sm mb-4">
            <div class="card-header bg-white py-3">
              <h6 class="fw-bold mb-0"><i class="bi bi-box-arrow-right me-2 text-primary"></i>Next checkouts</h6>
              <div class="small text-muted">Soonest first \u00b7 checkout at 12:00 PM unless noted</div>
            </div>
            <div class="card-body py-1 px-3">${ncBody}</div>
          </div>`;
      })();

      $('dashboard-content').innerHTML=statsRow(stats)+nextCheckoutsCard+managerRoomChart+managerTransferApprovalCard+checkinPaymentsCard+approvalsCard+billingCard+fdNoticeCard+requestBanner+`<div class="d-flex flex-wrap gap-2 mb-3">${quickActions}</div><div class="alert alert-light border"><strong>Shesh Dev Hotel Billing &amp; Guest Management.</strong> Operations and role actions are strictly tailored to your role. All active dashboard buttons are fully functional.</div>`;

    } else if (id==='rooms') {

      const d=await api('rooms',{},'GET'); rooms=d.rooms||[];
      let calStays=[]; let calPending=[];
      try { const sd=await api('active_stays',{},'GET'); calStays=sd.stays||[]; } catch(_) {}
      try { const pd=await api('pending_checkins',{},'GET'); calPending=pd.stays||[]; } catch(_) {}

      const uRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const canManageRooms = ['admin','manager','frontdesk'].includes(uRole);

      const canAddRoom = ['admin','manager'].includes(uRole);

      // Front desk is view-only for room status (owner directive 2026-11-01):
      // they keep the board, Add Room Category and Check-in above, but never
      // see the Change status dropdown, so they can never hit Permission denied.
      // Housekeeping now gets the dropdown too: the backend already allowed
      // them via rooms.status, but the old UI hid it from them.
      const canChangeRoomStatus = ['admin','manager','housekeeping','maintenance'].includes(uRole);

      const isMaintenance = (uRole === 'maintenance');

      const topActions = canManageRooms

        ? `<div class="d-flex flex-wrap gap-2"><button class="btn btn-outline-primary btn-sm" onclick="HotelBilling.addRoomType()"><i class="bi bi-tag me-1"></i>Add Room Category</button>${canAddRoom ? '<button class="btn btn-primary btn-sm" onclick="HotelBilling.addRoom()"><i class="bi bi-plus-lg me-1"></i>Add Room</button>' : ''}${uRole !== 'cashier' ? '<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.checkin()"><i class="bi bi-person-plus me-1"></i>Check-in</button>' : ''}</div>`

        : isMaintenance

          ? `<div class="d-flex align-items-center gap-2"><span class="badge text-bg-warning py-2 px-3"><i class="bi bi-tools me-1"></i>Maintenance Monitor Mode</span></div>`

          : `<div class="d-flex align-items-center gap-2"><span class="badge text-bg-light border text-muted py-2 px-3"><i class="bi bi-eye me-1"></i>View Only Mode</span></div>`;



      const maintenanceBanner = isMaintenance

        ? `<div class="alert alert-info py-2 px-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2"><span class="fw-semibold"><i class="bi bi-tools me-2"></i>Maintenance Monitor Mode — Displaying current room inventory and maintenance statuses. You may update room status between Maintenance and Available. Management and billing controls remain restricted.</span><span class="badge text-bg-warning">${rooms.filter(r=>r.status==='MAINTENANCE').length} under maintenance</span></div>`

        : '';



      const boardHtml=`${maintenanceBanner}<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><p class="text-muted mb-0">Room status board · rates come from room types</p>${topActions}</div><div class="row g-2 g-md-3">${rooms.map(r=>`<div class="col-12 col-sm-6 col-md-4 col-xl-3"><div class="card border-0 shadow-sm h-100 ${r.status==='MAINTENANCE'?'border-warning':''}"><div class="card-body p-3"><div class="d-flex justify-content-between align-items-start"><h5 class="fw-bold mb-1">${esc(r.room_number)}</h5>${pill(r.status)}</div><div class="text-muted small">${esc(r.type)} · Floor ${r.floor_number}</div><div class="fw-semibold mt-2">${php(r.nightly_rate)} <span class="text-muted small">/ night · VAT-inclusive</span></div><div class="text-muted small">Capacity ${r.capacity}</div>${canAddRoom?`<button class="btn btn-sm btn-outline-primary mt-2" onclick="HotelBilling.editRoom(${r.id})">Edit room</button>`:''}${r.status!=='OCCUPIED' && r.status!=='RESERVED' && canChangeRoomStatus?`<div class="mt-3"><select class="form-select form-select-sm" onchange="HotelBilling.roomStatus(${r.id},this.value)"><option value="">Change status…</option><option value="AVAILABLE">Available</option><option value="CLEANING">Cleaning</option><option value="MAINTENANCE">Maintenance / Unavailable</option></select></div>`:''}</div></div></div>`).join('')}</div>`;
      const calFloors=[...new Set(rooms.map(r=>Number(r.floor_number)||0))].sort((a,b)=>a-b);
      const calOptions=calFloors.map(f=>`<optgroup label="Floor ${f}">${rooms.filter(r=>Number(r.floor_number)===f).map(r=>`<option value="${r.id}">Room ${esc(r.room_number)} · ${esc(r.type)}</option>`).join('')}</optgroup>`).join('');
      const calTabActive = roomsCalTab==='calendar';
      $('rooms-content').innerHTML=`
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button class="btn btn-sm ${calTabActive?'btn-outline-primary':'btn-primary'}" id="roomcal-tab-board"><i class="bi bi-grid me-1"></i>Board</button>
          <button class="btn btn-sm ${calTabActive?'btn-primary':'btn-outline-primary'}" id="roomcal-tab-calendar"><i class="bi bi-calendar3 me-1"></i>Calendar</button>
        </div>
        <div id="roomcal-board" style="display:${calTabActive?'none':'block'}">${boardHtml}</div>
        <div id="roomcal-calendar" style="display:${calTabActive?'block':'none'}">
          <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
            <select class="form-select form-select-sm" id="roomcal-room" style="width:auto;min-width:230px" aria-label="Choose room">${calOptions}</select>
            <button class="btn btn-sm btn-outline-secondary" id="roomcal-prev" aria-label="Previous month">&lt;</button>
            <span id="roomcal-title" class="fw-bold" style="min-width:160px;text-align:center"></span>
            <button class="btn btn-sm btn-outline-secondary" id="roomcal-next" aria-label="Next month">&gt;</button>
            <button class="btn btn-sm btn-outline-secondary" id="roomcal-today">Today</button>
          </div>
          <div class="text-muted small mb-2">Tap a coloured date for details.</div>
          <div id="roomcal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px"></div>
          <div class="text-muted small mt-2">Blue = occupied &nbsp;·&nbsp; Amber = checkout day, 12:00 PM &nbsp;·&nbsp; Purple = reserved, payment pending &nbsp;·&nbsp; Yellow = cleaning today &nbsp;·&nbsp; Grey = maintenance today &nbsp;·&nbsp; White = available. Today&apos;s room status is live; future dates are projected from active stays, not bookings.</div>
        </div>`;
      const _calNow=new Date();
      const calDateStr=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const calToday=calDateStr(_calNow.getFullYear(),_calNow.getMonth(),_calNow.getDate());
      const calState={roomId: rooms.length?String(rooms[0].id):'', year:_calNow.getFullYear(), month:_calNow.getMonth()};
      const calMonthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
      const calDayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const calPretty=(ds)=>{ const p=String(ds).split('-'); const dt=new Date(Number(p[0]),Number(p[1])-1,Number(p[2])); return `${calDayNames[dt.getDay()]}, ${calMonthNames[Number(p[1])-1]} ${Number(p[2])}, ${p[0]}`; };
      const calStayFor=(roomId)=>{
        const a=(calStays||[]).find(s=>String(s.room_id)===String(roomId));
        if(a) return {stay:a, kind:'ACTIVE'};
        const p=(calPending||[]).find(s=>String(s.room_id)===String(roomId));
        if(p) return {stay:p, kind:'PENDING'};
        return null;
      };
      const calStatusFor=(room, ds)=>{
        const found=calStayFor(room.id);
        if(found){
          const s=found.stay;
          const checkin=String(s.checkin_at||s.actual_checkin_at||'').slice(0,10);
          const checkout=String(s.planned_checkout||'').slice(0,10);
          if(checkout && ds===checkout) return {cls:'roomcal-out', label:'Checkout day', stay:s, kind:found.kind};
          if(checkin && ds>=checkin && (!checkout || ds<checkout)) return {cls: found.kind==='PENDING'?'roomcal-res':'roomcal-occ', label: found.kind==='PENDING'?'Reserved':'Occupied', stay:s, kind:found.kind};
          if(checkout && ds>checkout) return {cls:'roomcal-out', label:'Checkout overdue', stay:s, kind:found.kind};
        }
        if(ds===calToday){
          if(room.status==='CLEANING') return {cls:'roomcal-clean', label:'Cleaning'};
          if(room.status==='MAINTENANCE') return {cls:'roomcal-maint', label:'Maintenance'};
          if(room.status==='RESERVED') return {cls:'roomcal-res', label:'Reserved'};
          if(room.status==='OCCUPIED') return {cls:'roomcal-occ', label:'Occupied'};
        }
        return {cls:'', label:'Available'};
      };
      const openCalModal=(room, ds)=>{
        const st=calStatusFor(room, ds);
        let body=`<p class="mb-1"><strong>Status:</strong> ${esc(st.label)}</p>`;
        let actions='';
        if(st.stay){
          const s=st.stay;
          const guest=esc(s.guest_name || (Array.isArray(s.occupant_names) && s.occupant_names.length ? s.occupant_names.join(', ') : 'Guest'));
          body+=`<p class="mb-1"><strong>Guest:</strong> ${guest}</p><p class="mb-1"><strong>Folio:</strong> ${esc(s.folio_number||'—')}</p><p class="mb-1"><strong>Room type:</strong> ${esc(room.type||'')}</p>`;
          if(st.label==='Checkout day' || st.label==='Checkout overdue'){
            body+=`<p class="mb-1"><strong>Checkout due:</strong> ${st.label==='Checkout overdue' ? 'Overdue — was due ' : ''}${esc(String(s.planned_checkout||'').slice(0,10))} at 12:00 PM</p><p class="text-muted small mb-0">After checkout, the room goes to Cleaning.</p>`;
          } else {
            body+=`<p class="mb-1"><strong>Check-in:</strong> ${esc(String(s.checkin_at||'').slice(0,10)||'—')}</p><p class="mb-1"><strong>Checkout due:</strong> ${esc(String(s.planned_checkout||'').slice(0,10))} at 12:00 PM</p>`;
            if(st.kind==='PENDING') body+=`<p class="text-warning small mb-0">Reserved — payment pending at the cashier. This room is not counted as occupied yet.</p>`;
          }
          actions=`<div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-outline-primary btn-sm" id="roomcal-folio">Folio</button>${st.kind==='ACTIVE' ? '<button class="btn btn-outline-success btn-sm" id="roomcal-checkout">Checkout</button>' : '<button class="btn btn-outline-secondary btn-sm" id="roomcal-stays">Active Stays</button>'}</div>`;
        } else if(st.label==='Available'){
          body+=`<p class="mb-1"><strong>Room type:</strong> ${esc(room.type||'')}</p><p class="mb-1"><strong>Nightly rate:</strong> ${php(room.nightly_rate)}</p><p class="text-muted small mb-0">No guest on this date. Future dates are projected from active stays — this is not a booking.</p>`;
          if(ds===calToday && uRole!=='cashier') actions=`<div class="mt-3"><button class="btn btn-primary btn-sm" id="roomcal-checkin">Walk-in Check-in</button></div>`;
        } else {
          body+=`<p class="mb-1"><strong>Room type:</strong> ${esc(room.type||'')}</p><p class="text-muted small mb-0">${st.label==='Cleaning' ? 'Cleaning has no set end date in the system — check the board again later.' : 'Maintenance has no set end date in the system — check the board again later.'}</p>`;
        }
        const x=modal(`Room ${esc(room.room_number)} — ${calPretty(ds)}`, body+actions);
        const folioBtn=x.root.querySelector('#roomcal-folio'); if(folioBtn) folioBtn.addEventListener('click', ()=>{ x.m.hide(); folio(Number(st.stay.folio_id)); });
        const coBtn=x.root.querySelector('#roomcal-checkout'); if(coBtn) coBtn.addEventListener('click', ()=>{ x.m.hide(); checkout(Number(st.stay.id)); });
        const staysBtn=x.root.querySelector('#roomcal-stays'); if(staysBtn) staysBtn.addEventListener('click', ()=>{ x.m.hide(); open('active-stays'); });
        const ciBtn=x.root.querySelector('#roomcal-checkin'); if(ciBtn) ciBtn.addEventListener('click', ()=>{ x.m.hide(); checkin(); });
      };
      const renderCal=()=>{
        const room=rooms.find(r=>String(r.id)===String(calState.roomId))||rooms[0];
        const grid=$('roomcal-grid'); if(!room || !grid){ if(grid) grid.innerHTML='<div class="text-muted">No rooms yet.</div>'; return; }
        calState.roomId=String(room.id);
        const titleEl=$('roomcal-title'); if(titleEl) titleEl.textContent=`${calMonthNames[calState.month]} ${calState.year}`;
        const first=new Date(calState.year, calState.month, 1); const startDay=first.getDay(); const daysIn=new Date(calState.year, calState.month+1, 0).getDate();
        let html=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(w=>`<div class="text-center text-muted small py-1">${w}</div>`).join('');
        for(let i=0;i<startDay;i++) html+=`<div class="roomcal-day roomcal-blank"></div>`;
        for(let d=1; d<=daysIn; d++){
          const ds=calDateStr(calState.year, calState.month, d);
          const st=calStatusFor(room, ds);
          html+=`<div class="roomcal-day ${st.cls}${ds===calToday?' roomcal-today':''}${ds<calToday?' roomcal-past':''}" data-cal-date="${ds}"><div class="roomcal-num">${d}</div></div>`;
        }
        grid.innerHTML=html;
        grid.querySelectorAll('[data-cal-date]').forEach(el=>{ el.addEventListener('click', ()=>{ openCalModal(room, el.getAttribute('data-cal-date')); }); });
      };
      const setCalTab=(tab)=>{
        roomsCalTab=tab;
        const boardEl=$('roomcal-board'), calEl=$('roomcal-calendar'), bBtn=$('roomcal-tab-board'), cBtn=$('roomcal-tab-calendar');
        if(boardEl) boardEl.style.display = tab==='calendar' ? 'none' : 'block';
        if(calEl) calEl.style.display = tab==='calendar' ? 'block' : 'none';
        if(bBtn) bBtn.className = `btn btn-sm ${tab==='calendar' ? 'btn-outline-primary' : 'btn-primary'}`;
        if(cBtn) cBtn.className = `btn btn-sm ${tab==='calendar' ? 'btn-primary' : 'btn-outline-primary'}`;
        if(tab==='calendar') renderCal();
      };
      $('roomcal-tab-board').addEventListener('click', ()=>setCalTab('board'));
      $('roomcal-tab-calendar').addEventListener('click', ()=>setCalTab('calendar'));
      $('roomcal-room').addEventListener('change', e=>{ calState.roomId=e.target.value; renderCal(); });
      $('roomcal-prev').addEventListener('click', ()=>{ calState.month--; if(calState.month<0){ calState.month=11; calState.year--; } renderCal(); });
      $('roomcal-next').addEventListener('click', ()=>{ calState.month++; if(calState.month>11){ calState.month=0; calState.year++; } renderCal(); });
      $('roomcal-today').addEventListener('click', ()=>{ calState.year=_calNow.getFullYear(); calState.month=_calNow.getMonth(); renderCal(); });
      if(calTabActive) renderCal();


    } else if (id==='active-stays' || id==='transactions' || id==='billing') {

      const d=await api('active_stays',{},'GET'); stays=d.stays||[];

      const curRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const isCashier = (curRole === 'cashier');

      const isManager = (curRole === 'manager');
      const stayPermissions = window.HotelAuth.getUser()?.permissions || [];
      const stayCan = (permission, fallback) => stayPermissions.length
        ? (stayPermissions.includes('*') || stayPermissions.includes(permission))
        : fallback;
      const canViewStays = stayCan('stays.view', ['admin','manager','cashier','frontdesk'].includes(curRole));
      const canCheckin = stayCan('stays.checkin', ['admin','manager','frontdesk'].includes(curRole));

      let pendingStays=[];

      let confirmRows=[];

      if (id==='active-stays' && !isCashier && canViewStays) {

        try { const pd=await api('pending_checkins',{},'GET'); pendingStays=pd.stays||[]; } catch(_) {}

        if(canCheckin){
          try { const cd=await api('checkin_payments',{},'GET'); confirmRows=(cd.checkin_payments||[]).filter(x=>x.status==='APPROVED' && !x.confirmed_at); } catch(_) {}
        }
      }

      const confirmHtml = confirmRows.length ? `<div class="card border-info shadow-sm mb-4"><div class="card-header bg-info-subtle py-3 d-flex justify-content-between align-items-center flex-wrap gap-2"><h6 class="fw-bold mb-0"><i class="bi bi-patch-check me-2"></i>Payments to Confirm (${confirmRows.length})</h6><span class="small text-muted">The Cashier approved these check-in payments. Confirm to close the loop — the Cashier gets a pop-up.</span></div><div class="card-body p-0"><div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Stay / Guest</th><th>Room</th><th>Receipt</th><th>Approved by</th><th>Action</th></tr></thead><tbody>${confirmRows.map(x=>`<tr><td><strong>${esc(x.stay_code)}</strong>${x.guest_name?`<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(x.guest_name)}</div>`:''}</td><td><strong>${esc(x.room_number)}</strong></td><td>${esc(x.receipt_number||'')}</td><td>Cashier ${esc(x.approved_by_name||'')}</td><td><button class="btn btn-sm btn-info" onclick="HotelBilling.confirmCheckinPayment(${x.id})"><i class="bi bi-patch-check me-1"></i>Confirm Payment</button></td></tr>`).join('')}</tbody></table></div></div></div>` : '';

      const pendingHtml = pendingStays.length ? `<div class="card border-warning shadow-sm mb-4"><div class="card-header bg-warning-subtle py-3 d-flex justify-content-between align-items-center flex-wrap gap-2"><h6 class="fw-bold mb-0"><i class="bi bi-hourglass-split me-2"></i>Pending Check-in Payments (${pendingStays.length})</h6><span class="small text-muted">Waiting for Cashier approval — the check-in completes once payment is approved.</span></div><div class="card-body p-0"><div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Stay / Guest</th><th>Room &amp; Duration</th><th>Total Billing</th><th>Discount</th><th>Net Bill</th><th>Due at Check-in</th><th>Pass to Balance</th>${canCheckin?'<th>Action</th>':''}</tr></thead><tbody>${pendingStays.map(s=>{
        const sNights = Number(s.payment_nights || 1);
        const sIs5Days = sNights >= 5;
        const sGross = Number(s.gross_amount) > 0 ? Number(s.gross_amount) : (Number(s.total_amount || 0) + Number(s.discount_amount || 0));
        const sDisc = Number(s.discount_amount || 0);
        const sBal = sIs5Days ? (Number(s.balance_amount) || Math.max(0, Number(s.total_amount || 0) - Number(s.required_amount || 0))) : 0;
        return `<tr><td><strong>${esc(s.stay_code)}</strong>${s.guest_name?`<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>`:''}<div class="small text-muted">${esc(s.folio_number)}</div></td><td><strong>${esc(s.room_number)}</strong><div class="small text-muted">${sNights} night(s)</div><span class="badge ${sIs5Days ? 'text-bg-warning text-dark' : 'text-bg-light border text-muted'}" style="font-size:10px;">${sIs5Days ? '5+ Days' : 'Short Stay'}</span></td><td>${php(sGross)}</td><td>${sDisc > 0 ? `<span class="badge text-bg-success">-${php(sDisc)}</span>` : '<span class="text-muted">None</span>'}</td><td>${php(s.total_amount||0)}</td><td><strong>${php(s.required_amount||0)}</strong><div class="small text-muted">${sIs5Days?'60% downpayment':'100% full'}</div></td><td>${sIs5Days ? `<strong class="text-danger">${php(sBal)}</strong><div class="badge bg-danger-subtle text-danger" style="font-size:9.5px;">Passes to Folio</div>` : '<span class="text-muted small">₱0.00</span>'}</td>${canCheckin?`<td><button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.cancelPendingCheckin(${s.id},'${esc(s.stay_code)}')"><i class="bi bi-x-circle me-1"></i>Cancel</button></td>`:''}</tr>`;
      }).join('')}</tbody></table></div></div></div>` : '';



      const renderStayActions = (s, isMobile = false) => {

        if (isCashier) {

          return `

            <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})" title="View Folio &amp; Billing"><i class="bi bi-receipt me-1"></i>Billing</button>

          `;

        }

        if (isManager) {

          return `

            <button class="btn btn-sm btn-outline-dark" onclick="HotelBilling.showStayQr('${esc(s.stay_code)}','${esc(s.folio_number)}')"><i class="bi bi-qr-code me-1"></i>${isMobile ? 'QR' : 'QR Pass'}</button>

            <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})">Folio</button>

            <button class="btn btn-sm btn-outline-info" onclick="HotelBilling.guestDetails(${s.id})"><i class="bi bi-person-lines-fill me-1"></i>${isMobile ? 'Guest' : 'Guest details'}</button>

            <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.bookAdditionalRoom(${s.id})"><i class="bi bi-person-plus me-1"></i>${isMobile ? 'Add room' : 'Book additional room'}</button>

          `;

        }

        return `

          <button class="btn btn-sm btn-outline-dark" onclick="HotelBilling.showStayQr('${esc(s.stay_code)}','${esc(s.folio_number)}')"><i class="bi bi-qr-code me-1"></i>${isMobile ? 'QR' : 'QR Pass'}</button>

          <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})">Folio</button>

          <button class="btn btn-sm btn-outline-info" onclick="HotelBilling.guestDetails(${s.id})"><i class="bi bi-person-lines-fill me-1"></i>${isMobile ? 'Guest' : 'Guest details'}</button>

          ${['admin','frontdesk'].includes(curRole) ? `<button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.bookAdditionalRoom(${s.id})"><i class="bi bi-person-plus me-1"></i>${isMobile ? 'Add room' : 'Book additional room'}</button>` : ''}

          ${curRole === 'frontdesk' ? `<button class="btn btn-sm btn-outline-secondary" onclick="HotelBilling.transfer(${s.id})">Transfer</button>` : ''}

          <button class="btn btn-sm btn-outline-warning" onclick="HotelBilling.earlyCheckout(${s.id})">${isMobile ? 'Early' : 'Early checkout'}</button>

          ${['admin','frontdesk'].includes(curRole) ? `<button class="btn btn-sm btn-outline-success" onclick="HotelBilling.checkout(${s.id})"><i class="bi bi-box-arrow-right me-1"></i>Checkout</button>` : ''}

        `;

      };



      // Other active stays under the same guest (display-only, from
      // active_stays.linked_stays). Shown only when non-empty.
      const linkedLine = (s) => (Array.isArray(s.linked_stays) && s.linked_stays.length)
        ? `<div class="small text-muted">Also booked under this guest: ${s.linked_stays.map(l => `Room ${esc(l.room_number)} (${esc(l.stay_code)})`).join(', ')}</div>`
        : '';



      let tableHeaders;

      let rows;

      if (isCashier) {

        tableHeaders = ['Stay / Guest', 'Room', 'Room Charges (VAT-inclusive)', 'Additional Charges', 'VATable Sales / VAT', 'Total Paid', 'Balance Due', 'Settlement Status', 'Actions'];

        rows = stays.map(s => {

          const bal = Number(s.balance_due ?? (Number(s.charges_total) - Number(s.paid_total)));

          const isSettled = s.is_settled ?? (bal <= 0.009);

          const roomChg = s.room_charges ?? s.charges_total;

          const addChg = s.additional_charges ?? '0.00';

          const vatChg = s.vat_total ?? '0.00';

          const paidChg = s.paid_total ?? '0.00';



          return `<tr>

            <td>

              <strong>${esc(s.stay_code)}</strong>

              ${s.guest_name ? `<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>` : ''}

              <div class="small text-muted">Folio ${esc(s.folio_number)}</div>

              ${linkedLine(s)}

            </td>

            <td><strong>Room ${esc(s.room_number)}</strong><div class="small text-muted">${s.guest_count} guest(s)</div></td>

            <td>${php(roomChg)}</td>

            <td>${Number(addChg) > 0 ? `<strong class="text-dark">${php(addChg)}</strong>` : '<span class="text-muted">₱0.00</span>'}</td>

            <td><div>VATable sales: ${php(s.vatable_sales ?? '0.00')}</div><div class="small text-muted">VAT (${Number(s.vat_rate || 0)}%): ${php(vatChg)}</div></td>

            <td><strong>${php(paidChg)}</strong></td>

            <td><strong class="${bal > 0.009 ? 'text-danger' : 'text-success'} fs-6">${php(bal)}</strong></td>

            <td>${isSettled ? '<span class="badge text-bg-success"><i class="bi bi-check-circle me-1"></i>Settled</span>' : '<span class="badge text-bg-warning text-dark"><i class="bi bi-exclamation-circle me-1"></i>Balance Due</span>'}</td>

            <td>

              <div class="d-flex flex-wrap gap-1">

                ${renderStayActions(s, false)}

              </div>

            </td>

          </tr>`;

        }).join('');

      } else {

        tableHeaders = ['Stay / Folio reference','Room','Guests','Scheduled / Actual Check-in','Planned checkout','Balance','Actions'];

        rows = stays.map(s=>`<tr><td><strong>${esc(s.stay_code)}</strong>${s.guest_name?`<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>`:''}<div class="small text-muted">${esc(s.folio_number)}</div>${linkedLine(s)}</td><td>${esc(s.room_number)}</td><td>${s.guest_count}</td><td><div>Scheduled: ${esc(s.checkin_at)}</div><div class="small text-muted">Actual: ${esc(s.actual_checkin_at||'Not recorded')}</div></td><td>${esc(s.planned_checkout)} at 12:00 PM</td><td>${php(Number(s.charges_total)-Number(s.paid_total))}</td><td><div class="d-flex flex-wrap gap-1">${renderStayActions(s, false)}</div></td></tr>`).join('');

      }



      const mobileStayCards = stays.map(s=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <div>

              <span class="fw-bold fs-6">${esc(s.stay_code)}</span>

              <div class="small text-muted">${esc(s.folio_number)}</div>

            </div>

            <span class="badge text-bg-light border fs-6">Room ${esc(s.room_number)}</span>

          </div>

          ${s.guest_name?`<div class="fw-semibold text-primary mb-2" style="font-size:13px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>`:''}

          ${linkedLine(s)}

          ${isCashier ? `

            <div class="row g-2 mb-2 small text-muted">

              <div class="col-6">Room Charges (VAT-inclusive): <strong class="text-dark">${php(s.room_charges ?? s.charges_total)}</strong></div>
              <div class="col-6 text-end">Additional: <strong class="text-dark">${php(s.additional_charges ?? '0.00')}</strong></div>
              <div class="col-6">VATable sales: <strong class="text-dark">${php(s.vatable_sales ?? '0.00')}</strong></div>
              <div class="col-6 text-end">VAT (${Number(s.vat_rate || 0)}%): <strong class="text-dark">${php(s.vat_total ?? '0.00')}</strong></div>

              <div class="col-6 text-end">Total Paid: <strong class="text-dark">${php(s.paid_total)}</strong></div>

              <div class="col-12 text-end pt-1">Balance Due: <strong class="${(Number(s.balance_due ?? (Number(s.charges_total)-Number(s.paid_total)))) > 0.009 ? 'text-danger' : 'text-success'} fs-6">${php(s.balance_due ?? (Number(s.charges_total)-Number(s.paid_total)))}</strong></div>

            </div>

          ` : `

            <div class="row g-2 mb-2 small text-muted">

              <div class="col-6">Guests: <strong class="text-dark">${s.guest_count}</strong></div>

              <div class="col-6 text-end">Balance: <strong class="text-danger">${php(Number(s.charges_total)-Number(s.paid_total))}</strong></div>

              <div class="col-12">Scheduled check-in: <strong class="text-dark">${esc(s.checkin_at)}</strong><div>Actual check-in: <strong class="text-dark">${esc(s.actual_checkin_at||'Not recorded')}</strong></div></div>

              <div class="col-6 text-end">Out: <strong class="text-dark">${esc(s.planned_checkout)}</strong></div>

            </div>

          `}

          <div class="d-flex flex-wrap gap-1 pt-2 border-top">

            ${renderStayActions(s, true)}

          </div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-4 text-center text-muted">No active stays.</div>';

      const dest=id==='active-stays'?'active-stays-content':id==='transactions'?'all-transactions-content':'billing-content';

      $(dest).innerHTML=`${pendingHtml}${confirmHtml}<div class="d-flex justify-content-between align-items-center mb-3"><p class="text-muted mb-0">${stays.length} active stay(s)</p></div>

      <div class="d-none d-md-block">${table(tableHeaders,rows,'No active stays.')}</div>

      <div class="d-md-none">${mobileStayCards}</div>`;

    } else if (id==='payments') {

      const cpUser = window.HotelAuth.getUser() || {};

      const cpRole = (cpUser.role || '').toLowerCase();

      const cpPermissions = Array.isArray(cpUser.permissions) ? cpUser.permissions : [];

      const cpCanProcessPayments = cpPermissions.length
        ? (cpPermissions.includes('*') || cpPermissions.includes('payments.process'))
        : ['admin','manager','cashier'].includes(cpRole);

      const cpCanViewStays = cpPermissions.length
        ? (cpPermissions.includes('*') || cpPermissions.includes('stays.view'))
        : ['admin','manager','cashier','frontdesk'].includes(cpRole);
      const cpIsCashier = (cpRole === 'cashier');
      const cpCanApproveCheckinPayments = cpIsCashier && cpCanProcessPayments;
      const cpCanViewCheckinQueue = cpCanViewStays && (!cpIsCashier || cpCanApproveCheckinPayments);

      const cpCanViewReports = cpPermissions.length
        ? (cpPermissions.includes('*') || cpPermissions.includes('reports.financial.view'))
        : ['admin','manager'].includes(cpRole);

      const [d,h,st,cpd]=await Promise.all([

        cpCanViewReports ? api('reports',{},'GET') : Promise.resolve({daily_payments:[]}),

        api('payment_history',{},'GET'),

        api('active_stays',{},'GET'),

        cpCanViewCheckinQueue ? api('checkin_payments',{},'GET') : Promise.resolve({checkin_payments:[]})
      ]);

      const cpAll = cpd.checkin_payments || [];

      const cpPending = cpAll.filter(x=>x.status==='FOR_PAYMENT');

      const cpDone = cpAll.filter(x=>x.status!=='FOR_PAYMENT').slice(0,5);
      const cpPendingGroups = groupPendingCheckinPayments(cpPending);

      const cpRow = (x, withApprove) => {
        const n = Number(x.nights || x.payment_nights || 1);
        const is5 = (n >= 5);
        const gross = Number(x.gross_amount) > 0 ? Number(x.gross_amount) : (Number(x.total_amount) + Number(x.discount_amount || 0));
        const disc = Number(x.discount_amount || 0);
        const bal = is5 ? (Number(x.balance_amount) || Math.max(0, Number(x.total_amount) - Number(x.required_amount))) : 0;
        return `<tr>

        <td><strong>${esc(x.stay_code)}</strong><div class="small text-muted">Folio ${esc(x.folio_number)}</div>${x.guest_name?`<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(x.guest_name)}</div>`:''}</td>

        <td><strong>Room ${esc(x.room_number)}</strong><div class="small text-muted">${n} night(s)</div><span class="badge ${is5 ? 'text-bg-warning text-dark' : 'text-bg-light border text-muted'}" style="font-size:10px;">${is5 ? '5+ Days' : 'Short Stay'}</span></td>

        <td>${php(gross)}</td>

        <td>${disc > 0 ? `<span class="badge text-bg-success">-${php(disc)}</span>` : '<span class="text-muted small">None</span>'}</td>

        <td>${php(x.total_amount)}</td>

        <td><strong>${php(x.required_amount)}</strong><div class="small text-muted">${is5 ? '60% downpayment' : '100% full'}</div></td>

        <td>${is5 ? `<strong class="text-danger">${php(bal)}</strong><div class="badge bg-danger-subtle text-danger" style="font-size:9.5px;">Passes to Folio</div>` : '<span class="text-muted small">₱0.00</span>'}</td>

        <td>${x.status==='FOR_PAYMENT'?'<span class="badge text-bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>For Payment</span>':(x.status==='APPROVED'?(x.confirmed_at?`<span class="badge text-bg-success"><i class="bi bi-patch-check me-1"></i>Confirmed</span><div class="small text-muted">${esc(x.receipt_number||'')} · FD confirmed by ${esc(x.confirmed_by_name||'')}</div>`:`<span class="badge text-bg-info"><i class="bi bi-check-circle me-1"></i>Approved</span><div class="small text-muted">${esc(x.receipt_number||'')} · by Cashier ${esc(x.approved_by_name||'')} · waiting for Front Desk confirmation</div>`):'<span class="badge text-bg-secondary">Cancelled</span>')}</td>

        ${cpCanApproveCheckinPayments ? `<td>${withApprove ? `<button class="btn btn-sm btn-success fw-bold" onclick="HotelBilling.approveCheckinPayment(${x.id})"><i class="bi bi-cash-stack me-1"></i>Approve</button>` : ''}</td>` : ''}

      </tr>`;
      };

      const cpGroupRow = group => {
        const payments = group.payments;
        const gross = payments.reduce((sum, row) => sum + Number(row.gross_amount || row.total_amount || 0), 0);
        const discount = payments.reduce((sum, row) => sum + Number(row.discount_amount || 0), 0);
        const net = payments.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
        const required = payments.reduce((sum, row) => sum + Number(row.required_amount || 0), 0);
        const nights = Math.max(...payments.map(row => Number(row.nights || row.payment_nights || 1)));
        const balance = payments.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
        const roomList = payments.map(row => `Room ${esc(row.room_number)}`).join(', ');
        return `<tr>
          <td><strong>${esc(group.group_code || `Group ${group.group_booking_id}`)}</strong><div class="small text-muted">${esc(payments[0].guest_name || 'Group Guest')} · ${payments.length} room folios</div></td>
          <td><strong>${roomList}</strong><div class="small text-muted">${nights} night(s) each/maximum</div></td>
          <td>${php(gross)}</td>
          <td>${discount > 0 ? `<span class="badge text-bg-success">− ${php(discount)}</span>` : '<span class="text-muted small">None</span>'}</td>
          <td>${php(net)}</td>
          <td><strong>${php(required)}</strong><div class="small text-muted">Combined room requirements</div></td>
          <td>${php(balance)}</td>
          <td><span class="badge text-bg-warning text-dark">${payments.length} rooms awaiting payment</span></td>
          ${cpCanApproveCheckinPayments ? `<td><button class="btn btn-sm btn-success fw-bold" onclick="HotelBilling.approveGroupCheckinPayment(${group.group_booking_id})"><i class="bi bi-cash-stack me-1"></i>Receive Group Payment</button></td>` : ''}
        </tr>`;
      };

      const cpQueue = cpCanViewCheckinQueue ? `<div class="card border-0 shadow-sm mb-4">

        <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">

          <div>

            <h6 class="fw-bold mb-0"><i class="bi bi-cash-register me-2 text-success"></i>Check-in Payments · For Payment Queue</h6>

            <div class="small text-muted">New walk-in check-ins saved by Front Desk appear here in real time. Only the Cashier can approve a payment; approval confirms the guest's check-in.</div>

          </div>

          ${cpPendingGroups.length?`<span class="badge text-bg-warning text-dark">${cpPendingGroups.length} booking(s) waiting</span>`:'<span class="badge text-bg-success">Queue clear</span>'}

        </div>

        <div class="card-body p-0">

          <div class="d-none d-md-block">${table(['Group / Guest','Rooms & Duration','Total Billing','Discount','Net Bill','Required at check-in','Pass to Balance','Status',...(cpCanApproveCheckinPayments?['Action']:[])], cpPendingGroups.map(group => group.group_booking_id ? cpGroupRow(group) : cpRow(group.payments[0], true)).join('') + cpDone.map(x=>cpRow(x,false)).join(''), 'No check-in payments yet.')}</div>

          <div class="d-md-none p-2">${cpPendingGroups.map(group=>{
            if (group.group_booking_id) {
              const payments = group.payments;
              const gross = payments.reduce((sum, row) => sum + Number(row.gross_amount || row.total_amount || 0), 0);
              const net = payments.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
              const required = payments.reduce((sum, row) => sum + Number(row.required_amount || 0), 0);
              return `<div class="card border shadow-sm p-3 mb-2">
                <div class="d-flex justify-content-between"><strong>${esc(group.group_code || `Group ${group.group_booking_id}`)}</strong><span class="badge text-bg-warning text-dark">${payments.length} rooms</span></div>
                <div class="small text-muted">${esc(payments[0].guest_name || 'Group Guest')} · ${payments.map(row => `Room ${esc(row.room_number)}`).join(', ')}</div>
                <div class="small mt-1">Group billing: <strong>${php(gross)}</strong> · Net: <strong>${php(net)}</strong></div>
                <div class="small mt-1">Required at check-in: <strong>${php(required)}</strong></div>
                ${cpCanApproveCheckinPayments ? `<button class="btn btn-success btn-sm mt-2 w-100 fw-bold" onclick="HotelBilling.approveGroupCheckinPayment(${group.group_booking_id})"><i class="bi bi-cash-stack me-1"></i>Receive Group Payment</button>` : ''}
              </div>`;
            }
            const x = group.payments[0];
            const n = Number(x.nights || x.payment_nights || 1);
            const is5 = (n >= 5);
            const gross = Number(x.gross_amount) > 0 ? Number(x.gross_amount) : (Number(x.total_amount) + Number(x.discount_amount || 0));
            const disc = Number(x.discount_amount || 0);
            const bal = is5 ? (Number(x.balance_amount) || Math.max(0, Number(x.total_amount) - Number(x.required_amount))) : 0;
            return `<div class="card border shadow-sm p-3 mb-2">
              <div class="d-flex justify-content-between"><strong>${esc(x.stay_code)}</strong><span class="badge text-bg-warning text-dark">For Payment</span></div>
              <div class="small text-muted">Room ${esc(x.room_number)} · ${esc(x.guest_name||'Guest')} · ${n} night(s) (${is5 ? '5+ Days' : 'Short'})</div>
              <div class="small mt-1">Total Billing: <strong>${php(gross)}</strong> ${disc > 0 ? `· Disc: <span class="text-success">-${php(disc)}</span>` : ''}</div>
              <div class="small mt-1">Required: <strong>${php(x.required_amount)}</strong> (${is5 ? '60% downpayment' : '100% full'})</div>
              ${is5 ? `<div class="small text-danger">Pass to Balance: <strong>${php(bal)}</strong> (Folio)</div>` : ''}
              ${cpCanApproveCheckinPayments?`<button class="btn btn-success btn-sm mt-2 w-100 fw-bold" onclick="HotelBilling.approveCheckinPayment(${x.id})"><i class="bi bi-cash-stack me-1"></i>Approve Payment</button>`:''}
            </div>`;
          }).join('') || '<div class="text-center text-muted p-3">No check-in payments waiting.</div>'}</div>

        </div>

      </div>` : '';



      const inHouse = [...(st.stays || [])];
      if (cpIsCashier) {
        inHouse.sort((a, b) => {
          const balanceA = Number(a.balance_due ?? (Number(a.charges_total) - Number(a.paid_total)));
          const balanceB = Number(b.balance_due ?? (Number(b.charges_total) - Number(b.paid_total)));
          return balanceB - balanceA;
        });
      }

      const readyForCheckoutCount = inHouse.filter(s => (s.is_settled ?? ((Number(s.balance_due ?? (Number(s.charges_total)-Number(s.paid_total)))) <= 0.009))).length;

      const unsettledCount = inHouse.length - readyForCheckoutCount;
      const cashierBalanceDue = inHouse.reduce((total, stay) => total + Math.max(0, Number(stay.balance_due ?? (Number(stay.charges_total) - Number(stay.paid_total)))), 0);



      const inHouseRows = inHouse.map(s => {

        const bal = Number(s.balance_due ?? (Number(s.charges_total) - Number(s.paid_total)));

        const isSettled = s.is_settled ?? (bal <= 0.009);
        const searchText = [s.stay_code, s.folio_number, s.room_number, s.guest_name].filter(Boolean).join(' ').toLowerCase();

        const statusBadge = isSettled

          ? '<span class="badge text-bg-success"><i class="bi bi-check-circle me-1"></i>Settled · Ready</span>'

          : `<span class="badge text-bg-warning text-dark"><i class="bi bi-exclamation-circle me-1"></i>Balance Due: ${php(bal)}</span>`;



        return `<tr ${cpIsCashier ? `data-cashier-stay data-cashier-search="${esc(searchText)}"` : ''}>

          <td>

            <strong>${esc(s.stay_code)}</strong>

            <div class="small text-muted">Folio ${esc(s.folio_number)}</div>

            ${s.guest_name ? `<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>` : ''}

          </td>

          <td><strong>Room ${esc(s.room_number)}</strong><div class="small text-muted">${s.guest_count} guest(s)</div></td>

          <td>

            <div>Charges: ${php(s.charges_total)}</div>

            ${Number(s.discount_total || 0) > 0 ? `<div class="small text-success">${(s.discounts||[]).map(discountDisplayName).map(esc).join(', ') || 'Discount'}: − ${php(s.discount_total)}</div>` : ''}

            ${Number(s.vat_total || 0) > 0 ? `<div class="small text-muted">VAT: ${php(s.vat_total)}</div>` : ''}

          </td>

          <td><strong>${php(s.paid_total)}</strong></td>

          <td><strong class="${bal > 0.009 ? 'text-danger' : 'text-success'} fs-6">${php(bal)}</strong></td>

          <td>${statusBadge}</td>

          <td>

            <div class="d-flex flex-wrap gap-1">

              <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})" title="View billing statement"><i class="bi bi-receipt me-1"></i>Billing</button>

            </div>

          </td>

        </tr>`;

      }).join('');



      const mobileInHouseCards = inHouse.map(s => {

        const bal = Number(s.balance_due ?? (Number(s.charges_total) - Number(s.paid_total)));

        const isSettled = s.is_settled ?? (bal <= 0.009);
        const searchText = [s.stay_code, s.folio_number, s.room_number, s.guest_name].filter(Boolean).join(' ').toLowerCase();

        return `

          <div class="card border-0 shadow-sm p-3 mb-2" ${cpIsCashier ? `data-cashier-stay data-cashier-search="${esc(searchText)}"` : ''}>

            <div class="d-flex justify-content-between align-items-start mb-2">

              <div>

                <span class="fw-bold fs-6">${esc(s.stay_code)}</span>

                <div class="small text-muted">Folio ${esc(s.folio_number)}</div>

              </div>

              <span class="badge text-bg-light border fs-6">Room ${esc(s.room_number)}</span>

            </div>

            ${s.guest_name ? `<div class="fw-semibold text-primary mb-2" style="font-size:13px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>` : ''}

            <div class="row g-2 mb-2 small text-muted">

              <div class="col-6">Total Paid: <strong class="text-dark">${php(s.paid_total)}</strong></div>

              <div class="col-6 text-end">Balance: <strong class="${bal > 0.009 ? 'text-danger' : 'text-success'}">${php(bal)}</strong></div>

            </div>

            <div class="d-flex justify-content-between align-items-center pt-2 border-top">

              <div>${isSettled ? '<span class="badge text-bg-success">Settled · Ready</span>' : '<span class="badge text-bg-warning text-dark">Balance Due</span>'}</div>

              <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})">Billing &amp; Payment</button>

            </div>

          </div>

        `;

      }).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No active in-house stays.</div>';



      const rows=(d.daily_payments||[]).map(r=>`<tr><td><button class="btn btn-sm btn-link" onclick="HotelBilling.reportDetails('${esc(r.day)}')">${esc(r.day)}</button></td><td>${r.payments_count}</td><td>${php(r.revenue)}</td></tr>`).join('');

      const history=(h.payments||[]).map(t=>`<tr><td>${esc(t.created_at)}</td><td><strong>${esc(t.receipt_number)}</strong></td><td>${esc(t.stay_code)}<div class="small text-muted">${esc(t.folio_number)}</div></td><td>${esc(t.room_number)}</td><td>${esc(t.method)}</td><td>${php(t.amount)}</td><td><span class="badge text-bg-success">${esc(t.folio_status==='PAID'?'PAID / COMPLETED':t.folio_status)}</span></td><td><div class="d-flex gap-1"><button class="btn btn-sm btn-outline-dark" onclick="HotelBilling.showReceiptModal('${esc(t.receipt_number)}')"><i class="bi bi-printer me-1"></i>Receipt</button><button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${t.folio_id})"><i class="bi bi-receipt me-1"></i>Folio</button></div></td></tr>`).join('');

      const mobileDailyCards = (d.daily_payments||[]).map(r=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-center mb-1">

            <button class="btn btn-link p-0 fw-bold fs-6 text-decoration-none" onclick="HotelBilling.reportDetails('${esc(r.day)}')">

              <i class="bi bi-calendar3 me-1"></i>${esc(r.day)}

            </button>

            <span class="badge text-bg-success fs-6">${php(r.revenue)}</span>

          </div>

          <div class="small text-muted">Payment count: <strong class="text-dark">${r.payments_count}</strong></div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No payments recorded in the last 30 days.</div>';

      const dailyPaymentsSection = cpCanViewReports ? `
        <h6 class="fw-bold mb-3">Daily payments · last 30 days</h6>
        <p class="small text-muted">Click a date to inspect the underlying transactions.</p>
        <div class="d-none d-md-block">${table(['Date','Payment count','Collected'],rows,'No payments recorded in the last 30 days.')}</div>
        <div class="d-md-none">${mobileDailyCards}</div>
      ` : '';



      const mobileHistoryCards = (h.payments||[]).map(t=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <div>

              <span class="fw-bold fs-6">${esc(t.receipt_number)}</span>

              <div class="small text-muted">${esc(t.created_at)}</div>

            </div>

            <span class="badge text-bg-success">${esc(t.folio_status==='PAID'?'PAID / COMPLETED':t.folio_status)}</span>

          </div>

          <div class="row g-2 mb-1 small text-muted">

            <div class="col-6">Stay / Folio: <strong class="text-dark">${esc(t.stay_code)} (${esc(t.folio_number)})</strong></div>

            <div class="col-6 text-end">Room: <strong class="text-dark">${esc(t.room_number)}</strong></div>

            <div class="col-6">Method: <strong class="text-dark">${esc(t.method)}</strong></div>

            <div class="col-6 text-end">Amount: <strong class="text-primary fs-6">${php(t.amount)}</strong></div>

          </div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No payment records yet.</div>';



      $('payments-content').innerHTML=`
      ${cpIsCashier ? `<section class="cashier-pos">
        <div class="cashier-pos-header">
          <div class="cashier-pos-brand">
            <span class="cashier-pos-icon"><i class="bi bi-cash-register"></i></span>
            <div><div class="cashier-pos-eyebrow">SHESH DEV HOTEL · BILLING</div><h4 class="mb-1">Cashier Payment Desk</h4><div class="cashier-pos-subtitle">Guest folios, check-in collections, and payment receipts</div></div>
          </div>
          <div class="cashier-pos-summary">
            <div><span>Open Folios</span><strong>${inHouse.length}</strong></div>
            <div><span>Outstanding</span><strong>${php(cashierBalanceDue)}</strong></div>
            <div><span>Check-In Queue</span><strong>${cpPendingGroups.length}</strong></div>
            <div><span>Recent Receipts</span><strong>${(h.payments||[]).length}</strong></div>
          </div>
        </div>
        <div class="cashier-pos-toolbar">
          <div><h5 class="mb-1">Payment work queue</h5><p class="mb-0">Search by guest, stay, room, or folio. Checkout is handled by Front Desk.</p></div>
          <div class="input-group cashier-pos-search">
            <span class="input-group-text"><i class="bi bi-search"></i></span>
            <input id="cashier-stay-search" type="search" class="form-control" placeholder="Find guest, room, stay, folio…" aria-label="Search open folios">
          </div>
        </div>
      </section>` : `<div class="alert alert-light border mb-4"><strong>Shesh Dev Hotel</strong><br>Agora, Lapasan, Cagayan de Oro</div>`}



      ${cpQueue}



      <div class="card border-0 shadow-sm mb-4 ${cpIsCashier ? 'cashier-worklist-card' : ''}">

        <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">

          <div>

            <h6 class="fw-bold mb-0"><i class="bi bi-people-fill me-2 text-primary"></i>${cpIsCashier ? 'Open Folios &amp; Collect Payment' : 'In-House Stays &amp; Checkout Settlement'}</h6>

            <div class="small text-muted">${cpIsCashier ? 'Review the live folio balance, accept payment, and print the guest receipt.' : 'Review billing, settle balances, and process guest checkout. Make sure payment is settled before checking out.'}</div>

          </div>

          <div class="d-flex gap-2">

            ${cpIsCashier
              ? `<span class="badge text-bg-primary">${inHouse.length} Open Folios</span><span class="badge ${unsettledCount ? 'text-bg-warning text-dark' : 'text-bg-success'}">${unsettledCount} Balance Due</span>`
              : `<span class="badge text-bg-success">${readyForCheckoutCount} Settled (Ready)</span>${unsettledCount > 0 ? `<span class="badge text-bg-warning text-dark">${unsettledCount} Balance Due</span>` : ''}`}

          </div>

        </div>

        <div class="card-body p-0">

          ${cpIsCashier ? '<div id="cashier-stays-empty" class="alert alert-light border mx-3 mt-3 mb-0 d-none">No open folios match your search.</div>' : ''}
          <div class="d-none d-md-block">${table(['Stay / Folio reference','Room','Charges &amp; Extras','Total Paid','Balance Due','Settlement Status','Actions'],inHouseRows,'No active in-house stays.')}</div>

          <div class="d-md-none p-2">${mobileInHouseCards}</div>

        </div>

      </div>



      ${dailyPaymentsSection}

      <h6 class="${cpIsCashier ? 'cashier-history-heading' : 'fw-bold mt-4 mb-3'}">Recent payment records</h6>

      <div class="d-none d-md-block">${table(['Date / Time','Receipt','Stay / Folio','Room','Method','Amount','Status','Actions'],history,'No payment records yet.')}</div>

      <div class="d-md-none">${mobileHistoryCards}</div>

      ${cpIsCashier ? '</section>' : ''}`;

      if (cpIsCashier) {
        const search = $('cashier-stay-search');
        const emptyState = $('cashier-stays-empty');
        search?.addEventListener('input', () => {
          const query = search.value.trim().toLowerCase();
          const matches = [...$('payments-content').querySelectorAll('[data-cashier-stay]')].filter((element) => {
            const visible = (element.dataset.cashierSearch || '').includes(query);
            element.hidden = !visible;
            return visible;
          });
          if (emptyState) emptyState.classList.toggle('d-none', query.length === 0 || matches.length > 0);
        });
      }

    } else if (id==='service-requests') {

      const d=await api('requests',{},'GET');

      const curRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();
      const curRoleKey = curRole.replace(/[\s_-]/g, '');
      const isDepartmentStaff = !['admin','manager','frontdesk','cashier'].includes(curRoleKey);
      const departmentAliases = {foodbeverage:'restaurant', food:'restaurant', minibar:'bar', parking:'valet', parkingvalet:'valet', valetparking:'valet', frontdesk:'service', other:'service', concierge:'service'};
      const normalizeDepartment = value => {
        const key = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
        return departmentAliases[key] || key;
      };
      if (['service', 'maintenance'].includes(curRoleKey)) {
        const legacyTypes = curRoleKey === 'maintenance'
          ? new Set(['MAINTENANCE'])
          : new Set(['SERVICE', 'OTHER', 'FRONT_DESK']);
        d.requests = (d.requests || []).filter(request => {
          const assignedDepartment = normalizeDepartment(request.assigned_department);
          return assignedDepartment
            ? assignedDepartment === curRoleKey
            : legacyTypes.has(String(request.service_type || '').toUpperCase().trim());
        });
      }
      markRequestsViewed(d.requests || []);

      const isSupervisory = ['admin','manager','frontdesk'].includes(curRole);

      const isFrontdesk = (curRole === 'frontdesk');
      const currentRequestUser = window.HotelAuth.getUser() || {};
      const hasRequestPermissionList = Array.isArray(currentRequestUser.permissions);
      const requestPermissions = new Set(currentRequestUser.permissions || []);
      const canAssignRequests = isSupervisory && (hasRequestPermissionList
        ? (requestPermissions.has('*') || requestPermissions.has('service_requests.assign'))
        : ['admin','manager','frontdesk'].includes(curRole));
      const canFulfillRequests = hasRequestPermissionList
        ? (requestPermissions.has('*') || requestPermissions.has('service_requests.fulfill'))
        : ['admin','manager','service','other','housekeeping','maintenance','bar','minibar','restaurant','food_beverage','foodbeverage','valet','parking','parkingvalet','parking_valet','laundry'].includes(curRole);



      const deptTitles = {

        restaurant: 'Restaurant & Food Fulfillment',

        food_beverage: 'Restaurant & Food Fulfillment',

        bar: 'Bar & Drinks Fulfillment',

        housekeeping: 'Housekeeping & Linens Fulfillment',

        laundry: 'Laundry Fulfillment',

        maintenance: 'Maintenance Work Queue',

        valet: 'Valet & Parking Assistance',

        parking: 'Valet & Parking Assistance',

        parkingvalet: 'Valet & Parking Assistance',

        parking_valet: 'Valet & Parking Assistance',

        service: 'Guest Services Requests',

        other: 'General Service Concierge'

      };



      const deptBanner = deptTitles[curRole]
        ? `<div class="alert alert-primary py-2 px-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2"><div><span class="fw-bold me-2">${deptTitles[curRole]}</span><span class="small text-muted">${curRoleKey === 'maintenance' ? 'Repair and safety work assigned to Maintenance.' : curRoleKey === 'service' ? 'General guest assistance assigned to Guest Services.' : 'Requests assigned to your department.'}</span></div><span class="badge text-bg-primary">${(d.requests||[]).length} active</span></div>`

        : isFrontdesk

          ? `<div class="alert alert-light border py-2 px-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2"><div><span class="fw-bold me-2"><i class="bi bi-headset me-1"></i>Front Desk Routing Console</span><span class="small text-muted">Review incoming requests, route to respective departments, reassign, or monitor fulfillment.</span></div><span class="badge text-bg-secondary">${(d.requests||[]).length} total</span></div>`

          : `<div class="alert alert-light border py-2 px-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2"><div><span class="fw-bold me-2"><i class="bi bi-shield-check me-1"></i>All Hotel Departments (Supervisory View)</span><span class="small text-muted">Global overview across all department queues.</span></div><span class="badge text-bg-secondary">${(d.requests||[]).length} total</span></div>`;



      const deptBadge = (dept) => {

        const u = String(dept||'').toLowerCase();

        if (['restaurant','food_beverage','food'].includes(u)) return '<span class="badge" style="background:#ea580c;color:#fff;">Restaurant</span>';

        if (['bar','minibar'].includes(u)) return '<span class="badge" style="background:#7c3aed;color:#fff;">Bar</span>';

        if (u === 'housekeeping') return '<span class="badge" style="background:#0284c7;color:#fff;">Housekeeping</span>';

        if (u === 'laundry') return '<span class="badge" style="background:#0891b2;color:#fff;">Laundry</span>';

        if (u === 'maintenance') return '<span class="badge" style="background:#475569;color:#fff;">Maintenance</span>';

        if (['valet','parking','parkingvalet','parking_valet'].includes(u)) return '<span class="badge" style="background:#0d9488;color:#fff;">Valet</span>';

        if (['front_desk','service','other'].includes(u)) return '<span class="badge" style="background:#1e293b;color:#fff;">Service</span>';

        return u ? `<span class="badge text-bg-light border">${esc(u)}</span>` : '<span class="badge text-bg-warning text-dark">Unassigned</span>';

      };



      const renderRowActions = (r) => {

        const rid = Number(r.id);

        const st = (r.status || '').toUpperCase();
        const isFrontDeskOwnedRequest = r.request_kind !== 'ROOM_TRANSFER'
          && String(r.service_type || '').toUpperCase() === 'FRONT_DESK'
          && String(r.assigned_department || '').toLowerCase().replace(/[\s_-]/g, '') === 'frontdesk';

        let opts = [`<option value="">Actions…</option>`];
        const isActive = ['NEW','PENDING','ASSIGNED','ACKNOWLEDGED','IN_PROGRESS','ON_HOLD'].includes(st);
        const routeOptions = () => [
          `<optgroup label="Route / Assign Department">`,
          `<option value="ASSIGN:restaurant">Assign Restaurant</option>`,
          `<option value="ASSIGN:bar">Assign Bar</option>`,
          `<option value="ASSIGN:housekeeping">Assign Housekeeping</option>`,
          `<option value="ASSIGN:laundry">Assign Laundry</option>`,
          `<option value="ASSIGN:maintenance">Assign Maintenance</option>`,
          `<option value="ASSIGN:valet">Assign Valet</option>`,
          `<option value="ASSIGN:service">Assign Service</option>`,
          `</optgroup>`
        ];



        if (curRole === 'frontdesk') {
          if (isFrontDeskOwnedRequest) {
            if (['NEW','PENDING','ASSIGNED'].includes(st)) {
              opts.push(`<optgroup label="Handle Front Desk Request">`);
              opts.push(`<option value="ACKNOWLEDGE">Accept Request</option>`);
              opts.push(`<option value="IN_PROGRESS">Start Handling</option>`);
              opts.push(`<option value="ON_HOLD">Put On Hold</option>`);
              opts.push(`<option value="REJECT">Decline Request</option>`);
              opts.push(`</optgroup>`);
            } else if (st === 'ACKNOWLEDGED') {
              opts.push(`<optgroup label="Handle Front Desk Request">`);
              opts.push(`<option value="IN_PROGRESS">Start Handling</option>`);
              opts.push(`<option value="ON_HOLD">Put On Hold</option>`);
              opts.push(`<option value="COMPLETED">Complete Request</option>`);
              opts.push(`<option value="REJECT">Decline Request</option>`);
              opts.push(`</optgroup>`);
            } else if (st === 'IN_PROGRESS') {
              opts.push(`<optgroup label="Handle Front Desk Request">`);
              opts.push(`<option value="COMPLETED">Complete Request</option>`);
              opts.push(`<option value="ON_HOLD">Put On Hold</option>`);
              opts.push(`</optgroup>`);
            } else if (st === 'ON_HOLD') {
              opts.push(`<optgroup label="Handle Front Desk Request">`);
              opts.push(`<option value="IN_PROGRESS">Resume Handling</option>`);
              opts.push(`<option value="COMPLETED">Complete Request</option>`);
              opts.push(`</optgroup>`);
            }
          }
          if (canAssignRequests && isActive && r.request_kind !== 'ROOM_TRANSFER') {
            opts.push(...routeOptions());
          }
          if (r.request_kind === 'ROOM_TRANSFER' && ['NEW','PENDING','ASSIGNED','ACKNOWLEDGED','ON_HOLD'].includes(st)) {
            opts.push(`<option value="CHANGE_DESTINATION">Change destination room</option>`);
          }
          opts.push(`<option value="HISTORY">View History</option>`);
          return `<select class="form-select form-select-sm" data-requested-room-id="${Number(r.requested_room_id) || 0}" data-requested-room-number="${esc(r.requested_room_number || '')}" onchange="HotelBilling.handleRequestAction(${rid},this.value,this)">${opts.join('')}</select>`;
        }



        if (isSupervisory) {

          if (r.request_kind === 'ROOM_TRANSFER') {
            if (curRole === 'manager' && ['NEW','PENDING','ASSIGNED','ACKNOWLEDGED','ON_HOLD'].includes(st)) {
              opts.push(`<option value="CHANGE_DESTINATION">Change destination room</option>`);
              opts.push(`<option value="APPROVE_TRANSFER">Approve &amp; Transfer</option>`);
            } else if (curRole === 'manager' && st === 'IN_PROGRESS') {
              opts.push(`<option value="FINALIZE_TRANSFER">Finalize Transfer</option>`);
            }
            opts.push(`<option value="HISTORY">View History</option>`);
            return `<select class="form-select form-select-sm" data-requested-room-id="${Number(r.requested_room_id) || 0}" data-requested-room-number="${esc(r.requested_room_number || '')}" onchange="HotelBilling.handleRequestAction(${rid},this.value,this)">${opts.join('')}</select>`;
          }

          if (!['COMPLETED','CANCELLED','REJECTED'].includes(st)) {

            if (canAssignRequests && r.request_kind !== 'ROOM_TRANSFER') {
              opts.push(...routeOptions());
            }



            opts.push(`<option value="CANCEL">Cancel Request</option>`);

          }

          opts.push(`<option value="HISTORY">View History</option>`);

        } else {

          if (canFulfillRequests && curRole === 'maintenance' && String(r.assigned_department || r.service_type || '').toLowerCase() === 'maintenance' && isActive && Number(r.safety_flag || 0) !== 1) {
            opts.push(`<option value="FLAG_SAFETY">Flag Urgent Safety Issue</option>`);
          }

          if (canFulfillRequests && (st === 'NEW' || st === 'PENDING' || st === 'ASSIGNED')) {

            opts.push(`<option value="ACKNOWLEDGE">${requestActionLabel(r, 'acknowledge', 'queue')}</option>`);

            opts.push(`<option value="IN_PROGRESS">${requestActionLabel(r, 'start', 'queue')}</option>`);

            opts.push(`<option value="ON_HOLD">${requestActionLabel(r, 'hold', 'queue')}</option>`);

            opts.push(`<option value="REJECT">${requestActionLabel(r, 'reject', 'queue')}</option>`);

          } else if (canFulfillRequests && st === 'ACKNOWLEDGED') {

            opts.push(`<option value="IN_PROGRESS">${requestActionLabel(r, 'start', 'queue')}</option>`);

            opts.push(`<option value="ON_HOLD">${requestActionLabel(r, 'hold', 'queue')}</option>`);

            opts.push(`<option value="COMPLETED">${requestActionLabel(r, 'complete', 'queue')}</option>`);

            opts.push(`<option value="REJECT">${requestActionLabel(r, 'reject', 'queue')}</option>`);

          } else if (canFulfillRequests && st === 'IN_PROGRESS') {

            opts.push(`<option value="COMPLETED">${requestActionLabel(r, 'complete', 'queue')}</option>`);

            opts.push(`<option value="ON_HOLD">${requestActionLabel(r, 'hold', 'queue')}</option>`);

          } else if (canFulfillRequests && st === 'ON_HOLD') {

            opts.push(`<option value="IN_PROGRESS">${requestActionLabel(r, 'resume', 'queue')}</option>`);

            opts.push(`<option value="COMPLETED">${requestActionLabel(r, 'complete', 'queue')}</option>`);

          }

          opts.push(`<option value="HISTORY">View History</option>`);

        }



        return `<select class="form-select form-select-sm" onchange="HotelBilling.handleRequestAction(${rid},this.value,this)">${opts.join('')}</select>`;

      };



      const rows=(d.requests||[]).map(r=>`<tr><td><strong>${esc(r.request_code)}</strong><div class="small text-muted">${esc(r.stay_code)}</div></td><td><strong>${esc(r.room_number)}</strong>${r.guest_name?`<div class="small text-primary" style="font-size:12px;"><i class="bi bi-person me-1"></i>${esc(r.guest_name)}</div>`:''}</td>${isDepartmentStaff?'':`<td>${deptBadge(r.assigned_department||r.service_type)}</td>`}<td>${r.request_kind==='ROOM_TRANSFER'?`<strong>Transfer requested to Room ${esc(r.requested_room_number||'—')}</strong><div class="small text-muted">${esc(r.description)}</div>`:esc(r.description)}${r.safety_note?`<div class="small text-danger mt-1"><i class="bi bi-exclamation-triangle me-1"></i>${esc(r.safety_note)}</div>`:''}${r.on_hold_reason?`<div class="small text-warning mt-1"><i class="bi bi-pause-circle me-1"></i>Hold note: ${esc(r.on_hold_reason)}</div>`:''}${r.rejection_reason?`<div class="small text-muted mt-1"><i class="bi bi-x-circle me-1"></i>Rejection: ${esc(r.rejection_reason)}</div>`:''}</td><td>${r.chargeable?php(r.price):'<span class="text-muted small">No charge</span>'}</td><td>${pill(r.status)}</td><td>${renderRowActions(r)}</td></tr>`).join('');



      const mobileCards = (d.requests||[]).map(r => `

        <div class="card border-0 shadow-sm p-3 mb-2 request-mobile-card">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <div>

              <span class="fw-bold fs-6">${esc(r.request_code)}</span>

              <span class="text-muted small ms-1">(${esc(r.stay_code)})</span>

            </div>

            ${pill(r.status)}

          </div>

          <div class="d-flex align-items-center justify-content-between mb-2">

            <div class="fw-bold text-dark">

              <i class="bi bi-door-closed me-1 text-muted"></i>Room ${esc(r.room_number)}

              ${r.guest_name?`<div class="small text-primary fw-normal mt-1"><i class="bi bi-person me-1"></i>${esc(r.guest_name)}</div>`:''}

            </div>

            ${isDepartmentStaff ? (Number(r.safety_flag||0)===1?'<div><span class="badge text-bg-danger">URGENT SAFETY</span></div>':'') : `<div>${deptBadge(r.assigned_department||r.service_type)}${Number(r.safety_flag||0)===1?'<div class="mt-1"><span class="badge text-bg-danger">URGENT SAFETY</span></div>':''}</div>`}

          </div>

          <div class="p-2 bg-light rounded small mb-2">

            ${r.request_kind==='ROOM_TRANSFER'?`<strong>Transfer requested to Room ${esc(r.requested_room_number||'—')}</strong><div class="small text-muted">${esc(r.description)}</div>`:esc(r.description)}
            ${r.safety_note?`<div class="small text-danger mt-1"><i class="bi bi-exclamation-triangle me-1"></i>${esc(r.safety_note)}</div>`:''}

            ${r.on_hold_reason?`<div class="small text-warning mt-1"><i class="bi bi-pause-circle me-1"></i>Hold note: ${esc(r.on_hold_reason)}</div>`:''}

            ${r.rejection_reason?`<div class="small text-muted mt-1"><i class="bi bi-x-circle me-1"></i>Rejection: ${esc(r.rejection_reason)}</div>`:''}

          </div>

          <div class="d-flex justify-content-between align-items-center mb-2">

            <span class="text-muted small">Charge</span>

            <span class="fw-semibold">${r.chargeable ? php(r.price) : '<span class="text-muted small">No charge</span>'}</span>

          </div>

          <div class="pt-2 border-top">

            <label class="form-label small text-muted mb-1">Actions:</label>

            ${renderRowActions(r)}

          </div>

        </div>

      `).join('') || `<div class="card border-0 shadow-sm p-4 text-center text-muted">${curRoleKey === 'maintenance' ? 'No maintenance work orders are assigned to your department.' : curRoleKey === 'service' ? 'No guest service requests are assigned to your department.' : 'No service requests for your department.'}</div>`;



      $('service-requests-content').innerHTML=`${deptBanner}
      <div class="d-none d-md-block">${table(isDepartmentStaff?['Request / Stay','Room','Work Details','Charge','Status','Action']:['Request / Stay','Room','Department','Request Details','Charge','Status','Action'],rows,curRoleKey === 'maintenance'?'No maintenance work orders are assigned to your department.':curRoleKey === 'service'?'No guest service requests are assigned to your department.':'No service requests for your department.')}</div>

      <div class="d-md-none">${mobileCards}</div>`;

    } else if (id==='catalog') {

      const [td,md,rd]=await Promise.all([api('room_types',{},'GET'),api('service_catalog',{},'GET'),api('rooms',{},'GET')]);

      const curRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();

      const isSuper = ['admin', 'manager'].includes(curRole);

      const isBarStaff = ['bar', 'minibar'].includes(curRole);

      const isRestStaff = ['restaurant', 'food_beverage'].includes(curRole);

      const types=td.types||[], items=md.items||[], allRooms=rd.rooms||[];

      const typeRows=types.map(t=>`<tr><td><strong>${esc(t.name)}</strong></td><td>${php(t.nightly_rate)}/night (VAT-inclusive)</td><td>${t.capacity}</td><td>${allRooms.filter(r=>Number(r.room_type_id)===Number(t.id)||r.type===t.name).length}</td><td><button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.editRoomType(${Number(t.id)})">Edit</button></td></tr>`).join('');

      const menuRows=items.map(i=>`<tr>

          <td class="fw-semibold text-dark">${esc(i.name)}</td>

          <td><span class="badge text-bg-light border">${esc(i.subcategory || i.category.replace('_',' & '))}</span></td>

          <td><span class="badge ${i.item_type==='DRINK'?'text-bg-info-subtle text-info-emphasis':i.item_type==='FOOD'?'text-bg-warning-subtle text-warning-emphasis':'text-bg-secondary-subtle'}">${esc(i.item_type||'OTHER')}</span></td>

          <td class="small text-muted">${esc(i.description||'—')}</td>

          <td class="fw-bold text-success">${php(i.price)}</td>

          <td>${Number(i.active)?pill('ACTIVE'):pill('INACTIVE')}</td>

          <td>

            <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="HotelBilling.editMenuItem(${i.id})">Edit</button> 

            ${Number(i.active)?`<button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="HotelBilling.toggleMenuItem(${i.id},0)">Disable</button>`:`<button class="btn btn-sm btn-outline-success py-0 px-2" onclick="HotelBilling.toggleMenuItem(${i.id},1)">Enable</button>`}

          </td>

        </tr>`).join('');;



      const mobileTypeCards = types.map(t=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <span class="fw-bold fs-6">${esc(t.name)}</span>

            <span class="badge text-bg-primary fs-6">${php(t.nightly_rate)} / night · VAT-inclusive</span>

          </div>

          <div class="row g-2 mb-2 small text-muted">

            <div class="col-6">Capacity: <strong class="text-dark">${t.capacity} guests</strong></div>

            <div class="col-6 text-end">Assigned rooms: <strong class="text-dark">${allRooms.filter(r=>Number(r.room_type_id)===Number(t.id)||r.type===t.name).length}</strong></div>

          </div>

          <div class="pt-2 border-top">

            <button class="btn btn-sm btn-outline-primary w-100" onclick="HotelBilling.editRoomType(${Number(t.id)})">

              <i class="bi bi-pencil me-1"></i>Edit Room Type

            </button>

          </div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No room types configured.</div>';



      const mobileMenuCards = items.map(i=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <div>

              <span class="fw-bold fs-6">${esc(i.name)}</span>

              <div class="small text-muted">${esc(i.category.replace('_',' & '))}</div>

            </div>

            <div>${Number(i.active)?pill('ACTIVE'):pill('INACTIVE')}</div>

          </div>

          ${i.description ? `<div class="p-2 bg-light rounded small mb-2 text-muted">${esc(i.description)}</div>` : ''}

          <div class="d-flex justify-content-between align-items-center mb-2">

            <span class="text-muted small">Price</span>

            <strong class="fs-6 text-dark">${php(i.price)}</strong>

          </div>

          <div class="d-flex gap-2 pt-2 border-top">

            <button class="btn btn-sm btn-outline-primary flex-fill" onclick="HotelBilling.editMenuItem(${i.id})"><i class="bi bi-pencil me-1"></i>Edit</button>

            ${Number(i.active)?`<button class="btn btn-sm btn-outline-danger flex-fill" onclick="HotelBilling.toggleMenuItem(${i.id},0)"><i class="bi bi-slash-circle me-1"></i>Disable</button>`:`<button class="btn btn-sm btn-outline-success flex-fill" onclick="HotelBilling.toggleMenuItem(${i.id},1)"><i class="bi bi-check-circle me-1"></i>Enable</button>`}

          </div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No hotel services or amenities configured.</div>';



      $('catalog-content').innerHTML=`<div class="d-flex flex-wrap gap-2 mb-3"><button class="btn btn-primary btn-sm" onclick="HotelBilling.addRoomType()"><i class="bi bi-plus-lg me-1"></i>Add Room Type</button>${['admin','manager'].includes(curRole) ? '<button class="btn btn-outline-primary btn-sm" onclick="HotelBilling.addRoom()"><i class="bi bi-plus-lg me-1"></i>Add Room</button>' : ''}<button class="btn btn-outline-primary btn-sm" onclick="HotelBilling.addMenuItem()"><i class="bi bi-plus-lg me-1"></i>Add Service / Amenity</button></div>

      <div class="card border-0 shadow-sm mb-4"><div class="card-header bg-white fw-bold">Room Types & Nightly Prices</div>

        <div class="d-none d-md-block">${table(['Room type','Nightly price (VAT-inclusive)','Capacity','Rooms','Action'],typeRows,'No room types configured.')}</div>

        <div class="d-md-none p-2">${mobileTypeCards}</div>

      </div>

      <div class="card border-0 shadow-sm"><div class="card-header bg-white fw-bold">Priced Service Menu</div><div class="p-3 small text-muted">Manage selectable items for Food & Beverage, Housekeeping, General Services, Laundry, Minibar, and Other. Prices are applied by the server when a menu item is selected.</div>

        <div class="d-none d-md-block">${table(['Item','Category','Description','Price','Status','Action'],menuRows,'No hotel services or amenities configured.')}</div>

        <div class="d-md-none p-2">${mobileMenuCards}</div>

      </div>`;

    } else if (id==='reports') {

      const d=await api('reports',{},'GET');

      const rows=(d.daily_payments||[]).map(r=>`<tr><td><button class="btn btn-sm btn-link" onclick="HotelBilling.reportDetails('${esc(r.day)}')">${esc(r.day)}</button></td><td>${r.payments_count}</td><td>${php(r.revenue)}</td></tr>`).join('');

      const b=d.billing_summary||{};

      const catRows=(b.additional_charges_by_category||[]).map(c=>`<tr><td>${esc(c.category)}</td><td>${c.charges_count}</td><td>${php(c.amount)}</td></tr>`).join('');

      const v=d.vat_summary||{};
      const vatRows=(d.daily_vat||[]).map(t=>`<tr><td>${esc(t.day)}</td><td>${php(t.vatable_sales)}</td><td>${php(t.vat_amount)}</td><td>${php(t.vat_exempt_sales)}</td><td>${php(t.total_amount)}</td></tr>`).join('');



      const mobileReportCards = (d.daily_payments||[]).map(r=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-center mb-1">

            <button class="btn btn-link p-0 fw-bold fs-6 text-decoration-none" onclick="HotelBilling.reportDetails('${esc(r.day)}')">

              <i class="bi bi-calendar3 me-1"></i>${esc(r.day)}

            </button>

            <span class="badge text-bg-success fs-6">${php(r.revenue)}</span>

          </div>

          <div class="small text-muted">Payments count: <strong class="text-dark">${r.payments_count}</strong></div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No payment activity.</div>';



      const mobileCategoryCards = (b.additional_charges_by_category||[]).map(c=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-center mb-1">

            <span class="fw-bold fs-6">${esc(c.category)}</span>

            <span class="text-dark fw-bold fs-6">${php(c.amount)}</span>

          </div>

          <div class="small text-muted">Count: <strong class="text-dark">${c.charges_count}</strong></div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No additional charges in this period.</div>';



      $('reports-content').innerHTML=`<div class="alert alert-light border"><strong>Shesh Dev Hotel</strong><br>Agora, Lapasan, Cagayan de Oro</div>

      <div class="row g-2 g-sm-3 mb-3">${[['Finalized early checkouts',b.early_checkout_count||0],['Early-checkout charges',php(b.early_checkout_charges||0)]].map(x=>`<div class="col-6 col-lg-3"><div class="card border-0 shadow-sm h-100"><div class="card-body p-2 p-sm-3"><div class="small text-muted dashboard-stat-label">${x[0]}</div><div class="dashboard-stat-value ${String(x[1]).includes('₱')?'is-currency':''}">${x[1]}</div></div></div></div>`).join('')}</div>

      <div class="card border-0 shadow-sm mb-3"><div class="card-body"><h6 class="fw-bold">Collections report · last 30 days</h6><p class="small text-muted">Click a date to inspect the underlying transactions.</p>

        <div class="d-none d-md-block">${table(['Date','Payments','Collected'],rows,'No payment activity.')}</div>

        <div class="d-md-none">${mobileReportCards}</div>

      </div></div>

        <div class="card border-0 shadow-sm mb-3"><div class="card-body"><h6 class="fw-bold">VAT report · finalized folios · last 30 days</h6><p class="small text-muted">Each folio is reported once at checkout. Partial payments do not duplicate VAT in this report.</p>
          <div class="row g-2 mb-3">${[['VATable sales',v.vatable_sales],['VAT collected',v.vat_amount],['VAT-exempt sales',v.vat_exempt_sales],['Total billed',v.total_amount]].map(([label,value])=>`<div class="col-6 col-lg-3"><div class="p-3 bg-light rounded"><div class="small text-muted">${label}</div><strong>${php(value||0)}</strong></div></div>`).join('')}</div>
          <div class="d-none d-md-block">${table(['Checkout date','VATable sales','VAT','VAT-exempt sales','Total'],vatRows,'No finalized folios in this period.')}</div>
        </div></div>

        <div class="card border-0 shadow-sm"><div class="card-body"><h6 class="fw-bold">Additional charges by category · last 30 days</h6>

        <div class="d-none d-md-block">${table(['Category','Count','Amount'],catRows,'No additional charges in this period.')}</div>

        <div class="d-md-none">${mobileCategoryCards}</div>

      </div></div>`;

    } else if (id==='audit-logs') {

      const d=await api('audit_logs',{},'GET');

      const rows=(d.logs||[]).map(r=>`<tr><td>${esc(r.created_at)}</td><td>${esc(r.username||'System')}</td><td>${esc(r.action)}</td><td>${esc(r.entity_type)} ${esc(r.entity_id||'')}</td><td><code>${esc(r.details||'')}</code></td></tr>`).join('');

      const mobileAuditCards = (d.logs||[]).map(r=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <div>

              <span class="badge text-bg-light border text-dark fw-bold">${esc(r.action)}</span>

              <div class="small text-muted mt-1"><i class="bi bi-clock me-1"></i>${esc(r.created_at)}</div>

            </div>

            <span class="badge text-bg-secondary">${esc(r.username||'System')}</span>

          </div>

          <div class="small text-muted mb-2">

            Record: <strong class="text-dark">${esc(r.entity_type)} ${esc(r.entity_id||'')}</strong>

          </div>

          ${r.details ? `<div class="p-2 bg-light rounded small font-monospace text-break">${esc(r.details)}</div>` : ''}

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No audit events found.</div>';



      $('audit-logs-content').innerHTML=`

        <div class="d-none d-md-block">${table(['Time','User','Action','Record','Details'],rows,'No audit events found.')}</div>

        <div class="d-md-none">${mobileAuditCards}</div>

      `;

    } else if (id==='discounts') {

      $('discounts-content').innerHTML=`<div id="discount-policy-admin"><div class="text-muted p-3">Loading discount policies…</div></div>`; await renderDiscountAdmin();

    } else if (id==='walkin-checkin') {

      await renderWalkinCheckin();

    } else if (id==='checkout') {

      await renderCheckoutDashboard();

    } else if (id==='early-checkout-requests') {

      await renderEarlyCheckoutRequests('early-checkout-requests-content');

    } else if (id==='early-checkouts') {

      const curRole = String(window.HotelAuth.getUser()?.role||'').toLowerCase();

      if (!['admin','manager'].includes(curRole)) { $('early-checkouts-content').innerHTML='<div class="alert alert-warning">Only administrators and managers can review early-checkout requests.</div>'; return; }

      await renderEarlyCheckoutRequests('early-checkouts-content');

    } else if (id==='guest-chats') {

      const curRole = String(window.HotelAuth.getUser()?.role||'').toLowerCase();

      if (curRole !== 'frontdesk') { $('guest-chats-content').innerHTML='<div class="alert alert-warning">Guest chats are available to the front desk only.</div>'; return; }

      await renderGuestChats();

    } else if (id==='settings') {

      const u=window.HotelAuth.getUser(); $('settings-content').innerHTML=`<div class="card border-0 shadow-sm mb-4"><div class="card-body"><h6 class="fw-bold">Account & system settings</h6><p>Signed in as <strong>${esc(u?.username)}</strong> (${esc(u?.role)}).</p><p>Hotel billing stores stay and folio references, not a guest directory. The guest portal token is private and should be shared directly with the guest.</p><hr><form id="pw-form" class="row g-3"><div class="col-md-4"><label class="form-label">Current password</label><input class="form-control" name="old_password" type="password" required></div><div class="col-md-4"><label class="form-label">New password (minimum 6 characters)</label><input class="form-control" name="new_password" type="password" minlength="6" required></div><div class="col-md-4 d-flex align-items-end"><button class="btn btn-primary">Change Password</button></div></form></div></div><div id="policy-admin"><div class="text-muted p-3">Loading policy lookups…</div></div>`; $('pw-form').onsubmit=async e=>{e.preventDefault();try{await api('change_password',Object.fromEntries(new FormData(e.target)));notify('Password updated.');e.target.reset()}catch(err){notify(err.message,true)}}; if(['admin','manager'].includes((u?.role||'').toLowerCase())) await renderPolicyAdmin(); else $('policy-admin').textContent='Policy configuration is managed by an administrator or manager.';

    }

    if (id === 'settings' && String(window.HotelAuth.getUser()?.role || '').toLowerCase() === 'admin') {
      $('settings-content').insertAdjacentHTML('afterbegin', '<div id="vat-settings"></div>');
      await renderVatSettings();
      $('settings-content').insertAdjacentHTML('afterbegin', '<div id="demo-clock-admin"></div>');
      await renderDemoClockAdmin();
    }

  }

  function modal(title, html) { const root=document.createElement('div'); root.className='modal fade'; root.tabIndex=-1; root.innerHTML=`<div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content"><div class="modal-header d-flex justify-content-between align-items-center"><h5 class="modal-title mb-0">${title}</h5><button class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body">${html}</div></div></div>`; document.body.appendChild(root); const m=new bootstrap.Modal(root); root.addEventListener('hidden.bs.modal',()=>root.remove()); m.show(); return {root,m}; }

  const knownLanIp = '192.168.254.177'; // configured via .env HOTEL_SERVER_IP



  function resolvePortalUrl(guestPortalUrl) {

    const activeProtocol = location.protocol && location.protocol.startsWith('http') ? location.protocol : 'http:';

    const activeHost =

      location.hostname && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)

        ? location.hostname

        : knownLanIp;

    const activePort = location.port ? `:${location.port}` : '';

    let activeOrigin = `${activeProtocol}//${activeHost}${activePort}`;

    const configuredBase = String(window.__HOTEL_PORTAL_BASE || '').trim();

    if (configuredBase) {

      try {

        const configuredUrl = new URL(configuredBase);

        if (configuredUrl.protocol === 'http:' || configuredUrl.protocol === 'https:') {

          activeOrigin = configuredUrl.origin;

        }

      } catch (error) {

        console.warn('Configured guest portal base URL is invalid; using the current host.', error);

      }

    }



    let urlStr = String(guestPortalUrl || '').trim();

    if (!urlStr) return `${activeOrigin}/portal.php`;



    // Replace any localhost or previous LAN IP (e.g., 192.168.0.14) with current active IP

    urlStr = urlStr.replace(/^https?:\/\/[^\/]+/, activeOrigin);



    try {

      const u = new URL(urlStr, activeOrigin);

      // Guest portals are exposed by the Next.js same-origin rewrite at /portal.php.
      // Normalize old saved links too, so a project-folder prefix cannot fall through
      // to the Next.js login page instead of reaching the PHP guest portal.
      const portalOrigin = new URL(activeOrigin);
      u.protocol = portalOrigin.protocol;
      u.host = portalOrigin.host;
      u.pathname = '/portal.php';

      return u.href;

    } catch (_) {

      return `${activeOrigin}/${urlStr.replace(/^\/+/, '')}`;

    }

  }



  function renderQrCode(container, text) {

    if (!container) return;

    container.innerHTML = '';

    let rendered = false;

    if (typeof window.QRCode !== 'undefined') {

      try {

        new window.QRCode(container, {

          text: text,

          width: 220,

          height: 220,

          colorDark: '#000000',

          colorLight: '#ffffff',

          correctLevel: window.QRCode.CorrectLevel.L

        });

        rendered = true;

      } catch (err) {

        console.warn('QRCode JS failed, falling back to image:', err);

      }

    }

    if (!rendered || !container.hasChildNodes()) {

      const img = document.createElement('img');

      img.alt = 'Guest Portal QR Code';

      img.style.cssText = 'width:220px;height:220px;display:block;margin:0 auto;border-radius:6px;';

      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}`;

      container.innerHTML = '';

      container.appendChild(img);

    }

  }



  function printGuestPass(stayCode, folioNumber, qrSrc, portalUrl) {

    const printWin = window.open('', '_blank', 'width=460,height=640');

    if (!printWin) {

      window.print();

      return;

    }

    printWin.document.write(`<!DOCTYPE html>

<html>

<head>

  <meta charset="utf-8">

  <title>Guest Pass - ${esc(stayCode)}</title>

  <style>

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

    body { background: #ffffff; color: #000000; padding: 32px 20px; text-align: center; }

    .card { max-width: 330px; margin: 0 auto; border: 2px dashed #000000; border-radius: 16px; padding: 24px 20px; background: #fff; }

    .hotel { font-size: 16px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 2px; color: #000; }

    .address { font-size: 11px; color: #64748b; margin-bottom: 16px; }

    .code-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; margin-bottom: 4px; font-weight: 600; }

    .stay-code { display: inline-block; background: #000000; color: #ffffff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 19px; font-weight: 800; padding: 7px 18px; border-radius: 8px; margin-bottom: 12px; letter-spacing: 1.5px; }

    .folio { font-size: 12px; color: #334155; margin-bottom: 14px; }

    .qr-box { display: flex; justify-content: center; align-items: center; margin: 12px 0; padding: 8px; background: #fff; }

    .qr-box img, .qr-box canvas { width: 200px !important; height: 200px !important; }

    .instructions { font-size: 11px; color: #475569; line-height: 1.45; margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 12px; }

    @media print {

      body { padding: 0; }

      .card { border: 1px solid #000; }

    }

  </style>

</head>

<body>

  <div class="card">

    <div class="hotel">Shesh Dev Hotel</div>

    <div class="address">Agora, Lapasan, Cagayan de Oro</div>

    <div class="code-label">Stay Reference Code</div>

    <div class="stay-code">${esc(stayCode)}</div>

    <div class="folio">Folio: <strong>${esc(folioNumber)}</strong></div>

    <div class="qr-box">

      ${qrSrc ? `<img src="${qrSrc}" alt="QR Code">` : `<div style="font-size:11px;word-break:break-all;">${esc(portalUrl)}</div>`}

    </div>

    <div class="instructions">

      Scan this QR code with your smartphone camera to access room services, dining orders, and your live folio bill.<br>

      Or visit: <strong>${esc(portalUrl)}</strong>

    </div>

  </div>

  <script>

    window.onload = function() {

      setTimeout(function() { window.print(); }, 250);

    };

  <\/script>

</body>

</html>`);

    printWin.document.close();

  }



  function showCheckinComplete(r) {

    const portal = resolvePortalUrl(r.guest_portal_url);

    const saved = JSON.parse(localStorage.getItem('sheshDevGuestLinks') || '[]');

    saved.unshift({ stay: r.stay_code, folio: r.folio_number, url: portal, created: new Date().toISOString() });

    localStorage.setItem('sheshDevGuestLinks', JSON.stringify(saved.slice(0, 100)));



    const content = `

      <div class="text-center py-1">

        <div class="mb-3">

          <div class="d-inline-flex align-items-center gap-1 text-warning-emphasis fw-bold mb-1">

            <i class="bi bi-hourglass-split fs-5"></i>

            <span class="fs-6">Check-In Pending Cashier Payment</span>

          </div>

          <p class="text-muted small mb-0">Present this QR code or stay code to the guest to access their private portal.</p>

        </div>



        <div class="card border shadow-sm mx-auto p-4 mb-3" style="max-width: 380px; background: #ffffff; border-radius: 16px;">

          <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">

            <span class="fw-bold small text-secondary text-uppercase tracking-wide" style="font-size: 0.75rem;">SHESH DEV HOTEL</span>

            <span class="badge bg-black text-white px-2 py-1" style="background:#000000 !important; font-size: 0.7rem;">Guest Pass</span>

          </div>



          <div class="mb-2 text-center">

            <div class="text-muted small mb-1">Stay Reference Code</div>

            <div class="badge bg-black text-white font-monospace fs-4 px-3 py-2 text-uppercase shadow-sm" style="background:#000000 !important; letter-spacing: 2px;">${esc(r.stay_code)}</div>

            <div class="mt-1">

              <button class="btn btn-sm btn-outline-dark py-0 px-2" type="button" id="copy-stay-code-btn" style="font-size:0.75rem;">

                <i class="bi bi-clipboard me-1"></i>Copy Code

              </button>

            </div>

            <div class="small text-muted mt-2">Folio: <strong class="text-dark font-monospace">${esc(r.folio_number)}</strong></div>

          </div>



          <div id="checkin-qr-container" class="d-flex justify-content-center align-items-center p-3 bg-white rounded border my-2" style="min-height: 240px; background: #ffffff !important;">

            <div class="spinner-border spinner-border-sm text-dark" role="status"></div>

          </div>



          <div class="text-center mt-2">

            <span class="badge bg-light text-dark border px-3 py-1 rounded-pill small fw-semibold">

              <i class="bi bi-camera me-1"></i> Scan QR code with phone camera

            </span>

          </div>

        </div>



        ${Number(r.required_amount)>0?`<div class="alert alert-warning mx-auto text-start" style="max-width: 380px;"><strong><i class="bi bi-cash-register me-1"></i>Next step — Cashier payment:</strong><br>The guest settles <strong>${php(r.required_amount)}</strong> (${Number(r.required_percent)===60?'60% downpayment':'100% full payment'} of ${php(r.total_amount)}) at the Cashier. This check-in is <strong>confirmed only after the Cashier approves the payment</strong> — Front Desk and the guest portal update automatically.</div>`:''}



        <div class="card bg-light border-0 p-2 mx-auto mb-3" style="max-width: 380px;">

          <div class="input-group input-group-sm">

            <input type="text" class="form-control bg-white font-monospace small" value="${esc(portal)}" readonly id="qr-portal-url">

            <button class="btn btn-dark" type="button" id="copy-portal-btn" title="Copy portal link">

              <i class="bi bi-clipboard me-1"></i> Copy Link

            </button>

          </div>

        </div>



        <div class="d-flex justify-content-center gap-2 flex-wrap">

          <button class="btn btn-outline-dark" id="print-qr-btn">

            <i class="bi bi-printer me-1"></i> Print Pass

          </button>

          <button class="btn btn-outline-secondary" id="save-qr-img-btn">

            <i class="bi bi-download me-1"></i> Save QR

          </button>

          <a class="btn btn-dark" href="${esc(portal)}" target="_blank" rel="noopener">

            <i class="bi bi-box-arrow-up-right me-1"></i> Open Portal

          </a>

        </div>

      </div>

    `;



    const x = modal('Guest Check-In · QR Code & Pass', content);

    const qrContainer = x.root.querySelector('#checkin-qr-container');



    renderQrCode(qrContainer, portal);



    const getQrSrc = () => {

      if (!qrContainer) return null;

      const canvas = qrContainer.querySelector('canvas');

      if (canvas) {

        try { return canvas.toDataURL('image/png'); } catch (_) {}

      }

      const img = qrContainer.querySelector('img');

      if (img && img.src) return img.src;

      return null;

    };



    x.root.querySelector('#copy-stay-code-btn')?.addEventListener('click', () => {

      navigator.clipboard.writeText(r.stay_code)

        .then(() => notify(`Stay code ${r.stay_code} copied.`))

        .catch(() => notify('Copy failed; please copy manually.', true));

    });



    x.root.querySelector('#copy-portal-btn')?.addEventListener('click', () => {

      navigator.clipboard.writeText(portal)

        .then(() => notify('Guest portal link copied.'))

        .catch(() => notify('Copy failed; select and copy manually.', true));

    });



    x.root.querySelector('#save-qr-img-btn')?.addEventListener('click', () => {

      const src = getQrSrc();

      if (src) {

        const a = document.createElement('a');

        a.href = src;

        a.download = `Pass_${r.stay_code}.png`;

        document.body.appendChild(a);

        a.click();

        a.remove();

        notify('QR code image saved.');

      } else {

        notify('QR image is not ready yet.', true);

      }

    });



    x.root.querySelector('#print-qr-btn')?.addEventListener('click', () => {

      const src = getQrSrc();

      printGuestPass(r.stay_code, r.folio_number, src, portal);

    });

  }



  function hasGuestPortalToken(url) {

    try {

      return /^[a-f0-9]{64}$/i.test(new URL(url, window.location.origin).searchParams.get('t') || '');

    } catch (_) {

      return false;

    }

  }

  async function showStayQr(stayCode, folioNumber, savedUrl = '') {

    const saved = JSON.parse(localStorage.getItem('sheshDevGuestLinks') || '[]');

    const match = saved.find(item => item.stay === stayCode);

    const portalUrl = [savedUrl, match?.url]

      .filter(url => typeof url === 'string' && url !== '')

      .map(resolvePortalUrl)

      .find(hasGuestPortalToken);

    if (portalUrl) {

      showCheckinComplete({

        stay_code: stayCode,

        folio_number: folioNumber || match?.folio || 'N/A',

        guest_portal_url: portalUrl

      });

      return;

    }

    try {

      const result = await api('guest_portal_link', { stay_code: stayCode });

      if (!hasGuestPortalToken(result.guest_portal_url)) {

        throw new Error('The server did not return a valid guest portal link.');

      }

      showCheckinComplete({

        stay_code: stayCode,

        folio_number: folioNumber || 'N/A',

        guest_portal_url: result.guest_portal_url

      });

    } catch (error) {

      notify(error.message || 'Could not create a guest portal link.', true);

    }

  }



  async function checkin(preselectedGuest = null) {
    try {
      const timePolicy = await api('hotel_time_policy', {}, 'GET');
      if (!timePolicy.checkin_open) {
        return notify(`Check-in opens at 2:00 PM (${timePolicy.timezone}). Current hotel time: ${timePolicy.hotel_now}.`, true);
      }
      const d = await api('rooms', {}, 'GET');
      rooms = (d.rooms || []).filter(r => r.status === 'AVAILABLE');
      if (!rooms.length) return notify('No available rooms.', true);

      const firstRoom = rooms[0];

      const modalHtml = `
        <form id="new-checkin" class="row g-3">
          <div class="col-12">
            <div class="alert alert-light border py-2 mb-0 small text-muted">
              Guest <strong>first and last name are required</strong>. Front Desk records the stay; all eligible discounts are reviewed and applied by the Cashier.
            </div>
          </div>

          <div class="col-12" id="ck-guest-search-wrap">
            <label class="form-label">Book under an existing guest <span class="text-muted">(Optional)</span></label>
            <input class="form-control" type="text" id="ck-guest-search" maxlength="100" placeholder="Search by name or contact number…" autocomplete="off">
            <div id="ck-guest-results" class="list-group mt-2"></div>
          </div>
          <div class="col-12 d-none" id="ck-preselected-banner">
            <div class="alert alert-primary py-2 mb-0 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span>Booking under: <strong id="ck-preselected-name"></strong></span>
              <button type="button" class="btn btn-sm btn-outline-primary" id="ck-change-guest">Change guest</button>
            </div>
          </div>

          <div class="col-md-6">
            <label class="form-label fw-semibold">First name <span class="text-danger">*</span></label>
            <input class="form-control" type="text" name="first_name" id="ck-first-name" maxlength="100" placeholder="e.g. Juan" required autofocus>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">Last name <span class="text-danger">*</span></label>
            <input class="form-control" type="text" name="last_name" id="ck-last-name" maxlength="100" placeholder="e.g. Dela Cruz" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">Contact number <span class="text-muted">(Optional)</span></label>
            <input class="form-control" type="tel" name="contact_number" id="ck-contact" maxlength="30" placeholder="e.g. 0917 123 4567">
          </div>
          <div class="col-md-6">
            <label class="form-label">Email <span class="text-muted">(Optional)</span></label>
            <input class="form-control" type="email" name="email" id="ck-email" maxlength="150" placeholder="e.g. juan@example.com">
          </div>
          <!-- Room & Stay Details -->
          <div class="col-md-6">
            <label class="form-label fw-semibold">Available Room <span class="text-danger">*</span></label>
            <select class="form-select" name="room_id" id="ck-room-id" required>
              ${rooms.map(r => `<option value="${r.id}" data-rate="${r.nightly_rate}" data-capacity="${r.capacity}" data-num="${esc(r.room_number)}" data-type="${esc(r.type)}">${esc(r.room_number)} · ${esc(r.type)} · ${php(r.nightly_rate)}/night (VAT-inclusive, cap: ${r.capacity})</option>`).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label fw-semibold">Guests</label>
            <input class="form-control" type="number" name="guests" id="ck-guests" min="1" max="${firstRoom.capacity || 10}" value="1" required>
          </div>
          <div class="col-md-3">
            <label class="form-label fw-semibold">Nights</label>
            <input class="form-control fw-bold" type="number" name="nights" id="ck-nights" min="1" max="90" value="1" required>
          </div>

          <!-- Occupants: one row per guest (mirrors group check-in) -->
          <div class="col-12" id="ck-occupants-section">
            <div class="border rounded p-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold small text-uppercase text-secondary" style="letter-spacing:0.5px;">
                  <i class="bi bi-people me-1"></i>Occupants
                </span>
                <span class="small text-muted" id="ck-occupants-count-note"></span>
              </div>
              <div id="ck-occupants-hint" class="alert alert-info py-2 mb-2 small d-none">Booked under <strong id="ck-occupants-booker"></strong> — list the people actually staying in this room.</div>
              <div id="ck-occupant-rows"></div>
              <div class="small text-muted">One occupant per guest. First and last names are required; contact number is optional.</div>
            </div>
          </div>

          <!-- Real-Time Live Calculation Display -->
          <div class="col-12">
            <div class="p-3 rounded border shadow-sm" style="background:#f8fafc; border-color:#e2e8f0 !important;">
              <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                <span class="fw-bold small text-uppercase text-secondary" style="letter-spacing:0.5px;">
                  <i class="bi bi-calculator me-1"></i>Automatic Bill Calculation
                </span>
                <span class="badge" id="ck-live-policy-badge" style="font-size:11px;">Standard Stay</span>
              </div>

              <div class="row g-2 small">
                <div class="col-6 text-muted">Room Accommodation (VAT-inclusive):</div>
                <div class="col-6 text-end font-monospace text-dark" id="ck-calc-gross">₱0.00</div>

                <div class="col-6 text-muted">Discount (Cashier only):</div>
                <div class="col-6 text-end font-monospace text-success fw-bold" id="ck-calc-discount">-₱0.00</div>

                <div class="col-6 text-muted">VAT:</div>
                  <div class="col-6 text-end font-monospace text-dark" id="ck-calc-vat">Included in room rate</div>

                <div class="col-6 fw-bold text-dark pt-1 border-top fs-6">Total Billing:</div>
                <div class="col-6 text-end font-monospace fw-bold text-dark pt-1 border-top fs-6" id="ck-calc-total">₱0.00</div>
              </div>

              <!-- Stay Duration Policy Note -->
              <div class="mt-3 p-2 rounded small" id="ck-policy-alert-box" style="background:#e0f2fe; border: 1px solid #bae6fd; color:#0369a1;">
              </div>
            </div>
          </div>

          <div class="col-12 text-end pt-2 border-top">
            <button type="button" class="btn btn-outline-secondary me-2" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary fw-bold px-4 shadow-sm">
              <i class="bi bi-check-circle me-1"></i>Confirm Check-in
            </button>
          </div>
        </form>
      `;

      const {root, m} = modal('Walk-in Check-in', modalHtml);

      // Existing-guest booking: preselect a guest (from "Book additional
      // room" or from the search below), lock their details, and send
      // customer_id so no duplicate guest record is created. Clearing
      // returns the form to blank new-guest mode. The stored guest record
      // is never edited here; corrections belong in Guest details.
      let selectedCustomerId = null;
      const searchWrap = root.querySelector('#ck-guest-search-wrap');
      const searchInput = root.querySelector('#ck-guest-search');
      const resultsBox = root.querySelector('#ck-guest-results');
      const preselectedBanner = root.querySelector('#ck-preselected-banner');
      const preselectedName = root.querySelector('#ck-preselected-name');
      const firstNameInput = root.querySelector('#ck-first-name');
      const lastNameInput = root.querySelector('#ck-last-name');
      const contactInput = root.querySelector('#ck-contact');
      const emailInput = root.querySelector('#ck-email');
      const guestDetailInputs = [firstNameInput, lastNameInput, contactInput, emailInput];
      const occupantRowsBox = root.querySelector('#ck-occupant-rows');
      const occupantsHint = root.querySelector('#ck-occupants-hint');
      const occupantsBooker = root.querySelector('#ck-occupants-booker');
      const occupantsCountNote = root.querySelector('#ck-occupants-count-note');
      const applyPreselection = (g) => {
        selectedCustomerId = Number(g.customer_id) || null;
        firstNameInput.value = g.first_name || '';
        lastNameInput.value = g.last_name || '';
        contactInput.value = g.contact_number || '';
        emailInput.value = g.email || '';
        guestDetailInputs.forEach(el => { el.readOnly = true; });
        preselectedName.textContent = [g.first_name, g.last_name].filter(Boolean).join(' ') || 'Guest';
        preselectedBanner.classList.remove('d-none');
        searchWrap.classList.add('d-none');
        resultsBox.innerHTML = '';
        occupantsBooker.textContent = [g.first_name, g.last_name].filter(Boolean).join(' ') || 'Guest';
        occupantsHint.classList.remove('d-none');
      };
      const clearPreselection = () => {
        selectedCustomerId = null;
        guestDetailInputs.forEach(el => { el.value = ''; el.readOnly = false; });
        preselectedBanner.classList.add('d-none');
        searchWrap.classList.remove('d-none');
        resultsBox.innerHTML = '';
        searchInput.value = '';
        occupantsHint.classList.add('d-none');
      };
      root.querySelector('#ck-change-guest').addEventListener('click', clearPreselection);
      let guestSearchTimer = null;
      let lastGuestResults = [];
      searchInput.addEventListener('input', () => {
        clearTimeout(guestSearchTimer);
        const q = searchInput.value.trim();
        if (q.length < 2) { resultsBox.innerHTML = ''; return; }
        guestSearchTimer = setTimeout(async () => {
          try {
            const res = await api('customer_search', { q }, 'GET');
            lastGuestResults = res.customers || [];
            if (!lastGuestResults.length) {
              resultsBox.innerHTML = `<div class="small text-muted px-1">No matching guest found.</div>`;
              return;
            }
            resultsBox.innerHTML = lastGuestResults.map((c, i) => {
              const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Guest';
              const meta = [c.contact_number, c.email].filter(Boolean).join(' · ');
              return `<button type="button" class="list-group-item list-group-item-action" data-idx="${i}"><strong>${esc(name)}</strong>${meta ? `<span class="small text-muted d-block">${esc(meta)}</span>` : ''}</button>`;
            }).join('');
            resultsBox.querySelectorAll('[data-idx]').forEach(btn => btn.addEventListener('click', () => applyPreselection(lastGuestResults[Number(btn.dataset.idx)])));
          } catch (err) {
            resultsBox.innerHTML = `<div class="small text-danger px-1">${esc(err.message || 'Guest search failed.')}</div>`;
          }
        }, 300);
      });
      if (preselectedGuest && preselectedGuest.customer_id) applyPreselection(preselectedGuest);

      const roomSelect = root.querySelector('#ck-room-id');
      const nightsInput = root.querySelector('#ck-nights');
      const guestsInput = root.querySelector('#ck-guests');

      const calcGrossEl = root.querySelector('#ck-calc-gross');
      const calcDiscountEl = root.querySelector('#ck-calc-discount');
      const calcVatEl = root.querySelector('#ck-calc-vat');
      const calcTotalEl = root.querySelector('#ck-calc-total');
      const policyBadgeEl = root.querySelector('#ck-live-policy-badge');
      const policyAlertBox = root.querySelector('#ck-policy-alert-box');


      const updateCalculations = () => {
        const selectedOpt = roomSelect.options[roomSelect.selectedIndex];
        const nightlyRate = Number(selectedOpt?.getAttribute('data-rate') || 0);
        const capacity = Number(selectedOpt?.getAttribute('data-capacity') || 1);
        guestsInput.max = capacity;

        let nights = Math.max(1, Math.min(90, parseInt(nightsInput.value || 1, 10)));
        if (isNaN(nights)) nights = 1;

        const roomSubtotal = Math.round(nightlyRate * nights * 100) / 100;
        const discountVal = 0;
        const totalNetBill = roomSubtotal;


        calcGrossEl.textContent = `${php(roomSubtotal)} (${nights} night${nights > 1 ? 's' : ''} × ${php(nightlyRate)})`;
        calcDiscountEl.textContent = discountVal > 0 ? `-${php(discountVal)}` : '₱0.00';
        calcVatEl.textContent = 'Included in room rate';
        calcTotalEl.textContent = php(totalNetBill);

        // 5+ Days Stay Rule
        const is5DaysAbove = (nights >= 5);
        if (is5DaysAbove) {
          const downpayment = Math.round((totalNetBill * 0.60) * 100) / 100;
          const balance = Math.round((totalNetBill - downpayment) * 100) / 100;
          policyBadgeEl.className = 'badge text-bg-warning text-dark';
          policyBadgeEl.textContent = '5+ Days Stay Rule';
          policyAlertBox.style.background = '#fef3c7';
          policyAlertBox.style.borderColor = '#fde68a';
          policyAlertBox.style.color = '#92400e';
          policyAlertBox.innerHTML = `
            <div class="fw-bold mb-1"><i class="bi bi-calendar-check me-1"></i>5+ Days Stay Policy Active (${nights} Nights):</div>
            <div>• <strong>Required Downpayment (60%):</strong> <span class="text-success fw-bold">${php(downpayment)}</span> (Settle at Cashier upon check-in)</div>
            <div>• <strong>Remaining Balance (40%):</strong> <span class="text-danger fw-bold">${php(balance)}</span> (Passes to guest folio balance)</div>
          `;
        } else {
          policyBadgeEl.className = 'badge text-bg-primary';
          policyBadgeEl.textContent = 'Standard Short Stay';
          policyAlertBox.style.background = '#e0f2fe';
          policyAlertBox.style.borderColor = '#bae6fd';
          policyAlertBox.style.color = '#0369a1';
          policyAlertBox.innerHTML = `
            <div class="fw-bold mb-1"><i class="bi bi-info-circle me-1"></i>Stay under 5 days (${nights} Night${nights > 1 ? 's' : ''}):</div>
            <div>• <strong>100% Full Payment Required:</strong> <span class="text-dark fw-bold">${php(totalNetBill)}</span> (Must be paid in full at Cashier)</div>
            <div>• <strong>Balance to Pass:</strong> <span class="text-muted fw-bold">₱0.00</span> (No balance carried over)</div>
          `;
        }
      };

      roomSelect.addEventListener('change', updateCalculations);
      nightsInput.addEventListener('input', updateCalculations);

      updateCalculations();

      // Occupants: one row per guest, re-rendered when Guests changes.
      // Already-typed values survive by row index; "Use booker" copies the
      // booker fields into a row (for when the booker is also staying).
      const renderOccupantRows = () => {
        const prev = [];
        occupantRowsBox.querySelectorAll('[data-occupant-row]').forEach(row => {
          prev.push({
            first: row.querySelector('[data-occ-first]')?.value || '',
            last: row.querySelector('[data-occ-last]')?.value || '',
            contact: row.querySelector('[data-occ-contact]')?.value || ''
          });
        });
        let count = parseInt(guestsInput.value || 1, 10);
        if (isNaN(count) || count < 1) count = 1;
        occupantsCountNote.textContent = `${count} occupant${count > 1 ? 's' : ''} for ${count} guest${count > 1 ? 's' : ''}`;
        occupantRowsBox.innerHTML = Array.from({length: count}, (_, i) => {
          const p = prev[i] || {first: '', last: '', contact: ''};
          return `<div class="mb-2" data-occupant-row>
            <div class="d-flex justify-content-between align-items-center">
              <span class="small fw-semibold text-muted">Occupant ${i + 1}</span>
              <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none" data-occ-fill="${i}">Use booker</button>
            </div>
            <div class="row g-2">
              <div class="col-md-4"><input class="form-control" type="text" data-occ-first maxlength="100" placeholder="First name *" value="${esc(p.first)}" required></div>
              <div class="col-md-4"><input class="form-control" type="text" data-occ-last maxlength="100" placeholder="Last name *" value="${esc(p.last)}" required></div>
              <div class="col-md-4"><input class="form-control" type="tel" data-occ-contact maxlength="30" placeholder="Contact (optional)" value="${esc(p.contact)}"></div>
            </div>
          </div>`;
        }).join('');
        occupantRowsBox.querySelectorAll('[data-occ-fill]').forEach(btn => btn.addEventListener('click', () => {
          const row = occupantRowsBox.querySelectorAll('[data-occupant-row]')[Number(btn.dataset.occFill)];
          if (!row) return;
          row.querySelector('[data-occ-first]').value = firstNameInput.value;
          row.querySelector('[data-occ-last]').value = lastNameInput.value;
          row.querySelector('[data-occ-contact]').value = contactInput.value;
        }));
      };
      guestsInput.addEventListener('input', renderOccupantRows);
      renderOccupantRows();

      root.querySelector('#new-checkin').onsubmit = async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const nights = Math.max(1, Math.min(90, parseInt(f.nights || 1, 10)));

        try {
          const timePolicy = await api('hotel_time_policy', {}, 'GET');
          if (!timePolicy.checkin_open) {
            throw new Error(`Check-in opens at 2:00 PM (${timePolicy.timezone}). Current hotel time: ${timePolicy.hotel_now}.`);
          }
          const occupants = [];
          occupantRowsBox.querySelectorAll('[data-occupant-row]').forEach(row => {
            const first = (row.querySelector('[data-occ-first]')?.value || '').trim();
            const last = (row.querySelector('[data-occ-last]')?.value || '').trim();
            const contact = (row.querySelector('[data-occ-contact]')?.value || '').trim();
            if (!first || !last) throw new Error('Enter a first and last name for each occupant.');
            occupants.push({ first_name: first, last_name: last, contact_number: contact });
          });
          const guestCount = Number(f.guests);
          if (occupants.length !== guestCount) throw new Error('Enter exactly one occupant for each guest.');
          const r = await api('checkin', {
            room_id: Number(f.room_id),
            guests: guestCount,
            nights: nights,
            first_name: String(f.first_name || '').trim(),
            last_name: String(f.last_name || '').trim(),
            contact_number: String(f.contact_number || '').trim(),
            email: String(f.email || '').trim(),
            occupants: occupants,
            ...(selectedCustomerId ? { customer_id: selectedCustomerId } : {}),
            discount_amount: 0
          });
          m.hide();
          await open('active-stays');
          showCheckinComplete(r);
        } catch (err) {
          notify(err.message, true);
        }
      };
    } catch (e) {
      notify(e.message, true);
    }
  }

  // Opens walk-in check-in with an active stay's guest preselected, so an
  // additional room is booked under the same guest record (no duplicate).
  async function bookAdditionalRoom(stayId) {
    try {
      const d = await api('active_stays', {}, 'GET');
      const s = (d.stays || []).find(x => Number(x.id) === Number(stayId));
      if (!s) return notify('Stay not found.', true);
      if (!s.customer_id) return notify('This stay has no guest record to reuse.', true);
      checkin({
        customer_id: Number(s.customer_id),
        first_name: s.first_name || '',
        middle_name: s.middle_name || '',
        last_name: s.last_name || '',
        contact_number: s.contact_number || '',
        email: s.email || ''
      });
    } catch (err) {
      notify(err.message, true);
    }
  }

  async function guestDetails(stayId) {

    try {

      const d=await api('active_stays',{},'GET');

      const s=(d.stays||[]).find(x=>Number(x.id)===Number(stayId));

      if(!s) return notify('Stay not found.',true);

      // Occupants: table rows win; audit names remain only as the fallback
      // for group stays checked in before the occupants table existed.
      const tableOccupants = Array.isArray(s.occupants)
        ? s.occupants.filter(o => o && typeof o.full_name === 'string' && o.full_name.trim())
        : [];
      const auditNames = Array.isArray(s.occupant_names)
        ? s.occupant_names.filter(name => typeof name === 'string' && name.trim())
        : [];
      const curRole = (window.HotelAuth?.getUser?.()?.role || '').toLowerCase();
      const canEditOccupants = ['admin', 'manager', 'frontdesk'].includes(curRole);
      // Table stores one full_name; split on the first space only to prefill
      // the first/last inputs (display rejoins to the identical string).
      const splitOccupantName = (full) => {
        const t = String(full || '').trim();
        const sp = t.indexOf(' ');
        return sp === -1 ? [t, ''] : [t.slice(0, sp), t.slice(sp + 1).trim()];
      };
      const occupantRowHtml = (i, first, last, contact) => `<div class="mb-2" data-gd-occ-row>
          <div class="small fw-semibold text-muted">Occupant ${i + 1}</div>
          <div class="row g-2">
            <div class="col-md-4"><input class="form-control" type="text" data-gd-occ-first maxlength="100" placeholder="First name *" value="${esc(first)}" required></div>
            <div class="col-md-4"><input class="form-control" type="text" data-gd-occ-last maxlength="100" placeholder="Last name *" value="${esc(last)}" required></div>
            <div class="col-md-4"><input class="form-control" type="tel" data-gd-occ-contact maxlength="30" placeholder="Contact (optional)" value="${esc(contact)}"></div>
          </div>
        </div>`;
      const occupantEditForm = (prefill, note) => {
        const rows = Array.from({length: Math.max(1, Number(s.guest_count) || 1)}, (_, i) => {
          const [first, last] = prefill[i] ? splitOccupantName(prefill[i].full_name) : ['', ''];
          return occupantRowHtml(i, first, last, prefill[i]?.contact_number || '');
        }).join('');
        return `<form id="guest-occupants-form" class="col-12"><div class="card border-primary-subtle"><div class="card-header bg-light py-2"><strong><i class="bi bi-people me-1"></i>Room occupants</strong><span class="small text-muted ms-2">${note}</span></div><div class="card-body py-2">${rows}<div class="text-end mt-2"><button class="btn btn-primary btn-sm"><i class="bi bi-check2-circle me-1"></i>Save occupants</button></div></div></div></form>`;
      };
      let occupantSection = '';
      if (tableOccupants.length) {
        occupantSection = canEditOccupants
          ? occupantEditForm(tableOccupants, `Fixed count: ${s.guest_count} guest(s)`)
          : `<section class="col-12"><div class="card border-primary-subtle"><div class="card-header bg-light py-2"><strong><i class="bi bi-people me-1"></i>Room occupants</strong></div><div class="card-body py-2"><ol class="mb-0 ps-3">${tableOccupants.map(o => `<li>${esc(o.full_name)}${o.contact_number ? ` <span class="small text-muted">(${esc(o.contact_number)})</span>` : ''}</li>`).join('')}</ol></div></div></section>`;
      } else if (auditNames.length) {
        // Old group stay: names live only in the audit log. Staff with edit
        // rights get the same form prefilled from them; saving writes the
        // stay_occupants rows, migrating the stay to the new store.
        occupantSection = canEditOccupants
          ? occupantEditForm(auditNames.map(name => ({ full_name: name, contact_number: '' })), 'Names from group check-in — save to update.')
          : `<section class="col-12"><div class="card border-primary-subtle"><div class="card-header bg-light py-2"><strong><i class="bi bi-people me-1"></i>Room occupants</strong><span class="small text-muted ms-2">${esc(s.group_code || 'Group booking')} · Room ${esc(s.room_number)}</span></div><div class="card-body py-2"><ol class="mb-0 ps-3">${auditNames.map(name => `<li>${esc(name)}</li>`).join('')}</ol></div></div></section>`;
      } else if (canEditOccupants) {
        occupantSection = occupantEditForm([], 'No occupants recorded yet — add them below.');
      } else {
        occupantSection = `<div class="col-12 small text-muted">No occupant details recorded.</div>`;
      }
      const {root,m}=modal(`Guest details · Room ${esc(s.room_number)}`,`<div class="row g-3"><div class="col-12"><div class="alert alert-light border mb-0"><strong>Booked by / Group contact</strong><div>${esc(s.guest_name || 'Guest')}</div><span class="small text-muted">First and last name are required. Contact number and email are optional. Changes reflect on the folio, receipt, and guest portal.</span></div></div>${(Array.isArray(s.linked_stays) && s.linked_stays.length) ? `<div class="col-12"><div class="alert alert-light border mb-0 small text-muted">Also booked under this guest: ${s.linked_stays.map(l => `Room ${esc(l.room_number)} (${esc(l.stay_code)})`).join(', ')}</div></div>` : ''}${occupantSection}<form id="guest-details-form" class="col-12"><div class="row g-3"><div class="col-md-4"><label class="form-label">First name <span class="text-danger">*</span></label><input class="form-control" type="text" name="first_name" maxlength="100" value="${esc(s.first_name||'')}" required></div><div class="col-md-4"><label class="form-label">Middle name <span class="text-muted">(Optional)</span></label><input class="form-control" type="text" name="middle_name" maxlength="100" value="${esc(s.middle_name||'')}"></div><div class="col-md-4"><label class="form-label">Last name <span class="text-danger">*</span></label><input class="form-control" type="text" name="last_name" maxlength="100" value="${esc(s.last_name||'')}" required></div><div class="col-md-6"><label class="form-label">Contact number <span class="text-muted">(Optional)</span></label><input class="form-control" type="tel" name="contact_number" maxlength="30" value="${esc(s.contact_number||'')}"></div><div class="col-md-6"><label class="form-label">Email <span class="text-muted">(Optional)</span></label><input class="form-control" type="email" name="email" maxlength="150" value="${esc(s.email||'')}"></div><div class="col-12 text-end"><button class="btn btn-primary"><i class="bi bi-check2-circle me-1"></i>Save guest details</button></div></div></form></div>`);

      root.querySelector('#guest-details-form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const r=await api('update_stay_guest',{stay_id:Number(stayId),first_name:String(f.first_name||'').trim(),middle_name:String(f.middle_name||'').trim(),last_name:String(f.last_name||'').trim(),contact_number:String(f.contact_number||'').trim(),email:String(f.email||'').trim()});m.hide();notify(`Guest details saved: ${r.guest_name}`);await open(activeModule);}catch(err){notify(err.message,true)}};
      const occupantsForm = root.querySelector('#guest-occupants-form');
      if (occupantsForm) {
        occupantsForm.onsubmit = async e => {
          e.preventDefault();
          const occupants = [];
          occupantsForm.querySelectorAll('[data-gd-occ-row]').forEach(row => {
            const first = (row.querySelector('[data-gd-occ-first]')?.value || '').trim();
            const last = (row.querySelector('[data-gd-occ-last]')?.value || '').trim();
            const contact = (row.querySelector('[data-gd-occ-contact]')?.value || '').trim();
            if (!first || !last) throw new Error('Enter a first and last name for each occupant.');
            occupants.push({ first_name: first, last_name: last, contact_number: contact });
          });
          try {
            await api('update_stay_occupants', { stay_id: Number(stayId), occupants: occupants });
            notify('Occupant details saved.');
            m.hide();
            await guestDetails(stayId);
          } catch (err) { notify(err.message, true); }
        };
      }

    } catch(e){notify(e.message,true)}

  }


  async function showReceiptModal(receiptInput) {
    let data = receiptInput;
    if (typeof receiptInput === 'string' || typeof receiptInput === 'number') {
      try {
        const res = await api('receipt_details', { receipt_number: String(receiptInput), payment_id: Number(receiptInput) || 0 }, 'GET');
        data = res.receipt;
        if (res.folio_summary) {
          data.folio_summary = res.folio_summary;
          data.discounts = res.folio_summary.discounts || [];
        }
        data.receipt_summary = res.receipt_summary || {};
      } catch (err) {
        return notify('Unable to load receipt: ' + err.message, true);
      }
    }
    if (!data) return;

    if (data.group_receipt && Array.isArray(data.allocations)) {
      const allocations = data.allocations;
      const gross = allocations.reduce((sum, room) => sum + Number(room.gross_amount || 0), 0);
      const discounts = allocations.reduce((sum, room) => sum + Number(room.discount_amount || 0), 0);
      const total = allocations.reduce((sum, room) => sum + Number(room.total_amount || 0), 0);
      const paid = Number(data.amount_paid || 0);
      const vatable = allocations.reduce((sum, room) => sum + Number(room.vatable_sales || 0), 0);
      const vat = allocations.reduce((sum, room) => sum + Number(room.vat_amount || 0), 0);
      const exempt = allocations.reduce((sum, room) => sum + Number(room.vat_exempt_sales || 0), 0);
      const remaining = allocations.reduce((sum, room) => sum + Number(room.remaining_balance || 0), 0);
      const rows = allocations.map(room => `
        <tr>
          <td><strong>Room ${esc(room.room_number)}</strong><div class="small text-muted">Stay ${esc(room.stay_code)} · Folio ${esc(room.folio_number)}</div></td>
          <td class="text-end">${php(room.gross_amount)}</td>
          <td class="text-end text-success">${Number(room.discount_amount || 0) > 0 ? `${esc(room.discount_name || 'Discount')} · − ${php(room.discount_amount)}` : '—'}</td>
          <td class="text-end">${php(room.total_amount)}</td>
          <td class="text-end fw-semibold">${php(room.amount_paid)}</td>
          <td class="text-end">${php(room.remaining_balance)}</td>
        </tr>`).join('');
      const groupHtml = `
        <div class="receipt-area p-3 bg-white border rounded shadow-sm" id="printable-official-receipt" style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;max-width:900px;margin:0 auto;">
          <div class="text-center pb-3 border-bottom border-dashed mb-3">
            <div class="fw-bold text-dark fs-5 text-uppercase" style="letter-spacing:1px;">Shesh Dev Hotel</div>
            <div class="small text-muted">Agora, Lapasan, Cagayan de Oro City, Misamis Oriental, 9000</div>
            <div class="small text-muted">VAT Reg. TIN: 420-789-123-000</div>
            <div class="mt-2"><span class="badge text-bg-dark px-3 py-1 text-uppercase">Official Group Payment Receipt</span></div>
          </div>
          <div class="row g-2 mb-3 pb-2 border-bottom small">
            <div class="col-6"><span class="text-muted d-block">GROUP RECEIPT #</span><strong class="font-monospace text-primary fs-6">${esc(data.receipt_number)}</strong></div>
            <div class="col-6 text-end"><span class="text-muted d-block">DATE &amp; TIME</span><strong>${esc(data.created_at || new Date().toLocaleString('en-PH'))}</strong></div>
            <div class="col-6"><span class="text-muted d-block">GUEST / GROUP</span><strong>${esc(data.guest_name || 'Group Guest')} · ${esc(data.group_code || '')}</strong></div>
            <div class="col-6 text-end"><span class="text-muted d-block">CASHIER · METHOD</span><strong>${esc(data.cashier_name || 'Cashier')} · ${esc(data.method || 'CASH')}</strong></div>
          </div>
          <div class="table-responsive">
            <table class="table table-sm align-middle">
              <thead class="table-light"><tr><th>Room / Folio</th><th class="text-end">Room Charges</th><th class="text-end">Discount</th><th class="text-end">Net Bill</th><th class="text-end">Paid</th><th class="text-end">Balance</th></tr></thead>
              <tbody>${rows}</tbody>
              <tfoot><tr class="fw-bold"><td>Group totals</td><td class="text-end">${php(gross)}</td><td class="text-end text-success">${discounts > 0 ? `− ${php(discounts)}` : '—'}</td><td class="text-end">${php(total)}</td><td class="text-end">${php(paid)}</td><td class="text-end">${php(remaining)}</td></tr></tfoot>
            </table>
          </div>
          <div class="border-top pt-2 mb-3 small">
            <div class="d-flex justify-content-between"><span>VATable Sales (this payment):</span><strong>${php(vatable)}</strong></div>
            <div class="d-flex justify-content-between"><span>VAT (this payment):</span><strong>${php(vat)}</strong></div>
            <div class="d-flex justify-content-between"><span>VAT-exempt Sales (this payment):</span><strong>${php(exempt)}</strong></div>
            <div class="d-flex justify-content-between"><span>Amount Tendered:</span><strong>${php(data.received_amount || paid)}</strong></div>
            <div class="d-flex justify-content-between"><span>Change Given:</span><strong>${php(data.change || 0)}</strong></div>
          </div>
          <div class="text-center text-muted small py-2 border-top">This receipt covers the room-by-room payment allocations listed above.</div>
        </div>
        <div class="d-flex justify-content-end mt-3 no-print"><button class="btn btn-primary btn-sm fw-bold" onclick="window.print()"><i class="bi bi-printer me-1"></i>Print Group Receipt</button></div>`;
      modal(`Official Group Receipt · ${esc(data.receipt_number || '')}`, groupHtml);
      return;
    }

    const receiptNo = data.receipt_number || 'OR-PREVIEW';
    const guestName = data.guest_name || 'In-House Guest';
    const roomNo = data.room_number || '-';
    const stayCode = data.stay_code || '-';
    const folioNo = data.folio_number || '-';
    const cashierName = data.cashier_name || data.received_by_name || window.HotelAuth.getUser()?.username || 'Cashier';
    const createdAt = data.created_at || new Date().toLocaleString('en-PH');
    const method = data.method || 'CASH';
    const amount = Number(data.amount || data.amount_paid || 0);
    const received = Number(data.received_amount || amount);
    const change = Number(data.change_amount || data.change || 0);
    const refNote = data.reference_note || data.reference || '';
    const receiptDiscounts=Array.isArray(data.discounts)?data.discounts:[];
    const receiptDiscountTotal=Number(data.folio_summary?.discounts_total)
      ||receiptDiscounts.reduce((sum,discount)=>sum+Number(discount.amount||0),0);
    const remBal = data.receipt_summary?.outstanding_balance
      ?? data.folio_summary?.balance_remaining
      ?? (data.remaining_balance != null ? Number(data.remaining_balance) : 0);
    const isSettled = Number(remBal) <= 0.009;

    const receiptSummary = data.receipt_summary || {};
    const vatable = Number(receiptSummary.vatable_sales || 0);
    const vat12 = Number(receiptSummary.vat_amount || 0);
    const vatExempt = Number(receiptSummary.vat_exempt_sales || 0);
    const totalDue = Number(data.folio_summary?.total_bill || amount);
    const roomCharges = Number(data.folio_summary?.room_charges || data.folio_summary?.charges_total || 0);

    const html = `
      <div class="receipt-area p-3 bg-white border rounded shadow-sm" id="printable-official-receipt" style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;max-width:580px;margin:0 auto;">
        <div class="text-center pb-3 border-bottom border-dashed mb-3">
          <div class="d-inline-flex align-items-center justify-content-center rounded-circle mb-2" style="width:44px;height:44px;background:#f1f5f9;color:#1e293b;">
            <i class="bi bi-building fs-4"></i>
          </div>
          <div class="fw-bold text-dark fs-5 text-uppercase" style="letter-spacing:1px;">Shesh Dev Hotel</div>
          <div class="small text-muted">Walk-In Guest Management &amp; Billing System</div>
          <div class="small text-muted">Agora, Lapasan, Cagayan de Oro City, Misamis Oriental, 9000</div>
          <div class="small text-muted">VAT Reg. TIN: 420-789-123-000</div>
          <div class="mt-2"><span class="badge text-bg-dark px-3 py-1 text-uppercase" style="letter-spacing:1.5px;font-size:11px;">Official Payment Receipt</span></div>
        </div>

        <div class="row g-2 mb-3 pb-2 border-bottom small">
          <div class="col-6">
            <span class="text-muted d-block" style="font-size:11px;">OFFICIAL RECEIPT #:</span>
            <strong class="font-monospace text-primary fs-6">${esc(receiptNo)}</strong>
          </div>
          <div class="col-6 text-end">
            <span class="text-muted d-block" style="font-size:11px;">DATE &amp; TIME:</span>
            <strong class="text-dark">${esc(createdAt)}</strong>
          </div>
          <div class="col-6">
            <span class="text-muted d-block" style="font-size:11px;">CASHIER / RECEIVER:</span>
            <strong class="text-dark">${esc(cashierName)}</strong>
          </div>
          <div class="col-6 text-end">
            <span class="text-muted d-block" style="font-size:11px;">STAY &amp; FOLIO:</span>
            <strong class="text-dark">${esc(stayCode)} · Folio ${esc(folioNo)}</strong>
          </div>
        </div>

        <div class="p-3 bg-light rounded mb-3 small border">
          <div class="row g-2">
            <div class="col-7">
              <span class="text-muted d-block" style="font-size:11px;">GUEST NAME:</span>
              <strong class="text-dark fs-6"><i class="bi bi-person-fill text-secondary me-1"></i>${esc(guestName)}</strong>
            </div>
            <div class="col-5 text-end">
              <span class="text-muted d-block" style="font-size:11px;">ROOM NUMBER:</span>
              <strong class="text-dark fs-6"><i class="bi bi-door-closed text-secondary me-1"></i>Room ${esc(roomNo)}</strong>
            </div>
          </div>
        </div>

        <table class="table table-sm mb-3" style="font-size:0.83rem;">
          <thead>
            <tr class="table-light">
              <th>Particulars</th>
              <th class="text-end">Amount (PHP)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="fw-semibold text-dark">Payment collected</div>
                <div class="small text-muted">Payment Tender: <strong>${esc(method)}</strong>${refNote ? ' · Ref: ' + esc(refNote) : ''}</div>
              </td>
              <td class="text-end fw-bold fs-6">${php(amount)}</td>
            </tr>
            ${receiptDiscounts.map(discount=>`<tr><td><div class="fw-semibold text-success">Discount: ${esc(discountDisplayName(discount))}</div><div class="small text-muted">Applied to folio</div></td><td class="text-end text-success">− ${php(discount.amount)}</td></tr>`).join('')}
          </tbody>
        </table>

        <div class="border-top pt-2 mb-3" style="font-size:0.82rem;">
          ${receiptDiscountTotal>0?`<div class="d-flex justify-content-between mb-1 text-success"><span>Less: Discounts:</span><span>− ${php(receiptDiscountTotal)}</span></div>`:''}
          <div class="d-flex justify-content-between mb-1 text-muted">
            <span>Room charges:</span>
            <span>${php(roomCharges)}</span>
          </div>
          <div class="d-flex justify-content-between mb-1 text-muted">
            <span>Charges before VAT (this receipt):</span>
            <span>${php(vatable)}</span>
          </div>
          <div class="d-flex justify-content-between mb-1 text-muted">
            <span>VAT (this receipt):</span>
            <span>${php(vat12)}</span>
          </div>
          <div class="d-flex justify-content-between mb-1 text-muted">
            <span>VAT-free charges (this receipt):</span>
            <span>${php(vatExempt)}</span>
          </div>
          <div class="d-flex justify-content-between mb-1 fw-semibold">
            <span>Total to pay:</span>
            <span>${php(totalDue)}</span>
          </div>
          <div class="d-flex justify-content-between py-2 border-top border-bottom my-2 bg-light-subtle px-2 rounded">
            <span class="fw-bold fs-6 text-dark">Amount Paid:</span>
            <span class="fw-bold text-success fs-5">${php(amount)}</span>
          </div>
          <div class="d-flex justify-content-between mb-1 text-muted pt-1 px-1">
            <span>Amount Tendered / Received:</span>
            <span class="fw-semibold text-dark">${php(received)}</span>
          </div>
          <div class="d-flex justify-content-between mb-2 px-1">
            <span class="text-muted">Change Given:</span>
            <strong class="${change > 0 ? 'text-success' : 'text-dark'}">${php(change)}</strong>
          </div>
          <div class="d-flex justify-content-between p-2 rounded ${isSettled ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-warning-subtle text-dark border border-warning-subtle'}">
            <span class="fw-bold">${isSettled ? 'Folio Settlement Status:' : 'Balance Remaining:'}</span>
            <strong class="fs-6">${isSettled ? '✓ PAID IN FULL · SETTLED' : php(remBal)}</strong>
          </div>
        </div>

        <div class="text-center text-muted small py-2 border-top border-dashed" style="font-size:11px;">
          <div>Thank you for choosing Shesh Dev Hotel! Have a wonderful stay!</div>
          <div class="fst-italic mt-1 text-secondary">This document is an official system-generated payment receipt.</div>
        </div>
      </div>

      <div class="d-flex justify-content-between align-items-center mt-3 pt-3 border-top no-print">
        <div>
          ${data.stay_id && isSettled ? `<button class="btn btn-success btn-sm fw-bold shadow-sm" onclick="HotelBilling.checkout(${data.stay_id})"><i class="bi bi-box-arrow-right me-1"></i>Check-Out Guest Now</button>` : ''}
          ${data.folio_id ? `<button class="btn btn-outline-primary btn-sm ms-1" onclick="HotelBilling.folio(${data.folio_id})"><i class="bi bi-receipt me-1"></i>View Full Folio</button>` : ''}
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm fw-bold px-3 shadow-sm" onclick="window.print()">
            <i class="bi bi-printer me-1"></i>Print Official Receipt
          </button>
        </div>
      </div>
    `;
    modal(`Official Hotel Receipt · ${esc(receiptNo)}`, html);
  }

  async function approveGroupCheckinPayment(groupBookingId) {
    const cpError = (title, err) => {
      const message = (err && err.message) || String(err || 'Unknown error');
      if (window.HotelDialogs?.error) window.HotelDialogs.error({ title, text: message });
      else notify(message, true);
    };
    try {
      const response = await api('checkin_payments', {}, 'GET');
      const payments = (response.checkin_payments || []).filter(row =>
        Number(row.group_booking_id) === Number(groupBookingId) && row.status === 'FOR_PAYMENT'
      );
      if (payments.length < 2) {
        return cpError('Group payment', new Error('This group no longer has multiple pending room payments. Refresh the queue.'));
      }
      const guestName = payments[0].guest_name || 'Group Guest';
      const groupCode = payments[0].group_code || '';
      const grossTotal = payments.reduce((sum, row) => sum + Number(row.gross_amount || row.total_amount || 0), 0);
      const netTotal = payments.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
      const requiredPercent = row => Number(row.required_percent || (Number(row.nights || row.payment_nights || 1) >= 5 ? 60 : 100));
      const requiredTotal = payments.reduce((sum, row) =>
        sum + Math.min(Number(row.total_amount || 0), Number(row.required_amount || 0) || Number(row.total_amount || 0) * requiredPercent(row) / 100), 0
      );
      const paymentChoices = new Map();
      let selectedDiscount = null;
      let eligibilityConfirmed = false;
      let amountTouched = false;
      let currentRequired = requiredTotal;
      let currentNet = netTotal;

      const roomRows = payments.map(row => {
        const nights = Number(row.nights || row.payment_nights || 1);
        const isLongStay = nights >= 5;
        const bill = Number(row.total_amount || 0);
        const existingDiscount = Number(row.discount_amount || 0) > 0 || Number(row.existing_discount_count || 0) > 0;
        return `<tr>
          <td><input class="form-check-input group-discount-room" type="checkbox" value="${Number(row.id)}" aria-label="Apply selected discount to room ${esc(row.room_number)}" ${existingDiscount ? 'disabled' : ''}></td>
          <td><strong>Room ${esc(row.room_number)}</strong><div class="small text-muted">Stay ${esc(row.stay_code)} · Folio ${esc(row.folio_number)} · ${nights} night(s)</div><div class="small text-muted">Occupants: ${Array.isArray(row.occupant_names) && row.occupant_names.length ? row.occupant_names.map(esc).join(', ') : 'Not recorded; verify with Front Desk'}</div></td>
          <td class="text-end">${php(row.gross_amount || bill)}</td>
          <td class="text-end">${php(existingDiscount ? row.discount_amount : 0)}</td>
          <td class="text-end group-room-net" data-cp-id="${Number(row.id)}">${php(bill)}</td>
          <td class="text-end">${php(row.required_amount || bill)}</td>
        </tr>`;
      }).join('');

      const html = `
        <div class="container-fluid p-0">
          <div class="alert alert-info py-2"><strong>${esc(guestName)}</strong> · Group ${esc(groupCode)} · ${payments.length} room folios. One cashier payment will be allocated to each room and activate the group together.</div>
          <div class="table-responsive mb-3">
            <table class="table table-sm align-middle">
              <thead class="table-light"><tr><th>Discount?</th><th>Room / Folio</th><th class="text-end">Room Charges</th><th class="text-end">Existing Discount</th><th class="text-end">Net Bill</th><th class="text-end">Required</th></tr></thead>
              <tbody>${roomRows}</tbody>
              <tfoot><tr class="fw-bold"><td colspan="2">Group totals</td><td class="text-end">${php(grossTotal)}</td><td class="text-end" id="group-discount-total">${php(0)}</td><td class="text-end" id="group-net-total">${php(netTotal)}</td><td class="text-end" id="group-required-total">${php(requiredTotal)}</td></tr></tfoot>
            </table>
          </div>
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold" for="group-discount-select">Optional discount for selected room(s)</label>
              <select class="form-select" id="group-discount-select" disabled><option value="">Loading discounts…</option></select>
              <div class="form-text">Select only the room(s) occupied by a guest eligible for this discount. A room’s folio stays separate.</div>
            </div>
            <div class="col-md-6"><div id="group-discount-help" class="small text-muted">No group discount selected.</div></div>
          </div>
          <form id="approve-group-cp-form" class="row g-3">
            <div class="col-md-6"><label class="form-label fw-semibold">Payment Method</label><select class="form-select" name="method"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="GCASH">GCash</option><option value="MAYA">Maya</option><option value="QR_PH">QR Ph</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></div>
            <div class="col-md-6"><label class="form-label fw-semibold">Amount Received (PHP)</label><div class="input-group"><span class="input-group-text">₱</span><input class="form-control fw-bold" type="number" name="amount_received" id="group-cp-amount" min="${requiredTotal.toFixed(2)}" step="0.01" value="${requiredTotal.toFixed(2)}" required></div></div>
            <div class="col-12 p-3 bg-light border rounded"><div class="d-flex justify-content-between"><span>Group net bill</span><strong id="group-net-summary">${php(netTotal)}</strong></div><div class="d-flex justify-content-between"><span>Required at check-in</span><strong class="text-success" id="group-required-summary">${php(requiredTotal)}</strong></div><div class="d-flex justify-content-between"><span>Applied to group folios</span><strong id="group-applied-summary">${php(requiredTotal)}</strong></div><div class="d-flex justify-content-between"><span>Change</span><strong id="group-change-summary">${php(0)}</strong></div></div>
            <div class="col-12 d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-success fw-bold" id="group-cp-submit">Receive Group Payment &amp; Check In</button></div>
          </form>
        </div>`;
      const { root, m } = modal(`Approve Group Check-in Payment · ${esc(groupCode)}`, html);
      const discountSelect = root.querySelector('#group-discount-select');
      const amountInput = root.querySelector('#group-cp-amount');
      const submitButton = root.querySelector('#group-cp-submit');
      const checkedRooms = () => Array.from(root.querySelectorAll('.group-discount-room:checked')).map(input => Number(input.value));
      const moneyCents = amount => Math.round(Number(amount || 0) * 100);
      const percentCents = (amountCents, percent) => Math.floor((amountCents * Math.round(Number(percent) * 100) + 5000) / 10000);
      const recompute = () => {
        const previousRequired = currentRequired;
        const targetIds = new Set(checkedRooms());
        const seniorDiscount = selectedDiscount && ['SENIOR_CITIZEN', 'PWD'].includes(String(selectedDiscount.policy.category || '').toUpperCase());
        const roomValues = payments.map(row => {
          const eligible = targetIds.has(Number(row.id));
          const gross = Number(row.room_charge_total || row.gross_amount || row.total_amount || 0);
          const base = seniorDiscount ? Number(row.room_taxable_base || 0) : gross;
          let discountCents = 0;
          if (eligible && selectedDiscount) {
            discountCents = selectedDiscount.policy.discount_type === 'PERCENT'
              ? percentCents(moneyCents(base), selectedDiscount.rate)
              : moneyCents(selectedDiscount.policy.discount_value);
            discountCents = Math.min(discountCents, moneyCents(base));
            if (selectedDiscount.policy.max_discount !== null) discountCents = Math.min(discountCents, moneyCents(selectedDiscount.policy.max_discount));
          }
          const exemption = eligible && seniorDiscount ? Number(row.vat_amount || 0) : 0;
          const net = Math.max(0, Math.round((Number(row.total_amount || 0) - discountCents / 100 - exemption) * 100) / 100);
          const required = Math.min(net, Math.round(net * requiredPercent(row) * 100) / 100);
          const cell = root.querySelector(`.group-room-net[data-cp-id="${Number(row.id)}"]`);
          if (cell) cell.textContent = php(net);
          return { row, discountCents, net, required };
        });
        const discountTotal = roomValues.reduce((sum, value) => sum + value.discountCents, 0) / 100;
        currentNet = roomValues.reduce((sum, value) => sum + value.net, 0);
        currentRequired = roomValues.reduce((sum, value) => sum + value.required, 0);
        const previousAmount = Number(amountInput.value || 0);
        if (!amountTouched || previousAmount < currentRequired || Math.abs(previousAmount - previousRequired) < 0.001) amountInput.value = currentRequired.toFixed(2);
        amountInput.min = currentRequired.toFixed(2);
        root.querySelector('#group-discount-total').textContent = php(discountTotal);
        root.querySelector('#group-net-total').textContent = php(currentNet);
        root.querySelector('#group-required-total').textContent = php(currentRequired);
        root.querySelector('#group-net-summary').textContent = php(currentNet);
        root.querySelector('#group-required-summary').textContent = php(currentRequired);
        const tender = Number(amountInput.value || 0);
        root.querySelector('#group-applied-summary').textContent = php(Math.min(tender, currentNet));
        root.querySelector('#group-change-summary').textContent = php(Math.max(0, tender - currentNet));
      };
      amountInput.addEventListener('input', () => { amountTouched = true; recompute(); });
      root.querySelectorAll('.group-discount-room').forEach(input => input.addEventListener('change', recompute));

      try {
        const policyResponse = await fetch('/api/cashier_discount_policies.php', {
          method: 'GET', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' }
        });
        const policyData = await policyResponse.json().catch(() => ({}));
        if (!policyResponse.ok || policyData.error) throw new Error(policyData.error || `Discount service returned HTTP ${policyResponse.status}.`);
        const policies = (Array.isArray(policyData.discounts) ? policyData.discounts : []).filter(policy =>
          String(policy.applies_to || '').trim().toUpperCase() === 'ROOM'
          && !Number(policy.combinable) && !Number(policy.requires_manager)
        );
        const options = policies.flatMap(policy => {
          const rule = DISCOUNT_RATE_RULES[String(policy.category || '').trim().toUpperCase()];
          const rates = rule ? Array.from({ length: rule.max - rule.min + 1 }, (_, index) => rule.min + index) : [Number(policy.discount_value)];
          return rates.map(rate => {
            const key = String(paymentChoices.size);
            paymentChoices.set(key, { policy, rule, rate });
            return `<option value="${key}">${esc(policy.name)}${policy.discount_type === 'PERCENT' ? ` · ${rate}%` : ` · ${php(policy.discount_value)}`}</option>`;
          });
        });
        discountSelect.innerHTML = '<option value="">No discount</option>' + options.join('');
        discountSelect.disabled = false;
        discountSelect.addEventListener('change', async () => {
          const choice = paymentChoices.get(discountSelect.value);
          selectedDiscount = choice || null;
          eligibilityConfirmed = false;
          if (!choice) {
            root.querySelector('#group-discount-help').textContent = 'No group discount selected.';
            root.querySelectorAll('.group-discount-room').forEach(input => { if (!input.disabled) input.checked = false; });
            recompute();
            return;
          }
          if (choice.rule?.eligibleId) {
            const confirmed = await window.HotelDialogs.confirm({
              title: `Verify ${choice.policy.name} eligibility`,
              text: 'Confirm the qualifying guest is assigned to each checked room and that the required eligibility documentation was verified. Do not enter or store ID numbers.',
              confirmButtonText: 'Confirm eligibility',
              actionType: 'warning'
            });
            if (!confirmed) {
              discountSelect.value = '';
              selectedDiscount = null;
              root.querySelector('#group-discount-help').textContent = 'Discount not applied.';
              recompute();
              return;
            }
            eligibilityConfirmed = true;
          }
          root.querySelector('#group-discount-help').textContent = `${choice.policy.name}${choice.policy.discount_type === 'PERCENT' ? ` · ${choice.rate}%` : ''}. Check only eligible rooms.`;
          recompute();
        });
      } catch (err) {
        discountSelect.innerHTML = '<option value="">Discount list unavailable</option>';
        discountSelect.disabled = true;
        notify(`Could not load group check-in discounts: ${err.message}`, true);
      }

      root.querySelector('#approve-group-cp-form').onsubmit = async event => {
        event.preventDefault();
        try {
          const formData = new FormData(event.currentTarget);
          const eligibleCheckinPaymentIds = selectedDiscount ? checkedRooms() : [];
          if (selectedDiscount && !eligibleCheckinPaymentIds.length) throw new Error('Select the room(s) occupied by the eligible guest before applying the discount.');
          if (selectedDiscount && selectedDiscount.rule?.eligibleId && !eligibilityConfirmed) throw new Error('Confirm the guest’s eligibility before applying this discount.');
          submitButton.disabled = true;
          const result = await api('approve_group_checkin_payment', {
            group_booking_id: Number(groupBookingId),
            method: String(formData.get('method') || 'CASH'),
            amount_received: Number(formData.get('amount_received') || 0),
            apply_discount: Boolean(selectedDiscount),
            discount_policy_id: selectedDiscount ? Number(selectedDiscount.policy.id) : -1,
            discount_value: selectedDiscount ? selectedDiscount.rate : null,
            eligible_checkin_payment_ids: eligibleCheckinPaymentIds,
            eligibility_confirmed: eligibilityConfirmed,
            discount_reason: selectedDiscount ? `Group check-in discount: ${selectedDiscount.policy.name}` : ''
          });
          m.hide();
          notify(`Group payment approved · Receipt ${result.receipt_number} · Paid ${php(result.amount_paid)} · ${payments.length} rooms checked in.`);
          await showReceiptModal(result);
          await open(activeModule);
        } catch (err) {
          cpError('Group payment failed', err);
        } finally {
          submitButton.disabled = false;
        }
      };
    } catch (err) {
      cpError('Group payment', err);
    }
  }

  async function approveCheckinPayment(cpId) {
    const cpError=(title,err)=>{const msg=(err&&err.message)||String(err||'Unknown error'); if(window.HotelDialogs?.error) window.HotelDialogs.error({title,text:msg}); else notify(msg,true);};
    try {
      const d=await api('checkin_payments',{},'GET');
      const x=(d.checkin_payments||[]).find(z=>Number(z.id)===Number(cpId));
      if(!x) return cpError('Approve payment','Check-in payment not found. Refresh the queue.');
      if(x.status!=='FOR_PAYMENT') return cpError('Approve payment','This check-in payment was already processed. Refresh the queue.');
      const pct=Number(x.required_percent);
      const total0=Number(x.total_amount);
      const required0=Number(x.required_amount);
      const nights0=Number(x.nights || x.payment_nights || 1);
      const is5Days=nights0 >= 5;
      const gross0=Number(x.gross_amount) > 0 ? Number(x.gross_amount) : (total0 + Number(x.discount_amount || 0));
      const discount0=Number(x.discount_amount || 0);
      const discountReason0=String(x.discount_reason || x.discount_type || '');
      const hasExistingDiscount=discount0>0||Number(x.existing_discount_count||0)>0;
      const balance0=is5Days ? (Number(x.balance_amount) || Math.round(Math.max(0, total0 - required0) * 100) / 100) : 0;

      const modalHtml = `
        <div class="container-fluid p-0 cashier-payment-terminal">
          <!-- Guest & Room Banner -->
          <div class="p-3 mb-3 rounded bg-light border d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <div class="d-flex align-items-center gap-2">
                <span class="badge text-bg-warning text-dark font-monospace">${esc(x.stay_code)}</span>
                <strong class="text-dark fs-6">${esc(x.guest_name || 'Walk-in Guest')}</strong>
              </div>
              <div class="small text-muted mt-1">
                Room <strong>${esc(x.room_number)}</strong> · ${nights0} night(s) · Folio <strong>${esc(x.folio_number)}</strong>
              </div>
            </div>
            <div class="text-end">
              <span class="small text-muted d-block text-uppercase" style="font-size:11px;">Required at Check-in:</span>
              <strong class="fs-4 text-success font-monospace" id="cp-required-head">${php(required0)}</strong>
              <div class="small text-muted">(${is5Days ? '60% Downpayment' : '100% Full Payment'}) of <span id="cp-required-total">${php(total0)}</span></div>
            </div>
          </div>

          <!-- Cashier Read-Only View of Total Billing, Discount, and Stay Policy -->
          <div class="card mb-3 border shadow-sm">
            <div class="card-body p-3">
              <div class="row g-2 text-center">
                <div class="col-4 border-end">
                  <span class="small text-muted d-block text-uppercase" style="font-size:11px;">Total Billing</span>
                  <strong class="fs-6 text-dark font-monospace">${php(gross0)}</strong>
                </div>
                <div class="col-4 border-end">
                  <span class="small text-muted d-block text-uppercase" style="font-size:11px;">Discount Applied</span>
                  <select class="form-select form-select-sm my-1" id="cp-discount-select" aria-label="Select check-in discount" disabled>
                    <option value="">${hasExistingDiscount?'Discount already applied':'Loading discounts…'}</option>
                  </select>
                  <strong class="fs-6 ${discount0 > 0 ? 'text-success' : 'text-muted'} font-monospace" id="cp-discount-amount">${discount0 > 0 ? '-' : ''}${php(discount0)}</strong>
                  <div class="badge text-bg-success-subtle text-success p-1 ${hasExistingDiscount ? '' : 'd-none'}" id="cp-discount-label" style="font-size:9.5px;">${esc(discountReason0 || 'Applied')}</div>
                </div>
                <div class="col-4">
                  <span class="small text-muted d-block text-uppercase" style="font-size:11px;">Net Total Bill</span>
                  <strong class="fs-6 text-dark font-monospace" id="cp-net-total-head">${php(total0)}</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Stay Duration Policy & Must Pass to Balance Rule -->
          ${is5Days ? `
            <div class="p-3 mb-3 rounded border border-warning bg-warning-subtle">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <strong class="text-dark"><i class="bi bi-calendar-check me-1"></i>5+ Days Stay Rule Active (${nights0} Nights)</strong>
                <span class="badge text-bg-warning text-dark">Long Stay</span>
              </div>
              <div class="row g-2 mt-1">
                <div class="col-6">
                  <span class="small text-muted d-block">Required Downpayment (60%):</span>
                  <strong class="text-success fs-5 font-monospace" id="cp-policy-required">${php(required0)}</strong>
                  <div class="small text-muted" style="font-size:11px;">Collect now from guest</div>
                </div>
                <div class="col-6">
                  <span class="small text-muted d-block">Must Pass to Balance (40%):</span>
                  <strong class="text-danger fs-5 font-monospace" id="cp-policy-balance">${php(balance0)}</strong>
                  <div class="small text-muted" style="font-size:11px;">Remaining balance passes to stay folio</div>
                </div>
              </div>
            </div>
          ` : `
            <div class="p-3 mb-3 rounded border bg-light">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <strong class="text-dark"><i class="bi bi-calendar me-1"></i>Standard Stay (${nights0} Night${nights0 > 1 ? 's' : ''})</strong>
                <span class="badge text-bg-primary">Short Stay</span>
              </div>
              <div class="row g-2 mt-1">
                <div class="col-6">
                  <span class="small text-muted d-block">100% Full Payment Required:</span>
                  <strong class="text-success fs-5 font-monospace" id="cp-policy-required">${php(required0)}</strong>
                  <div class="small text-muted" style="font-size:11px;">Must be settled in full at check-in</div>
                </div>
                <div class="col-6">
                  <span class="small text-muted d-block">Balance to Pass:</span>
                  <strong class="text-muted fs-5 font-monospace">₱0.00</strong>
                  <div class="small text-muted" style="font-size:11px;">No remaining balance</div>
                </div>
              </div>
            </div>
          `}

          <form id="approve-cp-form" class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold">Payment Method</label>
              <select class="form-select" name="method" id="cp-method">
                <option value="CASH">💵 Cash (Philippine Peso)</option>
                <option value="CARD">💳 Credit / Debit Card (Terminal / POS)</option>
                <option value="GCASH">📱 GCash E-Wallet</option>
                <option value="MAYA">📱 Maya E-Wallet</option>
                <option value="QR_PH">📱 QR Ph (National QR)</option>
                <option value="BANK_TRANSFER">🏦 Bank Wire / Electronic Transfer</option>
                <option value="OTHER">Other Payment</option>
              </select>
            </div>

            <div class="col-md-6">
              <label class="form-label fw-semibold">Amount Received / Tendered (PHP)</label>
              <div class="input-group">
                <span class="input-group-text bg-white fw-bold">₱</span>
                <input class="form-control fw-bold fs-6" type="number" name="amount_received" id="cp-amt-input" min="${required0}" step="0.01" value="${required0.toFixed(2)}" required>
              </div>
            </div>

            <!-- Quick Cash Presets -->
            <div class="col-12" id="cp-quick-cash-area">
              <div class="d-flex align-items-center gap-1 flex-wrap"></div>
            </div>

            <!-- Summary Breakdown -->
            <div class="col-12">
              <div class="p-3 bg-light rounded border">
                <div class="d-flex justify-content-between mb-1 small text-muted">
                  <span>Total Billing:</span>
                  <strong class="text-dark">${php(gross0)}</strong>
                </div>
                <div class="d-flex justify-content-between mb-1 small text-muted">
                  <span>Discount Applied:</span>
                  <strong class="${discount0 > 0 ? 'text-success' : 'text-muted'}" id="cp-discount-summary">${discount0 > 0 ? `-${php(discount0)}` : '₱0.00'}</strong>
                </div>
                <div class="d-flex justify-content-between mb-1 small text-muted">
                  <span>Net Total Bill:</span>
                  <strong class="text-dark" id="cp-net-total-summary">${php(total0)}</strong>
                </div>
                <div class="d-flex justify-content-between mb-1 small text-muted">
                  <span>Amount Applied to Bill:</span>
                  <strong class="text-primary" id="cp-applied">${php(required0)}</strong>
                </div>
                <div class="d-flex justify-content-between mb-1 small text-muted">
                  <span>${is5Days ? 'Balance Passed to Stay Folio:' : 'Remaining Balance:'}</span>
                  <strong class="${is5Days ? 'text-danger' : 'text-muted'}" id="cp-remaining-balance">${php(balance0)}</strong>
                </div>
                <div class="d-flex justify-content-between pt-2 border-top">
                  <span class="fw-bold text-dark">Change Returned to Guest:</span>
                  <strong class="fs-5 text-success font-monospace" id="cp-change">₱0.00</strong>
                </div>
              </div>
            </div>

            <div class="col-12 d-flex justify-content-end gap-2 pt-2 border-top">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-success fw-bold px-4 shadow-sm" id="btn-submit-cp">
                <i class="bi bi-check2-circle me-1"></i>Approve Payment &amp; Confirm Check-in
              </button>
            </div>
          </form>
        </div>
      `;

      const {root,m}=modal(`Approve Check-in Payment · Room ${esc(x.room_number)}`, modalHtml);
      const amtInput=root.querySelector('#cp-amt-input');
      const changeEl=root.querySelector('#cp-change');
      const appliedEl=root.querySelector('#cp-applied');
      const netHeadEl=root.querySelector('#cp-net-total-head');
      const netSummaryEl=root.querySelector('#cp-net-total-summary');
      const reqHead=root.querySelector('#cp-required-head');
      const requiredTotalEl=root.querySelector('#cp-required-total');
      const discountSelect=root.querySelector('#cp-discount-select');
      const discountAmountEl=root.querySelector('#cp-discount-amount');
      const discountSummaryEl=root.querySelector('#cp-discount-summary');
      const discountLabelEl=root.querySelector('#cp-discount-label');
      const remBalEl = root.querySelector('#cp-remaining-balance');
      const policyRequiredEl=root.querySelector('#cp-policy-required');
      const policyBalanceEl=root.querySelector('#cp-policy-balance');
      const quickCashArea=root.querySelector('#cp-quick-cash-area');
      const approveButton=root.querySelector('#btn-submit-cp');
      const roomChargeInclusive=Number(x.room_charge_total||0);
      const roomChargeBase=Number(x.room_taxable_base||0);
      const intPercentCents=(amount,rate)=>Math.floor((Math.round(Number(amount)*100)*Math.round(Number(rate)*100)+5000)/10000);
      let selectedDiscount=null;
      const discountChoices=new Map();
      let eligibilityConfirmed=false;
      let amountTouched=false;
      let currentTotal=total0;
      let currentRequired=required0;

      const recompute=()=>{
        const taxExemptDiscount=selectedDiscount
          && ['SENIOR_CITIZEN','PWD'].includes(String(selectedDiscount.policy.category||'').toUpperCase());
        const discountBasis=taxExemptDiscount?roomChargeBase:roomChargeInclusive;
        let discountAmountCents=selectedDiscount
          ? selectedDiscount.policy.discount_type==='PERCENT'
            ? intPercentCents(discountBasis,selectedDiscount.rate)
            : Math.round(Number(selectedDiscount.policy.discount_value)*100)
          : 0;
        if(selectedDiscount){
          discountAmountCents=Math.min(discountAmountCents,Math.round(discountBasis*100));
          if(selectedDiscount.policy.max_discount!==null){
            discountAmountCents=Math.min(discountAmountCents,Math.round(Number(selectedDiscount.policy.max_discount)*100));
          }
        }
        const discountAmount=discountAmountCents/100;
        const taxExemption=taxExemptDiscount?Number(x.vat_amount||0):0;
        const previousRequired=currentRequired;
        currentTotal=Math.max(0,Math.round((total0-discountAmount-taxExemption)*100)/100);
        currentRequired=Math.min(currentTotal,Math.floor((Math.round(currentTotal*100)*pct/100)+0.5)/100);
        const currentDiscount=discount0+discountAmount;
        const previousAmount=Number(amtInput.value||0);
        if(!amountTouched || previousAmount<currentRequired || Math.abs(previousAmount-previousRequired)<0.001)amtInput.value=currentRequired.toFixed(2);
        const v=Number(amtInput.value||0);
        const applied=Math.min(v,currentTotal);
        netHeadEl.textContent=php(currentTotal);
        netSummaryEl.textContent=php(currentTotal);
        reqHead.textContent=php(currentRequired);
        requiredTotalEl.textContent=php(currentTotal);
        discountAmountEl.textContent=`${currentDiscount>0?'-':''}${php(currentDiscount)}`;
        discountSummaryEl.textContent=`${currentDiscount>0?'-':''}${php(currentDiscount)}`;
        discountSummaryEl.classList.toggle('text-success',currentDiscount>0);
        discountSummaryEl.classList.toggle('text-muted',currentDiscount<=0);
        discountAmountEl.classList.toggle('text-success',currentDiscount>0);
        discountAmountEl.classList.toggle('text-muted',currentDiscount<=0);
        discountLabelEl.classList.toggle('d-none',currentDiscount<=0);
        if(selectedDiscount)discountLabelEl.textContent=`${selectedDiscount.policy.name}${selectedDiscount.policy.discount_type==='PERCENT'?` · ${selectedDiscount.rate}%`:''}`;
        else if(discount0>0)discountLabelEl.textContent=discountReason0||'Applied';
        amtInput.min=currentRequired.toFixed(2);
        appliedEl.textContent=php(applied);
        changeEl.textContent=php(Math.max(0,v-applied));
        if(policyRequiredEl)policyRequiredEl.textContent=php(currentRequired);
        if(policyBalanceEl)policyBalanceEl.textContent=php(Math.max(0,currentTotal-currentRequired));
        if (remBalEl) {
          const rem = Math.max(0, currentTotal - applied);
          remBalEl.textContent = php(rem);
        }
        if(quickCashArea){
          const presets=[currentRequired,Math.ceil(currentRequired/100)*100,Math.ceil(currentRequired/500)*500,Math.ceil(currentRequired/1000)*1000,currentTotal]
            .filter((amount,index,items)=>amount>=currentRequired&&items.indexOf(amount)===index);
          quickCashArea.innerHTML=`<div class="d-flex align-items-center gap-1 flex-wrap"><span class="small text-muted me-1">Quick Presets:</span>${presets.map((amount,index)=>`<button type="button" class="btn btn-sm btn-outline-secondary cp-quick-btn" data-val="${amount.toFixed(2)}">${index===0?`Exact (${php(amount)})`:Math.abs(amount-currentTotal)<0.001?`Pay Full Bill (${php(amount)})`:php(amount)}</button>`).join('')}</div>`;
          quickCashArea.querySelectorAll('.cp-quick-btn').forEach(button=>button.addEventListener('click',()=>{
            amountTouched=true;
            amtInput.value=button.dataset.val;
            recompute();
          }));
        }
      };

      amtInput.addEventListener('input',()=>{amountTouched=true;recompute()});

      recompute();

      root.querySelector('#approve-cp-form').onsubmit=async e=>{
        e.preventDefault();
        const f=Object.fromEntries(new FormData(e.target));
        try{
          const submittedDiscount=discountSelect?.value ? discountChoices.get(discountSelect.value) : null;
          if(discountSelect?.value && !submittedDiscount){
            throw new Error('The selected discount could not be verified. Select it again before approving payment.');
          }
          if(submittedDiscount && submittedDiscount!==selectedDiscount){
            throw new Error('Wait for the selected discount to finish applying, then approve payment.');
          }
          const r=await api('approve_checkin_payment',{
            checkin_payment_id:Number(cpId),
            method:f.method,
            amount_received:Number(f.amount_received),
            apply_discount:Boolean(submittedDiscount),
            discount_policy_id:submittedDiscount?Number(submittedDiscount.policy.id):0,
            ...(submittedDiscount?{
              discount_value:submittedDiscount.rate,
              eligibility_confirmed:eligibilityConfirmed,
              discount_reason:`Applied during cashier check-in approval: ${submittedDiscount.policy.name}${submittedDiscount.policy.discount_type==='PERCENT'?` (${submittedDiscount.rate}%)`:''}`
            }: {})
          });
          m.hide();
          const discountMessage=Number(r.discount_amount)>0?` · Discount: ${php(r.discount_amount)}`:'';
          notify(`Check-in payment approved! Receipt: ${r.receipt_number} · Paid: ${php(r.amount_paid)}${discountMessage} · Guest is now active.`);
          await showReceiptModal(r);
          await open(activeModule);
        }catch(err){
          cpError('Approve payment failed',err);
        }
      };

      if(discountSelect&&!hasExistingDiscount){
        try{
          const policyResponse=await fetch('/api/cashier_discount_policies.php',{
            method:'GET',
            credentials:'include',
            cache:'no-store',
            headers:{Accept:'application/json'}
          });
          const policyData=await policyResponse.json().catch(()=>({}));
          if(!policyResponse.ok||policyData.error){
            throw new Error(policyData.error||`Discount service returned HTTP ${policyResponse.status}.`);
          }
          const eligiblePolicies=(Array.isArray(policyData.discounts)?policyData.discounts:[]).filter(policy=>
            String(policy.applies_to||'').trim().toUpperCase()==='ROOM'&&!Number(policy.combinable)&&!Number(policy.requires_manager)
            &&Number(policy.min_amount||0)<=roomChargeBase
          );
          const options=eligiblePolicies.flatMap(policy=>{
            const rule=DISCOUNT_RATE_RULES[String(policy.category||'').trim().toUpperCase()];
            const rates=rule?Array.from({length:rule.max-rule.min+1},(_,index)=>rule.min+index):[Number(policy.discount_value)];
            return rates.map(rate=>{
              const key=String(discountChoices.size);
              discountChoices.set(key,{policy,rule,rate});
              return `<option value="${key}">${esc(policy.name)}${policy.discount_type==='PERCENT'?` · ${rate}%`:` · ${php(policy.discount_value)}`}</option>`;
            });
          });
          discountSelect.innerHTML='<option value="">No discount</option>'+options.join('');
          if(!options.length){
            discountSelect.innerHTML='<option value="">No eligible discounts available</option>';
            discountSelect.disabled=true;
          }else{
            discountSelect.disabled=false;
          }
          discountSelect.addEventListener('change',async()=>{
            const choice=discountChoices.get(discountSelect.value);
            if(!choice){
              selectedDiscount=null;
              eligibilityConfirmed=false;
              recompute();
              return;
            }
            discountSelect.disabled=true;
            approveButton.disabled=true;
            try{
              if(choice.rule?.eligibleId){
                const confirmed=await window.HotelDialogs.confirm({
                  title:`Verify ${choice.policy.name} eligibility`,
                  text:'Confirm that you checked the guest’s eligibility and valid ID. Do not enter or store the ID number.',
                  confirmButtonText:'Confirm eligibility',
                  actionType:'warning'
                });
                if(!confirmed){
                  discountSelect.value='';
                  selectedDiscount=null;
                  eligibilityConfirmed=false;
                  recompute();
                  return;
                }
                eligibilityConfirmed=true;
              }else{
                eligibilityConfirmed=false;
              }
              selectedDiscount=choice;
              recompute();
            }catch(err){
              discountSelect.value='';
              selectedDiscount=null;
              eligibilityConfirmed=false;
              notify(err.message,true);
              recompute();
            }finally{
              discountSelect.disabled=false;
              approveButton.disabled=false;
            }
          });
        }catch(err){
          discountSelect.innerHTML='<option value="">Discount list unavailable</option>';
          discountSelect.disabled=true;
          notify(`Could not load check-in discounts: ${err.message}`,true);
        }
      }

    } catch(e){cpError('Approve payment failed',e);}
  }

async function confirmCheckinPayment(cpId) {

    try{await api('confirm_checkin_payment',{checkin_payment_id:Number(cpId)});notify('Payment confirmed. The Cashier has been notified.');await open(activeModule);}catch(e){notify(e.message,true)}

  }

  async function cancelPendingCheckin(stayId, stayCode) {

    const confirmed=await window.HotelDialogs.confirm({title:'Cancel pending check-in?',text:`Cancel check-in ${stayCode}? The guest has not settled the check-in payment. The room will be released and the FOR PAYMENT record marked cancelled.`,confirmButtonText:'Cancel check-in',actionType:'warning'});

    if(!confirmed)return;

    try{await api('cancel_pending_checkin',{stay_id:Number(stayId)});notify(`Pending check-in ${stayCode} cancelled. Room released.`);await open(activeModule);}catch(e){notify(e.message,true)}

  }

  async function folio(id) {
    try {
      const d = await api('folio', { folio_id: id });
      const f = d.folio;
      const rows = d.charges.map(c => `<tr><td>${esc(c.description)}</td><td>${c.quantity}</td><td>${php(c.unit_price)}</td><td>${php(c.amount)}</td></tr>`).join('');
      const payments = d.payments.map(p => `<tr><td>${esc(p.receipt_number)}</td><td>${esc(p.method)}</td><td>${esc(p.created_at)}</td><td>${php(p.amount)}</td></tr>`).join('');
      const discounts = (d.discounts || []).map(z => `<tr><td>${esc(discountDisplayName(z))}</td><td>${esc(z.status)}</td><td>${php(z.amount)}</td></tr>`).join('');
      const x = modal(`Shesh Dev Hotel · Bill ${esc(f.folio_number)}`, `
        <div class="mb-3"><strong>Shesh Dev Hotel</strong><br>Agora, Lapasan, Cagayan de Oro</div>
        <div class="d-flex justify-content-between flex-wrap"><p>Stay ${esc(f.stay_code)} · Room ${esc(f.room_number)}</p>${pill(f.status)}</div>
        <h6 class="fw-bold">Charges</h6>
        ${table(['Description', 'Qty', 'Unit price', 'Amount'], rows, 'No charges.')}
        <div class="row g-2 my-3">
          <div class="col-md-3"><div class="p-3 bg-light rounded">Charges<strong class="d-block">${php(d.total)}</strong></div></div>
          <div class="col-md-3"><div class="p-3 bg-light rounded">Discounts<strong class="d-block text-success">− ${php(d.discount_total || 0)}</strong></div></div>
          <div class="col-md-3"><div class="p-3 bg-light rounded">VAT (${Number(d.vat_rate || 0)}%)<strong class="d-block">${php(d.vat || 0)}</strong></div></div>
          <div class="col-md-3"><div class="p-3 bg-light rounded">Paid<strong class="d-block">${php(d.paid)}</strong></div></div>
          <div class="col-md-3"><div class="p-3 bg-light rounded">Balance (VAT included)<strong class="d-block">${php(d.balance)}</strong></div></div>
        </div>
        <h6 class="fw-bold">Applied discounts</h6>
        ${table(['Discount', 'Status', 'Amount'], discounts, 'No discounts applied.')}
        <h6 class="fw-bold mt-3">Payments</h6>
        ${table(['Receipt', 'Method', 'Date', 'Amount'], payments, 'No payments yet.')}
        <div class="d-flex flex-wrap gap-2 mt-3">
          ${f.status === 'OPEN' ? '<button class="btn btn-outline-primary" id="add-charge">Add charge</button>' : ''}
          <button class="btn btn-primary" id="take-payment" ${f.status !== 'OPEN' || Number(d.balance) <= 0 ? 'disabled' : ''}>Record payment</button>
          <button class="btn btn-outline-secondary" onclick="window.print()">Print bill</button>
        </div>
      `);
      x.root.querySelector('#add-charge')?.addEventListener('click', () => { x.m.hide(); addCharge(id); });
      x.root.querySelector('#take-payment')?.addEventListener('click', () => { x.m.hide(); pay(id, Number(d.balance)); });

    } catch (e) {
      notify(e.message, true);
    }
  }

  async function earlyCheckout(id){

    let stayId = id;

    let staysList = [];

    if (!stayId) {

      try {

        const d = await api('active_stays', {}, 'GET');

        staysList = d.stays || [];

        if (!staysList.length) return notify('No active in-house stays available for early checkout.', true);

        stayId = staysList[0].id;

      } catch (e) {

        return notify(e.message, true);

      }

    }

    let policyTime;
    try {
      policyTime = await api('hotel_time_policy', {}, 'GET');
    } catch (e) {
      return notify(e.message, true);
    }

    let policies;

    try {

      policies = (await api('early_checkout_policies', {}, 'GET')).policies || [];

    } catch(e) {

      return notify(e.message, true);

    }

    const active = policies.filter(p => Number(p.active)).sort((a, b) => {
      if (a.policy_key === 'HOURLY_PLUS_FEE') return -1;
      if (b.policy_key === 'HOURLY_PLUS_FEE') return 1;
      return Number(a.id) - Number(b.id);
    });

    if (!active.length) return notify('No active early checkout policies configured. Ask an administrator to configure one in Settings.', true);



    const stayPickerHtml = (!id && staysList.length > 0)

      ? `<div class="col-12"><label class="form-label fw-semibold">Select Active In-House Stay</label><select class="form-select" name="stay_id" id="early-stay-picker" required>${staysList.map(s => `<option value="${s.id}">Room ${esc(s.room_number)} · Stay ${esc(s.stay_code)}${s.guest_name ? ` (${esc(s.guest_name)})` : ''} · Checkout: ${esc(s.planned_checkout)}</option>`).join('')}</select></div>`

      : '';



    const x = modal('Early Checkout / Cancellation Request', `<form id="early-form" class="row g-3">

      ${stayPickerHtml}

      <div class="col-md-6"><label class="form-label">Request type</label><select class="form-select" name="request_type"><option value="EARLY_CHECKOUT">Early checkout</option><option value="CANCEL_AFTER_CHECKIN">Cancellation after check-in</option></select></div>

      <div class="col-md-6"><label class="form-label">Configured billing policy</label><select class="form-select" name="policy_id" id="early-policy" required>${active.map(p => `<option value="${Number(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>

      <div class="col-md-6"><label class="form-label">Intended departure date and time (${esc(policyTime.timezone)})</label><input class="form-control" type="datetime-local" name="requested_departure_at" value="${String(policyTime.hotel_now).replace(' ','T').slice(0,16)}" required></div>

      <div class="col-12"><div class="alert alert-info mb-0" id="early-policy-info"></div></div>

      <div class="col-12"><label class="form-label">Reason</label><textarea class="form-control" name="reason" required maxlength="500" placeholder="State reason for early departure or cancellation"></textarea></div>

      <div class="col-12 text-end"><button class="btn btn-primary"><i class="bi bi-send me-1"></i>Submit Early Checkout Request</button></div>

    </form>`);



    const sel = x.root.querySelector('#early-policy'), info = x.root.querySelector('#early-policy-info');

    const describe = () => {

      const p = active.find(p => Number(p.id) === Number(sel.value));

      info.textContent = p
        ? `${p.description || p.name}${p.policy_key === 'MANAGER_EXCEPTION' ? ' This is authorization only: a different manager must approve it, and existing room charges are preserved.' : ' This policy changes billing only and cannot authorize departure before the scheduled checkout time.'}${p.policy_key === 'HOURLY_PLUS_FEE' ? ` A different manager must approve it; the ₱${Number(p.fixed_fee).toFixed(2)} fee is included in the recalculated room charge.` : ''}`
        : 'Choose a policy.';

    };

    sel.onchange = describe;

    describe();

    x.root.querySelector('#early-form').onsubmit = async (e) => {

      e.preventDefault();

      const v = Object.fromEntries(new FormData(e.target));

      const targetStayId = Number(v.stay_id || stayId);
      const reason = String(v.reason || '').trim();
      const departureAt = String(v.requested_departure_at || '').replace('T', ' ');
      if (!reason) {
        notify('Enter a reason for the early checkout request.', true);
        return;
      }
      if (!departureAt) {
        notify('Choose the intended departure date and time.', true);
        return;
      }

      try {

        const r = await api('early_checkout_request', {

          stay_id: targetStayId,

          request_type: v.request_type,

          policy_id: Number(v.policy_id),

          reason,

          requested_departure_at: departureAt.length === 16 ? `${departureAt}:00` : departureAt

        });

        x.m.hide();

        const selectedPolicy = active.find(p => Number(p.id) === Number(v.policy_id));
        notify(selectedPolicy?.policy_key === 'MANAGER_EXCEPTION'
          ? 'Early departure request recorded. A different manager must approve and finalize it; existing room charges will remain unchanged.'
          : `Request recorded. Proposed room charge: ${php(r.proposed_room_charge)}. This policy does not authorize early room release.`);

        if (activeModule === 'early-checkout-requests' || activeModule === 'early-checkouts') {

          await renderEarlyCheckoutRequests(activeModule === 'early-checkout-requests' ? 'early-checkout-requests-content' : 'early-checkouts-content');

        }

      } catch (err) {

        notify(err.message, true);

      }

    };

  }

  async function renderDiscountAdmin(){

    const host=$('discount-policy-admin');if(!host)return;

    try{

      const d=await api('discount_policy_admin_list',{},'GET'),discounts=d.discounts||[];

      const rows=discounts.map(x=>`<tr><td><strong>${esc(x.name)}</strong><div class="small text-muted">${esc(x.category||'PROMOTIONAL')}</div></td><td>${esc(x.discount_type)}</td><td>${x.discount_type==='PERCENT'?Number(x.discount_value)+'%':php(x.discount_value)}</td><td>${esc(x.applies_to)}</td><td>${php(x.min_amount)}</td><td>${x.max_discount===null?'—':php(x.max_discount)}</td><td>${Number(x.active)?pill('ACTIVE'):pill('INACTIVE')}</td><td><div class="d-flex gap-1"><button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.editDiscountPolicy(${Number(x.id)})">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.deleteDiscountPolicy(${Number(x.id)})">Delete</button></div></td></tr>`).join('');

      const mobileDiscountCards = discounts.map(x=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <div>

              <span class="fw-bold fs-6">${esc(x.name)}</span>

              <div class="small text-muted">${esc(x.category||'PROMOTIONAL')} · Applies to ${esc(x.applies_to)}</div>

            </div>

            ${Number(x.active)?pill('ACTIVE'):pill('INACTIVE')}

          </div>

          <div class="row g-2 mb-2 small text-muted">

            <div class="col-6">Rate / Value: <strong class="text-success fs-6">${x.discount_type==='PERCENT'?Number(x.discount_value)+'%':php(x.discount_value)}</strong></div>

            <div class="col-6 text-end">Type: <strong class="text-dark">${esc(x.discount_type)}</strong></div>

            <div class="col-6">Min bill: <strong class="text-dark">${php(x.min_amount)}</strong></div>

            <div class="col-6 text-end">Max cap: <strong class="text-dark">${x.max_discount===null?'None':php(x.max_discount)}</strong></div>

          </div>

          <div class="d-flex gap-2 pt-2 border-top">

            <button class="btn btn-sm btn-outline-primary flex-fill" onclick="HotelBilling.editDiscountPolicy(${Number(x.id)})"><i class="bi bi-pencil me-1"></i>Edit</button>

            <button class="btn btn-sm btn-outline-danger flex-fill" onclick="HotelBilling.deleteDiscountPolicy(${Number(x.id)})"><i class="bi bi-trash me-1"></i>Delete</button>

          </div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No discount policies configured.</div>';



      host.innerHTML=`<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><div><h5 class="fw-bold mb-1">Discount policies</h5><p class="text-muted small mb-0">Add, edit, activate, or delete discounts available at checkout.</p></div><button class="btn btn-primary" id="add-discount-policy-nav">＋ Add discount</button></div>

      <div class="d-none d-md-block">${table(['Discount / category','Type','Value','Applies to','Minimum bill','Maximum discount','Status','Actions'],rows,'No discount policies configured. Use Add discount to create the first option.')}</div>

      <div class="d-md-none">${mobileDiscountCards}</div>`;

      host.querySelector('#add-discount-policy-nav')?.addEventListener('click',()=>editDiscountPolicy(0));

    }catch(e){host.innerHTML=`<div class="alert alert-danger">${esc(e.message||'Unable to load discount policies.')}</div>`;}

  }

  let chatPollTimer = null;
  let chatOpenStayId = null;
  let chatThreadSeenIds = new Set();
  // Shared staff chat sound: one play per message id, silent on mute,
  // missing file, or no user interaction yet (browsers block autoplay).
  // Attached to window so the WebSocket handler reuses the same dedupe set.
  window.HotelChatSound = window.HotelChatSound || (() => {
    let audio = null; let unavailable = false; const played = new Set();
    const muted = () => { try { return localStorage.getItem("sheshdev-staff-chat-sound") === "off"; } catch (e) { return false; } };
    return {
      play(id) {
        if (muted() || unavailable) return;
        if (id !== undefined && id !== null && id !== "") { const key = String(id); if (played.has(key)) return; played.add(key); }
        try {
          if (!audio) { audio = new Audio("/assets/chat.mp3"); audio.addEventListener("error", () => { unavailable = true; }); }
          const p = audio.play(); if (p && typeof p.then === "function") p.catch(() => {});
        } catch (e) {}
      },
      muted,
    };
  })();
  async function refreshChatBadge() {
    try {
      const curRole = String(window.HotelAuth.getUser()?.role || '').toLowerCase();
      if (curRole !== 'frontdesk') {
        document.querySelectorAll('[data-chat-badge]').forEach(el => { el.textContent = '0'; el.classList.add('d-none'); });
        return;
      }
      const d = await api('chat_conversations', {}, 'GET');
      const total = (d.conversations || []).reduce((sum, c) => sum + (Number(c.unread) || 0), 0);
      document.querySelectorAll('[data-chat-badge]').forEach(el => { el.textContent = String(total); el.classList.toggle('d-none', total <= 0); });
    } catch (_) {}
  }
  function chatMessageHtml(m) {
    const isStaff = String(m.sender_type || '').toUpperCase() === 'STAFF';
    const meta = `<div class="small text-muted mb-1 ${isStaff ? 'text-end' : ''}">${esc(isStaff ? 'Front desk' : (m.sender_name || 'Guest'))} · ${esc(m.created_at || '')}</div>`;
    const bubble = `<div class="p-2 px-3" style="max-width:75%;border-radius:18px;overflow-wrap:anywhere;${isStaff ? 'background:#17344e;color:#fff' : 'background:#e9ecef;color:#17344e'}"><div style="white-space:pre-wrap">${esc(m.body || '')}</div></div>`;
    return `<div class="d-flex flex-column mb-2 ${isStaff ? 'align-items-end' : 'align-items-start'}">${meta}${bubble}</div>`;
  }
  async function renderChatList() {
    const host = $('guest-chats-content'); if (!host) return;
    const listEl = host.querySelector('#guest-chat-list'); if (!listEl) return;
    const prevScrollTop = listEl.scrollTop;
    try {
      const data = await api('chat_conversations', {}, 'GET');
      if (data.migrated === false) { listEl.innerHTML = '<div class="alert alert-warning">Guest chat is not available yet. Import database/migrations/20261031_chat_messages.sql and refresh.</div>'; return; }
      const conversations = data.conversations || [];
      if (!conversations.length) { listEl.innerHTML = '<div class="text-muted py-4">No guest chats yet. Messages from guests appear here.</div>'; return; }
      listEl.innerHTML = conversations.map(c => `<div class="card border-0 shadow-sm mb-2 ${chatOpenStayId === Number(c.stay_id) ? 'chat-list-item-active' : ''}" data-chat-item="${esc(c.stay_id)}"><div class="card-body"><div><strong>Room ${esc(c.room_number)}</strong><span class="text-muted"> · ${esc(c.guest_name || 'Guest')} · ${esc(c.stay_code)}</span>${Number(c.unread) > 0 ? ` <span class="badge text-bg-danger">${esc(c.unread)} unread</span>` : ''}</div><div class="text-muted small">${esc(c.last_sender === 'STAFF' ? 'Front desk: ' : '')}${esc((c.last_body || '').slice(0, 100))}</div><div class="text-muted small">${esc(c.last_at || '')}</div><button type="button" class="btn btn-primary btn-sm w-100 mt-2" data-chat-open="${esc(c.stay_id)}">Open chat</button></div></div>`).join('');
      listEl.scrollTop = prevScrollTop;
      listEl.querySelectorAll('[data-chat-open]').forEach(btn => btn.addEventListener('click', () => openChatThread(Number(btn.dataset.chatOpen))));
    } catch (e) { listEl.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
  }
  async function openChatThread(stayId) {
    chatOpenStayId = stayId;
    const host = $('guest-chats-content'); if (!host) return;
    const threadEl = host.querySelector('#guest-chat-thread'); if (!threadEl) return;
    threadEl.innerHTML = '<div class="text-muted py-3">Loading conversation…</div>';
    try {
      const data = await api('chat_messages', {stay_id: stayId}, 'GET');
      const stay = data.stay || {};
      const messages = data.messages || [];
      chatThreadSeenIds = new Set(messages.map(m => String(m.id)));
      host.querySelectorAll('[data-chat-item]').forEach(el => el.classList.toggle('chat-list-item-active', Number(el.dataset.chatItem) === stayId));
      const quickReplies = ["Your room is ready.", "Housekeeping is on the way.", "Your order is being prepared.", "Someone from the front desk will assist you shortly.", "Thank you for your message.", "Please let us know if you need anything else."];
      threadEl.innerHTML = `<div class="card border-0 shadow-sm"><div class="card-body"><h6 class="fw-bold">Room ${esc(stay.room_number)} · ${esc(stay.stay_code)}</h6><div id="guest-chat-thread-messages" style="max-height:420px;overflow-y:auto;padding:2px">${messages.length ? messages.map(chatMessageHtml).join('') : '<div class="text-muted">No messages yet.</div>'}</div><div class="d-flex flex-wrap gap-2 mt-3" id="guest-chat-quick-replies">${quickReplies.map(t => `<button type="button" class="btn btn-outline-secondary btn-sm" data-quick-reply="${esc(t)}">${esc(t)}</button>`).join('')}</div><form id="guest-chat-reply-form" class="mt-3"><div class="mb-2"><textarea class="form-control" name="body" rows="3" maxlength="1000" placeholder="Write a reply…" required></textarea></div><button class="btn btn-primary btn-sm" type="submit">Send reply</button></form></div></div>`;
      const form = threadEl.querySelector('#guest-chat-reply-form');
      threadEl.querySelectorAll('[data-quick-reply]').forEach(btn => { btn.addEventListener('click', () => { const ta = form.querySelector('textarea[name="body"]'); if (ta) { ta.value = btn.dataset.quickReply; ta.focus(); } }); });
      form.onsubmit = async e => { e.preventDefault(); const body = new FormData(form).get('body').toString().trim(); if (!body) return; try { await api('chat_send', {stay_id: stayId, body}); form.reset(); notify('Message sent to the guest.'); await openChatThread(stayId); await renderChatList(); await refreshChatBadge(); } catch (err) { notify(err.message, true); } };
      await refreshChatBadge();
      const threadBox = threadEl.querySelector('#guest-chat-thread-messages');
      if (threadBox) threadBox.scrollTop = threadBox.scrollHeight;
    } catch (e) { threadEl.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
  }
  async function renderGuestChats() {
    const host = $('guest-chats-content'); if (!host) return;
    host.innerHTML = `<div class="d-flex justify-content-end gap-2 mb-3"><button type="button" class="btn btn-outline-secondary btn-sm" id="guest-chats-sound-toggle" title="Mute chat sound">🔔</button><button type="button" class="btn btn-outline-secondary btn-sm" id="guest-chats-refresh"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button></div><style>.guest-chat-layout{display:flex;gap:16px;align-items:flex-start}.guest-chat-layout #guest-chat-list{flex:0 0 340px;max-width:360px;min-width:0;max-height:640px;overflow-y:auto;padding-right:2px}.guest-chat-layout #guest-chat-thread{flex:1;min-width:0}.guest-chat-layout .chat-list-item-active{outline:2px solid #17344e;outline-offset:-2px}@media (max-width:767px){.guest-chat-layout{flex-direction:column}.guest-chat-layout #guest-chat-list{flex:none;max-width:none;width:100%;max-height:none}}</style><div class="guest-chat-layout"><div id="guest-chat-list"></div><div id="guest-chat-thread"><div class="text-muted py-4 px-2">Select a conversation to view messages.</div></div></div>`;
    host.querySelector('#guest-chats-refresh').addEventListener('click', async () => { await renderChatList(); if (chatOpenStayId) await openChatThread(chatOpenStayId); });
    const chatSoundBtn = host.querySelector('#guest-chats-sound-toggle');
    const syncChatSoundBtn = () => { if (chatSoundBtn) { const m = window.HotelChatSound?.muted?.() === true; chatSoundBtn.textContent = m ? '🔕' : '🔔'; chatSoundBtn.title = m ? 'Unmute chat sound' : 'Mute chat sound'; } };
    if (chatSoundBtn) chatSoundBtn.addEventListener('click', () => { try { localStorage.setItem('sheshdev-staff-chat-sound', window.HotelChatSound?.muted?.() ? 'on' : 'off'); } catch (e) {} syncChatSoundBtn(); });
    syncChatSoundBtn();
    await renderChatList();
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(async () => {
      if (window.HotelBilling?.getActiveModule?.() !== 'guest-chats') return;
      await renderChatList();
      if (chatOpenStayId) {
        try {
          const data = await api('chat_messages', {stay_id: chatOpenStayId}, 'GET');
          (data.messages || []).forEach(m => { const key = String(m.id); if (String(m.sender_type || '').toUpperCase() === 'GUEST' && !chatThreadSeenIds.has(key)) { chatThreadSeenIds.add(key); window.HotelChatSound?.play(m.id); } });
          const box = document.querySelector('#guest-chat-thread-messages');
          if (box) {
            const nearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 120;
            const prevTop = box.scrollTop;
            box.innerHTML = (data.messages || []).length ? data.messages.map(chatMessageHtml).join('') : '<div class="text-muted">No messages yet.</div>';
            box.scrollTop = nearBottom ? box.scrollHeight : prevTop;
          }
        } catch (_) {}
      }
    }, 30000);
  }
  async function renderEarlyCheckoutRequests(targetContainerId = 'early-checkouts-content'){

    const host=$(targetContainerId) || $('early-checkout-requests-content') || $('early-checkouts-content'); if(!host)return;

    host.innerHTML='<div class="text-muted p-3"><div class="spinner-border spinner-border-sm me-2"></div>Loading early-checkout requests…</div>';

    try{

      const d=await api('early_checkout_requests',{},'GET'), rows=d.requests||[];

      const pending=rows.filter(r=>r.status==='REQUESTED').length;

      const curRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const isFrontdesk = (curRole === 'frontdesk');

      // Decide/finalize are approver actions (early_checkout.approve). Anyone

      // who can view this page without that permission gets status badges,

      // not buttons the API would reject. Falls back to the role check when

      // the session carries no permission list.

      const ecPerms = window.HotelAuth.getUser()?.permissions || [];

      const canDecideEc = ecPerms.length ? (ecPerms.includes('*') || ecPerms.includes('early_checkout.approve')) : !isFrontdesk;

      // Stay extensions live in this same panel. A user without the extension
      // permission simply does not see the section instead of breaking the page.
      let erows=[], extOk=true;
      try{ const ed=await api('stay_extension_requests',{},'GET'); erows=ed.requests||[]; }catch(e){ extOk=false; }
      const extPending=erows.filter(r=>r.status==='REQUESTED').length;
      const canDecideExt = ecPerms.length ? (ecPerms.includes('*') || ecPerms.includes('stay_extension.approve')) : !isFrontdesk;

      const renderExtAction = (r) => {
        if (r.status === 'REQUESTED') {
          return canDecideExt
            ? `<div class="d-flex gap-1"><button class="btn btn-sm btn-success" onclick="HotelBilling.decideStayExtension(${Number(r.id)},'APPROVE')">Approve</button><button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.decideStayExtension(${Number(r.id)},'REJECT')">Reject</button></div>`
            : '<span class="badge text-bg-warning text-dark"><i class="bi bi-clock me-1"></i>Pending Manager Review</span>';
        }
        if (r.status === 'APPROVED') {
          return `<div class="d-flex gap-1 align-items-center"><span class="badge text-bg-success"><i class="bi bi-check2-all me-1"></i>Approved</span> <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${Number(r.folio_id)})"><i class="bi bi-receipt me-1"></i>Folio</button></div>`;
        }
        if (r.status === 'REJECTED') {
          return '<span class="badge text-bg-danger"><i class="bi bi-x-circle me-1"></i>Rejected</span>';
        }
        return '—';
      };



      const renderEarlyAction = (r) => {
        if (r.status === 'REQUESTED') {
          return canDecideEc
            ? `<div class="d-flex gap-1"><button class="btn btn-sm btn-success" onclick="HotelBilling.decideEarlyCheckout(${Number(r.id)},'APPROVE')">Approve</button><button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.decideEarlyCheckout(${Number(r.id)},'REJECT')">Reject</button></div>`
            : '<span class="badge text-bg-warning text-dark"><i class="bi bi-clock me-1"></i>Pending Manager Review</span>';
        }
        if (r.status === 'APPROVED') {
          return r.policy === 'MANAGER_EXCEPTION'
            ? `<button class="btn btn-sm btn-primary fw-bold" onclick="HotelBilling.finalizeEarlyCheckout(${Number(r.id)},'MANAGER_EXCEPTION')"><i class="bi bi-check2-circle me-1"></i>Authorize Early Departure</button>`
            : `<button class="btn btn-sm btn-primary fw-bold" onclick="HotelBilling.finalizeEarlyCheckout(${Number(r.id)})"><i class="bi bi-receipt me-1"></i>Post Charge to Folio</button>`;
        }
        if (r.status === 'FINALIZED') {
          return `<div class="d-flex gap-1 align-items-center"><span class="badge text-bg-success"><i class="bi bi-check2-all me-1"></i>${r.policy === 'MANAGER_EXCEPTION' ? 'Authorized' : 'Posted'}</span> <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${Number(r.folio_id)})"><i class="bi bi-receipt me-1"></i>Folio</button></div>`;
        }
        if (r.status === 'REJECTED') {
          return '<span class="badge text-bg-danger"><i class="bi bi-x-circle me-1"></i>Rejected</span>';
        }
        return '—';
      };



      // Shared Stay/Folio identifier: guest name first, stay code as fallback.
      const guestName = (r) => (r.guest_name || r.stay_code || '—');
      const guestCell = (r) => `<strong>#${Number(r.id)} · ${esc(guestName(r))}</strong><div class="small text-muted">Room ${esc(r.room_number)} · Folio ${esc(r.folio_number)}</div>`;

      const body=rows.map(r=>`<tr><td>${guestCell(r)}</td><td>${esc(String(r.request_type).replaceAll('_',' '))}<div class="small text-muted">${esc(r.policy)}</div></td><td>${esc(r.reason)}</td><td>${esc(r.requested_by_name||'Staff')}</td><td>${esc(r.requested_departure_at||'—')}</td><td>${php(r.proposed_room_charge)}</td><td>${pill(r.status)}</td><td>${renderEarlyAction(r)}</td></tr>`).join('');

      const mobileEarlyCards = rows.map(r=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <div>

              <span class="fw-bold fs-6">#${Number(r.id)} · ${esc(guestName(r))}</span>

              <div class="small text-muted">Room ${esc(r.room_number)} · Folio ${esc(r.folio_number)}</div>

            </div>

            ${pill(r.status)}

          </div>

          <div class="p-2 bg-light rounded small mb-2">

            <div class="fw-semibold text-dark">${esc(String(r.request_type).replaceAll('_',' '))} · <span class="text-muted fw-normal">${esc(r.policy)}</span></div>

            <div class="text-muted mt-1">${esc(r.reason)}</div>

          </div>

          <div class="row g-2 mb-2 small text-muted">

            <div class="col-6">Requested by: <strong class="text-dark">${esc(r.requested_by_name||'Staff')}</strong></div>

            <div class="col-6 text-end">Proposed: <strong class="text-primary fs-6">${php(r.proposed_room_charge)}</strong></div>

            <div class="col-12">Departure: <strong class="text-dark">${esc(r.requested_departure_at||'—')}</strong></div>

          </div>

          <div class="pt-2 border-top">

            ${renderEarlyAction(r)}

          </div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No early-checkout requests found.</div>';



      const combinedPending = pending + (extOk ? extPending : 0);

      const topBar = isFrontdesk

        ? `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><div><h5 class="fw-bold mb-1">Early Checkout Requests</h5><p class="text-muted mb-0">Record and submit early departure requests for review and manager authorization.</p></div><div class="d-flex align-items-center gap-2"><span class="badge text-bg-warning">${pending} pending</span><button class="btn btn-primary btn-sm" onclick="HotelBilling.earlyCheckout()"><i class="bi bi-plus-lg me-1"></i>Submit Request</button><button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('early-checkout-requests')"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button></div></div>`

        : `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><div><h5 class="fw-bold mb-1">Approvals</h5><p class="text-muted mb-0">Approve or reject early checkout and stay extension requests. Early checkout approvals can post a clearly labelled charge to the guest folio; extension approvals move the checkout date and post the extra nights to the folio. This does not check out the guest; collect payment against the folio, then use the normal Checkout action.</p></div><div class="d-flex align-items-center gap-2"><span class="badge text-bg-warning">${combinedPending} pending</span><button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('early-checkouts')"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button></div></div>`;



      const extBody=erows.map(r=>`<tr><td>${guestCell(r)}</td><td>${esc(r.current_checkout)} → <strong>${esc(r.requested_checkout)}</strong></td><td>${esc(r.extra_nights)} night${Number(r.extra_nights)===1?'':'s'}</td><td>${php(r.proposed_charge)}</td><td>${esc(r.reason||'—')}${r.status==='REJECTED'&&r.review_note?`<div class="small text-muted">Note: ${esc(r.review_note)}</div>`:''}</td><td>${esc(r.requested_by_name||'Guest portal')}</td><td>${pill(r.status)}</td><td>${renderExtAction(r)}</td></tr>`).join('');
      const extCards=erows.map(r=>`
        <div class="card border-0 shadow-sm p-3 mb-2">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <span class="fw-bold fs-6">#${Number(r.id)} · ${esc(guestName(r))}</span>
              <div class="small text-muted">Room ${esc(r.room_number)} · Folio ${esc(r.folio_number)}</div>
            </div>
            ${pill(r.status)}
          </div>
          <div class="p-2 bg-light rounded small mb-2">
            <div class="fw-semibold text-dark">${esc(r.current_checkout)} → ${esc(r.requested_checkout)} · <span class="text-muted fw-normal">${esc(r.extra_nights)} night${Number(r.extra_nights)===1?'':'s'}</span></div>
            <div class="text-muted mt-1">${esc(r.reason||'No reason given')}</div>
            ${r.status==='REJECTED'&&r.review_note?`<div class="text-muted mt-1">Note: ${esc(r.review_note)}</div>`:''}
          </div>
          <div class="row g-2 mb-2 small text-muted">
            <div class="col-6">Requested by: <strong class="text-dark">${esc(r.requested_by_name||'Guest portal')}</strong></div>
            <div class="col-6 text-end">Proposed: <strong class="text-primary fs-6">${php(r.proposed_charge)}</strong></div>
          </div>
          <div class="pt-2 border-top">
            ${renderExtAction(r)}
          </div>
        </div>
      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No stay extension requests found.</div>';
      const extSection = extOk ? `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 mt-4"><div><h5 class="fw-bold mb-1">Stay Extension Requests</h5><p class="text-muted mb-0">Approve or reject guest requests to stay past the planned checkout date. Approval moves the checkout date and posts the extra nights to the folio; the guest settles at checkout.</p></div><div class="d-flex align-items-center gap-2"><span class="badge text-bg-warning">${extPending} pending</span></div></div>
      <div class="d-none d-md-block">${table(['Stay / Folio','Checkout change','Extra nights','Proposed charge','Reason','Requested by','Status','Action'],extBody,'No stay extension requests found.')}</div>
      <div class="d-md-none">${extCards}</div>` : '';

            // Combined approvals list (approver view only): early checkout +
      // extension rows merged, REQUESTED first, then APPROVED, REJECTED,
      // other statuses, created_at DESC within the same status.
      const statusRank = (st) => st === 'REQUESTED' ? 0 : st === 'APPROVED' ? 1 : st === 'REJECTED' ? 2 : 3;
      const combinedRows = [
        ...rows.map(r => ({...r, _kind: 'early'})),
        ...(extOk ? erows.map(r => ({...r, _kind: 'ext'})) : []),
      ].sort((a, b) => (statusRank(a.status) - statusRank(b.status)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const combinedTypeBadge = (r) => r._kind === 'ext'
        ? '<span class="badge text-bg-success">Extension</span>'
        : '<span class="badge text-bg-info text-dark">Early checkout</span>';
      const combinedDetails = (r) => r._kind === 'ext'
        ? `${esc(r.current_checkout)} → <strong>${esc(r.requested_checkout)}</strong><div class="small text-muted">${esc(r.extra_nights)} night${Number(r.extra_nights) === 1 ? '' : 's'}</div><div class="small text-muted mt-1">${esc(r.reason || 'No reason given')}${r.status === 'REJECTED' && r.review_note ? `<br>Note: ${esc(r.review_note)}` : ''}</div>`
        : `${esc(String(r.request_type).replaceAll('_', ' '))}<div class="small text-muted">${esc(r.policy)} · Departs ${esc(r.requested_departure_at || '—')}</div><div class="small text-muted mt-1">${esc(r.reason || '')}</div>`;
      const combinedRequestedBy = (r) => r._kind === 'ext' ? (r.requested_by_name || 'Guest portal') : (r.requested_by_name || 'Staff');
      const combinedCharge = (r) => r._kind === 'ext' ? r.proposed_charge : r.proposed_room_charge;
      const combinedAction = (r) => r._kind === 'ext' ? renderExtAction(r) : renderEarlyAction(r);
      const combinedBody = combinedRows.map(r => `<tr><td>${guestCell(r)}</td><td>${combinedTypeBadge(r)}</td><td>${combinedDetails(r)}</td><td>${esc(combinedRequestedBy(r))}</td><td>${php(combinedCharge(r))}</td><td>${pill(r.status)}</td><td>${combinedAction(r)}</td></tr>`).join('');
      const combinedCards = combinedRows.map(r => `
        <div class="card border-0 shadow-sm p-3 mb-2">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <span class="fw-bold fs-6">#${Number(r.id)} · ${esc(guestName(r))}</span>
              <div class="small text-muted">Room ${esc(r.room_number)} · Folio ${esc(r.folio_number)}</div>
            </div>
            ${combinedTypeBadge(r)}
          </div>
          <div class="p-2 bg-light rounded small mb-2">
            <div class="fw-semibold text-dark">${combinedDetails(r)}</div>
          </div>
          <div class="row g-2 mb-2 small text-muted">
            <div class="col-6">Requested by: <strong class="text-dark">${esc(combinedRequestedBy(r))}</strong></div>
            <div class="col-6 text-end">Proposed: <strong class="text-primary fs-6">${php(combinedCharge(r))}</strong></div>
          </div>
          <div class="d-flex justify-content-between align-items-center pt-2 border-top">
            ${pill(r.status)}
            ${combinedAction(r)}
          </div>
        </div>
      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No approval requests found.</div>';

      host.innerHTML = isFrontdesk
        ? `${topBar}

      <div class="d-none d-md-block">${table(['Stay / Folio','Request','Reason','Requested by','Requested departure','Proposed charge','Status','Action'],body,'No early-checkout requests found.')}</div>

      <div class="d-md-none">${mobileEarlyCards}</div>${extSection}`
        : `${topBar}

      <div class="d-none d-md-block">${table(['Guest / Stay · Folio','Type','Details','Requested by','Proposed charge','Status','Action'],combinedBody,'No approval requests found.')}</div>

      <div class="d-md-none">${combinedCards}</div>`;

    }catch(e){host.innerHTML=`<div class="alert alert-danger">${esc(e.message||'Unable to load early-checkout requests.')}</div>`;}

  }

  async function decideEarlyCheckout(id,decision){

    const action=decision==='APPROVE'?'approve':'reject';

    const note=await window.HotelDialogs.input({title:`${action[0].toUpperCase()+action.slice(1)} early-checkout request`,text:`Optional note for request #${id}.`,label:'Note',type:'textarea',placeholder:'Enter an optional note'});

    if(note===null)return;

    const confirmed=await window.HotelDialogs.confirm({title:`${action[0].toUpperCase()+action.slice(1)} request #${id}?`,text:'This decision will be recorded in the audit log.',confirmButtonText:action[0].toUpperCase()+action.slice(1)});

    if(!confirmed)return;

    try{const r=await api('early_checkout_decision',{request_id:id,decision,note});notify(r.message||`Request ${r.status}.`);await renderEarlyCheckoutRequests();}

    catch(e){notify(e.message,true);}

  }

  async function decideStayExtension(id,decision){
    const action=decision==='APPROVE'?'approve':'reject';
    const note=await window.HotelDialogs.input({title:`${action[0].toUpperCase()+action.slice(1)} stay extension request`,text:`Optional note for request #${id}.`,label:'Note',type:'textarea',placeholder:'Enter an optional note'});
    if(note===null)return;
    const confirmed=await window.HotelDialogs.confirm({title:`${action[0].toUpperCase()+action.slice(1)} request #${id}?`,text:decision==='APPROVE'?'The checkout date will move and the extra nights will be posted to the folio.':'The guest will see this decision in the guest portal.',confirmButtonText:action[0].toUpperCase()+action.slice(1)});
    if(!confirmed)return;
    try{const r=await api(decision==='APPROVE'?'stay_extension_approve':'stay_extension_reject',{request_id:id,note});notify(r.message||`Request ${r.status}.`);await renderEarlyCheckoutRequests();}
    catch(e){notify(e.message,true);}
  }

  async function finalizeEarlyCheckout(id,policy){
    const isException=policy==='MANAGER_EXCEPTION';
    const confirmed=await window.HotelDialogs.confirm(isException?{title:'Authorize early departure?',text:`Authorize early departure for request #${id}? No charge will be posted and unused nights are not refunded; the guest pays the full booked stay. Any remaining balance is still due before checkout.`,confirmButtonText:'Authorize departure'}:{title:'Post charge to folio?',text:`Post the early-checkout charge for request #${id} to the folio? The room charge will be recalculated and the guest can settle the remaining balance before checkout. Any excess payment remains as a credit.`,confirmButtonText:'Post charge'});
    if(!confirmed)return;
    try{
      const r=await api('early_checkout_finalize',{request_id:id});
      notify(r.message||(isException?'Early departure authorized. Unused nights are not refunded.':'Early-checkout charge posted to folio.'));
      if (r.folio_id) {
        await folio(r.folio_id);
      } else {
        await renderEarlyCheckoutRequests();
      }
    }
    catch(e){notify(e.message,true);}
  }

  async function renderVatSettings(){
    const host=$('vat-settings');
    if(!host)return;
    try{
      const settings=await api('vat_settings',{},'GET');
      host.innerHTML=`<div class="card border-0 shadow-sm mb-4"><div class="card-body"><h6 class="fw-bold">VAT-inclusive pricing</h6><p class="small text-muted">Room and folio prices already include VAT. The backend extracts VAT from the inclusive total; it is never added on top. Update the rate only when the applicable tax rule changes.</p><form id="vat-settings-form" class="row g-2 align-items-end"><div class="col-sm-4 col-md-3"><label class="form-label" for="vat-rate-input">VAT rate (%)</label><input id="vat-rate-input" class="form-control" type="number" name="vat_rate" min="0" max="100" step="0.01" value="${esc(settings.vat_rate)}" required></div><div class="col-auto"><button class="btn btn-primary" type="submit">Save VAT settings</button></div><div class="col-12 small text-muted">Enter 0.00% or a rate from 1.00% to 100.00%. Philippines standard VAT: 12%. VAT-exempt discounts are applied according to their approved discount category.</div></form></div></div>`;
      host.querySelector('#vat-settings-form').onsubmit=async event=>{
        event.preventDefault();
        try{
          const form=Object.fromEntries(new FormData(event.currentTarget));
          const result=await api('vat_settings_save',form);
          notify(`VAT-inclusive pricing saved at ${Number(result.vat_rate).toFixed(2)}%.`);
          await renderVatSettings();
        }catch(error){notify(error.message,true);}
      };
    }catch(error){host.innerHTML=`<div class="alert alert-danger">${esc(error.message||'Could not load VAT settings.')}</div>`;}
  }

  async function renderPolicyAdmin(){const host=$('policy-admin');if(!host)return;try{const [ep,dp]=await Promise.all([api('early_checkout_policies',{},'GET'),api('discount_policy_admin_list',{},'GET')]);const policies=ep.policies||[], discounts=dp.discounts||[];
    let lateSettings={enabled:true,grace_minutes:60,cutoff_time:'18:00',fee_percent:50};
    try{const lp=await api('late_checkout_policy',{},'GET');if(lp.settings)lateSettings=lp.settings;}catch(_){}

    const er=policies.map(p=>`<tr><td><strong>${esc(p.name)}</strong><div class="small text-muted">${esc(p.policy_key)}</div><div class="small">${esc(p.description||'')}</div></td><td>${Number(p.minimum_hours)} h</td><td>${Number(p.minimum_nights)} night(s)</td><td>${php(p.fixed_fee)}</td><td>${Number(p.requires_manager)?'Yes':'No'}</td><td>${Number(p.active)?pill('ACTIVE'):pill('INACTIVE')}</td><td><button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.editEarlyPolicy(${Number(p.id)})">Edit</button></td></tr>`).join('');

    const dr=discounts.map(d=>`<tr><td><strong>${esc(d.name)}</strong><div class="small text-muted">${esc(d.category||'PROMOTIONAL')}</div></td><td>${esc(d.discount_type)}</td><td>${d.discount_type==='PERCENT'?Number(d.discount_value)+'%':php(d.discount_value)}</td><td>${esc(d.applies_to)}</td><td>${php(d.min_amount)}</td><td>${d.max_discount===null?'—':php(d.max_discount)}</td><td>${Number(d.active)?pill('ACTIVE'):pill('INACTIVE')}</td><td><div class="d-flex gap-1"><button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.editDiscountPolicy(${Number(d.id)})">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.deleteDiscountPolicy(${Number(d.id)})">Delete</button></div></td></tr>`).join('');



    const mobileEarlyPolicies = policies.map(p=>`

      <div class="card border-0 shadow-sm p-3 mb-2">

        <div class="d-flex justify-content-between align-items-start mb-2">

          <div>

            <span class="fw-bold fs-6">${esc(p.name)}</span>

            <div class="small text-muted">${esc(p.policy_key)}</div>

          </div>

          ${Number(p.active)?pill('ACTIVE'):pill('INACTIVE')}

        </div>

        ${p.description ? `<div class="p-2 bg-light rounded small mb-2 text-muted">${esc(p.description)}</div>` : ''}

        <div class="row g-2 mb-2 small text-muted">

          <div class="col-6">Min hours: <strong class="text-dark">${Number(p.minimum_hours)} h</strong></div>

          <div class="col-6 text-end">Min nights: <strong class="text-dark">${Number(p.minimum_nights)}</strong></div>

          <div class="col-6">Fixed fee: <strong class="text-primary fs-6">${php(p.fixed_fee)}</strong></div>

          <div class="col-6 text-end">Manager approval: <strong class="text-dark">${Number(p.requires_manager)?'Yes':'No'}</strong></div>

        </div>

        <div class="pt-2 border-top">

          <button class="btn btn-sm btn-outline-primary w-100" onclick="HotelBilling.editEarlyPolicy(${Number(p.id)})"><i class="bi bi-pencil me-1"></i>Edit Policy</button>

        </div>

      </div>

    `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No early checkout policies.</div>';



    const mobileDiscountPolicies = discounts.map(x=>`

      <div class="card border-0 shadow-sm p-3 mb-2">

        <div class="d-flex justify-content-between align-items-start mb-2">

          <div>

            <span class="fw-bold fs-6">${esc(x.name)}</span>

            <div class="small text-muted">${esc(x.category||'PROMOTIONAL')} · Applies to ${esc(x.applies_to)}</div>

          </div>

          ${Number(x.active)?pill('ACTIVE'):pill('INACTIVE')}

        </div>

        <div class="row g-2 mb-2 small text-muted">

          <div class="col-6">Rate / Value: <strong class="text-success fs-6">${x.discount_type==='PERCENT'?Number(x.discount_value)+'%':php(x.discount_value)}</strong></div>

          <div class="col-6 text-end">Type: <strong class="text-dark">${esc(x.discount_type)}</strong></div>

          <div class="col-6">Min bill: <strong class="text-dark">${php(x.min_amount)}</strong></div>

          <div class="col-6 text-end">Max cap: <strong class="text-dark">${x.max_discount===null?'None':php(x.max_discount)}</strong></div>

        </div>

        <div class="d-flex gap-2 pt-2 border-top">

          <button class="btn btn-sm btn-outline-primary flex-fill" onclick="HotelBilling.editDiscountPolicy(${Number(x.id)})"><i class="bi bi-pencil me-1"></i>Edit</button>

          <button class="btn btn-sm btn-outline-danger flex-fill" onclick="HotelBilling.deleteDiscountPolicy(${Number(x.id)})"><i class="bi bi-trash me-1"></i>Delete</button>

        </div>

      </div>

    `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No discount policies configured.</div>';



    const hasManagerException=policies.some(p=>p.policy_key==='MANAGER_EXCEPTION');
    const hasHourlyFeePolicy=policies.some(p=>p.policy_key==='HOURLY_PLUS_FEE');
    host.innerHTML=`<div class="card border-0 shadow-sm mt-4"><div class="card-body"><h5 class="fw-bold mb-1">Late checkout / overstay rule</h5><p class="text-muted small mb-3">Calculated at checkout only — never an auto-checkout and never a background charge. Scheduled checkout is 12:00 PM; the fee and extra nights below are posted only after front desk confirms them at checkout, and only a manager can waive them. Turning the rule off restores manual-only charging.</p><form id="late-checkout-form" class="row g-3"><div class="col-md-3 form-check ms-2 d-flex align-items-center"><input class="form-check-input me-2" type="checkbox" name="enabled" value="1" ${lateSettings.enabled?'checked':''}><label class="form-check-label">Rule enabled</label></div><div class="col-md-3"><label class="form-label">Grace period (minutes after 12:00 PM)</label><input class="form-control" type="number" name="grace_minutes" min="0" max="720" required value="${Number(lateSettings.grace_minutes)}"></div><div class="col-md-3"><label class="form-label">Evening cutoff (HH:MM, full night after this)</label><input class="form-control" name="cutoff_time" pattern="[0-9]{2}:[0-9]{2}" required value="${esc(lateSettings.cutoff_time)}"></div><div class="col-md-3"><label class="form-label">Late fee (% of nightly rate)</label><input class="form-control" type="number" name="fee_percent" min="0" max="100" step="0.01" required value="${Number(lateSettings.fee_percent)}"></div><div class="col-12 text-end"><button class="btn btn-primary">Save late checkout rule</button></div></form></div></div>
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4"><div><h5 class="fw-bold mb-1">Early checkout policy lookup</h5><p class="text-muted small mb-0">Early departure is blocked by default. Only an active manager-approved exception can authorize it; billing policies do not permit early room release.</p></div><div class="d-flex gap-2">${hasManagerException?'':'<button class="btn btn-outline-primary btn-sm" id="add-manager-exception">＋ Configure manager exception</button>'}${hasHourlyFeePolicy?'':'<button class="btn btn-primary btn-sm" id="add-hourly-fee-policy">＋ Configure hourly + ₱500 fee</button>'}</div></div>

    <div class="d-none d-md-block">${table(['Policy','Minimum hours','Minimum nights','Fixed fee','Manager approval','Status','Action'],er,'No early checkout policies.')}</div>

    <div class="d-md-none">${mobileEarlyPolicies}</div>

    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4"><div><h5 class="fw-bold mb-1">Discount policy lookup</h5><p class="text-muted small mb-0">These policies populate the Checkout discounts dropdown. Edit values here; staff choose a policy rather than entering discount amounts.</p></div><button class="btn btn-primary btn-sm" id="add-discount-policy">＋ Add discount</button></div>

    <div class="d-none d-md-block">${table(['Discount / category','Type','Value','Applies to','Minimum bill','Maximum discount','Status','Actions'],dr,'No discount policies configured. Use Add discount to create the first option.')}</div>

    <div class="d-md-none">${mobileDiscountPolicies}</div>`;

    host.querySelector('#add-manager-exception')?.addEventListener('click',addManagerExceptionPolicy);
    host.querySelector('#add-hourly-fee-policy')?.addEventListener('click',addHourlyFeePolicy);
    host.querySelector('#add-discount-policy')?.addEventListener('click',()=>editDiscountPolicy(0));
    host.querySelector('#late-checkout-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{await api('late_checkout_policy_save',{enabled:f.elements.enabled.checked?1:0,grace_minutes:Number(f.elements.grace_minutes.value),cutoff_time:String(f.elements.cutoff_time.value).trim(),fee_percent:Number(f.elements.fee_percent.value)});notify('Late checkout rule saved.');await renderPolicyAdmin();}catch(err){notify(err.message,true);}});

  }catch(e){host.innerHTML=`<div class="alert alert-warning">Policy tables could not load: ${esc(e.message)}. Run the included SQL migration and sign in as admin or manager.</div>`;}}

  async function addManagerExceptionPolicy(){
    const x=modal('Configure manager-approved early departure',`<form id="manager-exception-policy" class="row g-3">
      <div class="col-12"><div class="alert alert-warning mb-0">This policy only authorizes an early departure after a different manager approves the stay-specific request. Existing room charges are preserved.</div></div>
      <div class="col-12"><label class="form-label">Policy name</label><input class="form-control" name="name" maxlength="120" value="Manager-approved early departure exception" required></div>
      <div class="col-12"><label class="form-label">Description</label><textarea class="form-control" name="description" maxlength="500" required>Requires a documented reason and approval by a manager other than the requester. Does not change room charges.</textarea></div>
      <div class="col-12 form-check ms-2"><input class="form-check-input" type="checkbox" name="active" value="1" checked><label class="form-check-label">Active</label></div>
      <div class="col-12 text-end"><button class="btn btn-primary">Save policy</button></div></form>`);
    x.root.querySelector('form').onsubmit=async event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const values=Object.fromEntries(new FormData(form));
      try{
        await api('early_checkout_policy_save',{
          id:0,
          policy_key:'MANAGER_EXCEPTION',
          name:String(values.name||'').trim(),
          description:String(values.description||'').trim(),
          minimum_hours:0,
          minimum_nights:0,
          fixed_fee:0,
          requires_manager:1,
          active:form.elements.active.checked?1:0
        });
        x.m.hide();
        await renderPolicyAdmin();
        notify('Manager-approved exception policy configured. Early departures remain blocked until a separate manager approval is finalized.');
      }catch(error){notify(error.message,true);}
    };
  }

  async function addHourlyFeePolicy(){
    const x=modal('Configure prorated hourly + ₱500 policy',`<form id="hourly-fee-policy" class="row g-3">
      <div class="col-12"><div class="alert alert-info mb-0">Calculates room charges from actual occupied hours, with a one-hour minimum, then adds a ₱500 fee. A different manager must approve the request. This policy does not authorize early room release.</div></div>
      <div class="col-12"><label class="form-label">Policy name</label><input class="form-control" name="name" maxlength="120" value="Prorated hourly + ₱500 fee" required></div>
      <div class="col-12"><label class="form-label">Description</label><textarea class="form-control" name="description" maxlength="500" required>Recalculates the room charge using actual occupied hours (minimum 1 hour) plus a ₱500 fixed fee. Requires separate manager approval and does not authorize early room release.</textarea></div>
      <div class="col-12 form-check ms-2"><input class="form-check-input" type="checkbox" name="active" value="1" checked><label class="form-check-label">Active</label></div>
      <div class="col-12 text-end"><button class="btn btn-primary">Save policy</button></div></form>`);
    x.root.querySelector('form').onsubmit=async event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const values=Object.fromEntries(new FormData(form));
      try{
        await api('early_checkout_policy_save',{
          id:0,
          policy_key:'HOURLY_PLUS_FEE',
          name:String(values.name||'').trim(),
          description:String(values.description||'').trim(),
          minimum_hours:1,
          minimum_nights:0,
          fixed_fee:500,
          requires_manager:1,
          active:form.elements.active.checked?1:0
        });
        x.m.hide();
        await renderPolicyAdmin();
        notify('Prorated hourly + ₱500 policy configured. A different manager must approve each request.');
      }catch(error){notify(error.message,true);}
    };
  }

  async function editEarlyPolicy(id){try{const d=await api('early_checkout_policies',{},'GET'),p=(d.policies||[]).find(x=>Number(x.id)===Number(id));if(!p)throw Error('Policy not found');const x=modal('Edit early checkout policy',`<form id="ep-edit" class="row g-3"><input type="hidden" name="id" value="${p.id}"><div class="col-md-6"><label class="form-label">Policy name</label><input class="form-control" name="name" required maxlength="120" value="${esc(p.name)}"></div><div class="col-md-6"><label class="form-label">Minimum hours</label><input class="form-control" type="number" name="minimum_hours" min="0" max="720" step="0.25" required value="${p.minimum_hours}"></div><div class="col-md-6"><label class="form-label">Minimum nights</label><input class="form-control" type="number" name="minimum_nights" min="0" max="90" required value="${p.minimum_nights}"></div><div class="col-md-6"><label class="form-label">Fixed fee (₱)</label><input class="form-control" type="number" name="fixed_fee" min="0" step="0.01" required value="${p.fixed_fee}"></div><div class="col-12"><label class="form-label">Description</label><textarea class="form-control" name="description" maxlength="500">${esc(p.description||'')}</textarea></div><div class="col-md-6 form-check ms-2"><input class="form-check-input" type="checkbox" name="requires_manager" value="1" ${Number(p.requires_manager)?'checked':''}><label class="form-check-label">Manager approval required</label></div><div class="col-md-5 form-check ms-2"><input class="form-check-input" type="checkbox" name="active" value="1" ${Number(p.active)?'checked':''}><label class="form-check-label">Active</label></div><div class="col-12 text-end"><button class="btn btn-primary">Save policy</button></div></form>`);x.root.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.requires_manager=e.target.elements.requires_manager.checked?1:0;f.active=e.target.elements.active.checked?1:0;try{await api('early_checkout_policy_save',f);x.m.hide();await renderPolicyAdmin();notify('Early checkout policy saved.')}catch(err){notify(err.message,true)}}}catch(e){notify(e.message,true)}}

  async function deleteDiscountPolicy(id){const confirmed=await window.HotelDialogs.confirm({title:'Delete discount policy?',text:'If used on bills, it will be deactivated to preserve history.',confirmButtonText:'Delete',isDanger:true});if(!confirmed)return;try{const r=await api('discount_policy_delete',{id});notify(r.message||'Discount removed.');await renderPolicyAdmin()}catch(e){notify(e.message,true)}}

  async function editDiscountPolicy(id){try{const d=await api('discount_policy_admin_list',{},'GET'),p=(d.discounts||[]).find(x=>Number(x.id)===Number(id))||{id:0,name:'',category:'PROMOTIONAL',discount_type:'PERCENT',discount_value:10,applies_to:'ROOM',min_amount:0,max_discount:'',starts_at:'',expires_at:'',combinable:0,requires_manager:0,active:1};const x=modal(id?'Edit discount policy':'Add discount policy',`<form id="dp-edit" class="row g-3"><input type="hidden" name="id" value="${p.id}"><div class="col-md-6"><label class="form-label">Name</label><input class="form-control" name="name" required value="${esc(p.name)}"></div><div class="col-md-4"><label class="form-label">Category</label><select class="form-select" name="category">${[['SENIOR_CITIZEN','Senior Citizen'],['PWD','PWD'],['EARLY_BOOKING','Early-bird booking'],['LONG_STAY','Long-stay guest'],['GROUP','Group booking'],['LOYALTY','Loyalty / returning guest'],['WALK_IN','Walk-in promotion'],['BIRTHDAY','Birthday promotion'],['EMPLOYEE','Employee discount'],['CORPORATE','Corporate / partner rate'],['OFF_SEASON','Off-season promotion'],['PROMOTIONAL','Promotional'],['LAST_MINUTE','Last minute'],['PACKAGE','Package'],['MANAGER_COURTESY','Manager courtesy'],['OTHER','Other']].map(a=>`<option value="${a[0]}" ${(p.category||'PROMOTIONAL')===a[0]?'selected':''}>${a[1]}</option>`).join('')}</select></div><div class="col-md-4"><label class="form-label">Type</label><select class="form-select" name="discount_type"><option ${p.discount_type==='PERCENT'?'selected':''}>PERCENT</option><option ${p.discount_type==='FIXED'?'selected':''}>FIXED</option></select></div><div class="col-md-3"><label class="form-label">Value</label><input class="form-control" name="discount_value" type="number" min="0" step="0.01" required value="${p.discount_value}"></div><div class="col-md-4"><label class="form-label">Applies to</label><select class="form-select" name="applies_to">${['ROOM','FOOD','LAUNDRY','MINIBAR','SERVICE','OTHER','ALL'].map(v=>`<option ${p.applies_to===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="col-md-4"><label class="form-label">Minimum bill amount</label><input class="form-control" name="min_amount" type="number" min="0" step="0.01" value="${p.min_amount}"></div><div class="col-md-4"><label class="form-label">Maximum discount (blank = none)</label><input class="form-control" name="max_discount" type="number" min="0" step="0.01" value="${p.max_discount??''}"></div><div class="col-md-6"><label class="form-label">Starts at</label><input class="form-control" name="starts_at" type="datetime-local" value="${String(p.starts_at||'').replace(' ','T').slice(0,16)}"></div><div class="col-md-6"><label class="form-label">Expires at</label><input class="form-control" name="expires_at" type="datetime-local" value="${String(p.expires_at||'').replace(' ','T').slice(0,16)}"></div><div class="col-md-3 form-check ms-2"><input class="form-check-input" type="checkbox" name="combinable" value="1" ${Number(p.combinable)?'checked':''}><label class="form-check-label">Combinable</label></div><div class="col-md-3 form-check ms-2"><input class="form-check-input" type="checkbox" name="requires_manager" value="1" ${Number(p.requires_manager)?'checked':''}><label class="form-check-label">Manager approval</label></div><div class="col-md-3 form-check ms-2"><input class="form-check-input" type="checkbox" name="active" value="1" ${Number(p.active)?'checked':''}><label class="form-check-label">Active</label></div><div class="col-12 text-end"><button class="btn btn-primary">Save discount</button></div></form>`);x.root.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));for(const k of ['combinable','requires_manager','active'])f[k]=e.target.elements[k].checked?1:0;for(const k of ['starts_at','expires_at'])if(f[k])f[k]=f[k].replace('T',' ')+':00';try{await api('discount_policy_save',f);x.m.hide();await renderDiscountAdmin();notify('Discount policy saved.')}catch(err){notify(err.message,true)}}}catch(e){notify(e.message,true)}}



  async function addCharge(id) {

    try {

      const data = await api('service_catalog', {}, 'GET');

      const items = (data.items || []).filter(x => Number(x.active));



      // Group active items by category / department

      const categories = [...new Set(items.map(i => i.subcategory || i.category.replace('_', ' & ')))].filter(Boolean);



      const x = modal('Add Folio Charge', `

        <form id="charge-form" class="row g-3">

          <div class="col-12 alert alert-light border small py-2 mb-2">

            <i class="bi bi-info-circle me-1 text-primary"></i> Select a category and item. The unit price will automatically populate.

          </div>

          <div class="col-md-6">

            <label class="form-label fw-semibold">Step 1: Filter Category</label>

            <select class="form-select" id="charge-category-filter">

              <option value="">-- All Categories & Departments --</option>

              ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}

            </select>

          </div>

          <div class="col-md-6">

            <label class="form-label fw-semibold">Step 2: Choose Product Item</label>

            <select class="form-select" name="catalog_item_id" id="charge-menu-item">

              <option value="">Manual / other charge</option>

              ${items.map(i => {

                const catGroup = i.subcategory || i.category.replace('_', ' & ');

                return `<option value="${i.id}" data-category-group="${esc(catGroup)}" data-category="${esc(i.category)}" data-name="${esc(i.name)}" data-price="${Number(i.price)}">${esc(catGroup)} � ${esc(i.name)} (${php(i.price)})</option>`;

              }).join('')}

            </select>

          </div>

          <div class="col-md-4">

            <label class="form-label">Category (manual only)</label>

            <select class="form-select" name="category">

              <option>FOOD</option>

              <option>BAR</option>

              <option>MINIBAR</option>

              <option>LAUNDRY</option>

              <option>SERVICE</option>

              <option>ROOM_SERVICE</option>

              <option>EXTRA_PERSON</option>

              <option>LATE_CHECKOUT</option>

              <option>DAMAGE</option>

              <option>MISSING_ITEM</option>

              <option>OTHER</option>

              <option>ADJUSTMENT</option>

            </select>

          </div>

          <div class="col-md-8">

            <label class="form-label">Description / Item Name</label>

            <input class="form-control" name="description" maxlength="255" required>

          </div>

          <div class="col-md-6">

            <label class="form-label">Quantity</label>

            <input class="form-control" name="quantity" type="number" min="0.01" step="0.01" value="1" required>

          </div>

          <div class="col-md-6">

            <label class="form-label">Unit Price (?)</label>

            <input class="form-control" name="unit_price" id="charge-unit-price" type="number" min="0" step="0.01" value="0" required>

          </div>

          <div class="col-12 text-end pt-3 border-top">

            <button type="button" class="btn btn-light me-2" data-bs-dismiss="modal">Cancel</button>

            <button class="btn btn-primary"><i class="bi bi-plus-circle me-1"></i>Save Charge</button>

          </div>

        </form>

      `);



      const catFilter = x.root.querySelector('#charge-category-filter');

      const itemSelect = x.root.querySelector('#charge-menu-item');

      const descInput = x.root.querySelector('[name=description]');

      const priceInput = x.root.querySelector('[name=unit_price]');

      const chargeKey = `charge-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;



      catFilter.onchange = () => {

        const selectedCat = catFilter.value;

        const currentSelectedId = itemSelect.value;

        itemSelect.innerHTML = '<option value="">Manual / other charge</option>';

        items.forEach(i => {

          const catGroup = i.subcategory || i.category.replace('_', ' & ');

          if (!selectedCat || catGroup === selectedCat) {

            const opt = document.createElement('option');

            opt.value = i.id;

            opt.dataset.categoryGroup = catGroup;

            opt.dataset.category = i.category;

            opt.dataset.name = i.name;

            opt.dataset.price = i.price;

            opt.textContent = `${catGroup} � ${i.name} (${php(i.price)})`;

            if (String(i.id) === String(currentSelectedId)) opt.selected = true;

            itemSelect.appendChild(opt);

          }

        });

        itemSelect.dispatchEvent(new Event('change'));

      };



      itemSelect.onchange = () => {

        const o = itemSelect.selectedOptions[0];

        if (itemSelect.value && o) {

          descInput.value = o.dataset.name || '';

          priceInput.value = o.dataset.price || '0';

          descInput.readOnly = true;

          priceInput.readOnly = true;

        } else {

          descInput.value = '';

          priceInput.value = '0';

          descInput.readOnly = false;

          priceInput.readOnly = false;

        }

      };



      x.root.querySelector('#charge-form').onsubmit = async e => {

        e.preventDefault();

        try {

          const f = Object.fromEntries(new FormData(e.target));

          await api('add_charge', {

            folio_id: id,

            ...f,

            idempotency_key: chargeKey,

            catalog_item_id: Number(f.catalog_item_id || 0),

            quantity: Number(f.quantity),

            unit_price: Number(f.unit_price)

          });

          x.m.hide();

          notify('Charge added to folio.');

          folio(id);

        } catch(err) {

          notify(err.message, true);

        }

      };

    } catch(e) {

      notify(e.message, true);

    }

  }

  async function addRoomType(existing=null) { const isEdit=!!existing; const x=modal(isEdit?'Edit Room Type & Nightly Price':'Add Room Type & Nightly Price',`<form id="room-type-form" class="row g-3"><div class="col-md-6"><label class="form-label">Room type name</label><input class="form-control" name="name" maxlength="80" placeholder="e.g. Deluxe, Family Suite" value="${esc(existing?.name||'')}" required></div><div class="col-md-3"><label class="form-label">Nightly price (₱, VAT-inclusive)</label><input class="form-control" name="nightly_rate" type="number" min="0" step="0.01" value="${Number(existing?.nightly_rate||0)}" required></div><div class="col-md-3"><label class="form-label">Capacity</label><input class="form-control" name="capacity" type="number" min="1" max="20" value="${Number(existing?.capacity||2)}" required></div><div class="col-12 text-end"><button class="btn btn-primary">${isEdit?'Update room type':'Save room type'}</button></div></form>`);x.root.querySelector('#room-type-form').onsubmit=async e=>{e.preventDefault();try{const saved=await api('room_type_save',{...Object.fromEntries(new FormData(e.target)),id:existing?.id||0});const savedId=Number(saved?.id||0);x.m.hide();if(!isEdit&&savedId>0){notify('Room type and nightly price saved. Add a room with this type below.');await addRoom(null,savedId);return;}notify(isEdit?'Room type updated. New rate will be used for future check-ins and rate calculations.':'Room type and nightly price saved.');open('catalog')}catch(err){notify(err.message,true)}}; }

  async function editRoomType(id) { try { const d=await api('room_types',{},'GET'); const type=(d.types||[]).find(t=>Number(t.id)===Number(id)); if(!type)return notify('Room type not found. Refresh the page and try again.',true); return addRoomType(type); } catch(e) { notify(e.message,true); } }

  async function addRoom(existing=null, preselectTypeId=0) { try {const [td,rd]=await Promise.all([api('room_types',{},'GET'),api('rooms',{},'GET')]);const types=td.types||[];const room=(rd.rooms||[]).find(r=>Number(r.id)===Number(existing));if(!types.length)return notify('Add a room type first.',true);if(existing&&!room)return notify('Room not found.',true);const preselectId=Number(preselectTypeId||0);const preselectMissing=preselectId>0&&!types.some(t=>Number(t.id)===preselectId);if(preselectMissing)notify('That room type was saved, but it is not in the room type list yet. Pick a type below, or refresh the page and try again.',true);const selectedTypeId=existing?Number(room?.room_type_id||0):preselectId;const x=modal(existing?'Edit Room':'Add Room',`<form id="room-form" class="row g-3"><div class="col-md-4"><label class="form-label">Room number</label><input class="form-control" name="room_number" maxlength="4" pattern="[1-9][0-9]{2,3}" placeholder="e.g. 101, 205, 301" value="${esc(room?.room_number||'')}" required></div><div class="col-md-5"><label class="form-label">Room type · VAT-inclusive nightly price</label><select class="form-select" name="room_type_id" required><option value="">Choose a room type…</option>${types.map(t=>`<option value="${t.id}" ${selectedTypeId===Number(t.id)?'selected':''}>${esc(t.name)} — ${php(t.nightly_rate)}/night · capacity ${t.capacity}</option>`).join('')}</select></div><div class="col-md-3"><label class="form-label">Floor (derived from room number)</label><input class="form-control" name="floor_number" type="number" min="1" value="${room?.floor_number||1}" required><div class="form-text">101–199 = 1st; 201–299 = 2nd; 301–399 = 3rd, etc.</div></div><div class="col-12 text-end"><button class="btn btn-primary">Save room</button></div></form>`);const form=x.root.querySelector('#room-form');const num=form.elements.room_number, floor=form.elements.floor_number;num.addEventListener('input',()=>{if(/^\d{3,4}$/.test(num.value))floor.value=num.value.slice(0,-2)});form.onsubmit=async e=>{e.preventDefault();const payload={...Object.fromEntries(new FormData(e.target)),id:existing||0};if(!Number(payload.room_type_id)){notify('Choose a room type before saving.',true);return;}try{await api('room_save',payload);x.m.hide();notify('Room saved.');open('rooms')}catch(err){notify(err.message,true)}};}catch(e){notify(e.message,true)} }

  async function editRoom(id){return addRoom(id)}



  async function addMenuItem(existing=null) {

    try {

      const curRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();

      const defaultDept = ['bar', 'minibar'].includes(curRole) ? 'bar' : 'restaurant';

      // Service catalog subcategories are descriptive labels, not restaurant menu categories.
      const categories = [];



      const x = modal(existing ? 'Edit Service / Amenity Item' : 'Add Hotel Service / Amenity', `

        <form id="menu-item-form" class="row g-3">

          <div class="col-md-6">

            <label class="form-label fw-semibold">Item Name</label>

            <input class="form-control" name="name" maxlength="120" placeholder="e.g. Laundry service, extra bed, minibar item" required value="${esc(existing?.name||'')}">

          </div>

          <div class="col-md-6">

            <label class="form-label fw-semibold">Item Type</label>

            <select class="form-select" name="item_type" id="menu-item-type">

              <option value="FOOD" ${existing?.item_type==='FOOD'?'selected':''}>Food</option>

              <option value="DRINK" ${existing?.item_type==='DRINK'?'selected':''}>Drink / Beverage</option>

              <option value="OTHER" ${existing?.item_type==='OTHER' || !existing?'selected':''}>Amenity / Service</option>

            </select>

          </div>

          <div class="col-md-6">

            <label class="form-label fw-semibold">Department Catalog</label>

            <select class="form-select" name="category" required>

              ${[['HOUSEKEEPING','Housekeeping'],['SERVICE','General Services'],['LAUNDRY','Laundry'],['MINIBAR','Minibar'],['GYM','Gym'],['POOL','Pool'],['SPA','Spa & Massage'],['OTHER','Other']].map(([v,l])=>`<option value="${v}" ${(existing?.category===v || (!existing && v==='SERVICE'))?'selected':''}>${l}</option>`).join('')}

            </select>

          </div>

          <div class="col-md-6">

            <label class="form-label fw-semibold">Subcategory / Group (optional)</label>

            <input class="form-control" name="subcategory" maxlength="120" placeholder="e.g. Laundry, Extra Bed, Cold Drinks" value="${esc(existing?.subcategory||'')}">

          </div>

          <div class="col-md-8">

            <label class="form-label fw-semibold">Description / Notes</label>

            <input class="form-control" name="description" maxlength="255" placeholder="Ingredients, portion size, serving info" value="${esc(existing?.description||'')}">

          </div>

          <div class="col-md-4">

            <label class="form-label fw-semibold">Price (?)</label>

            <input class="form-control" name="price" type="number" min="0" step="0.01" value="${Number(existing?.price||0)}" required>

          </div>

          <div class="col-12 text-end pt-3 border-top">

            <button type="button" class="btn btn-light me-2" data-bs-dismiss="modal">Cancel</button>

            <button class="btn btn-primary"><i class="bi bi-check2 me-1"></i>Save Service</button>

          </div>

        </form>

      `);



      x.root.querySelector('#menu-item-form').onsubmit = async e => {

        e.preventDefault();

        try {

          await api('service_catalog_save', { ...Object.fromEntries(new FormData(e.target)), id: existing?.id || 0 });

          x.m.hide();

          notify('Service/amenity saved.');

          open('catalog');

        } catch(err) {

          notify(err.message, true);

        }

      };

    } catch(err) {

      notify(err.message, true);

    }

  }

  async function editMenuItem(id) {try{const d=await api('service_catalog',{},'GET');const item=(d.items||[]).find(x=>Number(x.id)===Number(id));if(item) addMenuItem(item)}catch(e){notify(e.message,true)}}

  async function toggleMenuItem(id,active) {

    const isEnabling = Number(active) === 1;

    const confirmed = await window.HotelDialogs.confirm({

      title: isEnabling ? 'Enable Service?' : 'Disable Service?',

      text: isEnabling

        ? 'This service will become available in service request and billing lists.'

        : 'This service will be unavailable for new service requests.',

      confirmButtonText: isEnabling ? 'Enable Service' : 'Disable Service',

      isDanger: !isEnabling

    });

    if (!confirmed) return;

    try {

      await api('service_catalog_toggle', { id, active: isEnabling ? 1 : 0 });

      notify(isEnabling ? 'Service enabled.' : 'Service disabled.');

      await open('catalog');

    } catch(e) {

      notify(e.message, true);

    }

  }



    async function pay(id, balance) {
    const curRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();
    if (curRole === 'frontdesk') {
      return notify('Payment processing and split tender are restricted to Cashier and Management.', true);
    }
    if (balance <= 0) return notify('No outstanding balance. Folio is fully settled.', true);

    let folioData = null;
    try {
      folioData = await api('folio', { folio_id: id });
    } catch (error) {
      notify(error.message || 'Could not load billing details for this folio.', true);
      return;
    }

    const f = folioData?.folio || {};
    const guestName = folioData?.customer_name || f.guest_name || 'In-House Guest';
    const roomNumber = f.room_number || '-';
    const stayCode = f.stay_code || '-';
    const folioNumber = f.folio_number || '-';
    const currentBalance = Number(folioData?.balance ?? balance);

    const presetAmounts = [
      currentBalance,
      Math.ceil(currentBalance / 100) * 100,
      Math.ceil(currentBalance / 500) * 500,
      Math.ceil(currentBalance / 1000) * 1000
    ].filter((v, i, a) => v >= currentBalance && a.indexOf(v) === i);

    const modalHtml = `
      <div class="container-fluid p-0 cashier-payment-terminal">
        <div class="p-3 mb-3 rounded bg-light border d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <div class="d-flex align-items-center gap-2">
              <span class="badge text-bg-primary font-monospace">${esc(folioNumber)}</span>
              <strong class="text-dark fs-6">${esc(guestName)}</strong>
            </div>
            <div class="small text-muted mt-1">
              Room <strong>${esc(roomNumber)}</strong> · Stay <strong>${esc(stayCode)}</strong>
            </div>
          </div>
          <div class="text-end">
            <span class="small text-muted d-block text-uppercase" style="font-size:11px;">Current Balance Due:</span>
            <strong class="fs-4 text-danger font-monospace">${php(currentBalance)}</strong>
          </div>
        </div>

        <form id="pro-payment-form">
          <div class="mb-3">
            <label class="form-label fw-bold small text-uppercase text-muted">Settlement Mode</label>
            <div class="btn-group w-100" role="group">
              <input type="radio" class="btn-check" name="payment_mode" id="pm-single" value="single" checked>
              <label class="btn btn-outline-primary fw-semibold btn-sm py-2" for="pm-single">
                <i class="bi bi-wallet2 me-1"></i> Single Payment Method
              </label>
              <input type="radio" class="btn-check" name="payment_mode" id="pm-split" value="split">
              <label class="btn btn-outline-primary fw-semibold btn-sm py-2" for="pm-split">
                <i class="bi bi-distribute-vertical me-1"></i> Split Tender (Multi-Method)
              </label>
            </div>
          </div>

          <!-- Single Payment Mode -->
          <div id="sec-single-payment">
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label fw-semibold">Payment Method</label>
                <select class="form-select" id="single-method" name="method">
                  <option value="CASH">💵 Cash (Philippine Peso)</option>
                  <option value="CARD">💳 Credit / Debit Card (Terminal / POS)</option>
                  <option value="GCASH">📱 GCash E-Wallet</option>
                  <option value="MAYA">📱 Maya E-Wallet</option>
                  <option value="QR_PH">📱 QR Ph (National QR)</option>
                  <option value="BANK_TRANSFER">🏦 Bank Wire / Electronic Transfer</option>
                  <option value="OTHER">Other / Voucher</option>
                </select>
              </div>

              <div class="col-md-6">
                <label class="form-label fw-semibold">Amount to Apply to Bill (PHP)</label>
                <div class="input-group">
                  <span class="input-group-text bg-white fw-bold">₱</span>
                  <input class="form-control fw-bold fs-6" type="number" id="single-amount" name="amount" min="0.01" max="${currentBalance}" step="0.01" value="${currentBalance.toFixed(2)}" required>
                  <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-full-balance" title="Pay Full Balance">Full</button>
                </div>
              </div>

              <!-- Cash Tendered & Change Area -->
              <div class="col-12" id="cash-tender-area">
                <div class="p-3 rounded border" style="background:#f8fafc;">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <label class="form-label fw-bold mb-0 text-dark">
                      <i class="bi bi-cash-stack text-success me-1"></i>Cash Tendered by Guest (PHP)
                    </label>
                    <span class="small text-muted">Quick Presets:</span>
                  </div>

                  <div class="d-flex flex-wrap gap-1 mb-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary quick-cash-btn" data-val="${currentBalance.toFixed(2)}">Exact (${php(currentBalance)})</button>
                    ${presetAmounts.filter(x => x > currentBalance).map(v => `<button type="button" class="btn btn-sm btn-outline-secondary quick-cash-btn" data-val="${v.toFixed(2)}">₱${v.toLocaleString()}</button>`).join('')}
                    <button type="button" class="btn btn-sm btn-outline-secondary quick-cash-btn" data-val="${(Math.ceil((currentBalance+500)/500)*500).toFixed(2)}">+₱500</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary quick-cash-btn" data-val="${(Math.ceil((currentBalance+1000)/1000)*1000).toFixed(2)}">+₱1,000</button>
                  </div>

                  <div class="row g-2 align-items-center">
                    <div class="col-sm-6">
                      <div class="input-group">
                        <span class="input-group-text bg-white fw-bold">₱</span>
                        <input class="form-control fw-bold fs-6" type="number" id="cash-received" name="received_amount" min="${currentBalance}" step="0.01" value="${currentBalance.toFixed(2)}">
                      </div>
                    </div>
                    <div class="col-sm-6">
                      <div class="p-2 rounded bg-white border d-flex justify-content-between align-items-center">
                        <span class="text-muted small">Change to Guest:</span>
                        <strong class="fs-5 text-success font-monospace" id="cash-change-display">₱0.00</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Non-cash Reference Field -->
              <div class="col-12 d-none" id="reference-area">
                <label class="form-label fw-semibold" id="lbl-reference">Transaction / Slip Reference #</label>
                <input class="form-control" type="text" id="single-reference" name="reference_note" maxlength="120" placeholder="e.g. Card Approval Trace #, GCash Ref #, Bank Ref #">
                <div class="small text-muted mt-1">Required for electronic audit and guest verification.</div>
              </div>
            </div>
          </div>

          <!-- Split Tender Mode -->
          <div id="sec-split-payment" class="d-none">
            <div class="alert alert-light border small text-muted mb-2">
              <i class="bi bi-info-circle me-1 text-primary"></i>Split payment between multiple methods. The total of all allocations must equal the total amount applied.
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Total Amount Applied to Bill (PHP)</label>
              <div class="input-group">
                <span class="input-group-text bg-white fw-bold">₱</span>
                <input class="form-control fw-bold" type="number" id="split-total-applied" min="0.01" max="${currentBalance}" step="0.01" value="${currentBalance.toFixed(2)}">
              </div>
            </div>
            <div id="split-items-container">
              <div class="row g-2 split-row mb-2 p-2 bg-light rounded border align-items-end">
                <div class="col-md-4">
                  <label class="form-label small mb-1">Method</label>
                  <select class="form-select form-select-sm split-method">
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="GCASH">GCash</option>
                    <option value="MAYA">Maya</option>
                    <option value="QR_PH">QR Ph</option>
                    <option value="BANK_TRANSFER">Bank Wire</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label class="form-label small mb-1">Amount</label>
                  <input class="form-control form-control-sm fw-bold split-amount" type="number" min="0.01" step="0.01" value="${currentBalance.toFixed(2)}">
                </div>
                <div class="col-md-3">
                  <label class="form-label small mb-1">Reference (optional)</label>
                  <input class="form-control form-control-sm split-note" maxlength="120" placeholder="Slip / Trace / Ref">
                </div>
                <div class="col-md-1 text-end">
                  <button type="button" class="btn btn-outline-danger btn-sm w-100 btn-remove-split">×</button>
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm mb-3" id="btn-add-split">
              <i class="bi bi-plus-lg me-1"></i>Add Another Method
            </button>
            <div class="p-2 rounded bg-light border d-flex justify-content-between align-items-center mb-3">
              <span class="small text-muted">Allocated Sum:</span>
              <span id="split-sum-display" class="fw-bold font-monospace text-success fs-6">${php(currentBalance)}</span>
            </div>
          </div>

          <!-- Settlement Summary Card -->
          <div class="p-3 rounded mb-3 border bg-white">
            <div class="d-flex justify-content-between text-muted small mb-1">
              <span>Total Bill Outstanding:</span>
              <span>${php(currentBalance)}</span>
            </div>
            <div class="d-flex justify-content-between text-muted small mb-1">
              <span>Payment to Apply Now:</span>
              <span id="sum-paying-display" class="fw-bold text-dark">${php(currentBalance)}</span>
            </div>
            <div class="d-flex justify-content-between pt-2 border-top">
              <span class="fw-bold text-dark">Remaining Balance After Payment:</span>
              <strong id="sum-rem-display" class="fs-6 text-success">₱0.00 (Fully Settled)</strong>
            </div>
          </div>

          <div class="d-flex justify-content-end gap-2 pt-2 border-top">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-success fw-bold px-4 shadow-sm" id="btn-save-pro-payment">
              <i class="bi bi-check2-circle me-1"></i>Process Payment &amp; Issue Official Receipt
            </button>
          </div>
        </form>
      </div>
    `;

    const { root, m } = modal(`Cashier Payment Terminal · Folio ${esc(folioNumber)}`, modalHtml);

    const singleSec = root.querySelector('#sec-single-payment');
    const splitSec = root.querySelector('#sec-split-payment');
    const singleMethod = root.querySelector('#single-method');
    const singleAmount = root.querySelector('#single-amount');
    const cashTenderArea = root.querySelector('#cash-tender-area');
    const cashReceived = root.querySelector('#cash-received');
    const cashChangeDisplay = root.querySelector('#cash-change-display');
    const refArea = root.querySelector('#reference-area');
    const singleRef = root.querySelector('#single-reference');
    const splitTotalApplied = root.querySelector('#split-total-applied');
    const splitItemsContainer = root.querySelector('#split-items-container');
    const splitSumDisplay = root.querySelector('#split-sum-display');
    const sumPayingDisplay = root.querySelector('#sum-paying-display');
    const sumRemDisplay = root.querySelector('#sum-rem-display');

    // Switch between single and split tender
    root.querySelectorAll('input[name="payment_mode"]').forEach(r => {
      r.addEventListener('change', () => {
        if (r.value === 'split') {
          singleSec.classList.add('d-none');
          splitSec.classList.remove('d-none');
          splitTotalApplied.value = singleAmount.value;
          recalcSplit();
        } else {
          singleSec.classList.remove('d-none');
          splitSec.classList.add('d-none');
          recalcSingle();
        }
      });
    });

    // Method selection toggles cash tender vs reference
    singleMethod.addEventListener('change', () => {
      const isCash = singleMethod.value === 'CASH';
      cashTenderArea.classList.toggle('d-none', !isCash);
      refArea.classList.toggle('d-none', isCash);
      if (isCash) {
        cashReceived.value = singleAmount.value;
      }
      recalcSingle();
    });

    const recalcSingle = () => {
      const applied = Math.max(0, Math.min(Number(singleAmount.value || 0), currentBalance));
      const isCash = singleMethod.value === 'CASH';
      let rcv = Number(cashReceived.value || applied);
      if (rcv < applied) {
        rcv = applied;
        cashReceived.value = applied.toFixed(2);
      }
      cashReceived.min = applied.toFixed(2);
      const chg = isCash ? Math.max(0, rcv - applied) : 0;
      cashChangeDisplay.textContent = php(chg);

      sumPayingDisplay.textContent = php(applied);
      const rem = Math.max(0, currentBalance - applied);
      if (rem <= 0.009) {
        sumRemDisplay.className = 'fs-6 text-success';
        sumRemDisplay.textContent = '₱0.00 (Fully Settled)';
      } else {
        sumRemDisplay.className = 'fs-6 text-danger font-monospace';
        sumRemDisplay.textContent = php(rem);
      }
    };

    singleAmount.addEventListener('input', recalcSingle);
    cashReceived.addEventListener('input', recalcSingle);

    root.querySelector('#btn-full-balance')?.addEventListener('click', () => {
      singleAmount.value = currentBalance.toFixed(2);
      cashReceived.value = currentBalance.toFixed(2);
      recalcSingle();
    });

    root.querySelectorAll('.quick-cash-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cashReceived.value = btn.dataset.val;
        recalcSingle();
      });
    });

    // Split tender recalculations
    const recalcSplit = () => {
      const rows = [...splitItemsContainer.querySelectorAll('.split-row')];
      const sum = rows.reduce((acc, row) => acc + Number(row.querySelector('.split-amount').value || 0), 0);
      splitSumDisplay.textContent = php(sum);
      sumPayingDisplay.textContent = php(sum);
      const rem = Math.max(0, currentBalance - sum);
      if (rem <= 0.009) {
        sumRemDisplay.className = 'fs-6 text-success';
        sumRemDisplay.textContent = '₱0.00 (Fully Settled)';
      } else {
        sumRemDisplay.className = 'fs-6 text-danger font-monospace';
        sumRemDisplay.textContent = php(rem);
      }
    };

    splitTotalApplied.addEventListener('input', recalcSplit);
    splitItemsContainer.addEventListener('input', recalcSplit);

    root.querySelector('#btn-add-split')?.addEventListener('click', () => {
      const rows = [...splitItemsContainer.querySelectorAll('.split-row')];
      const currentSum = rows.reduce((acc, row) => acc + Number(row.querySelector('.split-amount').value || 0), 0);
      const needed = Math.max(0.01, currentBalance - currentSum);

      const div = document.createElement('div');
      div.className = 'row g-2 split-row mb-2 p-2 bg-light rounded border align-items-end';
      div.innerHTML = `
        <div class="col-md-4">
          <label class="form-label small mb-1">Method</label>
          <select class="form-select form-select-sm split-method">
            <option value="CARD">Card</option>
            <option value="GCASH">GCash</option>
            <option value="MAYA">Maya</option>
            <option value="QR_PH">QR Ph</option>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank Wire</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">Amount</label>
          <input class="form-control form-control-sm fw-bold split-amount" type="number" min="0.01" step="0.01" value="${needed.toFixed(2)}">
        </div>
        <div class="col-md-3">
          <label class="form-label small mb-1">Reference (optional)</label>
          <input class="form-control form-control-sm split-note" maxlength="120" placeholder="Slip / Trace / Ref">
        </div>
        <div class="col-md-1 text-end">
          <button type="button" class="btn btn-outline-danger btn-sm w-100 btn-remove-split">×</button>
        </div>
      `;
      div.querySelector('.btn-remove-split').addEventListener('click', () => {
        div.remove();
        recalcSplit();
      });
      splitItemsContainer.appendChild(div);
      recalcSplit();
    });

    root.querySelectorAll('.btn-remove-split').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.split-row').remove();
        recalcSplit();
      });
    });

    recalcSingle();

    // Submit handler
    const form = root.querySelector('#pro-payment-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const mode = root.querySelector('input[name="payment_mode"]:checked').value;
      try {
        let payload = {};
        const idempotencyKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');

        if (mode === 'single') {
          const applied = Number(singleAmount.value || 0);
          if (applied <= 0) throw new Error('Please enter a valid amount to pay.');
          if (applied > currentBalance + 0.009) throw new Error('Payment amount cannot exceed the outstanding balance.');
          const method = singleMethod.value;
          const isCash = method === 'CASH';
          const rcv = isCash ? Number(cashReceived.value || applied) : applied;
          if (rcv < applied) throw new Error('Amount received cannot be less than the payment amount.');

          payload = {
            folio_id: id,
            amount: applied,
            received_amount: rcv,
            method: method,
            reference_note: singleRef.value.trim(),
            idempotency_key: idempotencyKey
          };
        } else {
          const rows = [...splitItemsContainer.querySelectorAll('.split-row')];
          if (!rows.length) throw new Error('Add at least one payment allocation.');
          const allocations = rows.map(r => ({
            method: r.querySelector('.split-method').value,
            amount: Number(r.querySelector('.split-amount').value || 0),
            received_amount: Number(r.querySelector('.split-amount').value || 0),
            reference_note: r.querySelector('.split-note').value.trim()
          }));
          const totalSplit = Math.round(allocations.reduce((acc, a) => acc + a.amount, 0) * 100) / 100;
          if (totalSplit <= 0) throw new Error('Total payment amount must be greater than zero.');
          if (totalSplit > currentBalance + 0.009) throw new Error('Total split payment exceeds current balance.');

          payload = {
            folio_id: id,
            amount: totalSplit,
            received_amount: totalSplit,
            allocations: allocations,
            idempotency_key: idempotencyKey
          };
        }

        const res = await api('pay', payload);
        m.hide();
        notify(`Payment recorded successfully! Receipt: ${res.receipt_number}`);
        await showReceiptModal(res);
        await open(activeModule);
      } catch (err) {
        notify(err.message, true);
      }
    };
  }

async function transfer(id) {

    try {

      const d=await api('rooms',{},'GET');

      const avail=(d.rooms||[]).filter(r=>r.status==='AVAILABLE');

      if(!avail.length)return notify('No available destination rooms.',true);

      const x=modal('Room Transfer',`<form id="transfer-form" class="row g-3"><div class="col-12 alert alert-light border">The new VAT-inclusive rate applies starting the next night. The current night remains at its original rate.</div><div class="col-md-8"><label class="form-label">Destination room</label><select class="form-select" name="to_room_id">${avail.map(r=>`<option value="${r.id}">${esc(r.room_number)} · ${esc(r.type)} · ${php(r.nightly_rate)}/night (VAT-inclusive)</option>`).join('')}</select></div><div class="col-md-4"><label class="form-label">Reason</label><input class="form-control" name="reason" maxlength="255" required></div><div class="col-12 text-end"><button class="btn btn-primary">Confirm Transfer</button></div></form>`);

      x.root.querySelector('#transfer-form').onsubmit=async e=>{

        e.preventDefault();

        const f=Object.fromEntries(new FormData(e.target));

        const confirmed = await window.HotelDialogs.confirm({

          title: 'Confirm Room Transfer?',

          text: 'Transfer this guest to the selected room? Rate adjustments apply starting the next night.',

          confirmButtonText: 'Transfer Room',

          actionType: 'primary'

        });

        if (!confirmed) return;

        try{

          const r=await api('transfer',{stay_id:id,to_room_id:Number(f.to_room_id),reason:f.reason});

          x.m.hide();

          notify('Room transferred. New rate effective '+r.effective_date);

          open(activeModule);

        }catch(err){notify(err.message,true)}

      };

    }catch(e){notify(e.message,true)}

  }



  async function renderWalkinCheckin() {

    const host = $('walkin-checkin-content');

    if (!host) return;

    host.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-dark mb-3"></div><div>Loading Walk-In & Check-In Dashboard…</div></div>';



    try {

      const [roomsData, staysData] = await Promise.all([
        api('rooms', {}, 'GET'),
        api('active_stays', {}, 'GET')
      ]);
      const allRooms = roomsData.rooms || [];
      const availableRooms = allRooms.filter(r => r.status === 'AVAILABLE');

      const occupiedRooms = allRooms.filter(r => r.status === 'OCCUPIED');

      const cleaningRooms = allRooms.filter(r => r.status === 'CLEANING');

      const maintenanceRooms = allRooms.filter(r => r.status === 'MAINTENANCE');



      const tomorrow = new Date();

      tomorrow.setDate(tomorrow.getDate() + 1);

      const tomorrowStr = tomorrow.toISOString().split('T')[0];



      const roomOptions = availableRooms.length > 0

        ? availableRooms.map(r => `<option value="${r.id}" data-rate="${r.nightly_rate}" data-capacity="${r.capacity}">Room ${esc(r.room_number)} — ${esc(r.type)} (${php(r.nightly_rate)}/night, VAT-inclusive, Max ${r.capacity} guests)</option>`).join('')

        : '<option value="">No rooms currently available</option>';



      const roomCards = availableRooms.length > 0

        ? availableRooms.map(r => `

            <div class="col-12 col-sm-6 col-lg-4 col-xl-3">

              <div class="card border-0 shadow-sm h-100">

                <div class="card-body p-3 d-flex flex-column justify-content-between">

                  <div>

                    <div class="d-flex justify-content-between align-items-start mb-2">

                      <h5 class="fw-bold mb-0">${esc(r.room_number)}</h5>

                      <span class="badge text-bg-success">Available</span>

                    </div>

                    <div class="text-muted small">${esc(r.type)} · Floor ${r.floor_number}</div>

                    <div class="fw-semibold mt-2 text-primary fs-5">${php(r.nightly_rate)} <span class="text-muted small fs-6">/ night · VAT-inclusive</span></div>

                    <div class="small text-muted mb-3"><i class="bi bi-people me-1"></i>Up to ${r.capacity} guests</div>

                  </div>

                  <button type="button" class="btn btn-outline-primary btn-sm w-100" onclick="HotelBilling.selectRoomForWalkin(${r.id})">

                    <i class="bi bi-check2-circle me-1"></i>Select Room

                  </button>

                </div>

              </div>

            </div>

          `).join('')

        : '<div class="col-12"><div class="alert alert-warning mb-0">No rooms are currently marked as Available. Please check Room Board for rooms in Cleaning or Maintenance status.</div></div>';



      host.innerHTML = `

        <div class="row g-2 g-sm-3 mb-4">

          <div class="col-6 col-md-3">

            <div class="card border-0 shadow-sm h-100">

              <div class="card-body p-3 d-flex align-items-center gap-3">

                <div class="dashboard-stat-icon text-success"><i class="bi bi-door-open"></i></div>

                <div>

                  <div class="text-muted small">Available Rooms</div>

                  <div class="fs-4 fw-bold text-success">${availableRooms.length}</div>

                </div>

              </div>

            </div>

          </div>

          <div class="col-6 col-md-3">

            <div class="card border-0 shadow-sm h-100">

              <div class="card-body p-3 d-flex align-items-center gap-3">

                <div class="dashboard-stat-icon text-primary"><i class="bi bi-building"></i></div>

                <div>

                  <div class="text-muted small">Occupied Rooms</div>

                  <div class="fs-4 fw-bold text-primary">${occupiedRooms.length}</div>

                </div>

              </div>

            </div>

          </div>

          <div class="col-6 col-md-3">

            <div class="card border-0 shadow-sm h-100">

              <div class="card-body p-3 d-flex align-items-center gap-3">

                <div class="dashboard-stat-icon text-warning"><i class="bi bi-stars"></i></div>

                <div>

                  <div class="text-muted small">Cleaning</div>

                  <div class="fs-4 fw-bold text-warning">${cleaningRooms.length}</div>

                </div>

              </div>

            </div>

          </div>

          <div class="col-6 col-md-3">

            <div class="card border-0 shadow-sm h-100">

              <div class="card-body p-3 d-flex align-items-center gap-3">

                <div class="dashboard-stat-icon text-secondary"><i class="bi bi-tools"></i></div>

                <div>

                  <div class="text-muted small">Maintenance</div>

                  <div class="fs-4 fw-bold text-secondary">${maintenanceRooms.length}</div>

                </div>

              </div>

            </div>

          </div>

        </div>



        <div class="card border-0 shadow-sm mb-4">

          <div class="card-header bg-white py-3 border-bottom d-flex align-items-center justify-content-between">

            <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-person-plus me-2 text-primary"></i>Walk-In Guest Registration & Check-In</h6>

            <span class="badge text-bg-light border text-muted">Front Desk Operations</span>

          </div>

          <div class="card-body p-3 p-md-4">

            <form id="form-walkin-dashboard">

              <div class="row g-3">

                <div class="col-12">

                  <div class="p-3 bg-light rounded border">

                    <div class="d-flex align-items-center justify-content-between mb-2">

                      <span class="fw-semibold small text-uppercase text-muted"><i class="bi bi-person-vcard me-1"></i>Guest Information</span>

                      <span class="badge text-bg-secondary" style="font-size: 0.7rem;">Name required · Contact &amp; email optional · Can update anytime via Guest Portal QR</span>

                    </div>

                    <div class="row g-2">

                      <div class="col-md-3">

                        <label class="form-label small mb-1">First Name <span class="text-danger">*</span></label>

                        <input type="text" id="wkd-first-name" class="form-control form-control-sm" placeholder="e.g. Juan" maxlength="100" required>

                      </div>

                      <div class="col-md-3">

                        <label class="form-label small mb-1">Last Name <span class="text-danger">*</span></label>

                        <input type="text" id="wkd-last-name" class="form-control form-control-sm" placeholder="e.g. Dela Cruz" maxlength="100" required>

                      </div>

                      <div class="col-md-3">

                        <label class="form-label small mb-1">Contact Number <span class="text-muted">(Optional)</span></label>

                        <input type="tel" id="wkd-contact" class="form-control form-control-sm" placeholder="e.g. 0917 123 4567" maxlength="30">

                      </div>

                      <div class="col-md-3">

                        <label class="form-label small mb-1">Email <span class="text-muted">(Optional)</span></label>

                        <input type="email" id="wkd-email" class="form-control form-control-sm" placeholder="e.g. juan@example.com" maxlength="150">

                      </div>
                    </div>

                  </div>

                </div>



                <div class="col-md-5">

                  <label class="form-label fw-semibold small">Select Available Room <span class="text-danger">*</span></label>

                  <select id="wkd-room-id" class="form-select form-select-sm" required>

                    <option value="">Choose an available room…</option>

                    ${roomOptions}

                  </select>

                  <div class="form-text small" id="wkd-room-info">Select a room to view capacity and nightly rate.</div>

                </div>

                <div class="col-md-3">

                  <label class="form-label fw-semibold small">Number of Guests <span class="text-danger">*</span></label>

                  <input type="number" id="wkd-guests" class="form-control form-control-sm" value="1" min="1" max="10" required>

                  <div class="form-text small" id="wkd-capacity-note">Must not exceed room capacity.</div>

                </div>

                <div class="col-md-4">

                  <label class="form-label fw-semibold small">Expected Departure Date <span class="text-danger">*</span></label>

                  <input type="date" id="wkd-checkout" class="form-control form-control-sm" value="${tomorrowStr}" min="${tomorrowStr}" required>

                  <div class="form-text small">Minimum 1 night stay.</div>

                </div>



                <div class="col-12">

                  <div class="alert alert-primary py-2 px-3 mb-0 d-flex flex-wrap align-items-center justify-content-between gap-2">

                    <div class="d-flex align-items-center gap-3">

                      <div><span class="text-muted small">Duration:</span> <strong id="wkd-nights-display">1 night</strong></div>

                      <div><span class="text-muted small">Nightly Rate (VAT-inclusive):</span> <strong id="wkd-rate-display">₱0.00</strong></div>

                    </div>

                    <div><span class="text-muted small">Estimated Bill (VAT included):</span> <strong class="fs-6 text-primary" id="wkd-total-display">₱0.00</strong></div>
                  </div>
                </div>

                <div class="col-12">
                  <div class="alert alert-success py-2 px-3 mb-0 d-flex flex-wrap justify-content-between gap-2">
                    <span>Estimated bill before cashier review:</span>
                    <strong id="wkd-payable-display">₱0.00</strong>
                  </div>
                  <div class="form-text">Any eligible discount is applied by the Cashier before payment is collected.</div>
                </div>

                <div class="col-12 d-flex justify-content-end gap-2 pt-2">

                  <button type="reset" class="btn btn-outline-secondary btn-sm px-3">Clear Form</button>

                  <button type="submit" id="btn-wkd-submit" class="btn btn-primary btn-sm px-4">

                    <i class="bi bi-check2-circle me-1"></i>Process & Confirm Check-In

                  </button>

                </div>

              </div>

            </form>

          </div>

        </div>



        <div class="d-flex justify-content-between align-items-center mb-3">

          <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-door-open me-2 text-success"></i>Available Rooms Ready for Check-In (${availableRooms.length})</h6>

          <button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('rooms')"><i class="bi bi-grid me-1"></i>View All Rooms</button>

        </div>

        <div class="row g-2 g-md-3 mb-4">

          ${roomCards}

        </div>

      `;



      const roomSelect = host.querySelector('#wkd-room-id');

      const guestsInput = host.querySelector('#wkd-guests');

      const checkoutInput = host.querySelector('#wkd-checkout');

      const rateDisplay = host.querySelector('#wkd-rate-display');

      const nightsDisplay = host.querySelector('#wkd-nights-display');

      const totalDisplay = host.querySelector('#wkd-total-display');
      const discountInput = null;
      const discountCategoryInput = null;
      const discountReasonInput = null;
      const payableDisplay = host.querySelector('#wkd-payable-display');
      let estimatedTotal = 0;

      const roomInfo = host.querySelector('#wkd-room-info');

      const capacityNote = host.querySelector('#wkd-capacity-note');

      const form = host.querySelector('#form-walkin-dashboard');



      const updateEstimate = () => {

        const opt = roomSelect?.selectedOptions?.[0];

        const rate = opt && opt.dataset.rate ? Number(opt.dataset.rate) : 0;

        const capacity = opt && opt.dataset.capacity ? Number(opt.dataset.capacity) : 2;

        if (opt && opt.value) {

          roomInfo.textContent = `Nightly Rate (VAT-inclusive): ${php(rate)} | Max Capacity: ${capacity} guest(s)`;

          capacityNote.textContent = `Room limit: ${capacity} guest(s)`;

          guestsInput.max = capacity;

        } else {

          roomInfo.textContent = 'Select a room to view capacity and nightly rate.';

          capacityNote.textContent = 'Must not exceed room capacity.';

        }

        const coVal = checkoutInput.value;

        let nights = 1;

        if (coVal) {

          const coDate = new Date(coVal);

          const now = new Date();

          now.setHours(0,0,0,0);

          coDate.setHours(0,0,0,0);

          nights = Math.max(1, Math.round((coDate - now) / 86400000));

        }

        nightsDisplay.textContent = `${nights} night${nights > 1 ? 's' : ''}`;

        rateDisplay.textContent = php(rate);

        const roomTotal = Math.round(rate * nights * 100) / 100;
        estimatedTotal = roomTotal;
        totalDisplay.textContent = php(roomTotal);
        if (payableDisplay) payableDisplay.textContent = php(roomTotal);

      };



      roomSelect?.addEventListener('change', updateEstimate);
      checkoutInput?.addEventListener('change', updateEstimate);
      guestsInput?.addEventListener('input', updateEstimate);



      form?.addEventListener('submit', async (e) => {

        e.preventDefault();

        const roomId = Number(roomSelect.value);

        if (!roomId) return notify('Please select an available room.', true);



        const opt = roomSelect.selectedOptions[0];

        const maxCap = opt && opt.dataset.capacity ? Number(opt.dataset.capacity) : 20;

        const guests = Number(guestsInput.value || 1);

        if (guests < 1 || guests > maxCap) {

          return notify(`Guest count must be between 1 and ${maxCap} for this room.`, true);

        }



        const coVal = checkoutInput.value;

        if (!coVal) return notify('Please select an expected checkout date.', true);

        const coDate = new Date(coVal);

        const now = new Date();

        now.setHours(0,0,0,0);

        coDate.setHours(0,0,0,0);

        const nights = Math.max(1, Math.round((coDate - now) / 86400000));



        const firstName = host.querySelector('#wkd-first-name')?.value?.trim() || '';

        const lastName = host.querySelector('#wkd-last-name')?.value?.trim() || '';

        const contact = host.querySelector('#wkd-contact')?.value?.trim() || '';

        const email = host.querySelector('#wkd-email')?.value?.trim() || '';
        if (!firstName || !lastName) {
          return notify('Guest first and last name are required.', true);
        }



        const submitBtn = host.querySelector('#btn-wkd-submit');

        submitBtn.disabled = true;

        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Processing…';



        try {
          const timePolicy = await api('hotel_time_policy', {}, 'GET');
          if (!timePolicy.checkin_open) {
            throw new Error(`Check-in opens at 2:00 PM (${timePolicy.timezone}). Current hotel time: ${timePolicy.hotel_now}.`);
          }

          const r = await api('checkin', {

            room_id: roomId,

            guests,

            nights,

            first_name: firstName,

            last_name: lastName,

            email: email,
            discount_amount: 0

          });

          notify(`Check-in saved! Stay ${r.stay_code}; Folio ${r.folio_number}. Cashier review and payment required: ${php(r.required_amount||0)}.`);

          showCheckinComplete(r);

          await renderWalkinCheckin();

        } catch (err) {

          notify(err.message || 'Check-in failed.', true);

          submitBtn.disabled = false;

          submitBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Process & Confirm Check-In';

        }

      });



    } catch (err) {

      host.innerHTML = `<div class="alert alert-danger">${esc(err.message || 'Failed to load Walk-in dashboard.')}</div>`;

    }

  }



  async function renderCheckoutDashboard() {

    const host = $('checkout-content');

    if (!host) return;

    host.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-dark mb-3"></div><div>Loading Check-Out Dashboard…</div></div>';



    try {

      const d = await api('active_stays', {}, 'GET');

      const stays = d.stays || [];

      const readyForCheckout = stays.filter(s => s.is_settled ?? (Number(s.balance_due ?? (Number(s.charges_total) - Number(s.paid_total))) <= 0.009)).length;

      const balanceDueCount = stays.length - readyForCheckout;



      const rows = stays.map(s => {

        const bal = Number(s.balance_due ?? (Number(s.charges_total) - Number(s.paid_total)));
        const isSettled = s.is_settled ?? (bal <= 0.009);

        const statusBadge = isSettled

          ? '<span class="badge text-bg-success"><i class="bi bi-check-circle me-1"></i>Ready for Checkout</span>'

          : `<span class="badge text-bg-warning text-dark"><i class="bi bi-exclamation-circle me-1"></i>Balance Due: ${php(bal)}</span>`;



        return `<tr>

          <td>

            <strong>${esc(s.stay_code)}</strong>

            <div class="small text-muted">Folio ${esc(s.folio_number)}</div>

            ${s.guest_name ? `<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>` : ''}

          </td>

          <td><strong>Room ${esc(s.room_number)}</strong><div class="small text-muted">${s.guest_count} guest(s)</div></td>

          <td><div>Scheduled: ${esc(s.checkin_at)}</div><div class="small text-muted">Actual: ${esc(s.actual_checkin_at||'Not recorded')}</div></td>

          <td>${esc(s.planned_checkout)} at 12:00 PM</td>

          <td>

            <div class="fw-bold ${bal > 0 ? 'text-danger' : 'text-success'}">${php(bal)}</div>

            <div class="small text-muted">Charges: ${php(s.charges_total)} | Paid: ${php(s.paid_total)}</div>

          </td>

          <td>${statusBadge}</td>

          <td>

            <div class="d-flex flex-wrap gap-1">

              <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})"><i class="bi bi-receipt me-1"></i>View Bill</button>

              <button class="btn btn-sm btn-success" onclick="HotelBilling.checkout(${s.id})"><i class="bi bi-box-arrow-right me-1"></i>Check-Out</button>

            </div>

          </td>

        </tr>`;

      }).join('');



      const mobileCards = stays.map(s => {

        const bal = Number(s.balance_due ?? (Number(s.charges_total) - Number(s.paid_total)));
        const isSettled = s.is_settled ?? (bal <= 0.009);

        return `

          <div class="card border-0 shadow-sm p-3 mb-2">

            <div class="d-flex justify-content-between align-items-start mb-2">

              <div>

                <span class="fw-bold fs-6">${esc(s.stay_code)}</span>

                <div class="small text-muted">Folio ${esc(s.folio_number)}</div>

              </div>

              <span class="badge text-bg-light border fs-6">Room ${esc(s.room_number)}</span>

            </div>

            ${s.guest_name ? `<div class="fw-semibold text-primary mb-2" style="font-size:13px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>` : ''}

            <div class="row g-2 mb-2 small text-muted">

              <div class="col-12">Scheduled check-in: <strong class="text-dark">${esc(s.checkin_at)}</strong><div>Actual check-in: <strong class="text-dark">${esc(s.actual_checkin_at||'Not recorded')}</strong></div></div>

              <div class="col-6 text-end">Checkout: <strong class="text-dark">${esc(s.planned_checkout)} at 12:00 PM</strong></div>

              <div class="col-6">Guests: <strong class="text-dark">${s.guest_count}</strong></div>

              <div class="col-6 text-end">Balance: <strong class="${bal > 0 ? 'text-danger' : 'text-success'}">${php(bal)}</strong></div>

            </div>

            <div class="d-flex justify-content-between align-items-center pt-2 border-top">

              <div>${isSettled ? '<span class="badge text-bg-success">Ready for Checkout</span>' : '<span class="badge text-bg-warning text-dark">Balance Due</span>'}</div>

              <div class="d-flex gap-1">

                <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})">Folio</button>

                <button class="btn btn-sm btn-success" onclick="HotelBilling.checkout(${s.id})"><i class="bi bi-box-arrow-right me-1"></i>Check-Out</button>

              </div>

            </div>

          </div>

        `;

      }).join('') || '<div class="card border-0 shadow-sm p-4 text-center text-muted">No active in-house stays to check out.</div>';



      host.innerHTML = `

        <div class="row g-2 g-sm-3 mb-4">

          <div class="col-12 col-md-4">

            <div class="card border-0 shadow-sm h-100">

              <div class="card-body p-3 d-flex align-items-center gap-3">

                <div class="dashboard-stat-icon text-primary"><i class="bi bi-people"></i></div>

                <div>

                  <div class="text-muted small">Total Active Stays</div>

                  <div class="fs-4 fw-bold text-dark">${stays.length}</div>

                </div>

              </div>

            </div>

          </div>

          <div class="col-6 col-md-4">

            <div class="card border-0 shadow-sm h-100">

              <div class="card-body p-3 d-flex align-items-center gap-3">

                <div class="dashboard-stat-icon text-success"><i class="bi bi-check-circle"></i></div>

                <div>

                  <div class="text-muted small">Ready for Checkout (Settled)</div>

                  <div class="fs-4 fw-bold text-success">${readyForCheckout}</div>

                </div>

              </div>

            </div>

          </div>

          <div class="col-6 col-md-4">

            <div class="card border-0 shadow-sm h-100">

              <div class="card-body p-3 d-flex align-items-center gap-3">

                <div class="dashboard-stat-icon text-danger"><i class="bi bi-wallet2"></i></div>

                <div>

                  <div class="text-muted small">Settlement Required (Balance Due)</div>

                  <div class="fs-4 fw-bold text-danger">${balanceDueCount}</div>

                </div>

              </div>

            </div>

          </div>

        </div>



        <div class="card border-0 shadow-sm mb-3">

          <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">

            <div>

              <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-box-arrow-right me-2 text-primary"></i>Check-Out & Guest Departures</h6>

              <div class="small text-muted">Verify billing settlement, inspect final charges, and complete guest departures.</div>

            </div>

            <button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('checkout')"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>

          </div>

          <div class="card-body p-0">

            <div class="d-none d-md-block">

              ${table(['Stay / Folio Reference', 'Room', 'Scheduled / Actual Check-in', 'Scheduled Checkout', 'Balance Status', 'Settlement', 'Actions'], rows, 'No active stays found.')}

            </div>

            <div class="d-md-none p-3">

              ${mobileCards}

            </div>

          </div>

        </div>

      `;

    } catch(err) {

      host.innerHTML = `<div class="alert alert-danger">${esc(err.message || 'Failed to load Check-out dashboard.')}</div>`;

    }

  }



  function checkoutReceiptHtml(d, finalized=false) {
    const lc = d.late_checkout || null;
    const autoTotal = (!finalized && lc) ? Number(lc.total_auto_amount || 0) : 0;
    const hasPending = autoTotal > 0.009;
    const simFinal = hasPending ? Number(d.final_amount_with_late_checkout ?? (Number(d.final_amount || 0) + autoTotal)) : Number(d.final_amount || 0);
    const paid = Number(d.payments_received || 0);
    const postedOutstanding = Math.max(0, Number(d.final_amount || 0) - paid);
    const outstandingIncludingPending = Math.max(0, simFinal - paid);
    const rows=(d.charges||[]).map(c=>`<tr><td>${esc(roomStayTitle(c))}${c.category==='ROOM'?' (VAT-inclusive)':''}</td><td class="num">${php(c.amount)}</td></tr>`).join('')
      + `<tr><td>Charges before VAT</td><td class="num">${php(d.vatable_sales||0)}</td></tr>`
      + (Number(d.vat_exempt_sales||0)>0?`<tr><td>VAT-free charges</td><td class="num">${php(d.vat_exempt_sales)}</td></tr>`:'');
    const discountRows=(d.discounts||[]).map(discount=>`<tr><td class="text-success">Discount: ${esc(discountDisplayName(discount))}</td><td class="text-end text-success">− ${php(discount.amount)}</td></tr>`).join('')
      || (Number(d.discount_total)>0?`<tr><td>Discounts / credits</td><td class="text-end">− ${php(d.discount_total)}</td></tr>`:'');
    const postedSettled = d.settlement_status !== 'ADDITIONAL_PAYMENT_DUE';
    const status = finalized
      ? (postedSettled ? 'Fully settled' : `Balance due: ${php(Math.abs(Number(d.settlement_delta)))}`)
      : hasPending
        ? (postedSettled ? `Posted balance settled · Pending automatic charge ${php(autoTotal)} not yet posted` : `Balance due (posted): ${php(postedOutstanding)} · Pending automatic charge ${php(autoTotal)} not yet posted`)
        : (postedSettled ? 'Fully settled' : `Balance due: ${php(Math.abs(Number(d.settlement_delta)))}`);
    const alertClass = (finalized ? postedSettled : (postedSettled && !hasPending)) ? 'success' : 'warning';
    const plannedNights = Number(d.planned_nights || 0);
    const stayedNights = Number(d.nights_stayed || 0);
    const nightsLine = plannedNights > 0 ? `Planned ${plannedNights} night(s) · Stayed ${stayedNights} night(s)` : `${stayedNights} night(s)`;
    let pendingHtml = '';
    if (hasPending) {
      const pendingRows = (lc.lines || []).map(l => `<tr><td>${esc(l)} (pending)</td><td class="text-end">${php(l.indexOf('Late checkout fee') === 0 ? lc.late_fee_amount : lc.nightly_rate)}</td></tr>`).join('');
      pendingHtml = `<div class="mt-3"><h6 class="fw-bold">Pending automatic charges — not yet posted</h6><p class="small text-muted mb-2">These charges are not in the posted totals above. They are added to the folio only when you confirm them; only a manager can waive them. Scheduled checkout ${esc(lc.scheduled_checkout_at)} · Hotel time ${esc(lc.actual_checkout_at)} · Nightly rate ${php(lc.nightly_rate)} · Grace ${esc(lc.grace_minutes)} min · Evening cutoff ${esc(lc.cutoff_time)} · Late fee ${esc(lc.fee_percent)}%.</p><table class="table table-sm"><tbody>${pendingRows}<tr><td>Pending total (gross)</td><td class="text-end">${php(autoTotal)}</td></tr><tr><th>New total to pay if confirmed (VAT-recomputed)</th><th class="text-end">${php(simFinal)}</th></tr><tr><td>Outstanding including pending</td><td class="text-end">${php(outstandingIncludingPending)}</td></tr></tbody></table></div>`;
    }
    let lateBox = '';
    if (finalized) {
      const postedLate = (d.charges || []).filter(c => String(c.description || '').indexOf('Late checkout fee') === 0 || String(c.description || '').indexOf('Overstay night') === 0);
      if (postedLate.length) {
        const lateRows = postedLate.map(c => `<tr><td>${esc(c.description)}</td><td class="text-end">${php(c.amount)}</td></tr>`).join('');
        lateBox = `<div class="mt-3"><h6 class="fw-bold">Automatic late charge (included above — not an additional charge)</h6><table class="table table-sm"><tbody>${lateRows}</tbody></table><div class="small text-muted">Scheduled checkout ${esc(d.scheduled_checkout_at || `${d.stay.planned_checkout} at 12:00 PM`)} · Actual checkout ${esc(d.stay.actual_checkout || 'Not recorded')}${lc ? ` · Nightly rate ${php(lc.nightly_rate)} · Grace ${esc(lc.grace_minutes)} min · Evening cutoff ${esc(lc.cutoff_time)}` : ''}.</div></div>`;
      }
    }

    return `<div class="checkout-receipt"><div class="text-center mb-3"><h4 class="mb-1">SHESH DEV HOTEL</h4><div class="small text-muted">Agora, Lapasan, Cagayan de Oro</div><h5 class="mt-3">${finalized?'FINAL CHECKOUT RECEIPT':'CHECKOUT BILL REVIEW'}</h5><div class="small text-muted">${finalized?'Finalized transaction':'Estimate — not yet finalized'}</div></div><hr><div class="row g-2 mb-3"><div class="col-6"><div class="small text-muted">Stay reference</div><strong>${esc(d.stay.stay_code)}</strong></div><div class="col-6 text-end"><div class="small text-muted">Folio</div><strong>${esc(d.stay.folio_number)}</strong></div><div class="col-6"><div class="small text-muted">Room</div><strong>${esc(d.stay.room_number)}</strong></div><div class="col-6 text-end"><div class="small text-muted">Nights</div><strong>${esc(nightsLine)}</strong></div>${d.stay.guest_name?`<div class="col-12"><div class="small text-muted">Guest</div><strong>${esc(d.stay.guest_name)}</strong></div>`:''}<div class="col-12"><div class="small text-muted">Scheduled check-in</div><strong>${esc(d.stay.checkin_at)}</strong><div class="small text-muted mt-1">Actual check-in</div><strong>${esc(d.stay.actual_checkin_at||'Not recorded')}</strong><div class="small text-muted mt-1">Scheduled checkout</div><strong>${esc(d.stay.planned_checkout)} at 12:00 PM</strong><div class="small text-muted mt-1">Actual checkout</div><strong>${esc(d.stay.actual_checkout||'Not yet checked out')}</strong></div></div><table class="table table-sm"><thead><tr><th>Item</th><th class="text-end">Amount</th></tr></thead><tbody>${rows}${discountRows}<tr><td>VAT (${Number(d.vat_rate)}%) included</td><td class="text-end">${php(d.vat)}</td></tr></tbody><tfoot><tr><th>${hasPending?'Total to pay (posted charges only)':'Total to pay'}</th><th class="text-end">${php(d.final_amount)}</th></tr><tr><td>Amount paid</td><td class="text-end">${php(d.payments_received)}</td></tr><tr><td>Outstanding balance${hasPending?' (posted only)':''}</td><td class="text-end">${php(postedOutstanding)}</td></tr></tfoot></table>${pendingHtml}${lateBox}<div class="alert alert-${alertClass} mb-0"><strong>${esc(status)}</strong></div>${finalized?'<p class="small text-muted text-center mt-3 mb-0">Thank you for staying with us.</p>':''}</div>`;

  }

  function printCheckoutReceipt(d) {
    const rows=(d.charges||[]).map(c=>`<tr><td>${esc(roomStayTitle(c))}${c.category==='ROOM'?' (VAT-inclusive)':''}</td><td style="text-align:right">${php(c.amount)}</td></tr>`).join('')
      + `<tr><td>Charges before VAT</td><td style="text-align:right">${php(d.vatable_sales||0)}</td></tr>`
      + (Number(d.vat_exempt_sales||0)>0?`<tr><td>VAT-free charges</td><td style="text-align:right">${php(d.vat_exempt_sales)}</td></tr>`:'');
    const discountRows=(d.discounts||[]).map(discount=>`<tr><td>Discount: ${esc(discountDisplayName(discount))}</td><td style="text-align:right">− ${php(discount.amount)}</td></tr>`).join('')
      || (Number(d.discount_total)>0?`<tr><td>Discounts / credits</td><td style="text-align:right">− ${php(d.discount_total)}</td></tr>`:'');

    const w=window.open('','_blank','width=760,height=800'); if(!w){notify('Allow pop-ups to print the checkout receipt.',true);return;}

    const settlementStatus=d.settlement_status==='ADDITIONAL_PAYMENT_DUE'
      ? `Balance due ${php(Math.abs(Number(d.settlement_delta)))}`
      : 'Fully settled';
    const outstandingBalance=Math.max(0,Number(d.final_amount||0)-Number(d.payments_received||0));
    const printPlanned = Number(d.planned_nights || 0);
    const printNightsLine = printPlanned > 0 ? `Planned ${printPlanned} night(s) · Stayed ${Number(d.nights_stayed || 0)} night(s)` : `Stayed ${Number(d.nights_stayed || 0)} night(s)`;
    const printLateCharges = (d.charges || []).filter(c => String(c.description || '').indexOf('Late checkout fee') === 0 || String(c.description || '').indexOf('Overstay night') === 0);
    const printLateBox = printLateCharges.length ? `<div style="margin-top:14px"><strong>Automatic late charge (included above — not an additional charge)</strong><table><tbody>${printLateCharges.map(c => `<tr><td>${esc(c.description)}</td><td class="num">${php(c.amount)}</td></tr>`).join('')}</tbody></table><p class="muted">Scheduled checkout ${esc(d.scheduled_checkout_at || `${d.stay.planned_checkout} at 12:00 PM`)} · Actual checkout ${esc(d.stay.actual_checkout || 'Not recorded')}${d.late_checkout ? ` · Nightly rate ${php(d.late_checkout.nightly_rate)} · Grace ${esc(d.late_checkout.grace_minutes)} min · Evening cutoff ${esc(d.late_checkout.cutoff_time)}` : ''}.</p></div>` : '';
    w.document.write(`<!doctype html><html><head><title>Checkout Receipt · ${esc(d.stay.stay_code)}</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;color:#111;margin:28px}h2,h3,p{text-align:center;margin:5px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.num{text-align:right}.totals{margin-top:14px}.totals div{display:flex;justify-content:space-between;padding:5px 0}.muted{color:#555;font-size:12px}.status{border:1px solid #aaa;padding:10px;margin-top:15px;text-align:center}@media print{button{display:none}body{margin:12mm}}</style></head><body><h2>SHESH DEV HOTEL</h2><p>Agora, Lapasan, Cagayan de Oro</p><h3>FINAL CHECKOUT RECEIPT</h3><p class="muted">Stay ${esc(d.stay.stay_code)} · Folio ${esc(d.stay.folio_number)} · Room ${esc(d.stay.room_number)}${d.stay.guest_name?` · Guest: ${esc(d.stay.guest_name)}`:''}</p><p>Scheduled check-in: ${esc(d.stay.checkin_at)} · Actual check-in: ${esc(d.stay.actual_checkin_at||'Not recorded')} · Scheduled checkout: ${esc(d.stay.planned_checkout)} at 12:00 PM · Actual checkout: ${esc(d.stay.actual_checkout||'Not recorded')}</p><p class="muted">${printNightsLine}</p><table><thead><tr><th>Item</th><th class="num">Amount</th></tr></thead><tbody>${rows}${discountRows}<tr><td>VAT (${Number(d.vat_rate)}%) included</td><td class="num">${php(d.vat)}</td></tr></tbody></table><div class="totals"><div><strong>Total to pay</strong><strong>${php(d.final_amount)}</strong></div><div><span>Amount paid</span><span>${php(d.payments_received)}</span></div><div><span>Outstanding balance</span><span>${php(outstandingBalance)}</span></div><div><strong>Balance / settlement</strong><strong>${esc(settlementStatus)}</strong></div></div>${printLateBox}<div class="status">Checkout finalized · Room status: Cleaning</div><p style="margin-top:24px">Thank you for staying with us.</p><button onclick="window.print()">Print receipt</button><script>window.onload=()=>window.print()</script></body></html>`);

    w.document.close();

  }

  // Dialog shown when the server returns needs_confirmation for a checkout
  // with an automatic late charge. Resolves to the successful checkout result,
  // or null if the user cancels or the retry fails (the review dialog stays
  // open behind this one, so staff can settle the new total and retry).
  async function lateCheckoutConfirm(id, lc, newFinalAmount) {
    const role = (window.HotelAuth?.getUser()?.role || '').toLowerCase();
    const canWaive = ['admin', 'manager'].includes(role);
    const lineRows = (lc.lines || []).map(l => {
      const amount = l.indexOf('Late checkout fee') === 0 ? lc.late_fee_amount : lc.nightly_rate;
      return `<tr><td>${esc(l)}</td><td class="text-end">${php(amount)}</td></tr>`;
    }).join('');
    return new Promise(resolve => {
      const z = modal('Automatic late charge — confirm', `<p class="text-muted small mb-2">Scheduled checkout ${esc(lc.scheduled_checkout_at)} · Hotel time ${esc(lc.actual_checkout_at)} · Nightly rate ${php(lc.nightly_rate)}. Nothing has been posted yet.</p><table class="table table-sm"><tbody>${lineRows}<tr><th>Total automatic charge</th><th class="text-end">${php(lc.total_auto_amount)}</th></tr><tr><td>New total to pay if confirmed</td><td class="text-end">${php(newFinalAmount)}</td></tr></tbody></table>${(lc.notes || []).map(n => `<div class="small text-muted">${esc(n)}</div>`).join('')}<div class="mt-3"><label class="form-label">Waive reason (required to waive)</label><input class="form-control" id="late-waive-reason" placeholder="e.g. guest was moved by housekeeping delay"></div><div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-outline-secondary" id="late-cancel">Cancel</button><button type="button" class="btn btn-outline-warning" id="late-waive" ${canWaive ? '' : 'disabled title="Only a manager or administrator can waive this charge"'}>Waive charge</button><button type="button" class="btn btn-success" id="late-confirm">Confirm and add charges</button></div>${canWaive ? '' : '<div class="small text-muted mt-2">Waiving requires a manager or administrator.</div>'}`);
      z.root.querySelector('#late-cancel').onclick = () => { z.m.hide(); resolve(null); };
      z.root.querySelector('#late-confirm').onclick = async e => {
        const btn = e.currentTarget; btn.disabled = true;
        try {
          const result = await api('checkout', { stay_id: id, confirm: 1 });
          z.m.hide(); resolve(result);
        } catch (err) {
          // The server commits just-posted late charges and then fails the
          // balance check on purpose, so the caller can offer pay-then-retry.
          // That is NOT a generic failure: surface it as a marker, not a
          // toast-and-close, so checkout() can show the pay step.
          const msg = (err && err.message) ? String(err.message) : '';
          z.m.hide();
          if (msg.indexOf('already been posted') !== -1) { resolve({ late_posted_unpaid: true, message: msg }); }
          else { notify(msg || 'Checkout failed.', true); resolve(null); }
        }
      };
      z.root.querySelector('#late-waive').onclick = async e => {
        if (!canWaive) return;
        const reason = String(z.root.querySelector('#late-waive-reason').value || '').trim();
        if (!reason) { notify('Enter a reason for waiving the automatic late charge.', true); return; }
        const btn = e.currentTarget; btn.disabled = true;
        try {
          const result = await api('checkout', { stay_id: id, waive: 1, waive_reason: reason });
          z.m.hide(); resolve(result);
        } catch (err) { notify(err.message, true); z.m.hide(); resolve(null); }
      };
    });
  }

  async function checkout(id) {

    const checkoutRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();
    if (!['admin', 'frontdesk', 'manager'].includes(checkoutRole)) {
      return notify('Only Front Desk, a manager, or an administrator can finalize guest checkout.', true);
    }

    try {

      const d=await api('final_bill_preview',{stay_id:id});

      const pending=d.pending_early_checkout_request;

      // Posted vs pending, kept separate on purpose. The old code gated
      // Confirm on (posted final + pending auto) - payments, so when only
      // the pending automatic charge was unpaid, Confirm was disabled and
      // the confirm dialog that posts the charges was unreachable — while
      // Settle opened pay() for the posted (zero) balance. That was the
      // deadlock. The new gate: posted settled + only pending outstanding
      // => Confirm becomes a first step, "Confirm late charges".
      const postedSettled = d.settlement_status !== 'ADDITIONAL_PAYMENT_DUE';
      const postedBalanceDue = postedSettled ? 0 : Math.abs(Number(d.settlement_delta));
      const latePreview=d.late_checkout||null;
      const autoTotal=latePreview?Number(latePreview.total_auto_amount||0):0;
      const simFinal=autoTotal>0.009 ? Number(d.final_amount_with_late_checkout ?? (Number(d.final_amount||0)+autoTotal)) : Number(d.final_amount||0);
      const newBalanceDue=Math.max(0,simFinal-Number(d.payments_received||0));
      const checkoutAllowed = Boolean(d.checkout_allowed);
      // Note: posted settled is NOT required here. If a posted balance is
      // also due, confirming late charges first still posts the late
      // charges, after which the combined posted balance is payable in
      // one pay call. Requiring posted-settled first would re-create the
      // deadlock for the mixed case (and a disabled Confirm button cannot
      // be triggered by the Settle button).
      const pendingOnly = autoTotal>0.009 && !pending && checkoutAllowed;
      const canFinalize = postedSettled && autoTotal<=0.009 && !pending && checkoutAllowed;
      const canConfirm = pendingOnly || canFinalize;
      const confirmLabel = pendingOnly ? 'Confirm late charges' : 'Confirm checkout';
      const disabledReason = !checkoutAllowed ? 'Checkout is before the scheduled noon time or approved exception time' : pending ? 'Resolve the early checkout request first' : postedBalanceDue>0.009 ? 'Make sure the posted payment is settled before checkout' : 'Make sure payment is settled before checkout';

      let statusAlert = '';

      if (pending) {

        statusAlert = `<div class="alert alert-danger mt-3 mb-0"><strong>Checkout blocked.</strong> Early checkout request #${Number(pending.id)} is ${pending.status==='REQUESTED'?'pending approval':'approved but not finalized'}. Open <strong>Early Checkout Approvals</strong> to resolve and finalize this request first. Checkout will remain unavailable until the request is finalized or rejected.</div>`;

      } else if (autoTotal>0.009) {

        // Pending charge exists and is not posted yet: the Settle button
        // must NOT open pay() for the posted balance (it would be the
        // posted amount, or zero, and can never pay the pending charge).
        // It triggers the confirm-late-charges step instead.
        statusAlert = `<div class="alert alert-warning mt-3 mb-0 d-flex justify-content-between align-items-center flex-wrap gap-2"><div><strong><i class="bi bi-exclamation-triangle-fill me-1"></i>Automatic late charge pending:</strong> <strong>${php(autoTotal)}</strong> not yet posted. Outstanding including pending: <strong>${php(newBalanceDue)}</strong>.${postedBalanceDue>0.009?` This includes a posted balance of <strong>${php(postedBalanceDue)}</strong> plus the pending charge.`:` Confirm the late charges first — they cannot be paid until they are posted.`}</div><button type="button" class="btn btn-sm btn-primary" id="checkout-settle-btn"><i class="bi bi-credit-card me-1"></i>Confirm late charges first</button></div>`;

      } else if (!postedSettled) {

        statusAlert = `<div class="alert alert-warning mt-3 mb-0 d-flex justify-content-between align-items-center flex-wrap gap-2"><div><strong><i class="bi bi-exclamation-triangle-fill me-1"></i>Payment Not Settled:</strong> Outstanding posted balance of <strong>${php(postedBalanceDue)}</strong> must be settled before checkout.</div><button type="button" class="btn btn-sm btn-primary" id="checkout-settle-btn"><i class="bi bi-credit-card me-1"></i>Settle Balance / Pay Now</button></div>`;

      }

      if (autoTotal>0.009) {
        const lateLines=(latePreview.lines||[]).map(l=>`<div>${esc(l)} — ${php(l.indexOf('Late checkout fee')===0?latePreview.late_fee_amount:latePreview.nightly_rate)}</div>`).join('');
        statusAlert += `<div class="alert alert-info mt-3 mb-0"><strong>Automatic late charge pending (not yet posted):</strong> Scheduled checkout ${esc(latePreview.scheduled_checkout_at)}, hotel time ${esc(d.hotel_now)}, nightly rate ${php(latePreview.nightly_rate)}.${lateLines}<div class="mt-1">New total to pay if confirmed (VAT-recomputed): <strong>${php(simFinal)}</strong>. Confirming checkout will ask you to confirm these charges first; only a manager can waive them.</div>${(latePreview.notes||[]).map(n=>`<div class="small">${esc(n)}</div>`).join('')}</div>`;
      }

      if (!checkoutAllowed) {
        const scheduled = d.scheduled_checkout_at || `${d.stay.planned_checkout} 12:00:00`;
        const exceptionMessage = d.early_checkout_exception
          ? ` The manager-approved departure time is ${esc(d.early_checkout_exception.requested_departure_at)}.`
          : '';
        statusAlert += `<div class="alert alert-warning mt-3 mb-0"><strong>Checkout is not yet allowed.</strong> Standard checkout is at 12:00 PM on ${esc(d.stay.planned_checkout)} (${esc(d.hotel_timezone)}). Current hotel time: ${esc(d.hotel_now)}.${exceptionMessage}</div>`;
      }

      const x=modal('Final checkout · Receipt review',`${checkoutReceiptHtml(d,false)}${statusAlert}<div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-outline-secondary" id="cancel-checkout">Close</button><button type="button" class="btn btn-success" id="confirm-checkout" ${!canConfirm ? `disabled title="${disabledReason}"` : ''}><i class="bi bi-check2-circle me-1"></i>${confirmLabel}</button></div>`);

      x.root.querySelector('#cancel-checkout').onclick=()=>x.m.hide();

      const settleBtn = x.root.querySelector('#checkout-settle-btn');
      if (settleBtn) {
        if (autoTotal>0.009) {
          // Pending charge: confirming posts it; paying before that is
          // impossible, so Settle just opens the confirm step.
          settleBtn.addEventListener('click', () => { x.root.querySelector('#confirm-checkout')?.click(); });
        } else {
          settleBtn.addEventListener('click', () => {
            x.m.hide();
            pay(d.stay.folio_id, postedBalanceDue);
          });
        }
      }

      if(!canConfirm)return;

      // Explicit pay-then-retry step after late charges were posted by a
      // confirm call that then failed the balance check (server commits
      // only those charges and returns the 'already been posted' error).
      const showLatePostedStep = async (postedMessage) => {
        const role = (window.HotelAuth?.getUser()?.role || '').toLowerCase();
        const canPay = role !== 'frontdesk';
        const y = modal('Late charges posted — pay, then checkout again', `<p>Late charges have been posted to the folio and will not be posted again.</p><p class="small text-muted">${esc(postedMessage || '')}</p><p>Amount now due: <strong>${php(newBalanceDue)}</strong> (new total ${php(simFinal)} less payments received ${php(d.payments_received)}).</p>${canPay ? '' : '<p class="small text-muted">Front Desk cannot take payments — a cashier or manager must take this payment.</p>'}<div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-outline-secondary" id="late-posted-close">Close</button>${canPay ? '<button type="button" class="btn btn-primary" id="late-posted-pay">Pay now</button>' : ''}<button type="button" class="btn btn-success" id="late-posted-reopen">Reopen checkout review</button></div>`);
        y.root.querySelector('#late-posted-close').onclick = () => { y.m.hide(); };
        if (canPay) {
          y.root.querySelector('#late-posted-pay').onclick = () => {
            y.m.hide();
            pay(d.stay.folio_id, newBalanceDue);
          };
        }
        y.root.querySelector('#late-posted-reopen').onclick = async () => {
          y.m.hide();
          x.m.hide();
          await checkout(id);
        };
      };

      x.root.querySelector('#confirm-checkout').onclick=async e=>{

        const b=e.currentTarget;
        if (b.disabled) return;
        b.disabled=true;

        let result;
        try {
          if (pendingOnly) {
            // First step only: open the late-charge dialog directly. The
            // old code never reached it because Confirm was disabled.
            result = await lateCheckoutConfirm(id, d.late_checkout, simFinal);
            if (!result) {
              b.disabled=false;
              b.innerHTML='<i class="bi bi-check2-circle me-1"></i>Confirm late charges';
              return;
            }
            if (result.late_posted_unpaid) {
              b.disabled=false;
              b.innerHTML='<i class="bi bi-check2-circle me-1"></i>Confirm late charges';
              await showLatePostedStep(result.message);
              return;
            }
          } else {
            const confirmed = await window.HotelDialogs.confirm({

              title: 'Finalize Guest Checkout?',

              text: `Finalize checkout for Stay ${d.stay.stay_code} (Room ${d.stay.room_number})? Folio will be settled and room condition set to Cleaning.`,

              confirmButtonText: 'Finalize Checkout',

              actionType: 'success'

            });

            if (!confirmed) {
              b.disabled=false;
              return;
            }

            b.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>Finalizing…';

            result=await api('checkout',{stay_id:id});
            if (result && result.needs_confirmation && result.late_checkout) {
              result=await lateCheckoutConfirm(id, result.late_checkout, Number(d.final_amount_with_late_checkout ?? (Number(d.final_amount||0)+Number(result.late_checkout.total_auto_amount||0))));
              if (!result) {
                b.disabled=false;
                b.innerHTML='<i class="bi bi-check2-circle me-1"></i>Confirm checkout';
                return;
              }
              if (result.late_posted_unpaid) {
                b.disabled=false;
                b.innerHTML='<i class="bi bi-check2-circle me-1"></i>Confirm checkout';
                await showLatePostedStep(result.message);
                return;
              }
            }
          }
        } catch(err) {
          b.disabled=false;
          b.innerHTML= pendingOnly ? '<i class="bi bi-check2-circle me-1"></i>Confirm late charges' : '<i class="bi bi-check2-circle me-1"></i>Confirm checkout';
          notify(err.message,true);
          return;
        }

        const checkoutModalClosed=x.root.classList.contains('show')
          ? new Promise(resolve=>x.root.addEventListener('hidden.bs.modal',resolve,{once:true}))
          : Promise.resolve();
        x.m.hide();
        await checkoutModalClosed;
        try {
          await open(activeModule);
        } catch (refreshError) {
          console.error('[HotelBilling] Checkout completed, but the active dashboard could not refresh.', refreshError);
          notify('Checkout is complete, but this dashboard could not refresh. Reload to see the updated stay.', true);
        }
        // Re-read the preview so the final receipt includes any automatic
        // late / overstay lines posted by this checkout, not the pre-checkout
        // charge list.
        let finalData={...d,stay:{...d.stay,actual_checkout:result.actual_checkout||new Date().toLocaleString()},settlement_status:d.settlement_status};
        try {
          const fresh=await api('final_bill_preview',{stay_id:id});
          finalData={...fresh,stay:{...fresh.stay,actual_checkout:result.actual_checkout||fresh.stay.actual_checkout||new Date().toLocaleString()},settlement_status:fresh.settlement_status};
        } catch (_) {}
        const y=modal('Checkout completed',`${checkoutReceiptHtml(finalData,true)}<div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-outline-secondary" id="close-checkout-receipt">Close</button><button type="button" class="btn btn-primary" id="print-checkout-receipt">Print receipt</button></div>`);

        y.root.querySelector('#close-checkout-receipt').onclick=()=>{y.m.hide();open(activeModule)};
        y.root.querySelector('#print-checkout-receipt').onclick=()=>printCheckoutReceipt(finalData);

      };

    } catch(e) { notify(e.message,true); }

  }

  async function roomStatus(id,status) {

    if(!status)return;
    // Defense in depth for the frontdesk view-only rule: even a stale cached
    // board that still renders the dropdown must not send the request.
    if ((window.HotelAuth.getUser()?.role || '').toLowerCase() === 'frontdesk') {
      open('rooms');
      return;
    }

    const confirmed = await window.HotelDialogs.confirm({

      title: 'Update Room Condition?',

      text: `Change room condition to ${status}?`,

      confirmButtonText: 'Update Condition',

      actionType: status === 'MAINTENANCE' ? 'warning' : 'primary'

    });

    if(!confirmed) {

      open('rooms');

      return;

    }

    try{

      await api('room_status',{room_id:id,status});

      notify('Room status updated.');

      open('rooms');

    }catch(e){notify(e.message,true)}

  }

  async function reportDetails(day){try{const d=await api('report_transactions',{day});const rows=(d.transactions||[]).map(t=>`<tr><td>${esc(t.created_at)}</td><td>${esc(t.receipt_number)}</td><td>${esc(t.stay_code)}<div class="small text-muted">${esc(t.folio_number)}</div></td><td>${esc(t.room_number)}</td><td>${esc(t.method)}</td><td>${php(t.amount)}</td><td>${esc(t.reference_note||'—')}</td></tr>`).join('');modal('Shesh Dev Hotel · Agora, Lapasan, Cagayan de Oro · Transaction details · '+esc(day),table(['Date / Time','Receipt','Stay / Folio','Room','Method','Amount','Reference'],rows,'No transactions for this date.'));}catch(e){notify(e.message,true)}}

  async function requestStatus(id,status,reason='') { if(!status)return;try{const r=await api('request_status',{request_id:id,status,reason});if(r.room_transfer){if(r.transfer_finalized){notify(`Transfer to Room ${r.transfer_room_number || '—'} finalized. The room move was already completed; no duplicate move or charge was made.`);}else{const amt=Number(r.transfer_adjustment||0);const signed=(amt>0?'+':amt<0?'−':'')+php(Math.abs(amt));notify(`Transfer approved and completed to Room ${r.transfer_room_number || '—'}. Bill adjustment ${signed} for ${Number(r.transfer_nights||0)} remaining night(s).`);}await open('dashboard');await open('active-stays');}else{notify(status==='COMPLETED'?'Request fulfilled; any chargeable amount was posted once.':'Request updated.');await open('service-requests')}await refreshRequestBadge()}catch(e){if(e.message.includes('no longer available')){notify('That room is no longer available. The guest’s room has not changed and the request remains unchanged awaiting approval. Refreshing the queue—choose another available room, then approve again.',true);await open('service-requests');await refreshRequestBadge();return}notify(e.message,true)} }

  async function changeTransferDestination(id, currentRequestedRoomId, currentRequestedRoomNumber) {
    try {
      const currentRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();
      if (!['manager', 'frontdesk'].includes(currentRole)) {
        return notify('Only managers and Front Desk may change a transfer destination.', true);
      }

      const roomData = await api('rooms', {}, 'GET');
      const availableRooms = (roomData.rooms || []).filter(room => room.status === 'AVAILABLE' && Number(room.id) !== Number(currentRequestedRoomId));
      if (!availableRooms.length) {
        notify('There are no available rooms to select. The transfer request remains pending.', true);
        await open('service-requests');
        return;
      }

      const dialog = modal('Choose Another Destination Room', `
        <form id="transfer-destination-form" class="row g-3">
          <div class="col-12"><div class="alert alert-info mb-0">Current requested destination: Room ${esc(currentRequestedRoomNumber || '—')}. Changing the destination does not move the guest; the new room must still be available when the transfer is approved.</div></div>
          <div class="col-12">
            <label class="form-label" for="transfer-destination-room">Available room</label>
            <select id="transfer-destination-room" name="to_room_id" class="form-select" required>
              ${availableRooms.map(room => `<option value="${Number(room.id)}">${esc(room.room_number)} · ${esc(room.type)} · ${php(room.nightly_rate)}/night (VAT-inclusive)</option>`).join('')}
            </select>
          </div>
          <div class="col-12 text-end"><button class="btn btn-primary" type="submit">Save destination</button></div>
        </form>`);

      dialog.root.querySelector('#transfer-destination-form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        try {
          const toRoomId = Number(new FormData(form).get('to_room_id'));
          const result = await api('request_transfer_destination', { request_id: id, to_room_id: toRoomId });
          dialog.m.hide();
          notify(`Destination changed to Room ${result.requested_room_number}. The transfer is still pending approval.`);
          await open('service-requests');
          await refreshRequestBadge();
        } catch (error) {
          submitButton.disabled = false;
          if (error.message.includes('no longer available')) {
            dialog.m.hide();
            notify('That room is no longer available. The guest’s room has not changed. Refresh the queue and choose another available room.', true);
            await open('service-requests');
            return;
          }
          notify(error.message, true);
        }
      });
    } catch (error) {
      notify(error.message, true);
    }
  }



  async function assignRequest(id, dept, notes='') {

    if(!id||!dept)return;

    try {

      const r = await api('request_assign', { request_id: id, department: dept, notes });

      notify(r.message || `Request assigned to ${dept}.`);

      await open('service-requests');

      await refreshRequestBadge();

    } catch(e) {

      notify(e.message, true);

    }

  }

  async function flagRequestSafety(id, reason) {
    try {
      const result = await api('request_safety_flag', { request_id: id, reason });
      notify(result.message || 'Urgent safety alert saved and Front Desk notified.');
      await open('service-requests');
      await refreshRequestBadge();
    } catch (e) {
      notify(e.message, true);
    }
  }


  async function handleRequestAction(id, action, selectEl) {

    if (!action) return;

    if (selectEl) selectEl.value = '';

    try {

      if (action.startsWith('ASSIGN:')) {

        const dept = action.split(':')[1];

        const notes = await window.HotelDialogs.input({

          title: `Assign to ${dept.toUpperCase()}`,

          text: `Route request #${id} to the ${dept} department.`,

          label: 'Optional routing note / instructions',

          placeholder: 'e.g. Please expedite'

        });

        if (notes === null) return;

        await assignRequest(id, dept, notes);

      } else if (action === 'CANCEL') {

        const confirmed = await window.HotelDialogs.confirm({

          title: `Cancel Request #${id}?`,

          text: 'Are you sure you want to cancel this request?',

          confirmButtonText: 'Cancel Request'

        });

        if (!confirmed) return;

        await requestStatus(id, 'CANCELLED');

      } else if (action === 'ON_HOLD') {

        const reason = await window.HotelDialogs.input({

          title: 'Put Request On Hold',

          text: 'Enter the reason for placing this request on hold:',

          label: 'Reason for Hold',
          placeholder: 'e.g. Waiting for guest confirmation / restocking supplies',
          required: true,
          validationMessage: 'A hold reason is required.'

        });

        if (!reason) return;

        await requestStatus(id, 'ON_HOLD', reason);

      } else if (action === 'REJECT') {

        const reason = await window.HotelDialogs.input({

          title: 'Reject Request',

          text: 'Enter the reason for rejecting this request:',

          label: 'Rejection Reason',
          placeholder: 'e.g. Item unavailable / Service hours ended',
          required: true,
          validationMessage: 'A rejection reason is required.'

        });

        if (!reason) return;

        await requestStatus(id, 'REJECTED', reason);

      } else if (action === 'COMPLETED') {

        const confirmed = await window.HotelDialogs.confirm({

          title: 'Complete & Fulfill Request?',

          text: `Mark request #${id} as completed? If chargeable, the amount will be posted once to the guest folio.`,

          confirmButtonText: 'Mark Completed'

        });

        if (!confirmed) return;

        await requestStatus(id, 'COMPLETED');

      } else if (action === 'FLAG_SAFETY') {

        const reason = await window.HotelDialogs.input({

          title: 'Flag Urgent Safety Issue',

          text: 'Describe the hazard or safety concern. Front Desk will be notified immediately.',

          label: 'Safety concern',
          placeholder: 'e.g. Exposed wiring near the room entrance',
          required: true,
          validationMessage: 'A safety concern description is required.'

        });

        if (!reason) return;

        await flagRequestSafety(id, reason);

      } else if (action === 'ACKNOWLEDGE') {

        await requestStatus(id, 'ACKNOWLEDGED');

      } else if (action === 'IN_PROGRESS') {

        await requestStatus(id, 'IN_PROGRESS');

      } else if (action === 'APPROVE_TRANSFER' || action === 'FINALIZE_TRANSFER') {

        await requestStatus(id, 'COMPLETED');

      } else if (action === 'CHANGE_DESTINATION') {

        await changeTransferDestination(id, selectEl?.dataset.requestedRoomId, selectEl?.dataset.requestedRoomNumber);

      } else if (action === 'HISTORY') {

        await viewHistory(id);

      }

    } catch(e) {

      notify(e.message, true);

    }

  }



  async function viewHistory(id) {

    try {

      const d = await api('request_history', { request_id: id }, 'GET');

      const hist = d.history || [];

      const rows = hist.map(h => {

        const fromBadge = h.from_status ? pill(h.from_status) : '<span class="text-muted small">None (Created)</span>';

        const toBadge = pill(h.to_status);

        const deptBadge = h.assigned_department ? `<span class="badge text-bg-light border">${esc(h.assigned_department)}</span>` : '—';

        return `<tr>

          <td><div class="small fw-semibold">${esc(h.created_at)}</div></td>

          <td><div class="d-flex align-items-center gap-1">${fromBadge} <i class="bi bi-arrow-right text-muted small"></i> ${toBadge}</div></td>

          <td>${deptBadge}</td>

          <td><strong>${esc(h.changed_by_username || 'Guest / Portal')}</strong> <span class="badge text-bg-secondary text-uppercase" style="font-size:10px;">${esc(h.changed_by_role || 'portal')}</span></td>

          <td class="small text-muted">${esc(h.notes || '—')}</td>

        </tr>`;

      }).join('');



      modal(`Request #${id} · Lifecycle & Audit History`, `

        <div class="mb-3 text-muted small">Complete timeline of status changes, department routing, and fulfillment logs for request #${id}.</div>

        ${table(['Timestamp', 'Status Change', 'Department', 'Action By', 'Notes / Reason'], rows, 'No history entries recorded yet.')}

      `);

    } catch (e) {

      notify(e.message, true);

    }

  }

  function savedGuestLinks(){

    const items=JSON.parse(localStorage.getItem('sheshDevGuestLinks')||'[]');

    const rows=items.map(x=>{

      const url = resolvePortalUrl(x.url);

      return `<tr><td><strong>${esc(x.stay)}</strong>${x.folio?`<div class="small text-muted">${esc(x.folio)}</div>`:''}</td><td><a href="${esc(url)}" target="_blank" rel="noopener">Open portal</a></td><td><button class="btn btn-sm btn-outline-dark me-1" data-show-qr="${esc(url)}" data-stay="${esc(x.stay)}" data-folio="${esc(x.folio||'')}"><i class="bi bi-qr-code me-1"></i>QR Code</button><button class="btn btn-sm btn-outline-secondary" data-copy-link="${esc(url)}">Copy</button></td></tr>`;

    }).join('');

    const x=modal('Saved guest portal links',table(['Stay reference','Portal link','Action'],rows,'No links saved in this browser.'));

    x.root.querySelectorAll('[data-copy-link]').forEach(b=>b.onclick=()=>navigator.clipboard.writeText(b.dataset.copyLink).then(()=>notify('Guest link copied')).catch(()=>notify('Copy the link from Open link manually.',true)));

    x.root.querySelectorAll('[data-show-qr]').forEach(b=>b.onclick=()=>{

      x.m.hide();

      showStayQr(b.dataset.stay, b.dataset.folio || 'N/A', b.dataset.showQr || '');

    });

  }

  function roomStayTitle(charge) {
    const desc = String(charge.description || '');
    if (charge.category === 'ROOM' && desc.startsWith('Accommodation')) {
      const qty = Number(charge.quantity) || 1;
      return `Room stay — ${qty} ${qty === 1 ? 'night' : 'nights'}`;
    }
    return desc;
  }

  async function folio(id) {

    try {

      window.HotelBilling.currentOpenFolioId = id;

      const d=await api('folio',{folio_id:id}), f=d.folio, open=f.status==='OPEN', money=php;

      const curRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const folioPermissions = window.HotelAuth.getUser()?.permissions || [];
      const folioCan = (permission, fallback) => folioPermissions.length
        ? (folioPermissions.includes('*') || folioPermissions.includes(permission))
        : fallback;
      const canTakePayment = folioCan('payments.process', ['admin', 'manager', 'cashier'].includes(curRole));

      const canCheckout = folioCan('stays.checkout', ['admin', 'frontdesk'].includes(curRole));

      const canAddCharge = folioCan('charges.create', ['admin', 'manager', 'cashier', 'frontdesk'].includes(curRole));

      const dateOnly=v=>String(v||'—').replace('T',' ').replace(/\s\d{2}:\d{2}:\d{2}.*/, '');



      const allCharges = d.charges || [];

      const roomCharges = allCharges.filter(c => (c.category||'').toUpperCase() === 'ROOM');

      const addCharges = allCharges.filter(c => (c.category||'').toUpperCase() !== 'ROOM');

      const roomTotal = roomCharges.reduce((s, c) => s + Number(c.amount||0), 0);

      const addTotal = addCharges.reduce((s, c) => s + Number(c.amount||0), 0);

      const discountTotal = Number(d.discount_total || 0);

      const vatAmount = Number(d.vat || 0);

      const vatableSales = Number(d.vatable_sales || 0);

      const vatExemptSales = Number(d.vat_exempt_sales || 0);

      const vatRate = Number(d.vat_rate || 12);

      const final = Number(d.grand_total ?? (Number(d.total)-discountTotal+vatAmount));

      const balanceDue = Number(d.balance || 0);

      const isSettled = balanceDue <= 0.009;



      const chargesHtml = allCharges.map(c => {

        const isRoom = (c.category||'').toUpperCase() === 'ROOM';

        return `<div class="folio-line">

          <div>

            <strong>${esc(roomStayTitle(c))}</strong>

            <span class="badge ${isRoom ? 'text-bg-light border' : 'text-bg-secondary'} ms-1" style="font-size:10px;">${esc(c.category || 'CHARGE')}</span>

            <div class="folio-line-note">${Number(c.quantity)} × ${money(c.unit_price)}</div>

          </div>

          <strong>${money(c.amount)}</strong>

        </div>`;

      }).join('') || '<div class="folio-empty">No charges have been posted.</div>';



      const payments=(d.payments||[]).map(p=>`<div class="folio-line"><div><strong>${esc(p.method)}</strong><div class="folio-line-note">Receipt ${esc(p.receipt_number)} · ${dateOnly(p.created_at)}</div></div><div class="text-end"><strong>${money(p.amount)}</strong></div></div>`).join('')||'<div class="folio-empty">No payments received yet.</div>';



      const discounts=(d.discounts||[]).map(z => {

        const who = z.applied_by_role

          ? `<span class="badge text-bg-light border text-uppercase ms-1" style="font-size:10px;">Applied by ${esc(z.applied_by_role)}${z.applied_by_username ? ` (${esc(z.applied_by_username)})` : ''}</span>`

          : '';

        return `<div class="folio-line"><div><strong>${esc(discountDisplayName(z))}</strong>${who}<div class="folio-line-note">${esc(z.status)}${z.reason ? ' · ' + esc(z.reason) : ''}</div></div><strong class="folio-positive">− ${money(z.amount)}</strong></div>`;

      }).join('');



      const x=modal('Folio statement',`<div class="folio-identity"><div><div class="folio-identity-label">Stay reference</div><div class="folio-identity-value">${esc(f.stay_code)} · Room ${esc(f.room_number)}${f.guest_name?` · Guest: ${esc(f.guest_name)}`:''}</div></div><div class="text-end"><div class="folio-identity-label">Bill status</div><div class="folio-identity-value">${esc(open?'Unsettled / Open':f.status)}</div></div></div>

      <div class="folio-sheet">

        <!-- Prominent Breakdown Cards -->

        <div class="row g-2 mb-3">

          <div class="col-6 col-md-4 col-lg-2">

            <div class="p-2 border rounded bg-white h-100">

              <div class="small text-muted" style="font-size:11px;">Room Charges</div>

              <div class="fw-bold text-dark fs-6">${money(roomTotal)}</div>

            </div>

          </div>

          <div class="col-6 col-md-4 col-lg-2">

            <div class="p-2 border rounded bg-white h-100">

              <div class="small text-muted" style="font-size:11px;">Additional Charges</div>

              <div class="fw-bold text-dark fs-6">${money(addTotal)}</div>

              <div class="text-muted" style="font-size:10px;">${addCharges.length} item(s)</div>

            </div>

          </div>

          <div class="col-6 col-md-4 col-lg-2">

            <div class="p-2 border rounded bg-white h-100">

              <div class="small text-muted" style="font-size:11px;">Discounts Applied</div>

              <div class="fw-bold text-success fs-6">− ${money(discountTotal)}</div>

              <div class="text-muted" style="font-size:10px;">${(d.discounts||[]).length} applied</div>

            </div>

          </div>

          <div class="col-6 col-md-4 col-lg-2">

            <div class="p-2 border rounded bg-white h-100">

              <div class="small text-muted" style="font-size:11px;">VAT (${vatRate}%)</div>

              <div class="fw-bold text-dark fs-6">${money(vatAmount)}</div>

            </div>

          </div>

          <div class="col-6 col-md-4 col-lg-2">

            <div class="p-2 border rounded bg-white h-100">

              <div class="small text-muted" style="font-size:11px;">Total Paid</div>

              <div class="fw-bold text-primary fs-6">${money(d.paid)}</div>

            </div>

          </div>

          <div class="col-6 col-md-4 col-lg-2">

            <div class="p-2 border rounded ${isSettled ? 'bg-success-subtle border-success' : 'bg-warning-subtle border-warning'} h-100">

              <div class="small text-muted" style="font-size:11px;">Balance Due</div>

              <div class="fw-bold ${isSettled ? 'text-success' : 'text-danger'} fs-6">${money(balanceDue)}</div>

              <div class="badge ${isSettled ? 'text-bg-success' : 'text-bg-warning text-dark'}" style="font-size:9.5px;">${isSettled ? 'Fully Settled' : 'Unsettled'}</div>

            </div>

          </div>

        </div>



        <section class="folio-section"><div class="folio-section-title">Stay & checkout details</div><div class="folio-card p-3"><div class="folio-dates"><div><div class="folio-meta-label">Check-in</div><div class="folio-meta-value">${dateOnly(f.checkin_at)}</div></div><div><div class="folio-meta-label">Scheduled checkout</div><div class="folio-meta-value">${dateOnly(f.planned_checkout)}</div></div></div></div></section>${(d.transfers && d.transfers.length) ? `<section class="folio-section"><div class="folio-section-title">Room transfers</div><div class="folio-card p-3">${d.transfers.map(t => `<div>${dateOnly(t.effective_date)}: Moved from Room ${esc(t.from_room_number)} to Room ${esc(t.to_room_number)} (rate ${money(Number(t.old_rate))} → ${money(Number(t.new_rate))})</div>`).join('')}</div></section>` : ''}

        <div class="folio-grid">

          <div>

            <section class="folio-section">

              <div class="folio-section-title">Bill breakdown</div>

              <div class="folio-card">

                ${chargesHtml}

                <div class="folio-totals">

                  <div class="folio-line"><span>Total charges</span><strong>${money(d.total)}</strong></div>

                  ${addTotal > 0 ? `<div class="folio-line text-muted"><span>  ↳ Additional incidental charges</span><strong>${money(addTotal)}</strong></div>` : ''}

                  ${discounts}

                  <div class="folio-line"><span>Charges before VAT</span><strong>${money(vatableSales)}</strong></div>
                  <div class="folio-line"><span>VAT (${vatRate}%) included</span><strong>${money(vatAmount)}</strong></div>
                  ${vatExemptSales > 0 ? `<div class="folio-line"><span>VAT-free charges</span><strong>${money(vatExemptSales)}</strong></div>` : ''}

                  <div class="folio-line folio-final"><span>Final bill (VAT included)</span><strong>${money(final)}</strong></div>

                  <div class="folio-line"><span>Payments made</span><strong>${money(d.paid)}</strong></div>

                  <div class="folio-line folio-final"><span>Balance due</span><strong class="${balanceDue > 0 ? 'text-danger' : 'folio-positive'}">${money(balanceDue)}</strong></div>

                </div>

              </div>

            </section>

          </div>

          <aside>

            <section class="folio-section"><div class="folio-section-title">Payment summary</div><div class="folio-card p-3"><div class="folio-meta-label">Total payments made</div><div class="folio-payment-total">${money(d.paid)}</div><hr><div class="folio-meta-label">Charges before VAT</div><div class="folio-meta-value">${money(vatableSales)}</div><div class="folio-meta-label mt-2">VAT included in total</div><div class="folio-meta-value">${money(vatAmount)}</div></div></section>

            <section class="folio-section"><div class="folio-section-title">Payment history</div><div class="folio-card">${payments}</div></section>

            <section class="folio-section">

              <div class="folio-section-title">Checkout settlement</div>

              <div class="folio-card folio-settlement">

                <div class="folio-line-note mb-2">The payment amount is validated against the VAT-inclusive final bill.</div>

                <div class="folio-line"><span>Final bill amount</span><strong>${money(final)}</strong></div>

                <div class="folio-line"><span>Payments made</span><strong>${money(d.paid)}</strong></div>

                <div class="folio-line"><span>Balance remaining</span><strong class="${balanceDue > 0 ? 'text-danger' : 'text-success'}">${money(balanceDue)}</strong></div>

                <div class="folio-actions">

                  ${open && canAddCharge ? '<button class="btn btn-outline-primary" id="add-charge"><i class="bi bi-plus-circle me-1"></i>Add charge</button>' : ''}

                  ${canTakePayment ? `<button class="btn btn-primary" id="take-payment" ${!open || isSettled ? 'disabled' : ''}><i class="bi bi-credit-card me-1"></i>${isSettled ? 'Balance Settled' : 'Settle Balance / Pay'}</button>` : ''}

                  ${canCheckout ? `<button class="btn ${isSettled ? 'btn-success' : 'btn-outline-secondary'}" id="folio-checkout-btn" ${!open ? 'disabled' : ''}><i class="bi bi-box-arrow-right me-1"></i>${isSettled ? 'Check-Out Guest' : 'Check-Out (Settle Balance First)'}</button>` : ''}

                  <button class="btn btn-outline-secondary" onclick="window.print()"><i class="bi bi-printer me-1"></i>Print bill</button>

                </div>

              </div>

            </section>

          </aside>

        </div>

      </div>`);



      x.root.classList.add('folio-modal');

      x.root.addEventListener('hidden.bs.modal',()=>{if(window.HotelBilling.currentOpenFolioId===id)window.HotelBilling.currentOpenFolioId=null;});

      x.root.querySelector('.modal-dialog').className='modal-dialog modal-dialog-centered modal-dialog-scrollable';

      x.root.querySelector('.modal-header').innerHTML=`<div><div class="folio-hotel">Shesh Dev Hotel</div><div class="folio-address">Agora, Lapasan, Cagayan de Oro</div></div><div class="d-flex align-items-center gap-2 ms-auto"><span class="folio-status">${esc(f.status)}</span><button class="btn-close ms-2" data-bs-dismiss="modal" aria-label="Close"></button></div>`;



      x.root.querySelector('#add-charge')?.addEventListener('click',()=>{x.m.hide();addCharge(id)});

      x.root.querySelector('#take-payment')?.addEventListener('click',()=>{x.m.hide();pay(id,Number(d.balance))});



      x.root.querySelector('#folio-checkout-btn')?.addEventListener('click', () => {

        if (!isSettled) {

          window.HotelDialogs.warning({

            title: 'Payment Not Settled',

            text: `Please settle the outstanding balance of ${money(balanceDue)} before checking out.`,

            confirmButtonText: 'Settle Balance Now'

          }).then(res => {

            if (res.isConfirmed) {

              x.m.hide();

              pay(id, balanceDue);

            }

          });

          return;

        }

        const folioModalClosed=new Promise(resolve=>x.root.addEventListener('hidden.bs.modal',resolve,{once:true}));
        x.m.hide();
        folioModalClosed.then(()=>checkout(f.stay_id));

      });



    }catch(e){notify(e.message,true)}

  }

  async function refreshDemoClockBanner() {
    const banner = $('demo-clock-banner');
    if (!banner) return;
    try {
      const state = await api('demo_clock_status', {}, 'GET');
      const topbarDate = $('topbar-date');
      if (topbarDate) topbarDate.textContent = `${state.hotel_now} (${state.timezone})`;
      if (!state.active) {
        banner.classList.add('d-none');
        return;
      }
      banner.textContent = `DEMO MODE ACTIVE — Simulated hotel time: ${state.hotel_now} (${state.timezone}). Check-in/checkout policies use this clock.`;
      banner.classList.remove('d-none');
    } catch (error) {
      banner.textContent = 'Hotel time status is unavailable. Confirm the active clock before processing check-in or checkout.';
      banner.classList.remove('d-none');
      console.error('Could not read the hotel demo clock status.', error);
    }
  }

  async function renderDemoClockAdmin() {
    const container = $('demo-clock-admin');
    if (!container) return;
    try {
      const state = await api('demo_clock_status', {}, 'GET');
      if (!state.available) {
        container.remove();
        return;
      }
      const value = String(state.simulated_at || state.hotel_now || '').replace(' ', 'T').slice(0, 16);
      container.innerHTML = `<div class="card border-warning shadow-sm mb-4"><div class="card-body"><div class="d-flex flex-wrap justify-content-between align-items-start gap-2"><div><h6 class="fw-bold mb-1">Demo Mode clock</h6><p class="text-muted mb-3">Development/demo server only. This shared simulated time affects hotel check-in and checkout policy decisions; payment processing remains on real server time.</p></div><span class="badge ${state.active ? 'text-bg-warning' : 'text-bg-secondary'}">${state.active ? 'SIMULATION ACTIVE' : 'USING REAL TIME'}</span></div><form id="demo-clock-form" class="row g-2 align-items-end"><div class="col-md-5"><label class="form-label" for="demo-clock-input">Simulated hotel date and time (${esc(state.timezone)})</label><input id="demo-clock-input" class="form-control" type="datetime-local" name="simulated_at" value="${esc(value)}" required></div><div class="col-auto"><button class="btn btn-warning" type="submit">Set simulated time</button></div><div class="col-auto"><button id="demo-clock-reset" class="btn btn-outline-secondary" type="button" ${state.active ? '' : 'disabled'}>Reset to real time</button></div></form><div class="small text-muted mt-2">Only administrators can change this clock. All signed-in staff see a banner while simulation is active.</div></div></div>`;
      const form = $('demo-clock-form');
      form.onsubmit = async event => {
        event.preventDefault();
        try {
          await api('demo_clock_set', { simulated_at: form.elements.simulated_at.value });
          notify('Demo clock updated.');
          await Promise.all([renderDemoClockAdmin(), refreshDemoClockBanner()]);
        } catch (error) {
          notify(error.message, true);
        }
      };
      $('demo-clock-reset').onclick = async () => {
        try {
          await api('demo_clock_reset', {});
          notify('Demo clock reset to real hotel time.');
          await Promise.all([renderDemoClockAdmin(), refreshDemoClockBanner()]);
        } catch (error) {
          notify(error.message, true);
        }
      };
    } catch (error) {
      container.innerHTML = `<div class="alert alert-danger">Demo clock status could not be loaded: ${esc(error.message)}</div>`;
    }
  }

  window.HotelBilling={api,open,getActiveModule:()=>activeModule,notify,refreshRequestBadge,checkin,bookAdditionalRoom,guestDetails,approveCheckinPayment,approveGroupCheckinPayment,confirmCheckinPayment,cancelPendingCheckin,renderWalkinCheckin,renderCheckoutDashboard,renderEarlyCheckoutRequests,selectRoomForWalkin:(roomId)=>{const sel=document.getElementById('wkd-room-id');if(sel){sel.value=String(roomId);sel.dispatchEvent(new Event('change'));sel.scrollIntoView({behavior:'smooth',block:'center'});sel.focus();}},folio,addCharge,pay,earlyCheckout,decideEarlyCheckout,finalizeEarlyCheckout,decideStayExtension,editEarlyPolicy,editDiscountPolicy,deleteDiscountPolicy,transfer,checkout,roomStatus,requestStatus,assignRequest,handleRequestAction,viewHistory,addRoom,editRoom,addRoomType,editRoomType,addMenuItem,editMenuItem,toggleMenuItem,reportDetails,savedGuestLinks,showCheckinComplete,showStayQr,showReceiptModal,showCheckoutReceipts,viewCheckoutReceipt,refreshChatBadge};

  document.addEventListener('hotel:authenticated',(event)=>{

    const uRole = (event.detail?.user?.role || '').toLowerCase();

    const isDeptStaff = ['service','housekeeping','maintenance','bar','restaurant','valet','parking','parkingvalet','parking_valet','laundry','other'].includes(uRole);

    if (!window.HotelModulesHelper) {

      open(isDeptStaff ? 'service-requests' : 'dashboard');

    }

    refreshDemoClockBanner();

    if (window.hotelDemoClockTimer) clearInterval(window.hotelDemoClockTimer);

    window.hotelDemoClockTimer=setInterval(refreshDemoClockBanner,15000);

    refreshRequestBadge();

    if(window.hotelRequestBadgeTimer)clearInterval(window.hotelRequestBadgeTimer);

    window.hotelRequestBadgeTimer=setInterval(refreshRequestBadge,30000);

    refreshChatBadge();

    if(window.hotelChatBadgeTimer)clearInterval(window.hotelChatBadgeTimer);

    window.hotelChatBadgeTimer=setInterval(refreshChatBadge,30000);

  });

  function initializeWalkin() {

    $('walkin-form')?.addEventListener('submit',e=>e.preventDefault());

    $('btn-confirm-walkin')?.addEventListener('click',()=>{

      const room=Number($('wi-selected-room-id')?.value),guests=Number($('wi-num-guests')?.value||1),checkout=$('wi-expected-checkout')?.value;

      if(!room||!checkout)return notify('Select a room and checkout date.',true);

      const nights=Math.max(1,Math.ceil((new Date(checkout)-new Date())/86400000));

      const firstName=$('wi-first-name')?.value?.trim()||'';

      const lastName=$('wi-last-name')?.value?.trim()||'';

      const contact=$('wi-contact')?.value?.trim()||'';

      const email=$('wi-email')?.value?.trim()||'';

      if(!firstName||!lastName)return notify('Guest first and last name are required.',true);

      api('checkin',{room_id:room,guests,nights,first_name:firstName,last_name:lastName,contact_number:contact,email:email}).then(r=>{

        bootstrap.Modal.getInstance($('walkInModal'))?.hide();

        notify(`Check-in saved. Stay ${r.stay_code}; folio ${r.folio_number}. Send the guest to the Cashier to settle ${php(r.required_amount||0)}.`);

        open('active-stays');

        showCheckinComplete(r);

      }).catch(e=>notify(e.message,true));

    });

    $('search-master')?.addEventListener('input',()=>{const q=$('search-master').value.toLowerCase();document.querySelectorAll('#master-table-body tr').forEach(r=>r.classList.toggle('d-none',!r.textContent.toLowerCase().includes(q)))});

    $('btn-add-master')?.classList.add('d-none');



    // Hook up responsive mobile sidebar controls

    const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');

    const closeSidebarBtn = document.getElementById('btn-close-sidebar');

    const sidebarCol = document.getElementById('sidebar-col');

    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    toggleSidebarBtn?.addEventListener('click', () => {

      sidebarCol?.classList.toggle('show');

      sidebarBackdrop?.classList.toggle('show');

    });

    closeSidebarBtn?.addEventListener('click', () => {

      sidebarCol?.classList.remove('show');

      sidebarBackdrop?.classList.remove('show');

    });

    sidebarBackdrop?.addEventListener('click', () => {

      sidebarCol?.classList.remove('show');

      sidebarBackdrop?.classList.remove('show');

    });



    initScrollTopHelper();

  }



  function initScrollTopHelper() {

    let btn = document.getElementById('btn-scroll-top');

    if (!btn) {

      btn = document.createElement('button');

      btn.id = 'btn-scroll-top';

      btn.className = 'scroll-top-btn no-print';

      btn.type = 'button';

      btn.setAttribute('aria-label', 'Scroll to top');

      btn.setAttribute('title', 'Scroll to top');

      btn.innerHTML = '<i class="bi bi-arrow-up"></i>';

      document.body.appendChild(btn);

    }



    const checkScroll = () => {

      const winScrolled = window.scrollY > 180 || document.documentElement.scrollTop > 180;

      const modalBody = document.querySelector('.modal.show .modal-body, .modal.show');

      const modalScrolled = modalBody && modalBody.scrollTop > 180;

      if (winScrolled || modalScrolled) {

        btn.classList.add('visible');

      } else {

        btn.classList.remove('visible');

      }

    };



    window.addEventListener('scroll', checkScroll, { passive: true });

    document.addEventListener('scroll', checkScroll, { passive: true, capture: true });



    btn.addEventListener('click', () => {

      const modalBody = document.querySelector('.modal.show .modal-body');

      if (modalBody && modalBody.scrollTop > 0) {

        modalBody.scrollTo({ top: 0, behavior: 'smooth' });

      }

      const modalDialog = document.querySelector('.modal.show');

      if (modalDialog && modalDialog.scrollTop > 0) {

        modalDialog.scrollTo({ top: 0, behavior: 'smooth' });

      }

      window.scrollTo({ top: 0, behavior: 'smooth' });

      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });

      document.body.scrollTo({ top: 0, behavior: 'smooth' });

    });

  }



  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initializeWalkin,{once:true}); else initializeWalkin();

})();
