// server.js — static host for the @acq operator dashboard (TZ §11.9). Serves a
// self-contained feature-based SPA that is a THIN client of the control-plane
// facade (no business logic here). Strict CSP + helmet; /health unauth. No I/O
// at import; main() runs on direct execution.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import helmet from 'helmet';

import { buildCsp } from './csp.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, '..', 'public');

export function createDashboardServer({ apiOrigin = 'self' } = {}) {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  const csp = buildCsp({ apiOrigin });
  app.use((_req, res, next) => {
    res.setHeader('content-security-policy', csp);
    next();
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'dashboard' }));
  app.get('/config.js', (_req, res) => {
    res.type('application/javascript').send(`window.__ACQ_API__=${JSON.stringify(apiOrigin)};`);
  });
  // Serve the pure, unit-tested browser modules (api-client, feature view-models)
  // straight from src — the same code the Node tests exercise (no duplication).
  app.use('/js', express.static(here, { extensions: [], index: false }));
  app.use(express.static(PUBLIC_DIR));
  return app;
}

export async function main({ env } = {}) {
  const app = createDashboardServer({ apiOrigin: env.apiOrigin });
  const server = await new Promise((resolve) => {
    const s = app.listen(env.port, () => resolve(s));
  });
  return { server, shutdown: () => server.close() };
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  main({ env: { port: Number(process.env.DASHBOARD_PORT || 7600), apiOrigin: process.env.CONTROL_ORIGIN || 'self' } }).catch(
    (err) => {
      console.error('dashboard failed to start', err);
      process.exit(1);
    }
  );
}
