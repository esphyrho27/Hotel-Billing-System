/**
 * Hotel Billing System - Real-Time WebSocket Server
 * Listens on port 8085 for WebSocket clients (browsers).
 * Listens on port 8086 for internal event triggers from PHP backend.
 */
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 8085;
const HTTP_PORT = process.env.WS_HTTP_PORT ? parseInt(process.env.WS_HTTP_PORT, 10) : 8086;

const wss = new WebSocketServer({ port: WS_PORT }, () => {
  console.log(`[WebSocket] Server running on ws://0.0.0.0:${WS_PORT}`);
});

// Map of client connections with metadata
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).slice(2);
  const clientMeta = {
    id: clientId,
    role: 'guest',
    department: null,
    stayCode: null,
    ip: req.socket.remoteAddress
  };
  clients.set(ws, clientMeta);

  // Send welcome and connection confirmation
  ws.send(JSON.stringify({
    event: 'CONNECTED',
    clientId,
    timestamp: new Date().toISOString()
  }));

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (payload.action === 'authenticate' || payload.type === 'auth' || payload.action === 'auth') {
        clientMeta.role = (payload.role || 'guest').toLowerCase();
        clientMeta.department = (payload.department || payload.role || '').toLowerCase();
        clientMeta.stayCode = String(payload.stayCode || payload.stay_code || '').trim().toUpperCase() || null;
        clientMeta.username = payload.username || null;
        clients.set(ws, clientMeta);

        ws.send(JSON.stringify({
          event: 'AUTHENTICATED',
          role: clientMeta.role,
          department: clientMeta.department,
          stayCode: clientMeta.stayCode
        }));
      } else if (payload.action === 'ping') {
        ws.send(JSON.stringify({ event: 'PONG', timestamp: Date.now() }));
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

// Helper to normalize department and role names for consistent matching
function normalizeDept(d) {
  if (!d) return '';
  const s = String(d).toLowerCase().replace(/[ _-]/g, '');
  if (['restaurant', 'foodbeverage', 'food'].includes(s)) return 'restaurant';
  if (['bar', 'minibar'].includes(s)) return 'bar';
  if (['valet', 'parking', 'parkingvalet'].includes(s)) return 'valet';
  if (['service', 'concierge', 'frontdesk', 'other'].includes(s)) return 'service';
  if (['housekeeping'].includes(s)) return 'housekeeping';
  if (['laundry'].includes(s)) return 'laundry';
  if (['maintenance'].includes(s)) return 'maintenance';
  return s;
}

// Broadcast function with strict role, financial, and department isolation
function broadcast(event, data, filters = {}) {
  const targetRole = filters.targetRole ? filters.targetRole.toLowerCase() : null;
  const targetDept = filters.targetDept ? filters.targetDept.toLowerCase() : null;
  const targetStay = filters.targetStay ? String(filters.targetStay).trim().toUpperCase() : null;
  const isPublic = Boolean(filters.isPublic || filters.broadcastAll || targetRole === 'all');

  const publicEvents = [
    'CATALOG_ITEM_TOGGLED',
    'CATALOG_UPDATED',
    'ROOM_STATUS_CHANGED',
    'ROOM_TYPE_UPDATED',
    'SYSTEM_NOTIFICATION',
    'PERMISSIONS_UPDATED',
    'INVENTORY_UPDATED',
    'INVENTORY_DELETED',
    'MENU_CATEGORY_CREATED',
    'MENU_CATEGORY_DELETED',
    'RESTAURANT_MENU_UPDATED',
    'RESTAURANT_ITEM_TOGGLED'
  ];

  const financialEvents = [
    'FOLIO_UPDATED',
    'DISCOUNT_UPDATED',
    'REFUND_UPDATED',
    'EARLY_CHECKOUT_UPDATED',
    'CHECKIN_PAYMENT_CREATED',
    'CHECKIN_PAYMENT_APPROVED',
    'CHECKIN_PAYMENT_CONFIRMED',
    'CHECKIN_PAYMENT_CANCELLED'
  ];

  const isPublicEvent = isPublic || publicEvents.includes(event);
  const isFinancialEvent = financialEvents.includes(event);

  const payload = JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString()
  });

  for (const [ws, meta] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    const isSupervisory = ['admin', 'manager', 'frontdesk'].includes(meta.role);
    const isFinancialRole = ['admin', 'manager', 'frontdesk', 'cashier'].includes(meta.role);
    const isTargetGuest = Boolean(targetStay && meta.stayCode && (meta.stayCode === targetStay));
    const isTargetDept = Boolean(
      targetDept && (
        normalizeDept(meta.department) === normalizeDept(targetDept) ||
        normalizeDept(meta.role) === normalizeDept(targetDept)
      )
    );
    const isTargetRole = Boolean(targetRole && (meta.role === targetRole || targetRole === 'all'));

    let shouldSend = false;

    if (isPublicEvent) {
      // Public events (catalog items, room availability, role permissions) go to everyone
      shouldSend = true;
    } else if (isFinancialEvent && isFinancialRole) {
      // Financial events (folio changes, discounts, refunds) go to cashier, front desk, and management
      shouldSend = true;
    } else if (targetStay) {
      // Stay-specific event (guest requests, private folios):
      // Delivered to supervisory staff, the assigned department, matching role, and the target guest!
      if (isSupervisory || isTargetGuest || isTargetDept || isTargetRole) {
        shouldSend = true;
      }
    } else if (isSupervisory) {
      shouldSend = true;
    } else if (isTargetDept) {
      shouldSend = true;
    } else if (isTargetRole) {
      shouldSend = true;
    } else if (!targetStay && !targetDept && !targetRole && meta.role !== 'guest') {
      shouldSend = true;
    }

    if (shouldSend) {
      try {
        ws.send(payload);
      } catch (err) {}
    }
  }
}

// 2. HTTP Server to receive events from PHP Backend
const internalServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { event, data, targetRole, targetDept, targetStay, isPublic } = payload;
        broadcast(event, data, { targetRole, targetDept, targetStay, isPublic });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, recipients: clients.size }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, connections: clients.size }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

internalServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[WebSocket Helper] Internal HTTP bridge on http://127.0.0.1:${HTTP_PORT}`);
});
