/* Front Desk group check-in UI. Uses the existing HotelAuth bridge and group_checkin API action. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (v) => '₱' + Number(v || 0).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2});
  const api = (...args) => window.HotelAuth.request(...args);
  let rooms = [], rowId = 0, loading = false;

  function availableRooms() {
    return rooms.filter(r => String(r.status || '').toUpperCase() === 'AVAILABLE');
  }
  function roomId(r) { return Number(r.id ?? r.room_id); }
  function roomNumber(r) { return r.room_number ?? r.number ?? r.room_no ?? roomId(r); }
  function roomRate(r) { return Number(r.rate ?? r.nightly_rate ?? r.base_rate ?? r.room_rate ?? 0); }
  function roomCapacity(r) { return Number(r.capacity ?? r.max_guests ?? r.max_occupancy ?? 1); }
  function selectedIds() {
    return [...document.querySelectorAll('.gci-room-select')].map(s => Number(s.value)).filter(Boolean);
  }
  function options(selected) {
    const used = selectedIds().filter(id => id !== selected);
    const rows = availableRooms().filter(r => !used.includes(roomId(r)));
    return '<option value="">Choose available room</option>' + rows.map(r =>
      '<option value="' + roomId(r) + '"' + (roomId(r) === selected ? ' selected' : '') + '>' +
      esc(roomNumber(r)) + ' · ' + esc(r.room_type_name ?? r.room_type ?? 'Room') + ' · ' + money(roomRate(r)) + '/night (VAT-inclusive) · capacity ' + roomCapacity(r) + '</option>'
    ).join('');
  }
  function rowHtml(id) {
    return '<tr data-gci-row="' + id + '">' +
      '<td class="align-middle row-number"></td>' +
      '<td><select class="form-select gci-room-select" required aria-label="Room">' + options(0) + '</select><div class="small text-muted mt-1 gci-room-meta">Select an available room</div></td>' +
      '<td><input class="form-control gci-guests" type="number" min="1" max="20" value="1" required aria-label="Guest count"><textarea class="form-control form-control-sm mt-2 gci-occupants" rows="2" placeholder="Enter occupant names, one per line" aria-label="Occupant names" required></textarea><div class="small text-muted mt-1">Enter one full name per guest.</div></td>' +
      '<td class="text-end align-middle fw-semibold gci-line-total">—</td>' +
      '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger gci-remove" aria-label="Remove room"><i class="bi bi-trash"></i></button></td>' +
      '</tr>';
  }
  function refreshRows() {
    const rows = [...document.querySelectorAll('#gci-rooms-body tr')];
    rows.forEach((tr, i) => {
      tr.querySelector('.row-number').textContent = i + 1;
      const sel = tr.querySelector('.gci-room-select'), current = Number(sel.value || 0);
      sel.innerHTML = options(current);
      const room = rooms.find(r => roomId(r) === Number(sel.value));
      const guests = tr.querySelector('.gci-guests');
      if (room) {
        guests.max = roomCapacity(room);
        if (Number(guests.value) > roomCapacity(room)) guests.value = roomCapacity(room);
        tr.querySelector('.gci-occupants').rows = Math.min(6, Math.max(2, Number(guests.value)));
        tr.querySelector('.gci-room-meta').textContent = (room.room_type_name ?? room.room_type ?? 'Room') + ' · capacity ' + roomCapacity(room) + ' · ' + money(roomRate(room)) + ' per night, VAT-inclusive';
        tr.querySelector('.gci-line-total').textContent = money(roomRate(room) * Math.max(1, Math.round((new Date($('gci-departure').value + 'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000)));
      } else {
        tr.querySelector('.gci-room-meta').textContent = 'Select an available room';
        tr.querySelector('.gci-line-total').textContent = '—';
      }
    });
    const departure = $('gci-departure')?.value;
    const nights = Math.max(1, departure ? Math.round((new Date(departure + 'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000) : 1);
    const total = rows.reduce((sum, tr) => {
      const r = rooms.find(x => roomId(x) === Number(tr.querySelector('.gci-room-select').value));
      return sum + (r ? roomRate(r) * nights : 0);
    }, 0);
    if ($('gci-room-count')) $('gci-room-count').textContent = rows.length;
    if ($('gci-night-count')) $('gci-night-count').textContent = nights;
    if ($('gci-estimated-total')) $('gci-estimated-total').textContent = money(total);
    if ($('gci-add-room')) $('gci-add-room').disabled = rows.length >= 20 || availableRooms().length <= rows.length;
    if ($('gci-submit')) $('gci-submit').disabled = loading || rows.length < 2 || rows.some(tr => !tr.querySelector('.gci-room-select').value);
  }
  function localDateOffset(days) { const d = new Date(); d.setDate(d.getDate() + days); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }
  function buildPanel() {
    if ($('panel-group-checkin')) return;
    const panel = document.createElement('section');
    panel.id = 'panel-group-checkin';
    panel.className = 'panel-section';
    panel.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div><h3 class="h4 fw-bold mb-1"><i class="bi bi-people-fill text-primary me-2"></i>Group Check-In</h3>
        <p class="text-muted mb-0">Check in multiple rooms for a group arriving together. Each room keeps its own stay, folio and payment record.</p></div>
        <span class="badge text-bg-primary px-3 py-2">Front Desk</span>
      </div>
      <div id="gci-alert" class="alert d-none" role="status"></div>
      <form id="gci-form" novalidate>
        <div class="row g-3 align-items-start">
          <div class="col-xl-8">
            <div class="card border-0 shadow-sm mb-3"><div class="card-header bg-white py-3"><h5 class="h6 mb-0 fw-bold"><i class="bi bi-person-vcard me-2 text-primary"></i>Primary Guest / Group Contact</h5></div>
              <div class="card-body"><div class="row g-3">
                <div class="col-md-6"><label for="gci-first" class="form-label">First name *</label><input id="gci-first" class="form-control" maxlength="100" required></div>
                <div class="col-md-6"><label for="gci-last" class="form-label">Last name *</label><input id="gci-last" class="form-control" maxlength="100" required></div>
                <div class="col-md-6"><label for="gci-contact" class="form-label">Contact number</label><input id="gci-contact" class="form-control" maxlength="40" autocomplete="tel"></div>
                <div class="col-md-6"><label for="gci-email" class="form-label">Email</label><input id="gci-email" class="form-control" type="email" maxlength="190" autocomplete="email"></div>
                <div class="col-md-8"><label for="gci-name" class="form-label">Group name (optional)</label><input id="gci-name" class="form-control" maxlength="120" placeholder="e.g. Santos Family"></div>
                <div class="col-md-4"><label for="gci-departure" class="form-label">Expected Departure Date *</label><input id="gci-departure" class="form-control" type="date" required></div>
              </div></div>
            </div>
            <div class="card border-0 shadow-sm"><div class="card-header bg-white py-3 d-flex flex-wrap justify-content-between align-items-center gap-2"><div><h5 class="h6 mb-1 fw-bold"><i class="bi bi-door-open me-2 text-primary"></i>Room Selection</h5><div class="small text-muted">Choose at least two available rooms. Guest counts are checked against room capacity.</div></div><button id="gci-add-room" class="btn btn-outline-primary btn-sm" type="button"><i class="bi bi-plus-lg me-1"></i>Add room</button></div>
              <div class="card-body p-0"><div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead class="table-light"><tr><th>#</th><th>Available room</th><th style="width:220px">Guests / Occupant names</th><th class="text-end">Room total*</th><th></th></tr></thead><tbody id="gci-rooms-body"></tbody></table></div></div>
              <div class="card-footer bg-white small text-muted">*Estimated room charges and room rates are VAT-inclusive. Final VAT breakdowns are calculated by the server.</div>
            </div>
          </div>
          <div class="col-xl-4"><div class="card border-0 shadow-sm mb-3"><div class="card-header bg-white py-3"><h5 class="h6 fw-bold mb-0"><i class="bi bi-receipt me-2 text-primary"></i>Group Stay Summary</h5></div><div class="card-body">
            <div class="d-flex justify-content-between mb-2"><span class="text-muted">Rooms</span><strong id="gci-room-count">2</strong></div>
            <div class="d-flex justify-content-between mb-3"><span class="text-muted">Nights</span><strong id="gci-night-count">1</strong></div><hr>
            <div class="d-flex justify-content-between align-items-start gap-2"><span>Estimated room charges (VAT-inclusive)</span><strong id="gci-estimated-total" class="text-primary fs-5">₱0.00</strong></div>
            <div class="alert alert-warning small mt-3 mb-0"><i class="bi bi-info-circle me-1"></i>Payment requirements and VAT breakdown follow the hotel’s server-side policy. Each room receives its own payment record. No payment is collected by this form.</div>
          </div></div>
          <div class="d-grid gap-2"><button id="gci-submit" type="submit" class="btn btn-primary btn-lg"><i class="bi bi-check2-circle me-2"></i>Process Group Check-In</button><button id="gci-refresh" type="button" class="btn btn-outline-secondary"><i class="bi bi-arrow-clockwise me-1"></i>Refresh room availability</button></div>
          <p class="small text-muted mt-3">Room availability is rechecked by the server when you submit. Review guest details before processing.</p>
          </div>
        </div>
      </form>`;
    $('panel-settings')?.parentElement?.appendChild(panel) || $('dashboard-container')?.appendChild(panel);
    $('gci-add-room').addEventListener('click', () => {
      const body = $('gci-rooms-body');
      if (body.children.length >= 20) return;
      const tr = document.createElement('tbody'); tr.innerHTML = rowHtml(++rowId);
      body.appendChild(tr.firstElementChild);
      refreshRows();
    });
    $('gci-rooms-body').addEventListener('change', refreshRows);
    $('gci-rooms-body').addEventListener('input', refreshRows);
    $('gci-rooms-body').addEventListener('click', e => {
      const btn = e.target.closest('.gci-remove');
      if (!btn) return;
      if ($('gci-rooms-body').children.length <= 2) return showAlert('Keep at least two rooms for a group check-in.', true);
      btn.closest('tr').remove(); refreshRows();
    });
    $('gci-departure').addEventListener('input', refreshRows);
    $('gci-refresh').addEventListener('click', loadRooms);
    $('gci-form').addEventListener('submit', submitGroup);
    $('gci-departure').value = localDateOffset(1);
    addRow(); addRow();
  }
  function addRow() {
    const holder = document.createElement('tbody'); holder.innerHTML = rowHtml(++rowId);
    $('gci-rooms-body').appendChild(holder.firstElementChild);
  }
  function showAlert(message, bad=false) {
    const el = $('gci-alert'); if (!el) return;
    el.className = 'alert ' + (bad ? 'alert-danger' : 'alert-success');
    el.textContent = message; el.classList.remove('d-none');
    el.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function loadRooms() {
    try {
      const data = await api('rooms', {}, 'GET');
      rooms = (data.rooms || []).map(r => ({...r, id: roomId(r)}));
      refreshRows();
      const available = availableRooms().length;
      if (available < 2) showAlert('At least two available rooms are required. Available rooms found: ' + available + '.', true);
      else { const alert = $('gci-alert'); alert?.classList.add('d-none'); }
    } catch (e) { showAlert('Could not load room availability: ' + e.message, true); }
  }
  async function submitGroup(e) {
    e.preventDefault();
    if (loading) return;
    let timePolicy;
    try { timePolicy = await api('hotel_time_policy', {}, 'GET'); }
    catch (err) { showAlert('Could not verify the hotel check-in time: ' + err.message, true); return; }
    if (!timePolicy.checkin_open) {
      showAlert(`Group check-in opens at 2:00 PM (${timePolicy.timezone}). Current hotel time: ${timePolicy.hotel_now}.`, true);
      return;
    }
    const form = $('gci-form');
    if (!form.reportValidity()) return;
    const rows = [...$('gci-rooms-body').querySelectorAll('tr')];
    const roomList = rows.map(tr => ({room_id:Number(tr.querySelector('.gci-room-select').value), guests:Number(tr.querySelector('.gci-guests').value), occupant_names:tr.querySelector('.gci-occupants').value.split(/\r?\n/).map(n => n.trim()).filter(Boolean)}));
    if (roomList.length < 2 || roomList.some(r => !r.room_id || r.guests < 1)) return showAlert('Select at least two rooms and valid guest counts.', true);
    if (roomList.some(r => r.occupant_names.length !== r.guests || r.occupant_names.some(n => n.length > 150))) return showAlert('Enter exactly one occupant name per guest in every room (150 characters maximum per name).', true);
    const departure = $('gci-departure').value;
    const today = Date.parse(timePolicy.hotel_now.slice(0, 10) + 'T00:00:00Z');
    const departureDate = Date.parse(departure + 'T00:00:00Z');
    const nights = Math.round((departureDate - today) / 86400000);
    if (!departure || !Number.isFinite(nights) || nights < 1 || nights > 90) return showAlert('Expected Departure Date must be between tomorrow and 90 days from today.', true);
    if (new Set(roomList.map(r => r.room_id)).size !== roomList.length) return showAlert('Each room can only be selected once.', true);
    const payload = {rooms:roomList,expected_departure_date:departure,first_name:$('gci-first').value.trim(),last_name:$('gci-last').value.trim(),contact_number:$('gci-contact').value.trim(),email:$('gci-email').value.trim()};
    if (!payload.first_name || !payload.last_name) return showAlert('Primary guest first and last name are required.', true);
    loading = true; $('gci-submit').disabled = true; $('gci-submit').innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing group check-in…';
    try {
      const result = await api('group_checkin', payload);
      showAlert('Group check-in created successfully. Group code: ' + (result.group_code || 'created') + '. ' + ((result.stays || []).length) + ' stay(s) created.', false);
      const details = (result.stays || []).map(s => 'Room ' + (s.room_number ?? s.room_id ?? '') + ': stay ' + (s.stay_code ?? s.stay_id ?? '') + ', folio ' + (s.folio_number ?? 'created')).join('\n');
      if (details) window.HotelDialogs?.alert ? window.HotelDialogs.alert({title:'Group Check-In Complete',text:'Group code: '+(result.group_code || '—')+'\n'+details,icon:'success'}) : window.alert('Group code: '+(result.group_code || '—')+'\n'+details);
      form.reset(); $('gci-departure').value = localDateOffset(1);
      $('gci-rooms-body').innerHTML = ''; addRow(); addRow(); await loadRooms();
    } catch (err) { showAlert(err.message || 'Group check-in failed. No success was reported.', true); }
    finally { loading = false; $('gci-submit').innerHTML = '<i class="bi bi-check2-circle me-2"></i>Process Group Check-In'; refreshRows(); }
  }
  async function openPanel() {
    const role = String(window.HotelAuth?.getUser()?.role || '').toLowerCase();
    const perms = window.HotelAuth?.getUser()?.permissions || [];
    if (!['admin','manager','frontdesk'].includes(role) || (perms.length && !perms.includes('*') && !perms.includes('stays.checkin'))) {
      window.HotelBilling?.notify?.('You do not have permission to use group check-in.', true); return;
    }
    document.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
    $('panel-group-checkin')?.classList.add('active');
    document.querySelectorAll('#sidebar-nav [data-module]').forEach(b => b.classList.toggle('active', b.dataset.module === 'group-checkin'));
    if ($('module-title-text')) $('module-title-text').textContent = 'Group Check-In';
    if ($('module-sub-text')) $('module-sub-text').textContent = 'Multiple rooms for one group stay';
    if ($('crumb-current')) $('crumb-current').textContent = 'Group Check-In';
    await loadRooms();
  }
  window.HotelGroupCheckin = { open: openPanel };
  function init() {
    if (!window.HotelAuth || !document.body) return;
    buildPanel();
    document.addEventListener('hotel:authenticated', () => {
      const role = String(window.HotelAuth?.getUser()?.role || '').toLowerCase();
      const allowed = ['admin','manager','frontdesk'].includes(role);
      window.HotelModulesHelper?.rebuildSidebar?.(role);
    });
    const role = String(window.HotelAuth?.getUser()?.role || '').toLowerCase();
    if (window.HotelAuth?.getUser()) window.HotelModulesHelper?.rebuildSidebar?.(role);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
