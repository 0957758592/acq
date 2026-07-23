import { WebSocketServer } from 'ws';

import { authenticate } from './http-mapping.js';

// WebSocket control surface (TZ §11.5) — realtime, bidirectional, over the SAME
// facade. A client message is `{ id, operation, args }`; the reply is the facade
// envelope `{ id, data, error, meta }`. Domain events are pushed as `{ event }`.
// Thin presentation only — zero business logic (RBAC/validation/audit are the
// facade's). routeWsMessage is pure so it is unit-tested without a socket.
export function routeWsMessage(facade, { role, actor } = {}) {
  return async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return { error: { code: 'BAD_JSON', message: 'invalid JSON message' } };
    }
    if (!msg.operation) {
      return { id: msg.id ?? null, error: { code: 'USAGE', message: 'operation is required' } };
    }
    const envelope = await facade.execute(msg.operation, { role, actor, args: msg.args ?? {}, correlationId: msg.id });
    return { id: msg.id ?? null, ...envelope };
  };
}

function tokenAuth(req, tokens) {
  const url = new URL(req.url, 'http://local');
  const header = req.headers.authorization;
  const query = url.searchParams.get('token');
  return authenticate(header, { tokens }) || (query ? authenticate(`Bearer ${query}`, { tokens }) : null);
}

export function attachWsControl({ server, facade, tokens = {}, eventSource = null, path = '/v1/ws' } = {}) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://local').pathname !== path) return;
    const auth = tokenAuth(req, tokens);
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, auth));
  });

  wss.on('connection', (ws, _req, auth) => {
    const route = routeWsMessage(facade, { role: auth.role, actor: auth.actor });
    ws.on('message', async (raw) => {
      ws.send(JSON.stringify(await route(raw.toString())));
    });
    if (eventSource?.subscribe) {
      const unsub = eventSource.subscribe((event) => { try { ws.send(JSON.stringify({ event })); } catch { /* closed */ } });
      ws.on('close', () => unsub?.());
    }
  });

  return wss;
}
