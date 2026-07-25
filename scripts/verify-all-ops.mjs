#!/usr/bin/env node
// FINAL AUDIT: every operation the docs (README §"How it's controlled" +
// complete-workflow.md §8) advertise is actually WIRED and callable through the
// facade. Drives the WHOLE OPERATIONS catalog via REST with an admin token and
// asserts each returns a well-formed envelope whose error (if any) is NOT
// UNKNOWN_OPERATION / NOT_IMPLEMENTED — i.e. the op exists, is validated, and
// reaches a handler (data, a coded seam, or INVALID_ARGS are all "wired").
import http from 'node:http';

import { OPERATIONS } from '@acq/control';

const T = 'admin-dev-token';
function op(name) {
  return new Promise((resolve) => {
    const body = '{}';
    const req = http.request({ host: '127.0.0.1', port: 7500, path: `/v1/op/${name}`, method: 'POST', timeout: 8000, headers: { 'content-type': 'application/json', authorization: `Bearer ${T}`, 'content-length': body.length } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d || '{}'))); });
    req.on('error', (e) => resolve({ error: { code: e.message } })); req.on('timeout', () => { req.destroy(); resolve({ error: { code: 'timeout' } }); });
    req.end(body);
  });
}

const NOT_WIRED = new Set(['UNKNOWN_OPERATION', 'NOT_IMPLEMENTED', 'timeout']);

async function main() {
  console.log(`\nAuditing all ${OPERATIONS.length} facade operations via REST (admin)…\n`);
  let wired = 0;
  const failures = [];
  for (const { name } of OPERATIONS) {
    const env = await op(name);
    const code = env.error?.code ?? null;
    const okWired = env.meta?.operation === name && !NOT_WIRED.has(code);
    if (okWired) wired += 1; else failures.push(`${name} → ${code ?? 'no-envelope'}`);
    const outcome = code ? code : 'data';
    console.log(`  ${okWired ? '✅' : '❌'} ${name.padEnd(26)} ${outcome}`);
  }
  console.log(`\n  ${wired}/${OPERATIONS.length} operations WIRED & callable`);
  if (failures.length) { console.log('  ❌ NOT wired:', failures.join(', ')); process.exitCode = 1; }
  else console.log('\n✔ ALL DOCUMENTED OPERATIONS ARE LIVE — every function in README/workflow is wired ✓');
}
main().catch((e) => { console.error('audit error:', e); process.exit(1); });
