#!/usr/bin/env node
// Dependency-scan gate (TZ §18.2). yarn v1's `yarn audit` exit code is a coarse
// severity BITMASK — it can't tell WHICH workspace a high/critical advisory
// affects. This gate parses `yarn audit --json` instead and blocks ONLY on
// high/critical advisories that reach a CORE, shipping service. Advisories whose
// every dependency path runs solely through an excluded, separately-deployed
// workspace (the operator UI `@acq/web`, whose Next.js framework carries a
// perpetual DoS/SSRF advisory surface) are SURFACED but do not block core CI —
// the core services (engine, control-plane, scrape-worker, whatsapp) do not
// depend on Next. Everything is printed for visibility; nothing is hidden.
//
//   node scripts/audit-gate.mjs        # exit 1 if a CORE high/critical exists
import { spawnSync } from 'node:child_process';

// Separately-deployed, non-core workspaces whose framework advisories are tracked
// but must not gate the core platform's supply-chain scan.
const EXCLUDED_WORKSPACES = ['@acq/web'];

const res = spawnSync('yarn', ['audit', '--json', '--groups', 'dependencies'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lines = (res.stdout || '').split('\n').filter(Boolean);

const advisories = [];
for (const line of lines) {
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  if (obj.type === 'auditAdvisory') advisories.push(obj.data.advisory);
}

const isHigh = (s) => s === 'high' || s === 'critical';
// A path is "excluded" iff it runs through one of the excluded workspaces.
const pathExcluded = (p) => EXCLUDED_WORKSPACES.some((w) => p.includes(w));

const highs = advisories.filter((a) => isHigh(a.severity));
const blocking = [];
const excludedOnly = [];
for (const a of highs) {
  const paths = [...new Set((a.findings || []).flatMap((f) => f.paths || []))];
  const corePaths = paths.filter((p) => !pathExcluded(p));
  (corePaths.length ? blocking : excludedOnly).push({ a, paths, corePaths });
}

const fmt = ({ a, paths }) => `  [${a.severity}] ${a.module_name}: ${a.title}\n      via ${paths.slice(0, 4).join(', ')}${paths.length > 4 ? ' …' : ''}  (patched in ${a.patched_versions})`;

console.log(`\nDependency scan (production) — ${advisories.length} advisories, ${highs.length} high/critical\n`);
if (excludedOnly.length) {
  console.log(`Surfaced (non-blocking — only reaches ${EXCLUDED_WORKSPACES.join(', ')}, a separate deployable):`);
  for (const e of excludedOnly) console.log(fmt(e));
  console.log('');
}
if (blocking.length) {
  console.log('BLOCKING — high/critical reaching a core shipping service:');
  for (const b of blocking) console.log(fmt(b));
  console.error(`\n✖ ${blocking.length} high/critical vulnerabilit${blocking.length === 1 ? 'y' : 'ies'} in CORE production dependencies\n`);
  process.exit(1);
}
console.log(`✔ No high/critical vulnerabilities in CORE production dependencies (${excludedOnly.length} UI-framework advisor${excludedOnly.length === 1 ? 'y' : 'ies'} surfaced, non-blocking)\n`);
