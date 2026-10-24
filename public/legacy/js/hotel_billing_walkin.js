/* Operations controller: retains the uploaded Bootstrap dashboard and connects it to the privacy-first stay/folio API. */

(() => {

  const $ = id => document.getElementById(id);

  const api = (...args) => window.HotelAuth.request(...args);

  let activeModule = 'dashboard', rooms = [], stays = [], selectedRoom = null;

  const php = n => '₱' + Number(n || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});

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

    const map={'dashboard':'panel-dashboard','walkin-checkin':'panel-walkin-checkin','active-stays':'panel-active-stays','checkout':'panel-checkout','early-checkout-requests':'panel-early-checkout-requests','rooms':'panel-rooms','catalog':'panel-catalog','transactions':'panel-transactions','billing':'panel-billing','payments':'panel-payments','service-requests':'panel-service-requests','early-checkouts':'panel-early-checkouts','reports':'panel-reports','audit-logs':'panel-audit-logs','users':'panel-users','discount-approvals':'panel-discount-approvals','settings':'panel-settings','dept-reports':'panel-dept-reports','dept-inventory':'panel-dept-inventory'};

    document.querySelectorAll('.panel-section').forEach(p=>p.classList.remove('active'));

    let target=$(map[id]);

    if (!target && id==='walkin-checkin') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="walkin-checkin-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

    if (!target && id==='checkout') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="checkout-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

    if (!target && id==='early-checkout-requests') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="early-checkout-requests-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

    if (!target && id==='service-requests') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="service-requests-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); } if (!target && id==='early-checkouts') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="early-checkouts-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); } if (!target && id==='users') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="users-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); } if (!target && id==='discount-approvals') { target=document.createElement('div'); target.id=map[id]; target.className='panel-section'; target.innerHTML='<div id="discount-approvals-content"></div>'; $('panel-settings')?.parentElement?.appendChild(target); }

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

  async function render(id) {

    if (id==='dashboard') {

      const d=await api('dashboard',{},'GET'); const counts=d.rooms||{}; await refreshRequestBadge();

      const curUserRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const roleKey = curUserRole.replace(/[\s_-]/g,'');

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

      const canCheckin = canPerm('stays.checkin') ?? (isFrontdesk || isManager || isAdmin);

      const canRequests = canPerm('service_requests.view') ?? true;

      const canReports = canPerm('reports.financial.view') ?? canViewFinancialSummary;

      const deptLabels = {restaurant:'Restaurant',bar:'Bar',housekeeping:'Housekeeping',laundry:'Laundry',maintenance:'Maintenance',valet:'Valet & Parking',parking:'Valet & Parking',parkingvalet:'Valet & Parking',service:'Room Service',foodbeverage:'Food & Beverage',minibar:'Minibar',other:'Service'};

      const statCard = (x)=>`<div class="col-6 col-md-4 col-xxl-3"><div class="card border-0 shadow-sm h-100 dashboard-stat"><div class="card-body p-2 p-sm-3 d-flex align-items-center gap-2 gap-sm-3"><div class="dashboard-stat-icon text-${x[2]}"><i class="bi bi-${x[3]}"></i></div><div class="min-w-0 flex-grow-1"><div class="text-muted small text-truncate dashboard-stat-label">${x[0]}</div><div class="dashboard-stat-value text-${x[2]} ${String(x[1]).includes('₱')?'is-currency':''}" title="${esc(String(x[1]))}">${x[1]}</div></div></div></div></div>`;

      const statsRow = (stats)=>`<div class="row g-2 g-sm-3 mb-4">${stats.map(statCard).join('')}</div>`;

      const moduleBtn = (module,label,icon,cls='btn-outline-secondary')=>{

        if (window.HotelModulesHelper && !window.HotelModulesHelper.isAllowed(curUserRole,module)) return '';

        return `<button class="btn ${cls} btn-sm" onclick="HotelBilling.open('${module}')"><i class="bi bi-${icon} me-1"></i>${label}</button>`;

      };



      if (['restaurant', 'foodbeverage', 'food'].includes(roleKey)) {

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

          ['Completed today',dep.completed_today||0,'success','check2-circle'],

          ['All open requests',d.pending_requests||0,'dark','list-task']

        ];

        const isFoodOrBar = ['restaurant', 'food_beverage', 'bar', 'minibar'].includes(roleKey);

        let roomsCard='';

        if (Array.isArray(dep.rooms_attention) && !isFoodOrBar) {

          const rowsHtml=dep.rooms_attention.map(r=>`<tr><td class="fw-semibold">${esc(r.room_number)}</td><td>${esc(r.type||'')}</td><td><span class="badge ${r.status==='CLEANING'?'text-bg-warning text-dark':'text-bg-secondary'}">${esc(r.status)}</span></td></tr>`).join('');

          roomsCard=`<div class="card border-0 shadow-sm mb-3"><div class="card-body"><h6 class="fw-bold mb-3"><i class="bi bi-door-open me-2"></i>Rooms needing attention</h6>${dep.rooms_attention.length?`<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Room</th><th>Type</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`:'<div class="text-muted small">No rooms in cleaning or maintenance right now.</div>'}</div></div>`;

        }

        const catalogBtnLabel = roleKey.includes('bar') ? "Bar Drinks Menu" : "Food & Drink Menu";

        const catalogBtnIcon = roleKey.includes('bar') ? "cup-straw" : "cup-hot";



        const actions=[

          `<button class="btn btn-success fw-semibold" onclick="HotelDeptManager.openCreateOrderModal('${roleKey.includes('bar') ? 'bar' : roleKey}')"><i class="bi bi-cart-plus me-1"></i>Take New Order</button>`,

          moduleBtn("service-requests", `${deptName} Queue`, "bell", "btn-primary"),

          isFoodOrBar ? moduleBtn("catalog", catalogBtnLabel, catalogBtnIcon, "btn-outline-dark") : null,

          moduleBtn("dept-reports", "Reports & Analytics", "graph-up-arrow", "btn-outline-primary"),

          moduleBtn("dept-inventory", "Inventory & Stocks", "boxes", "btn-outline-secondary"),

          isFoodOrBar ? `<button class="btn btn-outline-secondary fw-semibold" onclick="HotelDeptManager.openAddCategoryModal('${roleKey.includes('bar') ? 'bar' : 'restaurant'}')"><i class="bi bi-tag me-1"></i>+ Category</button>` : null,

          isFoodOrBar ? `<button class="btn btn-outline-secondary fw-semibold" onclick="HotelDeptManager.openAddProductModal('${roleKey.includes('bar') ? 'bar' : 'restaurant'}')"><i class="bi bi-plus-circle me-1"></i>+ Menu Item</button>` : null,

          !isFoodOrBar ? moduleBtn("rooms", "Room Board", "door-open") : null

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

          ['Occupied rooms', counts.OCCUPIED||0, 'primary', 'building']

        ] : [

          ['Active stays', d.active_stays||0, 'dark', 'people'],

          ['Occupied rooms', counts.OCCUPIED||0, 'primary', 'building'],

          ['Available rooms', counts.AVAILABLE||0, 'success', 'door-open'],

          ['Cleaning', counts.CLEANING||0, 'warning', 'stars']

        ];

        if (d.billing_summary && canFinancial) {

          stats.push(['Payments today', d.billing_summary.payments_today||0, 'info', 'receipt']);

          stats.push(['Folios with balance', d.billing_summary.unpaid_folio_count||0, 'warning', 'journal-text']);

          if (d.billing_summary.checkin_payments_pending) stats.push(['Check-ins for payment', d.billing_summary.checkin_payments_pending, 'danger', 'hourglass-split']);

        }

      } else {

        stats=[['Available rooms',counts.AVAILABLE||0,'success','door-open'],['Occupied rooms',counts.OCCUPIED||0,'primary','building'],['Cleaning',counts.CLEANING||0,'warning','stars'],['Maintenance',counts.MAINTENANCE||0,'secondary','tools'],['Active stays',d.active_stays||0,'dark','people'],['Open balance',php(d.open_balance),'danger','wallet2'],['Open requests',d.pending_requests||0,(d.pending_requests||0)?'danger':'success','bell'],["Today's collections",php(d.today_collections),'success','cash-coin']];

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

          ('discounts' in a) ? approvalRow('Discount approvals', a.discounts, 'discount-approvals', 'percent') : '',

          ('early_checkouts' in a) ? approvalRow('Early checkout approvals', a.early_checkouts, 'early-checkouts', 'clock-history') : '',

          ('refunds' in a) ? approvalRow('Refund approvals', a.refunds, 'payments', 'arrow-counterclockwise') : ''

        ].join('');

        approvalsCard=`<div class="card border-0 shadow-sm mb-3"><div class="card-body"><h6 class="fw-bold mb-1"><i class="bi bi-check2-square me-2"></i>Approvals inbox</h6><div class="text-muted small mb-2">${a.total||0} item(s) waiting for a decision</div>${rowsHtml}</div></div>`;

      }



      // Cashier check-in payment approvals queue card

      let checkinPaymentsCard = '';

      if (isCashier || canFinancial) {

        let cpList = d.billing_summary?.pending_checkins;

        if (!cpList || !Array.isArray(cpList)) {

          try {

            const cpd = await api('checkin_payments', {}, 'GET');

            cpList = (cpd.checkin_payments || []).filter(x => x.status === 'FOR_PAYMENT');

          } catch (_) { cpList = []; }

        }

        if (cpList && cpList.length > 0) {

          checkinPaymentsCard = `

            <div class="card border-0 shadow-sm mb-4 border-start border-4 border-warning">

              <div class="card-header bg-warning-subtle py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">

                <div class="d-flex align-items-center gap-2">

                  <span class="spinner-grow spinner-grow-sm text-warning" role="status"></span>

                  <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-bell-fill text-warning me-2"></i>Front Desk Check-in Payments · Awaiting Cashier Approval (${cpList.length})</h6>

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

                        <th class="text-end pe-3">Action</th>

                      </tr>

                    </thead>

                    <tbody>

                      ${cpList.map(cp => {
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

                          <td class="text-end pe-3">

                            <div class="d-inline-flex gap-1">

                              <button class="btn btn-sm btn-success fw-bold shadow-sm px-3 py-2" onclick="HotelBilling.approveCheckinPayment(${cp.id || cp.checkin_payment_id})">

                                <i class="bi bi-cash-stack me-1"></i>Receive &amp; Approve

                              </button>

                              <button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.cancelPendingCheckin(${cp.stay_id}, '${esc(cp.stay_code)}')">

                                <i class="bi bi-x-circle me-1"></i>Cancel

                              </button>

                            </div>

                          </td>

                        </tr>

                      `;}).join('')}

                    </tbody>

                  </table>

                </div>

              </div>

            </div>

          `;

        } else if (isCashier) {

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

                <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.open('payments')">

                  <i class="bi bi-clock-history me-1"></i>View Collections History

                </button>

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

        billingCard=`<div class="row g-3 mb-3"><div class="col-lg-6"><div class="card border-0 shadow-sm h-100"><div class="card-body"><h6 class="fw-bold mb-3"><i class="bi bi-cash-coin me-2"></i>Today's collections by method</h6>${methodRows?`<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Method</th><th class="text-end">Payments</th><th class="text-end">Total</th></tr></thead><tbody>${methodRows}</tbody></table></div>`:'<div class="text-muted small">No payments collected yet today.</div>'}</div></div></div><div class="col-lg-6"><div class="card border-0 shadow-sm h-100"><div class="card-body"><h6 class="fw-bold mb-3"><i class="bi bi-journal-text me-2"></i>Folios with balance</h6>${unpaidRows?`<div class="table-responsive"><table class="table table-sm align-middle mb-0"><tbody>${unpaidRows}</tbody></table></div><div class="text-muted small mt-2">${b.unpaid_folio_count||0} open folio(s) with balance · ${b.refunds_pending||0} refund request(s) pending</div>`:'<div class="text-muted small">All open folios are settled.</div>'}</div></div></div></div>`;

      }



      let quickActions;

      if (isCashier) {

        quickActions = `

          <button class="btn btn-primary btn-sm" onclick="HotelBilling.open('active-stays')"><i class="bi bi-people me-1"></i>Active Stays &amp; Billing</button>

          <button class="btn btn-outline-primary btn-sm" onclick="HotelBilling.open('payments')"><i class="bi bi-cash-coin me-1"></i>Payments &amp; Collections</button>

        `;

      } else {

        const moduleAllowed = mid => !window.HotelModulesHelper || window.HotelModulesHelper.isAllowed(curUserRole, mid);

        const reportsShortcut = (canReports && moduleAllowed('reports')) ? `<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('reports')"><i class="bi bi-bar-chart me-1"></i>Reports</button>` : '';

        const walkinBtn = canCheckin

          ? `<button class="btn btn-primary btn-sm" onclick="HotelBilling.checkin()"><i class="bi bi-person-plus me-1"></i>Walk-in Check-in</button>`

          : '';

        const roomBoardBtn = moduleAllowed('rooms')

          ? `<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('rooms')"><i class="bi bi-door-open me-1"></i>Room Board</button>`

          : '';

        const staysBtn = moduleAllowed('active-stays')

          ? `<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('active-stays')"><i class="bi bi-people me-1"></i>Active Stays</button>`

          : '';

        const guestLinksBtn = moduleAllowed('active-stays')

          ? `<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.savedGuestLinks()"><i class="bi bi-qr-code me-1"></i>Guest Links</button>`

          : '';

        const earlyCheckoutBtn = (isFrontdesk || isAdmin || isManager)

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

      $('dashboard-content').innerHTML=statsRow(stats)+checkinPaymentsCard+approvalsCard+billingCard+fdNoticeCard+requestBanner+`<div class="d-flex flex-wrap gap-2 mb-3">${quickActions}</div><div class="alert alert-light border"><strong>Shesh Dev Hotel Billing &amp; Guest Management.</strong> Operations and role actions are strictly tailored to your role. All active dashboard buttons are fully functional.</div>`;

    } else if (id==='rooms') {

      const d=await api('rooms',{},'GET'); rooms=d.rooms||[];

      const uRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const canManageRooms = ['admin','manager','frontdesk'].includes(uRole);

      const canAddRoom = ['admin','manager'].includes(uRole);

      const isMaintenance = (uRole === 'maintenance');

      const topActions = canManageRooms

        ? `<div class="d-flex flex-wrap gap-2"><button class="btn btn-outline-primary btn-sm" onclick="HotelBilling.addRoomType()"><i class="bi bi-tag me-1"></i>Add Room Category</button>${canAddRoom ? '<button class="btn btn-primary btn-sm" onclick="HotelBilling.addRoom()"><i class="bi bi-plus-lg me-1"></i>Add Room</button>' : ''}${uRole !== 'cashier' ? '<button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.checkin()"><i class="bi bi-person-plus me-1"></i>Check-in</button>' : ''}</div>`

        : isMaintenance

          ? `<div class="d-flex align-items-center gap-2"><span class="badge text-bg-warning py-2 px-3"><i class="bi bi-tools me-1"></i>Maintenance Monitor Mode</span></div>`

          : `<div class="d-flex align-items-center gap-2"><span class="badge text-bg-light border text-muted py-2 px-3"><i class="bi bi-eye me-1"></i>View Only Mode</span></div>`;



      const maintenanceBanner = isMaintenance

        ? `<div class="alert alert-info py-2 px-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2"><span class="fw-semibold"><i class="bi bi-tools me-2"></i>Maintenance Monitor Mode — Displaying current room inventory and maintenance statuses. You may update room status between Maintenance and Available. Management and billing controls remain restricted.</span><span class="badge text-bg-warning">${rooms.filter(r=>r.status==='MAINTENANCE').length} under maintenance</span></div>`

        : '';



      $('rooms-content').innerHTML=`${maintenanceBanner}<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><p class="text-muted mb-0">Room status board · rates come from room types</p>${topActions}</div><div class="row g-2 g-md-3">${rooms.map(r=>`<div class="col-12 col-sm-6 col-md-4 col-xl-3"><div class="card border-0 shadow-sm h-100 ${r.status==='MAINTENANCE'?'border-warning':''}"><div class="card-body p-3"><div class="d-flex justify-content-between align-items-start"><h5 class="fw-bold mb-1">${esc(r.room_number)}</h5>${pill(r.status)}</div><div class="text-muted small">${esc(r.type)} · Floor ${r.floor_number}</div><div class="fw-semibold mt-2">${php(r.nightly_rate)} <span class="text-muted small">/ night</span></div><div class="text-muted small">Capacity ${r.capacity}</div>${canAddRoom?`<button class="btn btn-sm btn-outline-primary mt-2" onclick="HotelBilling.editRoom(${r.id})">Edit room</button>`:''}${r.status!=='OCCUPIED' && (canManageRooms || isMaintenance)?`<div class="mt-3"><select class="form-select form-select-sm" onchange="HotelBilling.roomStatus(${r.id},this.value)"><option value="">Change status…</option><option value="AVAILABLE">Available</option><option value="CLEANING">Cleaning</option><option value="MAINTENANCE">Maintenance / Unavailable</option></select></div>`:''}</div></div></div>`).join('')}</div>`;

    } else if (id==='active-stays' || id==='transactions' || id==='billing') {

      const d=await api('active_stays',{},'GET'); stays=d.stays||[];

      const curRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const isCashier = (curRole === 'cashier');

      const isManager = (curRole === 'manager');

      let pendingStays=[];

      let confirmRows=[];

      if (id==='active-stays') {

        try { const pd=await api('pending_checkins',{},'GET'); pendingStays=pd.stays||[]; } catch(_) {}

        try { const cd=await api('checkin_payments',{},'GET'); confirmRows=(cd.checkin_payments||[]).filter(x=>x.status==='APPROVED' && !x.confirmed_at); } catch(_) {}

      }

      const confirmHtml = confirmRows.length ? `<div class="card border-info shadow-sm mb-4"><div class="card-header bg-info-subtle py-3 d-flex justify-content-between align-items-center flex-wrap gap-2"><h6 class="fw-bold mb-0"><i class="bi bi-patch-check me-2"></i>Payments to Confirm (${confirmRows.length})</h6><span class="small text-muted">The Cashier approved these check-in payments. Confirm to close the loop — the Cashier gets a pop-up.</span></div><div class="card-body p-0"><div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Stay / Guest</th><th>Room</th><th>Receipt</th><th>Approved by</th><th>Action</th></tr></thead><tbody>${confirmRows.map(x=>`<tr><td><strong>${esc(x.stay_code)}</strong>${x.guest_name?`<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(x.guest_name)}</div>`:''}</td><td><strong>${esc(x.room_number)}</strong></td><td>${esc(x.receipt_number||'')}</td><td>Cashier ${esc(x.approved_by_name||'')}</td><td><button class="btn btn-sm btn-info" onclick="HotelBilling.confirmCheckinPayment(${x.id})"><i class="bi bi-patch-check me-1"></i>Confirm Payment</button></td></tr>`).join('')}</tbody></table></div></div></div>` : '';

      const pendingHtml = pendingStays.length ? `<div class="card border-warning shadow-sm mb-4"><div class="card-header bg-warning-subtle py-3 d-flex justify-content-between align-items-center flex-wrap gap-2"><h6 class="fw-bold mb-0"><i class="bi bi-hourglass-split me-2"></i>Pending Check-in Payments (${pendingStays.length})</h6><span class="small text-muted">${isCashier ? 'Receive guest payment and approve to confirm check-in.' : 'Waiting for Cashier approval — the check-in completes once payment is approved.'}</span></div><div class="card-body p-0"><div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead class="table-light"><tr><th>Stay / Guest</th><th>Room &amp; Duration</th><th>Total Billing</th><th>Discount</th><th>Net Bill</th><th>Due at Check-in</th><th>Pass to Balance</th><th>Action</th></tr></thead><tbody>${pendingStays.map(s=>{
        const sNights = Number(s.payment_nights || 1);
        const sIs5Days = sNights >= 5;
        const sGross = Number(s.gross_amount) > 0 ? Number(s.gross_amount) : (Number(s.total_amount || 0) + Number(s.discount_amount || 0));
        const sDisc = Number(s.discount_amount || 0);
        const sBal = sIs5Days ? (Number(s.balance_amount) || Math.max(0, Number(s.total_amount || 0) - Number(s.required_amount || 0))) : 0;
        return `<tr><td><strong>${esc(s.stay_code)}</strong>${s.guest_name?`<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>`:''}<div class="small text-muted">${esc(s.folio_number)}</div></td><td><strong>${esc(s.room_number)}</strong><div class="small text-muted">${sNights} night(s)</div><span class="badge ${sIs5Days ? 'text-bg-warning text-dark' : 'text-bg-light border text-muted'}" style="font-size:10px;">${sIs5Days ? '5+ Days' : 'Short Stay'}</span></td><td>${php(sGross)}</td><td>${sDisc > 0 ? `<span class="badge text-bg-success">-${php(sDisc)}</span>` : '<span class="text-muted">None</span>'}</td><td>${php(s.total_amount||0)}</td><td><strong>${php(s.required_amount||0)}</strong><div class="small text-muted">${sIs5Days?'60% downpayment':'100% full'}</div></td><td>${sIs5Days ? `<strong class="text-danger">${php(sBal)}</strong><div class="badge bg-danger-subtle text-danger" style="font-size:9.5px;">Passes to Folio</div>` : '<span class="text-muted small">₱0.00</span>'}</td><td><div class="d-flex gap-1">${(isCashier || true) && s.checkin_payment_id ? `<button class="btn btn-sm btn-success fw-bold" onclick="HotelBilling.approveCheckinPayment(${s.checkin_payment_id})"><i class="bi bi-cash-stack me-1"></i>Approve Payment</button>` : ''}<button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.cancelPendingCheckin(${s.id},'${esc(s.stay_code)}')"><i class="bi bi-x-circle me-1"></i>Cancel</button></div></td></tr>`;
      }).join('')}</tbody></table></div></div></div>` : '';



      const renderStayActions = (s, isMobile = false) => {

        if (isCashier) {

          const bal = Number(s.balance_due ?? (Number(s.charges_total) - Number(s.paid_total)));

          const isSettled = s.is_settled ?? (bal <= 0.009);

          return `

            <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})" title="View Folio &amp; Billing"><i class="bi bi-receipt me-1"></i>Billing</button>

            <button class="btn btn-sm btn-primary" onclick="HotelBilling.pay(${s.folio_id}, ${bal})" ${isSettled ? 'disabled' : ''} title="Record Payment / Settle"><i class="bi bi-credit-card me-1"></i>${isSettled ? 'Settled' : 'Settle &amp; Pay'}</button>

            <button class="btn btn-sm ${isSettled ? 'btn-success' : 'btn-outline-secondary'}" onclick="HotelBilling.checkout(${s.id})" title="${isSettled ? '1-click Check-Out' : 'Make sure billing is settled before checkout'}"><i class="bi bi-box-arrow-right me-1"></i>Checkout</button>

          `;

        }

        if (isManager) {

          return `

            <button class="btn btn-sm btn-outline-dark" onclick="HotelBilling.showStayQr('${esc(s.stay_code)}','${esc(s.folio_number)}')"><i class="bi bi-qr-code me-1"></i>${isMobile ? 'QR' : 'QR Pass'}</button>

            <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})">Folio</button>

            <button class="btn btn-sm btn-outline-info" onclick="HotelBilling.guestDetails(${s.id})"><i class="bi bi-person-lines-fill me-1"></i>${isMobile ? 'Guest' : 'Guest details'}</button>

            <button class="btn btn-sm btn-outline-secondary" onclick="HotelBilling.transfer(${s.id})">Transfer</button>

          `;

        }

        return `

          <button class="btn btn-sm btn-outline-dark" onclick="HotelBilling.showStayQr('${esc(s.stay_code)}','${esc(s.folio_number)}')"><i class="bi bi-qr-code me-1"></i>${isMobile ? 'QR' : 'QR Pass'}</button>

          <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})">Folio</button>

          <button class="btn btn-sm btn-outline-info" onclick="HotelBilling.guestDetails(${s.id})"><i class="bi bi-person-lines-fill me-1"></i>${isMobile ? 'Guest' : 'Guest details'}</button>

          <button class="btn btn-sm btn-outline-secondary" onclick="HotelBilling.transfer(${s.id})">Transfer</button>

          <button class="btn btn-sm btn-outline-warning" onclick="HotelBilling.earlyCheckout(${s.id})">${isMobile ? 'Early' : 'Early checkout'}</button>

          <button class="btn btn-sm btn-outline-success" onclick="HotelBilling.checkout(${s.id})"><i class="bi bi-box-arrow-right me-1"></i>Checkout</button>

        `;

      };



      let tableHeaders;

      let rows;

      if (isCashier) {

        tableHeaders = ['Stay / Guest', 'Room', 'Room Charges', 'Additional Charges', 'VAT (12%)', 'Total Paid', 'Balance Due', 'Settlement Status', 'Actions'];

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

            </td>

            <td><strong>Room ${esc(s.room_number)}</strong><div class="small text-muted">${s.guest_count} guest(s)</div></td>

            <td>${php(roomChg)}</td>

            <td>${Number(addChg) > 0 ? `<strong class="text-dark">${php(addChg)}</strong>` : '<span class="text-muted">₱0.00</span>'}</td>

            <td>${php(vatChg)}</td>

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

        tableHeaders = ['Stay / Folio reference','Room','Guests','Check-in','Planned checkout','Balance','Actions'];

        rows = stays.map(s=>`<tr><td><strong>${esc(s.stay_code)}</strong>${s.guest_name?`<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>`:''}<div class="small text-muted">${esc(s.folio_number)}</div></td><td>${esc(s.room_number)}</td><td>${s.guest_count}</td><td>${esc(s.checkin_at)}</td><td>${esc(s.planned_checkout)}</td><td>${php(Number(s.charges_total)-Number(s.paid_total))}</td><td><div class="d-flex flex-wrap gap-1">${renderStayActions(s, false)}</div></td></tr>`).join('');

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

          ${isCashier ? `

            <div class="row g-2 mb-2 small text-muted">

              <div class="col-6">Room Charges: <strong class="text-dark">${php(s.room_charges ?? s.charges_total)}</strong></div>

              <div class="col-6 text-end">Additional: <strong class="text-dark">${php(s.additional_charges ?? '0.00')}</strong></div>

              <div class="col-6">VAT (12%): <strong class="text-dark">${php(s.vat_total ?? '0.00')}</strong></div>

              <div class="col-6 text-end">Total Paid: <strong class="text-dark">${php(s.paid_total)}</strong></div>

              <div class="col-12 text-end pt-1">Balance Due: <strong class="${(Number(s.balance_due ?? (Number(s.charges_total)-Number(s.paid_total)))) > 0.009 ? 'text-danger' : 'text-success'} fs-6">${php(s.balance_due ?? (Number(s.charges_total)-Number(s.paid_total)))}</strong></div>

            </div>

          ` : `

            <div class="row g-2 mb-2 small text-muted">

              <div class="col-6">Guests: <strong class="text-dark">${s.guest_count}</strong></div>

              <div class="col-6 text-end">Balance: <strong class="text-danger">${php(Number(s.charges_total)-Number(s.paid_total))}</strong></div>

              <div class="col-6">In: <strong class="text-dark">${esc(s.checkin_at)}</strong></div>

              <div class="col-6 text-end">Out: <strong class="text-dark">${esc(s.planned_checkout)}</strong></div>

            </div>

          `}

          <div class="d-flex flex-wrap gap-1 pt-2 border-top">

            ${renderStayActions(s, true)}

          </div>

        </div>

      `).join('') || '<div class="card border-0 shadow-sm p-4 text-center text-muted">No active stays.</div>';

      const dest=id==='active-stays'?'active-stays-content':id==='transactions'?'all-transactions-content':'billing-content';

      $(dest).innerHTML=`${pendingHtml}${confirmHtml}<div class="d-flex justify-content-between align-items-center mb-3"><p class="text-muted mb-0">${stays.length} active stay(s)</p>${!isCashier ? '<button class="btn btn-primary btn-sm" onclick="HotelBilling.checkin()">＋ Walk-in Check-in</button>' : ''}</div>

      <div class="d-none d-md-block">${table(tableHeaders,rows,'No active stays.')}</div>

      <div class="d-md-none">${mobileStayCards}</div>`;

    } else if (id==='payments') {

      const [d,h,rf,st,cpd]=await Promise.all([

        api('reports',{},'GET'),

        api('payment_history',{},'GET'),

        api('refund_list',{},'GET'),

        api('active_stays',{},'GET'),

        api('checkin_payments',{},'GET').catch(()=>({checkin_payments:[]}))

      ]);



      const cpRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const cpIsCashier = (cpRole === 'cashier');

      const cpAll = cpd.checkin_payments || [];

      const cpPending = cpAll.filter(x=>x.status==='FOR_PAYMENT');

      const cpDone = cpAll.filter(x=>x.status!=='FOR_PAYMENT').slice(0,5);

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

        <td>${withApprove ? (cpIsCashier ? `<button class="btn btn-sm btn-success fw-bold" onclick="HotelBilling.approveCheckinPayment(${x.id})"><i class="bi bi-cash-stack me-1"></i>Approve</button>` : '<span class="small text-muted">Cashier approval only</span>') : ''}</td>

      </tr>`;
      };

      const cpQueue = `<div class="card border-0 shadow-sm mb-4">

        <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">

          <div>

            <h6 class="fw-bold mb-0"><i class="bi bi-cash-register me-2 text-success"></i>Check-in Payments · For Payment Queue</h6>

            <div class="small text-muted">New walk-in check-ins saved by Front Desk appear here in real time. Only the Cashier can approve a payment; approval confirms the guest's check-in.</div>

          </div>

          ${cpPending.length?`<span class="badge text-bg-warning text-dark">${cpPending.length} waiting</span>`:'<span class="badge text-bg-success">Queue clear</span>'}

        </div>

        <div class="card-body p-0">

          <div class="d-none d-md-block">${table(['Stay / Guest','Room & Duration','Total Billing','Discount','Net Bill','Required at check-in','Pass to Balance','Status','Action'], cpPending.map(x=>cpRow(x,true)).join('') + cpDone.map(x=>cpRow(x,false)).join(''), 'No check-in payments yet.')}</div>

          <div class="d-md-none p-2">${cpPending.map(x=>{
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
              ${cpIsCashier?`<button class="btn btn-success btn-sm mt-2 w-100 fw-bold" onclick="HotelBilling.approveCheckinPayment(${x.id})"><i class="bi bi-cash-stack me-1"></i>Approve Payment</button>`:'<div class="small text-muted mt-1">Cashier approval only</div>'}
            </div>`;
          }).join('') || '<div class="text-center text-muted p-3">No check-in payments waiting.</div>'}</div>

        </div>

      </div>`;



      const inHouse = st.stays || [];

      const readyForCheckoutCount = inHouse.filter(s => (s.is_settled ?? ((Number(s.balance_due ?? (Number(s.charges_total)-Number(s.paid_total)))) <= 0.009))).length;

      const unsettledCount = inHouse.length - readyForCheckoutCount;



      const inHouseRows = inHouse.map(s => {

        const bal = Number(s.balance_due ?? (Number(s.charges_total) - Number(s.paid_total)));

        const isSettled = s.is_settled ?? (bal <= 0.009);

        const statusBadge = isSettled

          ? '<span class="badge text-bg-success"><i class="bi bi-check-circle me-1"></i>Settled · Ready</span>'

          : `<span class="badge text-bg-warning text-dark"><i class="bi bi-exclamation-circle me-1"></i>Balance Due: ${php(bal)}</span>`;



        return `<tr>

          <td>

            <strong>${esc(s.stay_code)}</strong>

            <div class="small text-muted">Folio ${esc(s.folio_number)}</div>

            ${s.guest_name ? `<div class="fw-semibold text-primary" style="font-size:12.5px;"><i class="bi bi-person me-1"></i>${esc(s.guest_name)}</div>` : ''}

          </td>

          <td><strong>Room ${esc(s.room_number)}</strong><div class="small text-muted">${s.guest_count} guest(s)</div></td>

          <td>

            <div>Charges: ${php(s.charges_total)}</div>

            ${Number(s.discount_total || 0) > 0 ? `<div class="small text-success">Discount: − ${php(s.discount_total)}</div>` : ''}

            ${Number(s.vat_total || 0) > 0 ? `<div class="small text-muted">VAT: ${php(s.vat_total)}</div>` : ''}

          </td>

          <td><strong>${php(s.paid_total)}</strong></td>

          <td><strong class="${bal > 0.009 ? 'text-danger' : 'text-success'} fs-6">${php(bal)}</strong></td>

          <td>${statusBadge}</td>

          <td>

            <div class="d-flex flex-wrap gap-1">

              <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})" title="View billing statement"><i class="bi bi-receipt me-1"></i>Billing</button>

              <button class="btn btn-sm btn-primary" onclick="HotelBilling.pay(${s.folio_id}, ${bal})" ${isSettled ? 'disabled' : ''} title="Record payment"><i class="bi bi-credit-card me-1"></i>${isSettled ? 'Settled' : 'Payment'}</button>

              <button class="btn btn-sm ${isSettled ? 'btn-success' : 'btn-outline-secondary'}" onclick="HotelBilling.checkout(${s.id})" title="${isSettled ? 'Finalize checkout' : 'Make sure payment is settled before checkout'}"><i class="bi bi-box-arrow-right me-1"></i>Checkout</button>

            </div>

          </td>

        </tr>`;

      }).join('');



      const mobileInHouseCards = inHouse.map(s => {

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

              <div class="col-6">Total Paid: <strong class="text-dark">${php(s.paid_total)}</strong></div>

              <div class="col-6 text-end">Balance: <strong class="${bal > 0.009 ? 'text-danger' : 'text-success'}">${php(bal)}</strong></div>

            </div>

            <div class="d-flex justify-content-between align-items-center pt-2 border-top">

              <div>${isSettled ? '<span class="badge text-bg-success">Settled · Ready</span>' : '<span class="badge text-bg-warning text-dark">Balance Due</span>'}</div>

              <div class="d-flex gap-1">

                <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${s.folio_id})">Billing</button>

                <button class="btn btn-sm btn-primary" onclick="HotelBilling.pay(${s.folio_id}, ${bal})" ${isSettled ? 'disabled' : ''}>Payment</button>

                <button class="btn btn-sm ${isSettled ? 'btn-success' : 'btn-outline-secondary'}" onclick="HotelBilling.checkout(${s.id})">Checkout</button>

              </div>

            </div>

          </div>

        `;

      }).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No active in-house stays.</div>';



      const rows=(d.daily_payments||[]).map(r=>`<tr><td><button class="btn btn-sm btn-link" onclick="HotelBilling.reportDetails('${esc(r.day)}')">${esc(r.day)}</button></td><td>${r.payments_count}</td><td>${php(r.revenue)}</td></tr>`).join('');

      const history=(h.payments||[]).map(t=>`<tr><td>${esc(t.created_at)}</td><td><strong>${esc(t.receipt_number)}</strong></td><td>${esc(t.stay_code)}<div class="small text-muted">${esc(t.folio_number)}</div></td><td>${esc(t.room_number)}</td><td>${esc(t.method)}</td><td>${php(t.amount)}</td><td><span class="badge text-bg-success">${esc(t.folio_status==='PAID'?'PAID / COMPLETED':t.folio_status)}</span></td><td><div class="d-flex gap-1"><button class="btn btn-sm btn-outline-dark" onclick="HotelBilling.showReceiptModal('${esc(t.receipt_number)}')"><i class="bi bi-printer me-1"></i>Receipt</button><button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${t.folio_id})"><i class="bi bi-receipt me-1"></i>Folio</button></div></td></tr>`).join('');

      const refundRows=(rf.refunds||[]).map(r=>{const acts=r.status==='REQUESTED'?`<button class="btn btn-sm btn-success me-1" onclick="HotelBilling.updateRefund(${r.id},'APPROVED')">Approve</button><button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.updateRefund(${r.id},'REJECTED')">Reject</button>`:r.status==='APPROVED'?`<button class="btn btn-sm btn-primary" onclick="HotelBilling.updateRefund(${r.id},'PROCESSING')">Start processing</button>`:r.status==='PROCESSING'?`<button class="btn btn-sm btn-success me-1" onclick="HotelBilling.updateRefund(${r.id},'COMPLETED')">Confirm issued</button><button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.updateRefund(${r.id},'FAILED')">Mark failed</button>`:r.status==='FAILED'?`<button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.updateRefund(${r.id},'PROCESSING')">Retry processing</button>`:'—';return `<tr><td><strong>${esc(r.refund_number)}</strong><div class="small text-muted">${esc(r.created_at)}</div></td><td>${esc(r.stay_code)} / ${esc(r.room_number)}</td><td>${esc(r.receipt_number)} · ${esc(r.original_payment_method)}</td><td>${php(r.amount)}</td><td>${esc(r.reason)}</td><td>${pill(r.status)}</td><td>${acts}</td></tr>`}).join('');



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



      const mobileRefundCards = (rf.refunds||[]).map(r=>{

        const acts=r.status==='REQUESTED'?`<button class="btn btn-sm btn-success flex-fill" onclick="HotelBilling.updateRefund(${r.id},'APPROVED')">Approve</button><button class="btn btn-sm btn-outline-danger flex-fill" onclick="HotelBilling.updateRefund(${r.id},'REJECTED')">Reject</button>`:r.status==='APPROVED'?`<button class="btn btn-sm btn-primary w-100" onclick="HotelBilling.updateRefund(${r.id},'PROCESSING')">Start processing</button>`:r.status==='PROCESSING'?`<button class="btn btn-sm btn-success flex-fill" onclick="HotelBilling.updateRefund(${r.id},'COMPLETED')">Confirm issued</button><button class="btn btn-sm btn-outline-danger flex-fill" onclick="HotelBilling.updateRefund(${r.id},'FAILED')">Mark failed</button>`:r.status==='FAILED'?`<button class="btn btn-sm btn-outline-primary w-100" onclick="HotelBilling.updateRefund(${r.id},'PROCESSING')">Retry processing</button>`:'—';

        return `

          <div class="card border-0 shadow-sm p-3 mb-2">

            <div class="d-flex justify-content-between align-items-start mb-2">

              <div>

                <span class="fw-bold fs-6">${esc(r.refund_number)}</span>

                <div class="small text-muted">${esc(r.created_at)}</div>

              </div>

              ${pill(r.status)}

            </div>

            <div class="row g-2 mb-2 small text-muted">

              <div class="col-6">Stay / Room: <strong class="text-dark">${esc(r.stay_code)} / ${esc(r.room_number)}</strong></div>

              <div class="col-6 text-end">Amount: <strong class="text-danger fs-6">${php(r.amount)}</strong></div>

              <div class="col-12">Original payment: <strong class="text-dark">${esc(r.receipt_number)} · ${esc(r.original_payment_method)}</strong></div>

            </div>

            <div class="p-2 bg-light rounded small mb-2 text-muted">Reason: <span class="text-dark">${esc(r.reason)}</span></div>

            ${acts !== '—' ? `<div class="pt-2 border-top d-flex gap-2">${acts}</div>` : ''}

          </div>

        `;

      }).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No refund requests.</div>';



      $('payments-content').innerHTML=`

      <div class="alert alert-light border mb-4"><strong>Shesh Dev Hotel</strong><br>Agora, Lapasan, Cagayan de Oro</div>



      ${cpQueue}



      <!-- In-House Stays & Checkout Settlement Section -->

      <div class="card border-0 shadow-sm mb-4">

        <div class="card-header bg-white py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">

          <div>

            <h6 class="fw-bold mb-0"><i class="bi bi-people-fill me-2 text-primary"></i>In-House Stays &amp; Checkout Settlement</h6>

            <div class="small text-muted">Review billing, settle balances, and process guest checkout. Make sure payment is settled before checking out.</div>

          </div>

          <div class="d-flex gap-2">

            <span class="badge text-bg-success">${readyForCheckoutCount} Settled (Ready)</span>

            ${unsettledCount > 0 ? `<span class="badge text-bg-warning text-dark">${unsettledCount} Balance Due</span>` : ''}

          </div>

        </div>

        <div class="card-body p-0">

          <div class="d-none d-md-block">${table(['Stay / Folio reference','Room','Charges &amp; Extras','Total Paid','Balance Due','Settlement Status','Actions'],inHouseRows,'No active in-house stays.')}</div>

          <div class="d-md-none p-2">${mobileInHouseCards}</div>

        </div>

      </div>



      <h6 class="fw-bold mb-3">Daily payments · last 30 days</h6>

      <p class="small text-muted">Click a date to inspect the underlying transactions.</p>

      <div class="d-none d-md-block">${table(['Date','Payment count','Collected'],rows,'No payments recorded in the last 30 days.')}</div>

      <div class="d-md-none">${mobileDailyCards}</div>

      <h6 class="fw-bold mt-4 mb-3">Recent payment records</h6>

      <div class="d-none d-md-block">${table(['Date / Time','Receipt','Stay / Folio','Room','Method','Amount','Status','Actions'],history,'No payment records yet.')}</div>

      <div class="d-md-none">${mobileHistoryCards}</div>

      <h6 class="fw-bold mt-4 mb-3">Refund approval and processing</h6>

      <div class="d-none d-md-block">${table(['Refund','Stay / Room','Original payment','Amount','Reason','Status','Actions'],refundRows,'No refund requests.')}</div>

      <div class="d-md-none">${mobileRefundCards}</div>

      <p class="small text-muted mt-2">A refund is marked completed only after staff confirms issuance and enters a transaction or cash-voucher reference.</p>`;

    } else if (id==='service-requests') {

      const d=await api('requests',{},'GET'); markRequestsViewed(d.requests||[]);

      const curRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const isSupervisory = ['admin','manager','frontdesk'].includes(curRole);

      const isFrontdesk = (curRole === 'frontdesk');



      const deptTitles = {

        restaurant: 'Restaurant & Food Fulfillment',

        food_beverage: 'Restaurant & Food Fulfillment',

        bar: 'Bar & Drinks Fulfillment',

        housekeeping: 'Housekeeping & Linens Fulfillment',

        laundry: 'Laundry Fulfillment',

        maintenance: 'Maintenance & Repairs Fulfillment',

        valet: 'Valet & Parking Assistance',

        parking: 'Valet & Parking Assistance',

        parkingvalet: 'Valet & Parking Assistance',

        parking_valet: 'Valet & Parking Assistance',

        service: 'General Service Concierge',

        other: 'General Service Concierge'

      };



      const deptBanner = deptTitles[curRole]

        ? `<div class="alert alert-primary py-2 px-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2"><div><span class="fw-bold me-2">${deptTitles[curRole]}</span><span class="small text-muted">Assigned department queue. Receive, acknowledge, update progress, and fulfill orders.</span></div><span class="badge text-bg-primary">${(d.requests||[]).length} active</span></div>`

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

        let opts = [`<option value="">Actions…</option>`];



        if (curRole === 'frontdesk') {

          opts.push(`<option value="HISTORY">View History</option>`);

          return `<select class="form-select form-select-sm" onchange="HotelBilling.handleRequestAction(${rid},this.value,this)">${opts.join('')}</select>`;

        }



        if (isSupervisory) {

          if (!['COMPLETED','CANCELLED','REJECTED'].includes(st)) {

            opts.push(`<optgroup label="Route / Assign Department">`);

            opts.push(`<option value="ASSIGN:restaurant">Assign Restaurant</option>`);

            opts.push(`<option value="ASSIGN:bar">Assign Bar</option>`);

            opts.push(`<option value="ASSIGN:housekeeping">Assign Housekeeping</option>`);

            opts.push(`<option value="ASSIGN:laundry">Assign Laundry</option>`);

            opts.push(`<option value="ASSIGN:maintenance">Assign Maintenance</option>`);

            opts.push(`<option value="ASSIGN:valet">Assign Valet</option>`);

            opts.push(`<option value="ASSIGN:service">Assign Service</option>`);

            opts.push(`</optgroup>`);



            if (r.request_kind === 'ROOM_TRANSFER' && st !== 'IN_PROGRESS') {

              opts.push(`<option value="ACCEPT_TRANSFER">Approve Room Transfer</option>`);

            }

            opts.push(`<option value="CANCEL">Cancel Request</option>`);

          }

          opts.push(`<option value="HISTORY">View History</option>`);

        } else {

          if (st === 'PENDING' || st === 'ASSIGNED') {

            opts.push(`<option value="ACKNOWLEDGE">Acknowledge</option>`);

            opts.push(`<option value="IN_PROGRESS">Start Work</option>`);

            opts.push(`<option value="ON_HOLD">Put On Hold</option>`);

            opts.push(`<option value="REJECT">Reject Order</option>`);

          } else if (st === 'ACKNOWLEDGED') {

            opts.push(`<option value="IN_PROGRESS">Start Work</option>`);

            opts.push(`<option value="ON_HOLD">Put On Hold</option>`);

            opts.push(`<option value="COMPLETED">Complete / Fulfill</option>`);

            opts.push(`<option value="REJECT">Reject Order</option>`);

          } else if (st === 'IN_PROGRESS') {

            opts.push(`<option value="COMPLETED">Complete / Fulfill</option>`);

            opts.push(`<option value="ON_HOLD">Put On Hold</option>`);

          } else if (st === 'ON_HOLD') {

            opts.push(`<option value="IN_PROGRESS">Resume Work</option>`);

            opts.push(`<option value="COMPLETED">Complete / Fulfill</option>`);

          }

          opts.push(`<option value="HISTORY">View History</option>`);

        }



        return `<select class="form-select form-select-sm" onchange="HotelBilling.handleRequestAction(${rid},this.value,this)">${opts.join('')}</select>`;

      };



      const rows=(d.requests||[]).map(r=>`<tr><td><strong>${esc(r.request_code)}</strong><div class="small text-muted">${esc(r.stay_code)}</div></td><td><strong>${esc(r.room_number)}</strong>${r.guest_name?`<div class="small text-primary" style="font-size:12px;"><i class="bi bi-person me-1"></i>${esc(r.guest_name)}</div>`:''}</td><td>${deptBadge(r.assigned_department||r.service_type)}</td><td>${r.request_kind==='ROOM_TRANSFER'?`<strong>Transfer requested to Room ${esc(r.requested_room_number||'—')}</strong><div class="small text-muted">${esc(r.description)}</div>`:esc(r.description)}${r.on_hold_reason?`<div class="small text-warning mt-1"><i class="bi bi-pause-circle me-1"></i>Hold note: ${esc(r.on_hold_reason)}</div>`:''}${r.rejection_reason?`<div class="small text-muted mt-1"><i class="bi bi-x-circle me-1"></i>Rejection: ${esc(r.rejection_reason)}</div>`:''}</td><td>${r.chargeable?php(r.price):'<span class="text-muted small">No charge</span>'}</td><td>${pill(r.status)}</td><td>${renderRowActions(r)}</td></tr>`).join('');



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

            <div>${deptBadge(r.assigned_department||r.service_type)}</div>

          </div>

          <div class="p-2 bg-light rounded small mb-2">

            ${r.request_kind==='ROOM_TRANSFER'?`<strong>Transfer requested to Room ${esc(r.requested_room_number||'—')}</strong><div class="small text-muted">${esc(r.description)}</div>`:esc(r.description)}

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

      `).join('') || '<div class="card border-0 shadow-sm p-4 text-center text-muted">No service requests for your department.</div>';



      $('service-requests-content').innerHTML=`${deptBanner}

      <div class="d-none d-md-block">${table(['Request / Stay','Room','Department','Request Details','Charge','Status','Action'],rows,'No service requests for your department.')}</div>

      <div class="d-md-none">${mobileCards}</div>`;

    } else if (id==='catalog') {

      const [td,md,rd]=await Promise.all([api('room_types',{},'GET'),api('service_catalog',{},'GET'),api('rooms',{},'GET')]);

      const curRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();

      const isSuper = ['admin', 'manager'].includes(curRole);

      const isBarStaff = ['bar', 'minibar'].includes(curRole);

      const isRestStaff = ['restaurant', 'food_beverage'].includes(curRole);

      const types=td.types||[], items=md.items||[], allRooms=rd.rooms||[];

      const typeRows=types.map(t=>`<tr><td><strong>${esc(t.name)}</strong></td><td>${php(t.nightly_rate)}/night</td><td>${t.capacity}</td><td>${allRooms.filter(r=>Number(r.room_type_id)===Number(t.id)||r.type===t.name).length}</td><td><button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.editRoomType(${Number(t.id)})">Edit</button></td></tr>`).join('');

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

            <span class="badge text-bg-primary fs-6">${php(t.nightly_rate)} / night</span>

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

      `).join('') || '<div class="card border-0 shadow-sm p-3 text-center text-muted">No menu items configured.</div>';



      $('catalog-content').innerHTML=`<div class="d-flex flex-wrap gap-2 mb-3"><button class="btn btn-primary btn-sm" onclick="HotelBilling.addRoomType()"><i class="bi bi-plus-lg me-1"></i>Add Room Type</button>${['admin','manager'].includes(curRole) ? '<button class="btn btn-outline-primary btn-sm" onclick="HotelBilling.addRoom()"><i class="bi bi-plus-lg me-1"></i>Add Room</button>' : ''}<button class="btn btn-outline-primary btn-sm" onclick="HotelBilling.addMenuItem()"><i class="bi bi-plus-lg me-1"></i>Add Menu Item</button></div>

      <div class="card border-0 shadow-sm mb-4"><div class="card-header bg-white fw-bold">Room Types & Nightly Prices</div>

        <div class="d-none d-md-block">${table(['Room type','Nightly price','Capacity','Rooms','Action'],typeRows,'No room types configured.')}</div>

        <div class="d-md-none p-2">${mobileTypeCards}</div>

      </div>

      <div class="card border-0 shadow-sm"><div class="card-header bg-white fw-bold">Priced Service Menu</div><div class="p-3 small text-muted">Manage selectable items for Food & Beverage, Housekeeping, General Services, Laundry, Minibar, and Other. Prices are applied by the server when a menu item is selected.</div>

        <div class="d-none d-md-block">${table(['Item','Category','Description','Price','Status','Action'],menuRows,'No menu items configured.')}</div>

        <div class="d-md-none p-2">${mobileMenuCards}</div>

      </div>`;

    } else if (id==='reports') {

      const d=await api('reports',{},'GET');

      const rows=(d.daily_payments||[]).map(r=>`<tr><td><button class="btn btn-sm btn-link" onclick="HotelBilling.reportDetails('${esc(r.day)}')">${esc(r.day)}</button></td><td>${r.payments_count}</td><td>${php(r.revenue)}</td></tr>`).join('');

      const b=d.billing_summary||{};

      const catRows=(b.additional_charges_by_category||[]).map(c=>`<tr><td>${esc(c.category)}</td><td>${c.charges_count}</td><td>${php(c.amount)}</td></tr>`).join('');



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

      <div class="row g-2 g-sm-3 mb-3">${[['Finalized early checkouts',b.early_checkout_count||0],['Early-checkout charges',php(b.early_checkout_charges||0)],['Refunds pending approval',b.refunds_pending_approval||0],['Refunds completed',b.refunds_completed||0],['Refunds rejected',b.refunds_rejected||0],['Refunds failed',b.refunds_failed||0],['Refunds issued · 30 days',php(b.refunds_issued_30d||0)]].map(x=>`<div class="col-6 col-lg-3"><div class="card border-0 shadow-sm h-100"><div class="card-body p-2 p-sm-3"><div class="small text-muted dashboard-stat-label">${x[0]}</div><div class="dashboard-stat-value ${String(x[1]).includes('₱')?'is-currency':''}">${x[1]}</div></div></div></div>`).join('')}</div>

      <div class="card border-0 shadow-sm mb-3"><div class="card-body"><h6 class="fw-bold">Collections report · last 30 days</h6><p class="small text-muted">Click a date to inspect the underlying transactions.</p>

        <div class="d-none d-md-block">${table(['Date','Payments','Collected'],rows,'No payment activity.')}</div>

        <div class="d-md-none">${mobileReportCards}</div>

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

    } else if (id==='settings') {

      const u=window.HotelAuth.getUser(); $('settings-content').innerHTML=`<div class="card border-0 shadow-sm mb-4"><div class="card-body"><h6 class="fw-bold">Account & system settings</h6><p>Signed in as <strong>${esc(u?.username)}</strong> (${esc(u?.role)}).</p><p>Hotel billing stores stay and folio references, not a guest directory. The guest portal token is private and should be shared directly with the guest.</p><hr><form id="pw-form" class="row g-3"><div class="col-md-4"><label class="form-label">Current password</label><input class="form-control" name="old_password" type="password" required></div><div class="col-md-4"><label class="form-label">New password (minimum 6 characters)</label><input class="form-control" name="new_password" type="password" minlength="6" required></div><div class="col-md-4 d-flex align-items-end"><button class="btn btn-primary">Change Password</button></div></form></div></div><div id="policy-admin"><div class="text-muted p-3">Loading policy lookups…</div></div>`; $('pw-form').onsubmit=async e=>{e.preventDefault();try{await api('change_password',Object.fromEntries(new FormData(e.target)));notify('Password updated.');e.target.reset()}catch(err){notify(err.message,true)}}; if(u?.role==='admin') await renderPolicyAdmin(); else $('policy-admin').textContent='Policy configuration is managed by an administrator.';

    }

  }

  function modal(title, html) { const root=document.createElement('div'); root.className='modal fade'; root.tabIndex=-1; root.innerHTML=`<div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content"><div class="modal-header d-flex justify-content-between align-items-center"><h5 class="modal-title mb-0">${title}</h5><button class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body">${html}</div></div></div>`; document.body.appendChild(root); const m=new bootstrap.Modal(root); root.addEventListener('hidden.bs.modal',()=>root.remove()); m.show(); return {root,m}; }

  const knownLanIp = '192.168.254.177'; // configured via .env HOTEL_SERVER_IP



  function resolvePortalUrl(guestPortalUrl) {

    const activeHost =

      location.hostname && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)

        ? location.hostname

        : knownLanIp;

    const activePort = location.port ? `:${location.port}` : '';

    const activeProtocol = location.protocol && location.protocol.startsWith('http') ? location.protocol : 'http:';

    const activeOrigin = `${activeProtocol}//${activeHost}${activePort}`;



    let urlStr = String(guestPortalUrl || '').trim();

    if (!urlStr) return `${activeOrigin}/portal.php`;



    // Replace any localhost or previous LAN IP (e.g., 192.168.0.14) with current active IP

    urlStr = urlStr.replace(/^https?:\/\/[^\/]+/, activeOrigin);



    try {

      const u = new URL(urlStr, activeOrigin);

      u.hostname = activeHost;

      if (location.port) u.port = location.port;

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

          <div class="d-inline-flex align-items-center gap-1 text-success fw-bold mb-1">

            <i class="bi bi-check-circle-fill fs-5"></i>

            <span class="fs-6">Check-In Successful</span>

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



        ${Number(r.required_amount)>0?`<div class="alert alert-warning mx-auto text-start" style="max-width: 380px;"><strong><i class="bi bi-cash-register me-1"></i>Next step — Cashier payment:</strong><br>${Number(r.discount_amount)>0?`Front Desk discount: <strong>${php(r.discount_amount)}</strong><br>Discounted total: <strong>${php(r.total_amount)}</strong><br>`:''}The guest settles <strong>${php(r.required_amount)}</strong> (${Number(r.required_percent)===60?'60% downpayment':'100% full payment'} of ${php(r.total_amount)}) at the Cashier. This check-in is <strong>confirmed only after the Cashier approves the payment</strong> — Front Desk and the guest portal update automatically.</div>`:''}



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



  function showStayQr(stayCode, folioNumber) {

    const saved = JSON.parse(localStorage.getItem('sheshDevGuestLinks') || '[]');

    const match = saved.find(x => x.stay === stayCode);

    const portalUrl = match && match.url ? match.url : `/portal.php?code=${encodeURIComponent(stayCode)}`;

    showCheckinComplete({

      stay_code: stayCode,

      folio_number: folioNumber || (match && match.folio) || 'N/A',

      guest_portal_url: portalUrl

    });

  }



  async function checkin() {
    try {
      const d = await api('rooms', {}, 'GET');
      rooms = (d.rooms || []).filter(r => r.status === 'AVAILABLE');
      if (!rooms.length) return notify('No available rooms.', true);

      const firstRoom = rooms[0];

      const modalHtml = `
        <form id="new-checkin" class="row g-3">
          <div class="col-12">
            <div class="alert alert-light border py-2 mb-0 small text-muted">
              Guest <strong>first and last name are required</strong>. All discounts (Senior, PWD, Promo, Other) and stay duration policies are calculated automatically by the Front Desk before forwarding to the Cashier.
            </div>
          </div>

          <div class="col-md-6">
            <label class="form-label fw-semibold">First name <span class="text-danger">*</span></label>
            <input class="form-control" type="text" name="first_name" maxlength="100" placeholder="e.g. Juan" required autofocus>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">Last name <span class="text-danger">*</span></label>
            <input class="form-control" type="text" name="last_name" maxlength="100" placeholder="e.g. Dela Cruz" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">Contact number <span class="text-muted">(Optional)</span></label>
            <input class="form-control" type="tel" name="contact_number" maxlength="30" placeholder="e.g. 0917 123 4567">
          </div>
          <div class="col-md-6">
            <label class="form-label">Email <span class="text-muted">(Optional)</span></label>
            <input class="form-control" type="email" name="email" maxlength="150" placeholder="e.g. juan@example.com">
          </div>

          <!-- Room & Stay Details -->
          <div class="col-md-6">
            <label class="form-label fw-semibold">Available Room <span class="text-danger">*</span></label>
            <select class="form-select" name="room_id" id="ck-room-id" required>
              ${rooms.map(r => `<option value="${r.id}" data-rate="${r.nightly_rate}" data-capacity="${r.capacity}" data-num="${esc(r.room_number)}" data-type="${esc(r.type)}">${esc(r.room_number)} · ${esc(r.type)} · ${php(r.nightly_rate)}/night (cap: ${r.capacity})</option>`).join('')}
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

          <!-- Discount Section with Dropdown & Automatic Calculation -->
          <div class="col-12 pt-2 border-top">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <label class="form-label fw-bold text-dark mb-0">
                <i class="bi bi-tag-fill text-primary me-1"></i>Apply Discount (Front Desk)
              </label>
              <span class="badge text-bg-light border text-muted" style="font-size:11px;">Auto-calculated on bill</span>
            </div>
            <div class="row g-2">
              <div class="col-md-6">
                <label class="form-label small text-muted">Discount Type / Policy</label>
                <select class="form-select fw-semibold" name="discount_dropdown" id="ck-discount-dropdown">
                  <option value="NONE" selected>❌ No Discount (Standard Rate)</option>
                  <option value="SENIOR_CITIZEN">👴 Senior Citizen (20% Statutory Discount - RA 9994)</option>
                  <option value="PWD">♿ Person with Disability / PWD (20% Statutory Discount - RA 10754)</option>
                  <option value="PROMO_10">🏷️ Room Promotion (10% Off)</option>
                  <option value="OTHER_PERCENT">🔢 Other: Custom Percentage (%)</option>
                  <option value="OTHER_FIXED">💵 Other: Custom Fixed Amount (₱)</option>
                </select>
              </div>

              <!-- Dynamic custom percent input -->
              <div class="col-md-6 d-none" id="ck-custom-pct-box">
                <label class="form-label small text-muted">Discount Percentage (%)</label>
                <div class="input-group">
                  <input class="form-control" type="number" id="ck-custom-pct-val" min="1" max="90" step="1" value="15" placeholder="e.g. 15">
                  <span class="input-group-text">%</span>
                </div>
              </div>

              <!-- Dynamic custom fixed input -->
              <div class="col-md-6 d-none" id="ck-custom-fixed-box">
                <label class="form-label small text-muted">Discount Amount (PHP)</label>
                <div class="input-group">
                  <span class="input-group-text">₱</span>
                  <input class="form-control" type="number" id="ck-custom-fixed-val" min="1" step="0.01" value="500" placeholder="e.g. 500">
                </div>
              </div>

              <!-- Dynamic Reference / ID Number Input -->
              <div class="col-12 d-none" id="ck-discount-ref-box">
                <label class="form-label small text-muted" id="ck-discount-ref-label">ID Number / Reference / Reason <span class="text-danger">*</span></label>
                <input class="form-control" type="text" id="ck-discount-ref-input" maxlength="255" placeholder="Enter ID number or authorization reason">
              </div>
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
                <div class="col-6 text-muted">Room Accommodation:</div>
                <div class="col-6 text-end font-monospace text-dark" id="ck-calc-gross">₱0.00</div>

                <div class="col-6 text-muted">Discount Applied:</div>
                <div class="col-6 text-end font-monospace text-success fw-bold" id="ck-calc-discount">-₱0.00</div>

                <div class="col-6 text-muted">12% VAT:</div>
                <div class="col-6 text-end font-monospace text-dark" id="ck-calc-vat">₱0.00</div>

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

      const roomSelect = root.querySelector('#ck-room-id');
      const nightsInput = root.querySelector('#ck-nights');
      const guestsInput = root.querySelector('#ck-guests');
      const discDropdown = root.querySelector('#ck-discount-dropdown');
      const customPctBox = root.querySelector('#ck-custom-pct-box');
      const customPctVal = root.querySelector('#ck-custom-pct-val');
      const customFixedBox = root.querySelector('#ck-custom-fixed-box');
      const customFixedVal = root.querySelector('#ck-custom-fixed-val');
      const refBox = root.querySelector('#ck-discount-ref-box');
      const refLabel = root.querySelector('#ck-discount-ref-label');
      const refInput = root.querySelector('#ck-discount-ref-input');

      const calcGrossEl = root.querySelector('#ck-calc-gross');
      const calcDiscountEl = root.querySelector('#ck-calc-discount');
      const calcVatEl = root.querySelector('#ck-calc-vat');
      const calcTotalEl = root.querySelector('#ck-calc-total');
      const policyBadgeEl = root.querySelector('#ck-live-policy-badge');
      const policyAlertBox = root.querySelector('#ck-policy-alert-box');

      let currentDiscountAmount = 0;
      let currentDiscountCategory = '';

      const updateCalculations = () => {
        const selectedOpt = roomSelect.options[roomSelect.selectedIndex];
        const nightlyRate = Number(selectedOpt?.getAttribute('data-rate') || 0);
        const capacity = Number(selectedOpt?.getAttribute('data-capacity') || 1);
        guestsInput.max = capacity;

        let nights = Math.max(1, Math.min(90, parseInt(nightsInput.value || 1, 10)));
        if (isNaN(nights)) nights = 1;

        const roomSubtotal = nightlyRate * nights;
        const discChoice = discDropdown.value;

        // Reset dynamic visibility
        customPctBox.classList.add('d-none');
        customFixedBox.classList.add('d-none');
        refBox.classList.add('d-none');

        let discountVal = 0;
        let cat = '';

        if (discChoice === 'SENIOR_CITIZEN') {
          cat = 'SENIOR_CITIZEN';
          discountVal = Math.round((roomSubtotal * 0.20) * 100) / 100;
          refBox.classList.remove('d-none');
          refLabel.innerHTML = 'Senior Citizen OSCA ID No. <span class="text-danger">*</span>';
          refInput.placeholder = 'e.g. OSCA-2026-98765';
        } else if (discChoice === 'PWD') {
          cat = 'PWD';
          discountVal = Math.round((roomSubtotal * 0.20) * 100) / 100;
          refBox.classList.remove('d-none');
          refLabel.innerHTML = 'PWD ID Card No. <span class="text-danger">*</span>';
          refInput.placeholder = 'e.g. PWD-NCR-12345';
        } else if (discChoice === 'PROMO_10') {
          cat = 'OTHER';
          discountVal = Math.round((roomSubtotal * 0.10) * 100) / 100;
          refBox.classList.remove('d-none');
          refLabel.innerHTML = 'Promo Campaign Reference / Note';
          refInput.placeholder = 'e.g. Room Promotion 10%';
          if (!refInput.value) refInput.value = 'Room Promotion (10%)';
        } else if (discChoice === 'OTHER_PERCENT') {
          cat = 'OTHER';
          customPctBox.classList.remove('d-none');
          refBox.classList.remove('d-none');
          refLabel.innerHTML = 'Discount Reason / Authorization <span class="text-danger">*</span>';
          refInput.placeholder = 'e.g. Corporate / Management courtesy';
          const pct = Math.max(1, Math.min(90, Number(customPctVal.value || 0)));
          discountVal = Math.round((roomSubtotal * (pct / 100)) * 100) / 100;
        } else if (discChoice === 'OTHER_FIXED') {
          cat = 'OTHER';
          customFixedBox.classList.remove('d-none');
          refBox.classList.remove('d-none');
          refLabel.innerHTML = 'Discount Reason / Authorization <span class="text-danger">*</span>';
          refInput.placeholder = 'e.g. VVIP Courtesy Voucher';
          const fixedVal = Math.max(0, Number(customFixedVal.value || 0));
          discountVal = Math.min(roomSubtotal, fixedVal);
        }

        const netRoom = Math.max(0, roomSubtotal - discountVal);
        const vat = Math.round((netRoom * 0.12) * 100) / 100;
        const totalNetBill = Math.round((netRoom + vat) * 100) / 100;

        currentDiscountAmount = discountVal;
        currentDiscountCategory = cat;

        calcGrossEl.textContent = `${php(roomSubtotal)} (${nights} night${nights > 1 ? 's' : ''} × ${php(nightlyRate)})`;
        calcDiscountEl.textContent = discountVal > 0 ? `-${php(discountVal)}` : '₱0.00';
        calcVatEl.textContent = php(vat);
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
      discDropdown.addEventListener('change', updateCalculations);
      customPctVal.addEventListener('input', updateCalculations);
      customFixedVal.addEventListener('input', updateCalculations);

      updateCalculations();

      root.querySelector('#new-checkin').onsubmit = async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const nights = Math.max(1, Math.min(90, parseInt(f.nights || 1, 10)));
        const discChoice = discDropdown.value;
        const refVal = String(refInput.value || '').trim();

        if (discChoice !== 'NONE') {
          if ((discChoice === 'SENIOR_CITIZEN' || discChoice === 'PWD' || discChoice === 'OTHER_PERCENT' || discChoice === 'OTHER_FIXED') && !refVal) {
            return notify('Please provide the ID number or authorization reason for the discount.', true);
          }
        }

        try {
          const r = await api('checkin', {
            room_id: Number(f.room_id),
            guests: Number(f.guests),
            nights: nights,
            first_name: String(f.first_name || '').trim(),
            last_name: String(f.last_name || '').trim(),
            contact_number: String(f.contact_number || '').trim(),
            email: String(f.email || '').trim(),
            discount_amount: currentDiscountAmount,
            discount_category: currentDiscountCategory,
            discount_reason: refVal || (discChoice === 'SENIOR_CITIZEN' ? 'Senior Citizen 20%' : (discChoice === 'PWD' ? 'PWD 20%' : 'Discount'))
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

  async function guestDetails(stayId) {

    try {

      const d=await api('active_stays',{},'GET');

      const s=(d.stays||[]).find(x=>Number(x.id)===Number(stayId));

      if(!s) return notify('Stay not found.',true);

      const {root,m}=modal(`Guest details · Room ${esc(s.room_number)}`,`<form id="guest-details-form" class="row g-3"><div class="col-12"><div class="alert alert-light border mb-0">First and last name are required. Contact number and email are optional. Changes reflect on the folio, receipt, and guest portal.</div></div><div class="col-md-4"><label class="form-label">First name <span class="text-danger">*</span></label><input class="form-control" type="text" name="first_name" maxlength="100" value="${esc(s.first_name||'')}" required></div><div class="col-md-4"><label class="form-label">Middle name <span class="text-muted">(Optional)</span></label><input class="form-control" type="text" name="middle_name" maxlength="100" value="${esc(s.middle_name||'')}"></div><div class="col-md-4"><label class="form-label">Last name <span class="text-danger">*</span></label><input class="form-control" type="text" name="last_name" maxlength="100" value="${esc(s.last_name||'')}" required></div><div class="col-md-6"><label class="form-label">Contact number <span class="text-muted">(Optional)</span></label><input class="form-control" type="tel" name="contact_number" maxlength="30" value="${esc(s.contact_number||'')}"></div><div class="col-md-6"><label class="form-label">Email <span class="text-muted">(Optional)</span></label><input class="form-control" type="email" name="email" maxlength="150" value="${esc(s.email||'')}"></div><div class="col-12 text-end"><button class="btn btn-primary"><i class="bi bi-check2-circle me-1"></i>Save guest details</button></div></form>`);

      root.querySelector('#guest-details-form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const r=await api('update_stay_guest',{stay_id:Number(stayId),first_name:String(f.first_name||'').trim(),middle_name:String(f.middle_name||'').trim(),last_name:String(f.last_name||'').trim(),contact_number:String(f.contact_number||'').trim(),email:String(f.email||'').trim()});m.hide();notify(`Guest details saved: ${r.guest_name}`);await open(activeModule);}catch(err){notify(err.message,true)}};

    } catch(e){notify(e.message,true)}

  }


  async function showReceiptModal(receiptInput) {
    let data = receiptInput;
    if (typeof receiptInput === 'string' || typeof receiptInput === 'number') {
      try {
        const res = await api('receipt_details', { receipt_number: String(receiptInput), payment_id: Number(receiptInput) || 0 });
        data = res.receipt;
        if (res.folio_summary) data.folio_summary = res.folio_summary;
      } catch (err) {
        return notify('Unable to load receipt: ' + err.message, true);
      }
    }
    if (!data) return;

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
    const remBal = data.folio_summary?.balance_remaining ?? (data.remaining_balance != null ? Number(data.remaining_balance) : 0);
    const isSettled = Number(remBal) <= 0.009;

    const vat12 = Math.round((amount / 1.12 * 0.12) * 100) / 100;
    const vatable = Math.round((amount - vat12) * 100) / 100;

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
                <div class="fw-semibold text-dark">Hotel Stay Charges &amp; Folio Settlement</div>
                <div class="small text-muted">Payment Tender: <strong>${esc(method)}</strong>${refNote ? ' · Ref: ' + esc(refNote) : ''}</div>
              </td>
              <td class="text-end fw-bold fs-6">${php(amount)}</td>
            </tr>
          </tbody>
        </table>

        <div class="border-top pt-2 mb-3" style="font-size:0.82rem;">
          <div class="d-flex justify-content-between mb-1 text-muted">
            <span>VATable Sales (Net of 12% VAT):</span>
            <span>${php(vatable)}</span>
          </div>
          <div class="d-flex justify-content-between mb-1 text-muted">
            <span>VAT (12%):</span>
            <span>${php(vat12)}</span>
          </div>
          <div class="d-flex justify-content-between mb-1 text-muted">
            <span>VAT-Exempt / Zero Rated Sales:</span>
            <span>₱0.00</span>
          </div>
          <div class="d-flex justify-content-between py-2 border-top border-bottom my-2 bg-light-subtle px-2 rounded">
            <span class="fw-bold fs-6 text-dark">TOTAL AMOUNT PAID:</span>
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
      const balance0=is5Days ? (Number(x.balance_amount) || Math.round(Math.max(0, total0 - required0) * 100) / 100) : 0;

      const presetAmounts = [
        required0,
        Math.ceil(required0 / 100) * 100,
        Math.ceil(required0 / 500) * 500,
        Math.ceil(required0 / 1000) * 1000,
        total0
      ].filter((v, i, a) => v >= required0 && a.indexOf(v) === i);

      const modalHtml = `
        <div class="container-fluid p-0">
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
              <div class="small text-muted">(${is5Days ? '60% Downpayment' : '100% Full Payment'}) of ${php(total0)}</div>
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
                  <span class="small text-muted d-block text-uppercase" style="font-size:11px;">FD Discount</span>
                  ${discount0 > 0 ? `<strong class="fs-6 text-success font-monospace">-${php(discount0)}</strong><div class="badge text-bg-success-subtle text-success p-1" style="font-size:9.5px;">${esc(discountReason0 || 'Applied')}</div>` : '<strong class="fs-6 text-muted font-monospace">₱0.00</strong>'}
                </div>
                <div class="col-4">
                  <span class="small text-muted d-block text-uppercase" style="font-size:11px;">Net Total Bill</span>
                  <strong class="fs-6 text-dark font-monospace">${php(total0)}</strong>
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
                  <strong class="text-success fs-5 font-monospace">${php(required0)}</strong>
                  <div class="small text-muted" style="font-size:11px;">Collect now from guest</div>
                </div>
                <div class="col-6">
                  <span class="small text-muted d-block">Must Pass to Balance (40%):</span>
                  <strong class="text-danger fs-5 font-monospace">${php(balance0)}</strong>
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
                  <strong class="text-success fs-5 font-monospace">${php(required0)}</strong>
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
              <div class="d-flex align-items-center gap-1 flex-wrap">
                <span class="small text-muted me-1">Quick Presets:</span>
                <button type="button" class="btn btn-sm btn-outline-secondary cp-quick-btn" data-val="${required0.toFixed(2)}">Exact (${php(required0)})</button>
                ${presetAmounts.filter(x => x > required0).map(v => `<button type="button" class="btn btn-sm btn-outline-secondary cp-quick-btn" data-val="${v.toFixed(2)}">₱${v.toLocaleString()}</button>`).join('')}
                <button type="button" class="btn btn-sm btn-outline-secondary cp-quick-btn" data-val="${total0.toFixed(2)}">Pay Full Bill (${php(total0)})</button>
              </div>
            </div>

            <!-- Summary Breakdown -->
            <div class="col-12">
              <div class="p-3 bg-light rounded border">
                <div class="d-flex justify-content-between mb-1 small text-muted">
                  <span>Total Billing:</span>
                  <strong class="text-dark">${php(gross0)}</strong>
                </div>
                <div class="d-flex justify-content-between mb-1 small text-muted">
                  <span>Front Desk Discount:</span>
                  <strong class="${discount0 > 0 ? 'text-success' : 'text-muted'}">${discount0 > 0 ? `-${php(discount0)}` : '₱0.00'}</strong>
                </div>
                <div class="d-flex justify-content-between mb-1 small text-muted">
                  <span>Net Total Bill:</span>
                  <strong class="text-dark" id="cp-net-total">${php(total0)}</strong>
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
      const netEl=root.querySelector('#cp-net-total');
      const reqHead=root.querySelector('#cp-required-head');

      const remBalEl = root.querySelector('#cp-remaining-balance');
      const recompute=()=>{
        const v=Number(amtInput.value||0);
        const applied=Math.min(v,total0);
        netEl.textContent=php(total0);
        reqHead.textContent=php(required0);
        amtInput.min=required0.toFixed(2);
        appliedEl.textContent=php(applied);
        changeEl.textContent=php(Math.max(0,v-applied));
        if (remBalEl) {
          const rem = Math.max(0, total0 - applied);
          remBalEl.textContent = php(rem);
        }
      };

      amtInput.addEventListener('input',recompute);

      root.querySelectorAll('.cp-quick-btn').forEach(b => {
        b.addEventListener('click', () => {
          amtInput.value = b.dataset.val;
          recompute();
        });
      });

      recompute();

      root.querySelector('#approve-cp-form').onsubmit=async e=>{
        e.preventDefault();
        const f=Object.fromEntries(new FormData(e.target));
        try{
          const r=await api('approve_checkin_payment',{
            checkin_payment_id:Number(cpId),
            method:f.method,
            amount_received:Number(f.amount_received)
          });
          m.hide();
          notify(`Check-in payment approved! Receipt: ${r.receipt_number} · Paid: ${php(r.amount_paid)} · Guest is now active.`);
          await showReceiptModal(r);
          await open(activeModule);
        }catch(err){
          cpError('Approve payment failed',err);
        }
      };
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

  async function folio(id) { try { const d=await api('folio',{folio_id:id}); const f=d.folio; const rows=d.charges.map(c=>`<tr><td>${esc(c.description)}</td><td>${c.quantity}</td><td>${php(c.unit_price)}</td><td>${php(c.amount)}</td></tr>`).join(''); const payments=d.payments.map(p=>`<tr><td>${esc(p.receipt_number)}</td><td>${esc(p.method)}</td><td>${esc(p.created_at)}</td><td>${php(p.amount)}</td><td><button class="btn btn-sm btn-outline-warning" data-refund="${p.id}" data-amount="${p.amount}">Refund</button></td></tr>`).join(''); const discounts=(d.discounts||[]).map(z=>`<tr><td>${esc(z.name)}</td><td>${esc(z.status)}</td><td>${php(z.amount)}</td></tr>`).join(''); const x=modal(`Shesh Dev Hotel · Bill ${esc(f.folio_number)}`,`<div class="mb-3"><strong>Shesh Dev Hotel</strong><br>Agora, Lapasan, Cagayan de Oro</div><div class="d-flex justify-content-between flex-wrap"><p>Stay ${esc(f.stay_code)} · Room ${esc(f.room_number)}</p>${pill(f.status)}</div><h6 class="fw-bold">Charges</h6>${table(['Description','Qty','Unit price','Amount'],rows,'No charges.')}<div class="row g-2 my-3"><div class="col-md-3"><div class="p-3 bg-light rounded">Charges<strong class="d-block">${php(d.total)}</strong></div></div><div class="col-md-3"><div class="p-3 bg-light rounded">Discounts<strong class="d-block text-success">− ${php(d.discount_total||0)}</strong></div></div><div class="col-md-3"><div class="p-3 bg-light rounded">VAT (${Number(d.vat_rate||0)}%)<strong class="d-block">${php(d.vat||0)}</strong></div></div><div class="col-md-3"><div class="p-3 bg-light rounded">Paid<strong class="d-block">${php(d.paid)}</strong></div></div><div class="col-md-3"><div class="p-3 bg-light rounded">Balance (VAT included)<strong class="d-block">${php(d.balance)}</strong></div></div>${Number(d.overpaid||0)>0?`<div class="col-md-3"><div class="p-3 rounded border border-warning bg-warning-subtle">Overpaid<strong class="d-block text-danger">${php(d.overpaid)}</strong><span class="small">Refund this amount before checkout</span></div></div>`:''}</div><section class="border rounded p-3 mb-3"><h6 class="fw-bold">Checkout discounts</h6><div class="row g-2 align-items-end"><div class="col-md-8"><label class="form-label">Available discount policy</label><select class="form-select" id="discount-policy"><option value="">Loading discounts…</option></select></div><div class="col-md-4"><button class="btn btn-success w-100" id="apply-discount" ${f.status!=='OPEN'?'disabled':''}>Apply discount</button></div><div class="col-12"><label class="form-label">Reason / notes (required for audit)</label><input class="form-control" id="discount-reason" maxlength="255" placeholder="Reason or eligibility note"></div></div><div class="small text-muted mt-2">Discount rules, eligibility, limits and manager approval are validated by the server.</div><div class="mt-3">${table(['Discount','Status','Amount'],discounts,'No discounts applied.')}</div></section><h6 class="fw-bold">Payments</h6>${table(['Receipt','Method','Date','Amount','Action'],payments,'No payments yet.')}<div class="d-flex flex-wrap gap-2 mt-3">${f.status==='OPEN'?'<button class="btn btn-outline-primary" id="add-charge">Add charge</button>':''}    <button class="btn btn-primary" id="take-payment" ${f.status!=='OPEN'||Number(d.balance)<=0?'disabled':''}>Record payment</button><button class="btn btn-outline-secondary" onclick="window.print()">Print bill</button></div>`); x.root.querySelector('#add-charge')?.addEventListener('click',()=>{x.m.hide();addCharge(id)});x.root.querySelector('#take-payment')?.addEventListener('click',()=>{x.m.hide();pay(id,Number(d.balance))});

    const sel=x.root.querySelector('#discount-policy'); try { const pd=await api('discount_policies',{},'GET'); sel.innerHTML='<option value="">Choose a discount</option>'+(pd.discounts||[]).map(z=>`<option value="${z.id}">${esc(z.name)} · ${z.discount_type==='PERCENT'?Number(z.discount_value)+'%':php(z.discount_value)} · ${esc(z.applies_to)}${Number(z.requires_manager)?' · manager approval':''}</option>`).join(''); if(!(pd.discounts||[]).length)sel.innerHTML='<option value="">No active discounts configured</option>'; }catch(err){sel.innerHTML='<option value="">Unable to load discount policies</option>';}

    x.root.querySelector('#apply-discount')?.addEventListener('click',async()=>{if(!sel.value)return notify('Select an available discount policy.',true);try{const r=await api('apply_discount',{folio_id:id,policy_id:Number(sel.value),reason:x.root.querySelector('#discount-reason').value});x.m.hide();notify(r.status==='PENDING'?'Discount submitted for manager approval.':`Discount applied: ${php(r.amount)}`);folio(id)}catch(err){notify(err.message,true)}});

    x.root.querySelectorAll('[data-refund]').forEach(b=>b.addEventListener('click',()=>{x.m.hide();refund(Number(b.dataset.refund),Number(b.dataset.amount),id)}));

  }catch(e){notify(e.message,true)} }

  function refund(paymentId, paidAmount, folioId){const x=modal('Request / Record Refund',`<form id="refund-form" class="row g-3"><div class="col-md-6"><label class="form-label">Amount (PHP)</label><input class="form-control" name="amount" type="number" min="0.01" max="${paidAmount}" step="0.01" required></div><div class="col-md-6"><label class="form-label">Refund method</label><select class="form-select" name="method"><option>CASH</option><option>GCASH</option><option>MAYA</option><option>BANK_TRANSFER</option><option>QR_PH</option><option>CARD</option><option>OTHER</option></select></div><div class="col-12"><label class="form-label">Reason</label><textarea class="form-control" name="reason" maxlength="500" required></textarea></div><div class="col-12 text-end"><button class="btn btn-primary"><i class="bi bi-check2-circle me-1"></i>Submit refund</button></div></form>`);x.root.querySelector('#refund-form').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));try{const r=await api('refund_request',{payment_id:paymentId,amount:Number(v.amount),method:v.method,reason:v.reason});x.m.hide();notify(`Refund ${r.refund_number}: ${r.status}`);folio(folioId)}catch(err){notify(err.message,true)}};}

  async function updateRefund(id,status){let transaction_reference='';if(status==='COMPLETED'){transaction_reference=await window.HotelDialogs.input({title:'Refund confirmation',text:'Enter the confirmed refund transaction or cash voucher reference.',label:'Transaction reference',placeholder:'Required to complete the refund',required:true,validationMessage:'A confirmed reference is required to complete a refund.'});if(transaction_reference===null)return;}const confirmed=await window.HotelDialogs.confirm({title:'Update refund status?',text:`Change refund #${id} to ${status}?`,confirmButtonText:'Update'});if(!confirmed)return;try{await api('refund_status',{refund_id:id,status,transaction_reference});notify(`Refund status updated to ${status}.`);await open('payments')}catch(e){notify(e.message,true)}}

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

    let policies;

    try {

      policies = (await api('early_checkout_policies', {}, 'GET')).policies || [];

    } catch(e) {

      return notify(e.message, true);

    }

    const active = policies.filter(p => Number(p.active));

    if (!active.length) return notify('No active early checkout policies configured. Ask an administrator to configure one in Settings.', true);



    const stayPickerHtml = (!id && staysList.length > 0)

      ? `<div class="col-12"><label class="form-label fw-semibold">Select Active In-House Stay</label><select class="form-select" name="stay_id" id="early-stay-picker" required>${staysList.map(s => `<option value="${s.id}">Room ${esc(s.room_number)} · Stay ${esc(s.stay_code)}${s.guest_name ? ` (${esc(s.guest_name)})` : ''} · Checkout: ${esc(s.planned_checkout)}</option>`).join('')}</select></div>`

      : '';



    const x = modal('Early Checkout / Cancellation Request', `<form id="early-form" class="row g-3">

      ${stayPickerHtml}

      <div class="col-md-6"><label class="form-label">Request type</label><select class="form-select" name="request_type"><option value="EARLY_CHECKOUT">Early checkout</option><option value="CANCEL_AFTER_CHECKIN">Cancellation after check-in</option></select></div>

      <div class="col-md-6"><label class="form-label">Configured billing policy</label><select class="form-select" name="policy_id" id="early-policy" required>${active.map(p => `<option value="${Number(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>

      <div class="col-md-6"><label class="form-label">Intended departure date and time</label><input class="form-control" type="datetime-local" name="requested_departure_at" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" required></div>

      <div class="col-12"><div class="alert alert-info mb-0" id="early-policy-info"></div></div>

      <div class="col-12"><label class="form-label">Reason</label><textarea class="form-control" name="reason" required maxlength="500" placeholder="State reason for early departure or cancellation"></textarea></div>

      <div class="col-12 text-end"><button class="btn btn-primary"><i class="bi bi-send me-1"></i>Submit Early Checkout Request</button></div>

    </form>`);



    const sel = x.root.querySelector('#early-policy'), info = x.root.querySelector('#early-policy-info');

    const describe = () => {

      const p = active.find(p => Number(p.id) === Number(sel.value));

      info.textContent = p ? `${p.description || p.name} Minimum hours: ${p.minimum_hours}; minimum nights: ${p.minimum_nights}; fixed fee: ${php(p.fixed_fee)}${Number(p.requires_manager) ? ' · Manager approval required' : ''}.` : 'Choose a policy.';

    };

    sel.onchange = describe;

    describe();

    x.root.querySelector('#early-form').onsubmit = async (e) => {

      e.preventDefault();

      const v = Object.fromEntries(new FormData(e.target));

      const targetStayId = Number(v.stay_id || stayId);

      try {

        const r = await api('early_checkout_request', {

          stay_id: targetStayId,

          request_type: v.request_type,

          policy_id: Number(v.policy_id),

          reason: v.reason,

          requested_departure_at: v.requested_departure_at.replace('T', ' ') + ':00'

        });

        x.m.hide();

        notify(`Early checkout request recorded. Proposed room charge: ${php(r.proposed_room_charge)}`);

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



      const renderEarlyAction = (r) => {
        if (r.status === 'REQUESTED') {
          return canDecideEc
            ? `<div class="d-flex gap-1"><button class="btn btn-sm btn-success" onclick="HotelBilling.decideEarlyCheckout(${Number(r.id)},'APPROVE')">Approve</button><button class="btn btn-sm btn-outline-danger" onclick="HotelBilling.decideEarlyCheckout(${Number(r.id)},'REJECT')">Reject</button></div>`
            : '<span class="badge text-bg-warning text-dark"><i class="bi bi-clock me-1"></i>Pending Manager Review</span>';
        }
        if (r.status === 'APPROVED') {
          return `<button class="btn btn-sm btn-primary fw-bold" onclick="HotelBilling.finalizeEarlyCheckout(${Number(r.id)})"><i class="bi bi-receipt me-1"></i>Post Charge to Folio</button>`;
        }
        if (r.status === 'FINALIZED') {
          return `<div class="d-flex gap-1 align-items-center"><span class="badge text-bg-success"><i class="bi bi-check2-all me-1"></i>Posted</span> <button class="btn btn-sm btn-outline-primary" onclick="HotelBilling.folio(${Number(r.folio_id)})"><i class="bi bi-receipt me-1"></i>Folio</button></div>`;
        }
        if (r.status === 'REJECTED') {
          return '<span class="badge text-bg-danger"><i class="bi bi-x-circle me-1"></i>Rejected</span>';
        }
        return '—';
      };



      const body=rows.map(r=>`<tr><td><strong>#${Number(r.id)} · ${esc(r.stay_code)}</strong><div class="small text-muted">Room ${esc(r.room_number)} · Folio ${esc(r.folio_number)}</div></td><td>${esc(String(r.request_type).replaceAll('_',' '))}<div class="small text-muted">${esc(r.policy)}</div></td><td>${esc(r.reason)}</td><td>${esc(r.requested_by_name||'Staff')}</td><td>${esc(r.requested_departure_at||'—')}</td><td>${php(r.proposed_room_charge)}</td><td>${pill(r.status)}</td><td>${renderEarlyAction(r)}</td></tr>`).join('');

      const mobileEarlyCards = rows.map(r=>`

        <div class="card border-0 shadow-sm p-3 mb-2">

          <div class="d-flex justify-content-between align-items-start mb-2">

            <div>

              <span class="fw-bold fs-6">${esc(r.stay_code)}</span>

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



      const topBar = isFrontdesk

        ? `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><div><h5 class="fw-bold mb-1">Early Checkout Requests</h5><p class="text-muted mb-0">Record and submit early departure requests for review and manager authorization.</p></div><div class="d-flex align-items-center gap-2"><span class="badge text-bg-warning">${pending} pending</span><button class="btn btn-primary btn-sm" onclick="HotelBilling.earlyCheckout()"><i class="bi bi-plus-lg me-1"></i>Submit Request</button><button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('early-checkout-requests')"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button></div></div>`

        : `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><div><h5 class="fw-bold mb-1">Early Checkout & Cancellation Requests</h5><p class="text-muted mb-0">Approve or reject pending requests. Approved requests can post a clearly labelled charge to the guest folio. This does not check out the guest; collect payment against the folio, then use the normal Checkout action.</p></div><div class="d-flex align-items-center gap-2"><span class="badge text-bg-warning">${pending} pending</span><button class="btn btn-outline-secondary btn-sm" onclick="HotelBilling.open('early-checkouts')"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button></div></div>`;



      host.innerHTML=`${topBar}

      <div class="d-none d-md-block">${table(['Stay / Folio','Request','Reason','Requested by','Requested departure','Proposed charge','Status','Action'],body,'No early-checkout requests found.')}</div>

      <div class="d-md-none">${mobileEarlyCards}</div>`;

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

  async function finalizeEarlyCheckout(id){
    const confirmed=await window.HotelDialogs.confirm({title:'Post charge to folio?',text:`Post the early-checkout charge for request #${id} to the folio? The room charge will be recalculated and the guest can settle the remaining balance or receive a refund before checkout.`,confirmButtonText:'Post charge'});
    if(!confirmed)return;
    try{
      const r=await api('early_checkout_finalize',{request_id:id});
      notify(r.message||'Early-checkout charge posted to folio.');
      if (r.folio_id) {
        await folio(r.folio_id);
      } else {
        await renderEarlyCheckoutRequests();
      }
    }
    catch(e){notify(e.message,true);}
  }

  async function renderPolicyAdmin(){const host=$('policy-admin');if(!host)return;try{const [ep,dp]=await Promise.all([api('early_checkout_policies',{},'GET'),api('discount_policy_admin_list',{},'GET')]);const policies=ep.policies||[], discounts=dp.discounts||[];

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



    host.innerHTML=`<h5 class="fw-bold mt-4">Early checkout policy lookup</h5><p class="text-muted small">Policy amounts are configured here. Checkout staff select a policy; they do not type fees or minimums.</p>

    <div class="d-none d-md-block">${table(['Policy','Minimum hours','Minimum nights','Fixed fee','Manager approval','Status','Action'],er,'No early checkout policies.')}</div>

    <div class="d-md-none">${mobileEarlyPolicies}</div>

    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4"><div><h5 class="fw-bold mb-1">Discount policy lookup</h5><p class="text-muted small mb-0">These policies populate the Checkout discounts dropdown. Edit values here; staff choose a policy rather than entering discount amounts.</p></div><button class="btn btn-primary btn-sm" id="add-discount-policy">＋ Add discount</button></div>

    <div class="d-none d-md-block">${table(['Discount / category','Type','Value','Applies to','Minimum bill','Maximum discount','Status','Actions'],dr,'No discount policies configured. Use Add discount to create the first option.')}</div>

    <div class="d-md-none">${mobileDiscountPolicies}</div>`;

    host.querySelector('#add-discount-policy')?.addEventListener('click',()=>editDiscountPolicy(0));

  }catch(e){host.innerHTML=`<div class="alert alert-warning">Policy tables could not load: ${esc(e.message)}. Run the included SQL migration and sign in as admin or manager.</div>`;}}

  async function editEarlyPolicy(id){try{const d=await api('early_checkout_policies',{},'GET'),p=(d.policies||[]).find(x=>Number(x.id)===Number(id));if(!p)throw Error('Policy not found');const x=modal('Edit early checkout policy',`<form id="ep-edit" class="row g-3"><input type="hidden" name="id" value="${p.id}"><div class="col-md-6"><label class="form-label">Policy name</label><input class="form-control" name="name" required maxlength="120" value="${esc(p.name)}"></div><div class="col-md-6"><label class="form-label">Minimum hours</label><input class="form-control" type="number" name="minimum_hours" min="0" max="720" step="0.25" required value="${p.minimum_hours}"></div><div class="col-md-6"><label class="form-label">Minimum nights</label><input class="form-control" type="number" name="minimum_nights" min="0" max="90" required value="${p.minimum_nights}"></div><div class="col-md-6"><label class="form-label">Fixed fee (₱)</label><input class="form-control" type="number" name="fixed_fee" min="0" step="0.01" required value="${p.fixed_fee}"></div><div class="col-12"><label class="form-label">Description</label><textarea class="form-control" name="description" maxlength="500">${esc(p.description||'')}</textarea></div><div class="col-md-6 form-check ms-2"><input class="form-check-input" type="checkbox" name="requires_manager" value="1" ${Number(p.requires_manager)?'checked':''}><label class="form-check-label">Manager approval required</label></div><div class="col-md-5 form-check ms-2"><input class="form-check-input" type="checkbox" name="active" value="1" ${Number(p.active)?'checked':''}><label class="form-check-label">Active</label></div><div class="col-12 text-end"><button class="btn btn-primary">Save policy</button></div></form>`);x.root.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.requires_manager=e.target.elements.requires_manager.checked?1:0;f.active=e.target.elements.active.checked?1:0;try{await api('early_checkout_policy_save',f);x.m.hide();await renderPolicyAdmin();notify('Early checkout policy saved.')}catch(err){notify(err.message,true)}}}catch(e){notify(e.message,true)}}

  async function deleteDiscountPolicy(id){const confirmed=await window.HotelDialogs.confirm({title:'Delete discount policy?',text:'If used on bills, it will be deactivated to preserve history.',confirmButtonText:'Delete',isDanger:true});if(!confirmed)return;try{const r=await api('discount_policy_delete',{id});notify(r.message||'Discount removed.');await renderPolicyAdmin()}catch(e){notify(e.message,true)}}

  async function editDiscountPolicy(id){try{const d=await api('discount_policy_admin_list',{},'GET'),p=(d.discounts||[]).find(x=>Number(x.id)===Number(id))||{id:0,name:'',category:'PROMOTIONAL',discount_type:'PERCENT',discount_value:10,applies_to:'ROOM',min_amount:0,max_discount:'',starts_at:'',expires_at:'',combinable:0,requires_manager:0,active:1};const x=modal(id?'Edit discount policy':'Add discount policy',`<form id="dp-edit" class="row g-3"><input type="hidden" name="id" value="${p.id}"><div class="col-md-6"><label class="form-label">Name</label><input class="form-control" name="name" required value="${esc(p.name)}"></div><div class="col-md-4"><label class="form-label">Category</label><select class="form-select" name="category">${[['SENIOR_CITIZEN','Senior Citizen'],['PWD','PWD'],['PROMOTIONAL','Promotional'],['LOYALTY','Loyalty / repeat guest'],['CORPORATE','Corporate'],['LONG_STAY','Long stay'],['EARLY_BOOKING','Early booking'],['LAST_MINUTE','Last minute'],['PACKAGE','Package'],['MANAGER_COURTESY','Manager courtesy'],['GROUP','Group booking'],['OTHER','Other']].map(a=>`<option value="${a[0]}" ${(p.category||'PROMOTIONAL')===a[0]?'selected':''}>${a[1]}</option>`).join('')}</select></div><div class="col-md-4"><label class="form-label">Type</label><select class="form-select" name="discount_type"><option ${p.discount_type==='PERCENT'?'selected':''}>PERCENT</option><option ${p.discount_type==='FIXED'?'selected':''}>FIXED</option></select></div><div class="col-md-3"><label class="form-label">Value</label><input class="form-control" name="discount_value" type="number" min="0" step="0.01" required value="${p.discount_value}"></div><div class="col-md-4"><label class="form-label">Applies to</label><select class="form-select" name="applies_to">${['ROOM','FOOD','LAUNDRY','MINIBAR','SERVICE','OTHER','ALL'].map(v=>`<option ${p.applies_to===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="col-md-4"><label class="form-label">Minimum bill amount</label><input class="form-control" name="min_amount" type="number" min="0" step="0.01" value="${p.min_amount}"></div><div class="col-md-4"><label class="form-label">Maximum discount (blank = none)</label><input class="form-control" name="max_discount" type="number" min="0" step="0.01" value="${p.max_discount??''}"></div><div class="col-md-6"><label class="form-label">Starts at</label><input class="form-control" name="starts_at" type="datetime-local" value="${String(p.starts_at||'').replace(' ','T').slice(0,16)}"></div><div class="col-md-6"><label class="form-label">Expires at</label><input class="form-control" name="expires_at" type="datetime-local" value="${String(p.expires_at||'').replace(' ','T').slice(0,16)}"></div><div class="col-md-3 form-check ms-2"><input class="form-check-input" type="checkbox" name="combinable" value="1" ${Number(p.combinable)?'checked':''}><label class="form-check-label">Combinable</label></div><div class="col-md-3 form-check ms-2"><input class="form-check-input" type="checkbox" name="requires_manager" value="1" ${Number(p.requires_manager)?'checked':''}><label class="form-check-label">Manager approval</label></div><div class="col-md-3 form-check ms-2"><input class="form-check-input" type="checkbox" name="active" value="1" ${Number(p.active)?'checked':''}><label class="form-check-label">Active</label></div><div class="col-12 text-end"><button class="btn btn-primary">Save discount</button></div></form>`);x.root.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));for(const k of ['combinable','requires_manager','active'])f[k]=e.target.elements[k].checked?1:0;for(const k of ['starts_at','expires_at'])if(f[k])f[k]=f[k].replace('T',' ')+':00';try{await api('discount_policy_save',f);x.m.hide();await renderPolicyAdmin();notify('Discount policy saved.')}catch(err){notify(err.message,true)}}}catch(e){notify(e.message,true)}}



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

  async function addRoomType(existing=null) { const isEdit=!!existing; const x=modal(isEdit?'Edit Room Type & Nightly Price':'Add Room Type & Nightly Price',`<form id="room-type-form" class="row g-3"><div class="col-md-6"><label class="form-label">Room type name</label><input class="form-control" name="name" maxlength="80" placeholder="e.g. Deluxe, Family Suite" value="${esc(existing?.name||'')}" required></div><div class="col-md-3"><label class="form-label">Nightly price (₱)</label><input class="form-control" name="nightly_rate" type="number" min="0" step="0.01" value="${Number(existing?.nightly_rate||0)}" required></div><div class="col-md-3"><label class="form-label">Capacity</label><input class="form-control" name="capacity" type="number" min="1" max="20" value="${Number(existing?.capacity||2)}" required></div><div class="col-12 text-end"><button class="btn btn-primary">${isEdit?'Update room type':'Save room type'}</button></div></form>`);x.root.querySelector('#room-type-form').onsubmit=async e=>{e.preventDefault();try{await api('room_type_save',{...Object.fromEntries(new FormData(e.target)),id:existing?.id||0});x.m.hide();notify(isEdit?'Room type updated. New rate will be used for future check-ins and rate calculations.':'Room type and nightly price saved.');open('catalog')}catch(err){notify(err.message,true)}}; }

  async function editRoomType(id) { try { const d=await api('room_types',{},'GET'); const type=(d.types||[]).find(t=>Number(t.id)===Number(id)); if(!type)return notify('Room type not found. Refresh the page and try again.',true); return addRoomType(type); } catch(e) { notify(e.message,true); } }

  async function addRoom(existing=null) { try {const [td,rd]=await Promise.all([api('room_types',{},'GET'),api('rooms',{},'GET')]);const types=td.types||[];const room=(rd.rooms||[]).find(r=>Number(r.id)===Number(existing));if(!types.length)return notify('Add a room type first.',true);if(existing&&!room)return notify('Room not found.',true);const x=modal(existing?'Edit Room':'Add Room',`<form id="room-form" class="row g-3"><div class="col-md-4"><label class="form-label">Room number</label><input class="form-control" name="room_number" maxlength="4" pattern="[1-9][0-9]{2,3}" placeholder="e.g. 101, 205, 301" value="${esc(room?.room_number||'')}" required></div><div class="col-md-5"><label class="form-label">Room type · nightly price</label><select class="form-select" name="room_type_id" required>${types.map(t=>`<option value="${t.id}" ${Number(room?.room_type_id)===Number(t.id)?'selected':''}>${esc(t.name)} — ${php(t.nightly_rate)}/night · capacity ${t.capacity}</option>`).join('')}</select></div><div class="col-md-3"><label class="form-label">Floor (derived from room number)</label><input class="form-control" name="floor_number" type="number" min="1" value="${room?.floor_number||1}" required><div class="form-text">101–199 = 1st; 201–299 = 2nd; 301–399 = 3rd, etc.</div></div><div class="col-12 text-end"><button class="btn btn-primary">Save room</button></div></form>`);const form=x.root.querySelector('#room-form');const num=form.elements.room_number, floor=form.elements.floor_number;num.addEventListener('input',()=>{if(/^\d{3,4}$/.test(num.value))floor.value=num.value.slice(0,-2)});form.onsubmit=async e=>{e.preventDefault();try{await api('room_save',{...Object.fromEntries(new FormData(e.target)),id:existing||0});x.m.hide();notify('Room saved.');open('rooms')}catch(err){notify(err.message,true)}};}catch(e){notify(e.message,true)} }

  async function editRoom(id){return addRoom(id)}



  async function addMenuItem(existing=null) {

    try {

      const curRole = (window.HotelAuth?.getUser()?.role || '').toLowerCase();

      const defaultDept = ['bar', 'minibar'].includes(curRole) ? 'bar' : 'restaurant';

      const catRes = await api('menu_categories', { department: defaultDept }, 'GET').catch(() => ({ categories: [] }));

      const categories = catRes.categories || [];



      const x = modal(existing ? 'Edit Menu / Service Item' : 'Add Food / Drink / Service Item', `

        <form id="menu-item-form" class="row g-3">

          <div class="col-md-6">

            <label class="form-label fw-semibold">Item Name</label>

            <input class="form-control" name="name" maxlength="120" placeholder="e.g. Crispy Calamari, San Miguel, Iced Latte" required value="${esc(existing?.name||'')}">

          </div>

          <div class="col-md-6">

            <label class="form-label fw-semibold">Item Type</label>

            <select class="form-select" name="item_type" id="menu-item-type">

              <option value="FOOD" ${existing?.item_type==='FOOD'?'selected':''}>Food</option>

              <option value="DRINK" ${existing?.item_type==='DRINK'?'selected':''}>Drink / Beverage</option>

              <option value="OTHER" ${existing?.item_type==='OTHER'?'selected':''}>Amenity / Service</option>

            </select>

          </div>

          <div class="col-md-6">

            <label class="form-label fw-semibold">Department Catalog</label>

            <select class="form-select" name="category" required>

              ${[['FOOD_BEVERAGE','Restaurant & Food'],['BAR','Bar & Beverage'],['HOUSEKEEPING','Housekeeping'],['SERVICE','General Services'],['LAUNDRY','Laundry'],['MINIBAR','Minibar'],['OTHER','Other']].map(([v,l])=>`<option value="${v}" ${(existing?.category===v || (!existing && defaultDept==='bar' && v==='BAR'))?'selected':''}>${l}</option>`).join('')}

            </select>

          </div>

          <div class="col-md-6">

            <div class="d-flex justify-content-between align-items-center mb-1">

              <label class="form-label fw-semibold mb-0">Subcategory</label>

              <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none" id="btn-quick-add-cat">+ New Category</button>

            </div>

            <select class="form-select" name="subcategory" id="menu-item-subcategory">

              <option value="">-- Choose Category --</option>

              ${categories.map(c=>`<option value="${esc(c.name)}" ${existing?.subcategory===c.name?'selected':''}>${esc(c.name)} (${esc(c.type)})</option>`).join('')}

              ${existing?.subcategory && !categories.some(c=>c.name===existing.subcategory) ? `<option value="${esc(existing.subcategory)}" selected>${esc(existing.subcategory)}</option>` : ''}

            </select>

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

            <button class="btn btn-primary"><i class="bi bi-check2 me-1"></i>Save Menu Item</button>

          </div>

        </form>

      `);



      x.root.querySelector('#btn-quick-add-cat')?.addEventListener('click', () => {

        window.HotelDeptManager?.openAddCategoryModal(defaultDept, async () => {

          const updatedCats = await api('menu_categories', { department: defaultDept }, 'GET').catch(() => ({ categories: [] }));

          const subSel = x.root.querySelector('#menu-item-subcategory');

          if (subSel) {

            subSel.innerHTML = '<option value="">-- Choose Category --</option>' + (updatedCats.categories||[]).map(c=>`<option value="${esc(c.name)}">${esc(c.name)} (${esc(c.type)})</option>`).join('');

          }

        });

      });



      x.root.querySelector('#menu-item-form').onsubmit = async e => {

        e.preventDefault();

        try {

          await api('service_catalog_save', { ...Object.fromEntries(new FormData(e.target)), id: existing?.id || 0 });

          x.m.hide();

          notify('Priced menu item saved.');

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

      title: isEnabling ? 'Enable Menu Item?' : 'Disable Menu Item?',

      text: isEnabling

        ? 'This item will immediately become available in the guest portal and order catalog.'

        : 'This item will immediately be marked unavailable in the guest portal and cannot be ordered.',

      confirmButtonText: isEnabling ? 'Enable Item' : 'Disable Item',

      isDanger: !isEnabling

    });

    if (!confirmed) return;

    try {

      await api('service_catalog_toggle', { id, active: isEnabling ? 1 : 0 });

      notify(isEnabling ? 'Menu item enabled.' : 'Menu item disabled.');

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
    } catch (_) {}

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
      <div class="container-fluid p-0">
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

      const x=modal('Room Transfer',`<form id="transfer-form" class="row g-3"><div class="col-12 alert alert-light border">The new rate applies starting the next night. The current night remains at its original rate.</div><div class="col-md-8"><label class="form-label">Destination room</label><select class="form-select" name="to_room_id">${avail.map(r=>`<option value="${r.id}">${esc(r.room_number)} · ${esc(r.type)} · ${php(r.nightly_rate)}/night</option>`).join('')}</select></div><div class="col-md-4"><label class="form-label">Reason</label><input class="form-control" name="reason" maxlength="255" required></div><div class="col-12 text-end"><button class="btn btn-primary">Confirm Transfer</button></div></form>`);

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
      const vatRate = Number(roomsData.vat_rate ?? 0.12);

      const availableRooms = allRooms.filter(r => r.status === 'AVAILABLE');

      const occupiedRooms = allRooms.filter(r => r.status === 'OCCUPIED');

      const cleaningRooms = allRooms.filter(r => r.status === 'CLEANING');

      const maintenanceRooms = allRooms.filter(r => r.status === 'MAINTENANCE');



      const tomorrow = new Date();

      tomorrow.setDate(tomorrow.getDate() + 1);

      const tomorrowStr = tomorrow.toISOString().split('T')[0];



      const roomOptions = availableRooms.length > 0

        ? availableRooms.map(r => `<option value="${r.id}" data-rate="${r.nightly_rate}" data-capacity="${r.capacity}">Room ${esc(r.room_number)} — ${esc(r.type)} (${php(r.nightly_rate)}/night, Max ${r.capacity} guests)</option>`).join('')

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

                    <div class="fw-semibold mt-2 text-primary fs-5">${php(r.nightly_rate)} <span class="text-muted small fs-6">/ night</span></div>

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

                      <div><span class="text-muted small">Nightly Rate:</span> <strong id="wkd-rate-display">₱0.00</strong></div>

                    </div>

                    <div><span class="text-muted small">Estimated Bill (VAT included):</span> <strong class="fs-6 text-primary" id="wkd-total-display">₱0.00</strong></div>
                  </div>
                </div>

                <div class="col-md-4">
                  <label class="form-label fw-semibold small">Check-in Discount (PHP, optional)</label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text bg-white">₱</span>
                    <input type="number" id="wkd-discount" class="form-control" min="0" step="0.01" value="0">
                  </div>
                </div>

                <div class="col-md-4">
                  <label class="form-label fw-semibold small">Discount Type</label>
                  <select id="wkd-discount-category" class="form-select form-select-sm">
                    <option value="">No discount</option>
                    <option value="SENIOR_CITIZEN">Senior Citizen</option>
                    <option value="PWD">PWD</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div class="col-md-4">
                  <label class="form-label fw-semibold small">Discount Reason / Reference</label>
                  <input type="text" id="wkd-discount-reason" class="form-control form-control-sm" maxlength="255" placeholder="ID / reference / other details">
                </div>

                <div class="col-12">
                  <div class="alert alert-success py-2 px-3 mb-0 d-flex flex-wrap justify-content-between gap-2">
                    <span>Estimated discounted total bill:</span>
                    <strong id="wkd-payable-display">₱0.00</strong>
                  </div>
                  <div class="form-text">The cashier will see the discounted total, collect the required payment or downpayment, and record what the guest actually pays.</div>
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
      const discountInput = host.querySelector('#wkd-discount');
      const discountCategoryInput = host.querySelector('#wkd-discount-category');
      const discountReasonInput = host.querySelector('#wkd-discount-reason');
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

          roomInfo.textContent = `Nightly Rate: ${php(rate)} | Max Capacity: ${capacity} guest(s)`;

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
        const vatTotal = Math.round(roomTotal * vatRate * 100) / 100;
        const total = Math.round((roomTotal + vatTotal) * 100) / 100;
        estimatedTotal = total;
        const discount = Number(discountInput?.value || 0);
        totalDisplay.textContent = php(total);
        payableDisplay.textContent = php(Math.max(0, total - discount));

      };



      roomSelect?.addEventListener('change', updateEstimate);
      checkoutInput?.addEventListener('change', updateEstimate);
      guestsInput?.addEventListener('input', updateEstimate);
      discountInput?.addEventListener('input', updateEstimate);
      discountCategoryInput?.addEventListener('change', () => {
        if (!discountCategoryInput.value) {
          discountInput.value = '0';
          discountReasonInput.value = '';
        }
        updateEstimate();
      });



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
        const discount = Number(discountInput?.value || 0);
        const discountCategory = discountCategoryInput?.value || '';
        const discountReason = discountReasonInput?.value?.trim() || '';
        if (!firstName || !lastName) {
          return notify('Guest first and last name are required.', true);
        }
        if (!Number.isFinite(discount) || discount < 0 || (discount >= estimatedTotal && discount > 0)) {
          return notify('Discount must be a valid amount less than the estimated bill.', true);
        }
        if (discount > 0 && !discountCategory) {
          return notify('Choose Senior Citizen, PWD, or Other as the discount type.', true);
        }
        if (discount > 0 && !discountReason) {
          return notify('Enter the discount ID, reference, or reason.', true);
        }



        const submitBtn = host.querySelector('#btn-wkd-submit');

        submitBtn.disabled = true;

        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Processing…';



        try {

          const r = await api('checkin', {

            room_id: roomId,

            guests,

            nights,

            first_name: firstName,

            last_name: lastName,

            email: email,
            discount_amount: discount,
            discount_category: discountCategory,
            discount_reason: discountReason

          });

          notify(`Check-in saved! Stay ${r.stay_code}; Folio ${r.folio_number}.${discount > 0 ? ` Front Desk discount: ${php(r.discount_amount)}.` : ''} Send the guest to the Cashier to settle ${php(r.required_amount||0)}.`);

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

      const readyForCheckout = stays.filter(s => (Number(s.charges_total) - Number(s.paid_total)) <= 0.009).length;

      const balanceDueCount = stays.length - readyForCheckout;



      const rows = stays.map(s => {

        const bal = Number(s.charges_total) - Number(s.paid_total);

        const isSettled = bal <= 0.009;

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

          <td>${esc(s.checkin_at)}</td>

          <td>${esc(s.planned_checkout)}</td>

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

        const bal = Number(s.charges_total) - Number(s.paid_total);

        const isSettled = bal <= 0.009;

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

              <div class="col-6">Check-in: <strong class="text-dark">${esc(s.checkin_at)}</strong></div>

              <div class="col-6 text-end">Checkout: <strong class="text-dark">${esc(s.planned_checkout)}</strong></div>

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

              ${table(['Stay / Folio Reference', 'Room', 'Check-in', 'Planned Checkout', 'Balance Status', 'Settlement', 'Actions'], rows, 'No active stays found.')}

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

    const rows=(d.charges||[]).map(c=>`<tr><td>${esc(c.description)}</td><td class="num">${php(c.amount)}</td></tr>`).join('');

    const status=d.settlement_status==='REFUND_DUE'?`Potential refund: ${php(d.settlement_delta)}`:(d.settlement_status==='ADDITIONAL_PAYMENT_DUE'?`Balance due: ${php(Math.abs(Number(d.settlement_delta)))}`:'Fully settled');

    return `<div class="checkout-receipt"><div class="text-center mb-3"><h4 class="mb-1">SHESH DEV HOTEL</h4><div class="small text-muted">Agora, Lapasan, Cagayan de Oro</div><h5 class="mt-3">${finalized?'FINAL CHECKOUT RECEIPT':'CHECKOUT BILL REVIEW'}</h5><div class="small text-muted">${finalized?'Finalized transaction':'Estimate — not yet finalized'}</div></div><hr><div class="row g-2 mb-3"><div class="col-6"><div class="small text-muted">Stay reference</div><strong>${esc(d.stay.stay_code)}</strong></div><div class="col-6 text-end"><div class="small text-muted">Folio</div><strong>${esc(d.stay.folio_number)}</strong></div><div class="col-6"><div class="small text-muted">Room</div><strong>${esc(d.stay.room_number)}</strong></div><div class="col-6 text-end"><div class="small text-muted">Guests / Nights</div><strong>${Number(d.nights_stayed)} night(s)</strong></div>${d.stay.guest_name?`<div class="col-12"><div class="small text-muted">Guest</div><strong>${esc(d.stay.guest_name)}</strong></div>`:''}<div class="col-12"><div class="small text-muted">Check-in</div><strong>${esc(d.stay.checkin_at)}</strong><div class="small text-muted mt-1">Scheduled checkout</div><strong>${esc(d.stay.planned_checkout)}</strong></div></div><table class="table table-sm"><thead><tr><th>Item</th><th class="text-end">Amount</th></tr></thead><tbody>${rows}<tr><td>Discounts / credits</td><td class="text-end">− ${php(d.discount_total)}</td></tr><tr><td>VAT (${Number(d.vat_rate)}%)</td><td class="text-end">${php(d.vat)}</td></tr></tbody><tfoot><tr><th>Total payable</th><th class="text-end">${php(d.final_amount)}</th></tr><tr><td>Payments received</td><td class="text-end">${php(d.payments_received)}</td></tr><tr><td>Completed refunds</td><td class="text-end">${php(d.refunds_completed)}</td></tr></tfoot></table><div class="alert alert-${d.settlement_status==='FULLY_SETTLED'?'success':(d.settlement_status==='REFUND_DUE'?'info':'warning')} mb-0"><strong>${esc(status)}</strong></div>${finalized?'<p class="small text-muted text-center mt-3 mb-0">Thank you for staying with us.</p>':''}</div>`;

  }

  function printCheckoutReceipt(d) {

    const rows=(d.charges||[]).map(c=>`<tr><td>${esc(c.description)}</td><td style="text-align:right">${php(c.amount)}</td></tr>`).join('');

    const w=window.open('','_blank','width=760,height=800'); if(!w){notify('Allow pop-ups to print the checkout receipt.',true);return;}

    w.document.write(`<!doctype html><html><head><title>Checkout Receipt · ${esc(d.stay.stay_code)}</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;color:#111;margin:28px}h2,h3,p{text-align:center;margin:5px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.num{text-align:right}.totals{margin-top:14px}.totals div{display:flex;justify-content:space-between;padding:5px 0}.muted{color:#555;font-size:12px}.status{border:1px solid #aaa;padding:10px;margin-top:15px;text-align:center}@media print{button{display:none}body{margin:12mm}}</style></head><body><h2>SHESH DEV HOTEL</h2><p>Agora, Lapasan, Cagayan de Oro</p><h3>FINAL CHECKOUT RECEIPT</h3><p class="muted">Stay ${esc(d.stay.stay_code)} · Folio ${esc(d.stay.folio_number)} · Room ${esc(d.stay.room_number)}${d.stay.guest_name?` · Guest: ${esc(d.stay.guest_name)}`:''}</p><p>Check-in: ${esc(d.stay.checkin_at)} · Actual checkout: ${esc(d.stay.actual_checkout||new Date().toLocaleString())}</p><table><thead><tr><th>Item</th><th class="num">Amount</th></tr></thead><tbody>${rows}<tr><td>Discounts / credits</td><td class="num">− ${php(d.discount_total)}</td></tr><tr><td>VAT (${Number(d.vat_rate)}%)</td><td class="num">${php(d.vat)}</td></tr></tbody></table><div class="totals"><div><strong>Total payable</strong><strong>${php(d.final_amount)}</strong></div><div><span>Payments received</span><span>${php(d.payments_received)}</span></div><div><span>Completed refunds</span><span>${php(d.refunds_completed)}</span></div><div><strong>Balance / refund status</strong><strong>${esc(d.settlement_status==='REFUND_DUE'?'Potential refund '+php(d.settlement_delta):(d.settlement_status==='ADDITIONAL_PAYMENT_DUE'?'Balance due '+php(Math.abs(Number(d.settlement_delta))):'Fully settled'))}</strong></div></div><div class="status">Checkout finalized · Room status: Cleaning</div><p style="margin-top:24px">Thank you for staying with us.</p><button onclick="window.print()">Print receipt</button><script>window.onload=()=>window.print()</script></body></html>`);

    w.document.close();

  }

  async function checkout(id) {

    try {

      const d=await api('final_bill_preview',{stay_id:id});

      const pending=d.pending_early_checkout_request;

      const isSettled = d.settlement_status === 'FULLY_SETTLED';

      const balanceDue = d.settlement_status === 'ADDITIONAL_PAYMENT_DUE' ? Math.abs(Number(d.settlement_delta)) : 0;

      const refundDue = d.settlement_status === 'REFUND_DUE' ? Number(d.settlement_delta) : 0;



      let statusAlert = '';

      if (pending) {

        statusAlert = `<div class="alert alert-danger mt-3 mb-0"><strong>Checkout blocked.</strong> Early checkout request #${Number(pending.id)} is ${pending.status==='REQUESTED'?'pending approval':'approved but not finalized'}. Open <strong>Early Checkout Approvals</strong> to resolve and finalize this request first. Checkout will remain unavailable until the request is finalized or rejected.</div>`;

      } else if (!isSettled && balanceDue > 0.009) {

        statusAlert = `<div class="alert alert-warning mt-3 mb-0 d-flex justify-content-between align-items-center flex-wrap gap-2"><div><strong><i class="bi bi-exclamation-triangle-fill me-1"></i>Payment Not Settled:</strong> Outstanding balance of <strong>${php(balanceDue)}</strong> must be settled before checkout.</div><button type="button" class="btn btn-sm btn-primary" id="checkout-settle-btn"><i class="bi bi-credit-card me-1"></i>Settle Balance / Pay Now</button></div>`;

      } else if (!isSettled && refundDue > 0.009) {

        statusAlert = `<div class="alert alert-info mt-3 mb-0"><strong><i class="bi bi-info-circle-fill me-1"></i>Overpayment / Potential Refund:</strong> The guest has an overpayment of <strong>${php(refundDue)}</strong>. Settle or complete refund before checkout.</div>`;

      }



      const canConfirm = isSettled && !pending;

      const x=modal('Final checkout · Receipt review',`${checkoutReceiptHtml(d,false)}${statusAlert}<div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-outline-secondary" id="cancel-checkout">Close</button><button type="button" class="btn btn-success" id="confirm-checkout" ${!canConfirm ? 'disabled title="Make sure payment is settled before checkout"' : ''}><i class="bi bi-check2-circle me-1"></i>Confirm checkout</button></div>`);

      x.root.querySelector('#cancel-checkout').onclick=()=>x.m.hide();

      x.root.querySelector('#checkout-settle-btn')?.addEventListener('click', () => {

        x.m.hide();

        pay(d.stay.folio_id, balanceDue);

      });

      if(!canConfirm)return;

      x.root.querySelector('#confirm-checkout').onclick=async e=>{

        const b=e.currentTarget;

        const confirmed = await window.HotelDialogs.confirm({

          title: 'Finalize Guest Checkout?',

          text: `Finalize checkout for Stay ${d.stay.stay_code} (Room ${d.stay.room_number})? Folio will be settled and room condition set to Cleaning.`,

          confirmButtonText: 'Finalize Checkout',

          actionType: 'success'

        });

        if (!confirmed) return;

        b.disabled=true;b.textContent='Finalizing…';

        try {

          await api('checkout',{stay_id:id});

          x.m.hide();

          const finalData={...d,stay:{...d.stay,actual_checkout:new Date().toLocaleString()},settlement_status:d.settlement_status};

          const y=modal('Checkout completed',`${checkoutReceiptHtml(finalData,true)}<div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-outline-secondary" id="close-checkout-receipt">Close</button><button type="button" class="btn btn-primary" id="print-checkout-receipt">Print receipt</button></div>`);

          y.root.querySelector('#close-checkout-receipt').onclick=()=>{y.m.hide();open(activeModule)};

          y.root.querySelector('#print-checkout-receipt').onclick=()=>printCheckoutReceipt(finalData);

          await open(activeModule);

        } catch(err) { b.disabled=false;b.innerHTML='<i class="bi bi-check2-circle me-1"></i>Confirm checkout';notify(err.message,true); }

      };

    } catch(e) { notify(e.message,true); }

  }

  async function roomStatus(id,status) {

    if(!status)return;

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

  async function requestStatus(id,status,reason='') { if(!status)return;try{const r=await api('request_status',{request_id:id,status,reason});if(r.room_transfer){const amt=Number(r.transfer_adjustment||0);const signed=(amt>0?'+':amt<0?'−':'')+php(Math.abs(amt));notify(`Room transfer applied. Bill adjustment ${signed} for ${Number(r.transfer_nights||0)} remaining night(s), effective ${r.effective_date||'next night'}.`);await open('dashboard');await open('active-stays');}else{notify(status==='COMPLETED'?'Request fulfilled; any chargeable amount was posted once.':'Request updated.');open('service-requests')}await refreshRequestBadge()}catch(e){notify(e.message,true)} }



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

      } else if (action === 'ACKNOWLEDGE') {

        await requestStatus(id, 'ACKNOWLEDGED');

      } else if (action === 'IN_PROGRESS' || action === 'ACCEPT_TRANSFER') {

        await requestStatus(id, 'IN_PROGRESS');

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

      showCheckinComplete({

        stay_code: b.dataset.stay,

        folio_number: b.dataset.folio || 'N/A',

        guest_portal_url: b.dataset.showQr

      });

    });

  }

  async function folio(id) {

    try {

      window.HotelBilling.currentOpenFolioId = id;

      const d=await api('folio',{folio_id:id}), f=d.folio, open=f.status==='OPEN', money=php;

      const curRole = (window.HotelAuth.getUser()?.role || '').toLowerCase();

      const canTakePayment = ['admin', 'manager', 'cashier'].includes(curRole);

      const canCheckout = ['admin', 'frontdesk', 'cashier'].includes(curRole);

      const canApplyDiscount = ['admin', 'frontdesk'].includes(curRole);

      const dateOnly=v=>String(v||'—').replace('T',' ').replace(/\s\d{2}:\d{2}:\d{2}.*/, '');



      const allCharges = d.charges || [];

      const roomCharges = allCharges.filter(c => (c.category||'').toUpperCase() === 'ROOM');

      const addCharges = allCharges.filter(c => (c.category||'').toUpperCase() !== 'ROOM');

      const roomTotal = roomCharges.reduce((s, c) => s + Number(c.amount||0), 0);

      const addTotal = addCharges.reduce((s, c) => s + Number(c.amount||0), 0);

      const discountTotal = Number(d.discount_total || 0);

      const vatAmount = Number(d.vat || 0);

      const vatRate = Number(d.vat_rate || 12);

      const final = Number(d.grand_total ?? (Number(d.total)-discountTotal+vatAmount));

      const balanceDue = Number(d.balance || 0);

      const isSettled = balanceDue <= 0.009;



      const chargesHtml = allCharges.map(c => {

        const isRoom = (c.category||'').toUpperCase() === 'ROOM';

        return `<div class="folio-line">

          <div>

            <strong>${esc(c.description)}</strong>

            <span class="badge ${isRoom ? 'text-bg-light border' : 'text-bg-secondary'} ms-1" style="font-size:10px;">${esc(c.category || 'CHARGE')}</span>

            <div class="folio-line-note">${Number(c.quantity)} × ${money(c.unit_price)}</div>

          </div>

          <strong>${money(c.amount)}</strong>

        </div>`;

      }).join('') || '<div class="folio-empty">No charges have been posted.</div>';



      const payments=(d.payments||[]).map(p=>`<div class="folio-line"><div><strong>${esc(p.method)}</strong><div class="folio-line-note">Receipt ${esc(p.receipt_number)} · ${dateOnly(p.created_at)}</div></div><div class="text-end"><strong>${money(p.amount)}</strong><br><button class="btn btn-link btn-sm p-0 text-warning" data-refund="${p.id}" data-amount="${p.amount}">Refund action</button></div></div>`).join('')||'<div class="folio-empty">No payments received yet.</div>';



      const discounts=(d.discounts||[]).map(z => {

        const who = z.applied_by_role

          ? `<span class="badge text-bg-light border text-uppercase ms-1" style="font-size:10px;">Applied by ${esc(z.applied_by_role)}${z.applied_by_username ? ` (${esc(z.applied_by_username)})` : ''}</span>`

          : '';

        return `<div class="folio-line"><div><strong>${esc(z.name)}</strong>${who}<div class="folio-line-note">${esc(z.status)}${z.reason ? ' · ' + esc(z.reason) : ''}</div></div><strong class="folio-positive">− ${money(z.amount)}</strong></div>`;

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

              <div class="small text-muted" style="font-size:11px;">Discounted (Front Desk)</div>

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



        <section class="folio-section"><div class="folio-section-title">Stay & checkout details</div><div class="folio-card p-3"><div class="folio-dates"><div><div class="folio-meta-label">Check-in</div><div class="folio-meta-value">${dateOnly(f.checkin_at)}</div></div><div><div class="folio-meta-label">Scheduled checkout</div><div class="folio-meta-value">${dateOnly(f.planned_checkout)}</div></div></div></div></section>

        <div class="folio-grid">

          <div>

            <section class="folio-section">

              <div class="folio-section-title">Bill breakdown</div>

              <div class="folio-card">

                ${chargesHtml}

                <div class="folio-totals">

                  <div class="folio-line"><span>Subtotal (Room &amp; Extras)</span><strong>${money(d.total)}</strong></div>

                  ${addTotal > 0 ? `<div class="folio-line text-muted"><span>  ↳ Additional incidental charges</span><strong>${money(addTotal)}</strong></div>` : ''}

                  ${discounts}

                  <div class="folio-line"><span>VAT (${vatRate}%)</span><strong>${money(vatAmount)}</strong></div>

                  <div class="folio-line folio-final"><span>Final bill (VAT included)</span><strong>${money(final)}</strong></div>

                  <div class="folio-line"><span>Payments received</span><strong>${money(d.paid)}</strong></div>

                  <div class="folio-line folio-final"><span>Balance due</span><strong class="${balanceDue > 0 ? 'text-danger' : 'folio-positive'}">${money(balanceDue)}</strong></div>

                </div>

              </div>

            </section>

          </div>

          <aside>

            <section class="folio-section"><div class="folio-section-title">Payment summary</div><div class="folio-card p-3"><div class="folio-meta-label">Total payments received</div><div class="folio-payment-total">${money(d.paid)}</div><hr><div class="folio-meta-label">VAT calculation</div><div class="folio-meta-value">${money(d.net_total ?? Number(d.total)-discountTotal)} × ${vatRate}%</div></div></section>

            <section class="folio-section"><div class="folio-section-title">Payment history</div><div class="folio-card">${payments}</div></section>

            <section class="folio-section">

              <div class="folio-section-title">Checkout settlement</div>

              <div class="folio-card folio-settlement">

                <div class="folio-line-note mb-2">The payment amount is validated against the VAT-inclusive final bill.</div>

                <div class="folio-line"><span>Final bill amount</span><strong>${money(final)}</strong></div>

                <div class="folio-line"><span>Payments received</span><strong>${money(d.paid)}</strong></div>

                <div class="folio-line"><span>Balance remaining</span><strong class="${balanceDue > 0 ? 'text-danger' : 'text-success'}">${money(balanceDue)}</strong></div>

                <div class="folio-actions">

                  ${open ? '<button class="btn btn-outline-primary" id="add-charge"><i class="bi bi-plus-circle me-1"></i>Add charge</button>' : ''}

                  ${canTakePayment ? `<button class="btn btn-primary" id="take-payment" ${!open || isSettled ? 'disabled' : ''}><i class="bi bi-credit-card me-1"></i>${isSettled ? 'Balance Settled' : 'Settle Balance / Pay'}</button>` : ''}

                  ${canCheckout ? `<button class="btn ${isSettled ? 'btn-success' : 'btn-outline-secondary'}" id="folio-checkout-btn" ${!open ? 'disabled' : ''}><i class="bi bi-box-arrow-right me-1"></i>${isSettled ? 'Check-Out Guest' : 'Check-Out (Settle Balance First)'}</button>` : ''}

                  <button class="btn btn-outline-secondary" onclick="window.print()"><i class="bi bi-printer me-1"></i>Print bill</button>

                </div>

              </div>

            </section>

            ${open && canApplyDiscount ? `<section class="folio-section"><div class="folio-section-title">Discount policy (Front Desk)</div><div class="folio-card folio-settlement"><label class="form-label">Available discount</label><select class="form-select mb-2" id="discount-policy"><option value="">Loading discounts…</option></select><input class="form-control mb-2" id="discount-reason" maxlength="255" placeholder="Reason or eligibility note"><button class="btn btn-success btn-sm" id="apply-discount">Apply discount</button></div></section>` : ''}

          </aside>

        </div>

      </div>`);



      x.root.classList.add('folio-modal');

      x.root.addEventListener('hidden.bs.modal',()=>{if(window.HotelBilling.currentOpenFolioId===id)window.HotelBilling.currentOpenFolioId=null;});

      x.root.querySelector('.modal-dialog').className='modal-dialog modal-dialog-centered modal-dialog-scrollable';

      x.root.querySelector('.modal-header').innerHTML=`<div><div class="folio-hotel">Shesh Dev Hotel</div><div class="folio-address">Agora, Lapasan, Cagayan de Oro</div></div><div class="d-flex align-items-center gap-2 ms-auto"><span class="folio-status">${esc(f.status)}</span><button class="btn-close ms-2" data-bs-dismiss="modal" aria-label="Close"></button></div>`;



      x.root.querySelector('#add-charge')?.addEventListener('click',()=>{x.m.hide();addCharge(id)});

      x.root.querySelector('#take-payment')?.addEventListener('click',()=>{x.m.hide();pay(id,Number(d.balance))});

      x.root.querySelectorAll('[data-refund]').forEach(b=>b.addEventListener('click',()=>{x.m.hide();refund(Number(b.dataset.refund),Number(b.dataset.amount),id)}));



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

        x.m.hide();

        checkout(f.stay_id);

      });



      if (canApplyDiscount) {

        const sel=x.root.querySelector('#discount-policy');

        if(sel){

          try{

            const pd=await api('discount_policies',{},'GET');

            sel.innerHTML='<option value="">Choose a discount</option>'+(pd.discounts||[]).map(z=>`<option value="${z.id}">${esc(z.name)} · ${z.discount_type==='PERCENT'?Number(z.discount_value)+'%':money(z.discount_value)}</option>`).join('');

            if(!(pd.discounts||[]).length)sel.innerHTML='<option value="">No active discounts configured</option>';

          }catch(_){

            sel.innerHTML='<option value="">Unable to load discount policies</option>';

          }

          x.root.querySelector('#apply-discount')?.addEventListener('click',async()=>{

            if(!sel.value)return notify('Select an available discount policy.',true);

            try{

              const r=await api('apply_discount',{folio_id:id,policy_id:Number(sel.value),reason:x.root.querySelector('#discount-reason').value});

              x.m.hide();

              notify(r.status==='PENDING'?'Discount submitted for manager approval.':`Discount applied: ${money(r.amount)}`);

              folio(id);

            }catch(err){notify(err.message,true)}

          });

        }

      }

    }catch(e){notify(e.message,true)}

  }

  window.HotelBilling={api,open,getActiveModule:()=>activeModule,notify,refreshRequestBadge,checkin,guestDetails,approveCheckinPayment,confirmCheckinPayment,cancelPendingCheckin,renderWalkinCheckin,renderCheckoutDashboard,renderEarlyCheckoutRequests,selectRoomForWalkin:(roomId)=>{const sel=document.getElementById('wkd-room-id');if(sel){sel.value=String(roomId);sel.dispatchEvent(new Event('change'));sel.scrollIntoView({behavior:'smooth',block:'center'});sel.focus();}},folio,addCharge,pay,refund,updateRefund,earlyCheckout,decideEarlyCheckout,finalizeEarlyCheckout,editEarlyPolicy,editDiscountPolicy,deleteDiscountPolicy,transfer,checkout,roomStatus,requestStatus,assignRequest,handleRequestAction,viewHistory,addRoom,editRoom,addRoomType,editRoomType,addMenuItem,editMenuItem,toggleMenuItem,reportDetails,savedGuestLinks,showCheckinComplete,showStayQr,showReceiptModal};

  document.addEventListener('hotel:authenticated',(event)=>{

    const uRole = (event.detail?.user?.role || '').toLowerCase();

    const isDeptStaff = ['service','housekeeping','maintenance','bar','restaurant','valet','parking','parkingvalet','parking_valet','laundry','other'].includes(uRole);

    if (!window.HotelModulesHelper) {

      open(isDeptStaff ? 'service-requests' : 'dashboard');

    }

    refreshRequestBadge();

    if(window.hotelRequestBadgeTimer)clearInterval(window.hotelRequestBadgeTimer);

    window.hotelRequestBadgeTimer=setInterval(refreshRequestBadge,30000);

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
