/**
 * Hotel Billing Real-Time WebSocket Client
 * Connects browsers to the WebSocket server on port 8085.
 * Handles automatic authentication, event dispatching, and auto-reconnection.
 */
(() => {
  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let heartbeatTimer = null;

  function getWsUrl() {
    const host = location.hostname || 'localhost';
    return `ws://${host}:8085`;
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const url = getWsUrl();
      ws = new WebSocket(url);

      ws.onopen = () => {
        const wasReconnecting = reconnectAttempts > 0;
        reconnectAttempts = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        // Send authentication
        const user = window.HotelAuth?.getUser();
        if (user) {
          ws.send(JSON.stringify({
            action: 'authenticate',
            role: user.role,
            department: user.role,
            username: user.username
          }));
        }

        // Reconcile data after reconnecting
        if (wasReconnecting) {
          const active = window.HotelBilling?.getActiveModule?.();
          if (active) window.HotelBilling?.open(active);
          window.HotelBilling?.refreshRequestBadge?.();
        }

        // Start ping heartbeat
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleServerEvent(payload);
        } catch (e) {}
      };

      ws.onclose = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        scheduleReconnect();
      };

      ws.onerror = () => {
        try { ws.close(); } catch (_) {}
      };
    } catch (e) {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 15000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function matchDept(userRole, targetDept) {
    if (!userRole || !targetDept) return false;
    const u = String(userRole).toLowerCase().replace(/[ _-]/g, '');
    const t = String(targetDept).toLowerCase().replace(/[ _-]/g, '');
    if (u === t) return true;
    if (['restaurant', 'foodbeverage', 'food'].includes(u) && ['restaurant', 'foodbeverage', 'food'].includes(t)) return true;
    if (['bar', 'minibar'].includes(u) && ['bar', 'minibar'].includes(t)) return true;
    if (['valet', 'parking', 'parkingvalet'].includes(u) && ['valet', 'parking', 'parkingvalet'].includes(t)) return true;
    if (['service', 'concierge', 'frontdesk', 'other'].includes(u) && ['service', 'concierge', 'frontdesk', 'other'].includes(t)) return true;
    if (['housekeeping', 'laundry'].includes(u) && ['housekeeping', 'laundry'].includes(t)) return true;
    return false;
  }

  function handleServerEvent(msg) {
    if (!msg || !msg.event) return;

    // Dispatch global custom event for modules to react
    document.dispatchEvent(new CustomEvent('hotel:ws_event', { detail: msg }));

    const data = msg.data || {};
    const curUser = window.HotelAuth?.getUser();
    const curRole = (curUser?.role || '').toLowerCase();
    const isLocalActor = Boolean(curUser && data.actor_id && Number(curUser.id) === Number(data.actor_id));

    switch (msg.event) {
      case 'REQUEST_CREATED': {
        const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(curRole);
        const isDept = matchDept(curRole, data.assigned_department);
        if (isSupervisory || isDept) {
          if (!isLocalActor) {
            showNotification(`New request: Room ${data.room_number || '—'} · ${data.description || ''}`);
          }
          const active = window.HotelBilling?.getActiveModule?.();
          if (active === 'service-requests' || active === 'dashboard') {
            window.HotelBilling?.open(active);
          }
          window.HotelBilling?.refreshRequestBadge?.();
        }
        break;
      }
      case 'ROOM_TRANSFER_REQUESTED': {
        if (['admin', 'manager', 'frontdesk'].includes(curRole)) {
          showNotification(
            `Room transfer request ${data.request_code || ''}: Room ${data.room_number || '—'} → Room ${data.requested_room_number || '—'}`
          );
          const active = window.HotelBilling?.getActiveModule?.();
          if (active === 'dashboard' || active === 'service-requests') {
            window.HotelBilling?.open(active);
          }
          window.HotelBilling?.refreshRequestBadge?.();
        }
        break;
      }
      case 'REQUEST_ASSIGNED': {
        const isDept = matchDept(curRole, data.assigned_department);
        const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(curRole);
        if (!isLocalActor) {
          if (isDept) {
            showNotification(`Order assigned to your department! Room ${data.room_number || '—'}: ${data.description || ''}`);
          } else if (isSupervisory) {
            showNotification(`Request ${data.request_code} assigned to ${data.assigned_department}`);
          }
        }
        const active = window.HotelBilling?.getActiveModule?.();
        if (active === 'service-requests' || active === 'dashboard') {
          window.HotelBilling?.open(active);
        }
        window.HotelBilling?.refreshRequestBadge?.();
        break;
      }
      case 'REQUEST_STATUS_CHANGED':
      case 'REQUEST_ACKNOWLEDGED':
      case 'REQUEST_ON_HOLD':
      case 'REQUEST_COMPLETED':
      case 'REQUEST_CANCELLED':
      case 'REQUEST_REJECTED': {
        const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(curRole);
        const isDept = matchDept(curRole, data.assigned_department);
        if (isSupervisory || isDept) {
          if (!isLocalActor) {
            const statusText = (data.status || '').replace(/_/g, ' ');
            showNotification(`Room ${data.room_number || '—'} request ${data.request_code || ''}: ${statusText}`);
          }
          const active = window.HotelBilling?.getActiveModule?.();
          if (active === 'service-requests' || active === 'dashboard') {
            window.HotelBilling?.open(active);
          }
          window.HotelBilling?.refreshRequestBadge?.();
        }
        break;
      }
      case 'RESTAURANT_ORDER_CREATED': {
        const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(curRole);
        const isRestaurant = matchDept(curRole, 'restaurant');
        if (isSupervisory || isRestaurant) {
          if (!isLocalActor) {
            showNotification(`New restaurant order ${data.order_code || ''}: Room ${data.room_number || '—'}`);
          }
          const active = window.HotelBilling?.getActiveModule?.();
          if (active === 'service-requests' || active === 'dashboard') {
            window.HotelBilling?.open(active);
          }
          window.HotelBilling?.refreshRequestBadge?.();
        }
        break;
      }
      case 'RESTAURANT_ORDER_STATUS_CHANGED': {
        const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(curRole);
        const isRestaurant = matchDept(curRole, 'restaurant');
        if (isSupervisory || isRestaurant) {
          if (!isLocalActor) {
            showNotification(`Restaurant order ${data.order_code || ''}: ${data.order_status || 'updated'}`);
          }
          const active = window.HotelBilling?.getActiveModule?.();
          if (active === 'service-requests' || active === 'dashboard') {
            window.HotelBilling?.open(active);
          }
          window.HotelBilling?.refreshRequestBadge?.();
        }
        break;
      }
      case 'GUEST_REGISTERED': {
        const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(curRole);
        if (isSupervisory) {
          if (!isLocalActor) {
            showNotification(`Guest registered: Room ${data.room_number || '—'} · ${data.guest_name || 'Guest'}`);
          }
          const active = window.HotelBilling?.getActiveModule?.();
          if (active === 'active-stays' || active === 'service-requests') {
            window.HotelBilling?.open(active);
          }
        }
        break;
      }
      case 'CHECKIN_PAYMENT_CREATED': {
        const canSettle = ['cashier', 'admin', 'manager'].includes(curRole);
        if (canSettle) {
          if (!isLocalActor) {
            const reqAmt = Number(data.required_amount || 0).toLocaleString('en-PH', {minimumFractionDigits: 2});
            if (window.HotelDialogs?.toast) {
              window.HotelDialogs.toast({
                title: `Front Desk Check-in: Room ${data.room_number || '—'} · ${data.guest_name || 'Guest'} (₱${reqAmt}) is waiting for payment approval!`,
                icon: 'warning',
                timer: 7000
              });
            } else {
              showNotification(`New check-in for payment: Room ${data.room_number || '—'} · ${data.guest_name || 'Guest'} · ₱${reqAmt}`);
            }
          }
          const active = window.HotelBilling?.getActiveModule?.();
          if (['payments', 'dashboard', 'billing', 'transactions', 'active-stays'].includes(active)) {
            window.HotelBilling?.open(active);
          }
        }
        break;
      }
      case 'CHECKIN_PAYMENT_CONFIRMED': {
        if (curRole === 'cashier') {
          if (!isLocalActor) {
            showNotification(`Front Desk confirmed payment: Room ${data.room_number || '—'} · ${data.guest_name || 'Guest'} · Receipt ${data.receipt_number || ''} · confirmed by ${data.confirmed_by || 'Front Desk'}`);
          }
          const active = window.HotelBilling?.getActiveModule?.();
          if (['payments', 'dashboard', 'billing', 'transactions'].includes(active)) {
            window.HotelBilling?.open(active);
          }
        } else if (['admin', 'manager', 'frontdesk'].includes(curRole) && !isLocalActor) {
          const active = window.HotelBilling?.getActiveModule?.();
          if (['active-stays', 'dashboard'].includes(active)) {
            window.HotelBilling?.open(active);
          }
        }
        break;
      }
      case 'CHECKIN_PAYMENT_APPROVED': {
        const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(curRole);
        if (isSupervisory && !isLocalActor) {
          showNotification(`Payment verified: Room ${data.room_number || '—'} · ${data.guest_name || 'Guest'} · Receipt ${data.receipt_number || ''} — check-in confirmed`);
        }
        if (isSupervisory || curRole === 'cashier') {
          const active = window.HotelBilling?.getActiveModule?.();
          if (['active-stays', 'payments', 'dashboard', 'billing', 'transactions'].includes(active)) {
            window.HotelBilling?.open(active);
          }
        }
        break;
      }
      case 'CHECKIN_PAYMENT_CANCELLED': {
        const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(curRole);
        if (isSupervisory) {
          if (!isLocalActor) {
            showNotification(`Pending check-in cancelled: Room ${data.room_number || '—'} · ${data.stay_code || ''}`);
          }
          const active = window.HotelBilling?.getActiveModule?.();
          if (['active-stays', 'payments', 'dashboard'].includes(active)) {
            window.HotelBilling?.open(active);
          }
        }
        break;
      }
      case 'CATALOG_ITEM_TOGGLED':
      case 'CATALOG_UPDATED': {
        const active = window.HotelBilling?.getActiveModule?.();
        if (active === 'catalog') {
          window.HotelBilling?.open('catalog');
        }
        const chargeMenu = document.getElementById('charge-menu-item');
        if (chargeMenu && data.id) {
          const opt = Array.from(chargeMenu.options).find(o => String(o.value) === String(data.id));
          if (Number(data.active) === 0) {
            if (opt) opt.remove();
          } else if (opt) {
            opt.textContent = `${data.category || ''} · ${data.name} — ₱${Number(data.price||0).toFixed(2)}`;
          } else {
            const newOpt = document.createElement('option');
            newOpt.value = String(data.id);
            newOpt.textContent = `${data.category || ''} · ${data.name} — ₱${Number(data.price||0).toFixed(2)}`;
            chargeMenu.appendChild(newOpt);
          }
        }
        if (!isLocalActor) {
          const actionLabel = msg.event === 'CATALOG_ITEM_TOGGLED'
            ? (Number(data.active) ? 'enabled' : 'disabled')
            : 'updated';
          showNotification(`Menu update: "${data.name || 'Item'}" was ${actionLabel}.`);
        }
        break;
      }
      case 'ROOM_STATUS_CHANGED': {
        const active = window.HotelBilling?.getActiveModule?.();
        if (['rooms', 'dashboard', 'catalog', 'active-stays'].includes(active)) {
          window.HotelBilling?.open(active);
        }
        if (!isLocalActor && data.room_number && data.status) {
          showNotification(`Room ${data.room_number} condition: ${data.status}`);
        }
        break;
      }
      case 'ROOM_TYPE_UPDATED': {
        const active = window.HotelBilling?.getActiveModule?.();
        if (['catalog', 'rooms'].includes(active)) {
          window.HotelBilling?.open(active);
        }
        break;
      }
      case 'STAY_CHECKIN':
      case 'STAY_CHECKOUT':
      case 'STAY_UPDATED': {
        const active = window.HotelBilling?.getActiveModule?.();
        if (['active-stays', 'dashboard', 'rooms'].includes(active)) {
          window.HotelBilling?.open(active);
        }
        if (!isLocalActor) {
          if (msg.event === 'STAY_CHECKIN') {
            showNotification(`Check-in: Room ${data.room_number || '—'} (${data.guest_name || 'Guest'})`);
          } else if (msg.event === 'STAY_CHECKOUT') {
            showNotification(`Check-out: Room ${data.room_number || '—'}`);
          } else if (msg.event === 'STAY_UPDATED') {
            showNotification(`Stay updated: Room ${data.room_number || '—'}`);
          }
        }
        break;
      }
      case 'FOLIO_UPDATED': {
        const active = window.HotelBilling?.getActiveModule?.();
        if (['dashboard', 'active-stays', 'transactions', 'payments', 'billing'].includes(active)) {
          window.HotelBilling?.open(active);
        }
        if (window.HotelBilling?.currentOpenFolioId && Number(window.HotelBilling.currentOpenFolioId) === Number(data.folio_id)) {
          window.HotelBilling?.folio(Number(data.folio_id));
        }
        break;
      }
      case 'DISCOUNT_UPDATED': {
        const active = window.HotelBilling?.getActiveModule?.();
        if (['discount-approvals', 'billing', 'dashboard', 'payments'].includes(active)) {
          window.HotelBilling?.open(active);
        }
        break;
      }
      case 'EARLY_CHECKOUT_UPDATED': {
        const active = window.HotelBilling?.getActiveModule?.();
        if (['early-checkouts', 'dashboard', 'active-stays'].includes(active)) {
          window.HotelBilling?.open(active);
        }
        break;
      }
      case 'REFUND_UPDATED': {
        const active = window.HotelBilling?.getActiveModule?.();
        if (['billing', 'reports', 'dashboard', 'payments'].includes(active)) {
          window.HotelBilling?.open(active);
        }
        break;
      }
      case 'PERMISSIONS_UPDATED': {
        const affectedRole = String(data.role || '').toLowerCase().replace(/[ _-]/g, '');
        const myRole = String(curRole || '').toLowerCase().replace(/[ _-]/g, '');
        if (myRole === affectedRole) {
          showNotification('Your role permissions have been updated by an administrator.');
          if (window.HotelAuth?.refreshSession) {
            window.HotelAuth.refreshSession().then(() => {
              if (window.HotelModulesHelper?.rebuildSidebar) {
                window.HotelModulesHelper.rebuildSidebar(curRole);
              }
            });
          }
        }
        document.dispatchEvent(new CustomEvent('hotel:permissions_updated', { detail: data }));
        break;
      }
    }
  }

  function showNotification(text) {
    if (typeof window.HotelBilling?.notify === 'function') {
      window.HotelBilling.notify(text);
    } else {
      const el = document.createElement('div');
      el.className = 'alert alert-info shadow position-fixed';
      el.style.cssText = 'right:20px;bottom:20px;z-index:4000;max-width:420px;font-weight:600;';
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4500);
    }
  }

  // Connect when authenticated or DOM is ready
  document.addEventListener('hotel:authenticated', (e) => {
    connect();
    if (ws && ws.readyState === WebSocket.OPEN) {
      const user = e.detail?.user;
      if (user) {
        ws.send(JSON.stringify({
          action: 'authenticate',
          role: user.role,
          department: user.role,
          username: user.username
        }));
      }
    }
  });

  window.HotelRealtime = {
    connect,
    send: (payload) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    },
    isConnected: () => ws && ws.readyState === WebSocket.OPEN
  };

  // Keep open queues and boards current if the WebSocket server is unavailable.
  const BOARD_MODULES = ['dashboard', 'rooms', 'active-stays', 'service-requests'];
  function refreshBoard() {
    if (document.visibilityState !== 'visible') return;
    if (document.querySelector('.modal.show')) return;
    const active = window.HotelBilling?.getActiveModule?.();
    if (active && BOARD_MODULES.includes(active)) {
      window.HotelBilling?.open(active);
    }
  }
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    refreshBoard();
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshBoard();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect, { once: true });
  } else {
    connect();
  }
})();
