# Mass WhatsApp Report — Implementation Plan (Roadmap + Plan 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a monorepo-module microservice that manages a WhatsApp account pool, per-device queues, leasing, health/ban detection, auto-replacement, auto-replenishment, and mass-report campaigns — controlled by an external brain over MCP.

**Architecture:** Hexagonal (Ports & Adapters). A pure, framework-free domain (`@julio/whatsapp`) drives a desired-state reconciler; infrastructure adapters (`@julio/whatsapp-infra`) implement ports over the existing engine infra (Mongo, RabbitMQ, Redis, `EngineDevice`/lease, `EngineJobRun`); a standalone `apps/whatsapp` process runs the orchestrator + MCP server. Reuses existing code; adds only structured logging, DLQ, and `ru`/`ua` locales.

**Tech Stack:** Node 18 ESM, Jest (`--experimental-vm-modules`), Mongoose 8, `amqplib` (RabbitMQ), `ioredis`, `node-cron`, `@modelcontextprotocol/sdk`. No TypeScript, no BullMQ, no zod.

**Source spec:** `docs/superpowers/specs/2026-07-09-mass-whatsapp-report-design.md`

**Commit convention:** every commit message ends with the trailer:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (omitted from the short commit lines below for brevity — always append it).

---

## Plan Roadmap (one plan per subsystem)

Each plan produces working, tested software on its own. Later plans depend on earlier ones. Plans marked *(to author)* are written once we reach them and have verified real formats/screens by fact (per `REQUIREM`: "проверять по факту").

| # | Plan | Produces | Depends on | Status |
|---|---|---|---|---|
| **1** | **Foundation & Pure Domain** | `@julio/whatsapp` pure domain (VOs, state-machine, queue, pool/report policies, reconciler) fully unit-tested; `@julio/logger` structured JSON transport | — | **this document** |
| 2 | Persistence & shared infra | `@julio/whatsapp-infra` Mongoose models + repositories (opt-lock), DLQ queue wrapper, `RabbitJobDispatcher`, `RabbitRedisEventBus` | 1 | *(to author)* |
| 3 | Procurement (dark.shopping) | `dark-shopping-client` + importer + `DarkShoppingProcurementAdapter` + `buy-accounts`/`replenish-pool` wired; `EngineExpense` accounting | 2 | *(to author — verify delivery format first)* |
| 4 | Device + WhatsApp automation | `packages/automation/src/whatsapp/*`, `DuoplusDeviceRegistrationAdapter`, `WhatsappAutomationAdapter`; bring-online/probe/report flows | 2 | *(to author — verify WhatsApp screens on device first)* |
| 5 | Orchestrator process | `apps/whatsapp/src/orchestrator.js`: cron reconciler + RabbitMQ consumers + composition wiring + DLQ | 2,3,4 | *(to author)* |
| 6 | MCP surface | `apps/whatsapp/src/mcp/*`: transport-agnostic core + tools/resources/notifications + stdio + streamable-http | 5 | *(to author)* |
| 7 | i18n + ops | `ru`/`ua` locales across `SUPPORTED_LOCALES` + dictionaries + hardcoded arrays; whatsapp domain message catalog (6 langs); README/runbook | 6 | *(to author)* |

---

# PLAN 1 — Foundation & Pure Domain

Builds the pure domain library (zero external deps, fully deterministic and unit-tested) plus the shared structured-logging enhancement. No DB, no vendors, no MCP. On completion, `yarn workspace @julio/whatsapp test` and the logger tests are green, and the domain fully encodes Pool/Queue/State-machine/Reconciler decisions.

**File structure created in this plan:**
- `packages/whatsapp/package.json`, `packages/whatsapp/jest.config.js`, `packages/whatsapp/src/index.js`
- `packages/whatsapp/src/domain/msisdn.js` (+ test)
- `packages/whatsapp/src/domain/account/status.js` (+ test)
- `packages/whatsapp/src/domain/account/account.js` (+ test)
- `packages/whatsapp/src/domain/device-queue/device-queue.js` (+ test)
- `packages/whatsapp/src/domain/pool/pool-policy.js` (+ test)
- `packages/whatsapp/src/domain/report/strategy.js` (+ test)
- `packages/whatsapp/src/domain/events.js` (+ test)
- `packages/whatsapp/src/domain/reconcile.js` (+ test)
- `packages/whatsapp/src/domain/errors.js`
- `packages/whatsapp/src/ports/index.js` (JSDoc contracts)
- `packages/logger/src/structured.js` (+ test), `packages/logger/jest.config.js`
- Modify: `jest.config.js` (root — add two projects), `packages/logger/src/index.js` (export), `packages/logger/package.json` (test script + devDeps)

---

### Task 1: Scaffold `@julio/whatsapp` + Msisdn value object

**Files:**
- Create: `packages/whatsapp/package.json`
- Create: `packages/whatsapp/jest.config.js`
- Create: `packages/whatsapp/src/domain/errors.js`
- Create: `packages/whatsapp/src/domain/msisdn.js`
- Test: `packages/whatsapp/src/domain/msisdn.test.js`
- Modify: `jest.config.js` (root)

- [ ] **Step 1: Create the package skeleton**

`packages/whatsapp/package.json`:
```json
{
  "name": "@julio/whatsapp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./domain/*": "./src/domain/*.js",
    "./ports": "./src/ports/index.js"
  },
  "scripts": {
    "test": "cross-env NODE_OPTIONS=--experimental-vm-modules jest -c jest.config.js",
    "lint": "eslint .",
    "build": "node -e \"console.log('whatsapp: no build step')\""
  },
  "devDependencies": {
    "cross-env": "^7.0.3",
    "eslint": "^9.17.0",
    "jest": "^29.7.0"
  }
}
```

`packages/whatsapp/jest.config.js`:
```js
export default {
  displayName: 'whatsapp',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.js']
};
```

- [ ] **Step 2: Register the package in the root jest projects**

In `jest.config.js` (root), add to the `projects` array (after the `device-control` line):
```js
    '<rootDir>/packages/whatsapp/jest.config.js',
```

- [ ] **Step 3: Create the domain error type**

`packages/whatsapp/src/domain/errors.js`:
```js
export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function domainError(code, message) {
  return new DomainError(code, message);
}
```

- [ ] **Step 4: Write the failing test for Msisdn**

`packages/whatsapp/src/domain/msisdn.test.js`:
```js
import { createMsisdn, normalizeMsisdn } from './msisdn.js';

describe('normalizeMsisdn', () => {
  it('normalizes spacing and separators to E.164', () => {
    expect(normalizeMsisdn('+49 170 123-4567')).toBe('+491701234567');
  });

  it('converts a 00 international prefix to +', () => {
    expect(normalizeMsisdn('0049 170 1234567')).toBe('+491701234567');
  });

  it('rejects non-numeric input', () => {
    expect(() => normalizeMsisdn('not-a-number')).toThrow('MSISDN_INVALID');
  });

  it('rejects too-short numbers', () => {
    expect(() => normalizeMsisdn('+12')).toThrow('MSISDN_INVALID');
  });
});

describe('createMsisdn', () => {
  it('exposes the canonical value and compares by value', () => {
    const a = createMsisdn('+49 170 1234567');
    const b = createMsisdn('00491701234567');
    expect(a.value).toBe('+491701234567');
    expect(a.equals(b)).toBe(true);
  });

  it('is frozen', () => {
    const m = createMsisdn('+491701234567');
    expect(Object.isFrozen(m)).toBe(true);
  });
});
```

- [ ] **Step 5: Run the test — verify it fails**

Run: `yarn workspace @julio/whatsapp test`
Expected: FAIL — cannot find module `./msisdn.js`.

- [ ] **Step 6: Implement Msisdn**

`packages/whatsapp/src/domain/msisdn.js`:
```js
import { domainError } from './errors.js';

const E164 = /^\+[1-9]\d{6,14}$/;

export function normalizeMsisdn(input) {
  if (typeof input !== 'string') {
    throw domainError('MSISDN_INVALID', 'MSISDN must be a string');
  }
  let cleaned = input.trim().replace(/[\s()\-.]/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (!cleaned.startsWith('+')) cleaned = `+${cleaned}`;
  if (!E164.test(cleaned)) {
    throw domainError('MSISDN_INVALID', `MSISDN is not valid E.164: ${input}`);
  }
  return cleaned;
}

export function createMsisdn(input) {
  const value = normalizeMsisdn(input);
  return Object.freeze({
    value,
    equals(other) {
      return Boolean(other) && other.value === value;
    }
  });
}
```

- [ ] **Step 7: Run the test — verify it passes**

Run: `yarn workspace @julio/whatsapp test`
Expected: PASS (all Msisdn tests green).

- [ ] **Step 8: Commit**

```bash
git add packages/whatsapp jest.config.js
git commit -m "feat(whatsapp): scaffold package + Msisdn value object"
```

---

### Task 2: Account status state-machine

**Files:**
- Create: `packages/whatsapp/src/domain/account/status.js`
- Test: `packages/whatsapp/src/domain/account/status.test.js`

- [ ] **Step 1: Write the failing test**

`packages/whatsapp/src/domain/account/status.test.js`:
```js
import {
  ACCOUNT_STATUSES,
  canTransition,
  assertTransition
} from './status.js';

describe('account status transitions', () => {
  it('lists all statuses', () => {
    expect(ACCOUNT_STATUSES).toEqual([
      'purchased', 'assigned', 'bringing_online',
      'online', 'cooldown', 'banned', 'retired'
    ]);
  });

  it('allows purchased -> assigned', () => {
    expect(canTransition('purchased', 'assigned')).toBe(true);
  });

  it('forbids purchased -> online', () => {
    expect(canTransition('purchased', 'online')).toBe(false);
  });

  it('allows online <-> cooldown', () => {
    expect(canTransition('online', 'cooldown')).toBe(true);
    expect(canTransition('cooldown', 'online')).toBe(true);
  });

  it('allows banned -> retired but retired is terminal', () => {
    expect(canTransition('banned', 'retired')).toBe(true);
    expect(canTransition('retired', 'assigned')).toBe(false);
  });

  it('assertTransition throws a coded error on invalid move', () => {
    expect(() => assertTransition('purchased', 'online'))
      .toThrow('ACCOUNT_TRANSITION_INVALID');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `yarn workspace @julio/whatsapp test -t "account status"`
Expected: FAIL — cannot find `./status.js`.

- [ ] **Step 3: Implement the state-machine**

`packages/whatsapp/src/domain/account/status.js`:
```js
import { domainError } from '../errors.js';

export const ACCOUNT_STATUSES = [
  'purchased', 'assigned', 'bringing_online',
  'online', 'cooldown', 'banned', 'retired'
];

const TRANSITIONS = {
  purchased: ['assigned', 'retired'],
  assigned: ['bringing_online', 'purchased', 'retired'],
  bringing_online: ['online', 'cooldown', 'assigned', 'banned', 'retired'],
  online: ['cooldown', 'banned', 'retired'],
  cooldown: ['online', 'banned', 'retired'],
  banned: ['retired'],
  retired: []
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw domainError(
      'ACCOUNT_TRANSITION_INVALID',
      `Illegal account transition ${from} -> ${to}`
    );
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `yarn workspace @julio/whatsapp test -t "account status"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp/src/domain/account/status.js packages/whatsapp/src/domain/account/status.test.js
git commit -m "feat(whatsapp): account status state-machine"
```

---

### Task 3: WhatsappAccount aggregate

**Files:**
- Create: `packages/whatsapp/src/domain/account/account.js`
- Test: `packages/whatsapp/src/domain/account/account.test.js`

- [ ] **Step 1: Write the failing test**

`packages/whatsapp/src/domain/account/account.test.js`:
```js
import { createAccount, assignToDevice, transition, recordProbe } from './account.js';

const clock = () => new Date('2026-07-09T00:00:00.000Z');

function baseAccount(overrides = {}) {
  return createAccount({
    id: 'a1',
    msisdn: '+491701234567',
    source: 'dark_shopping',
    secretRefs: { session: 'keychain:wa-a1' },
    ...overrides
  }, { clock });
}

describe('WhatsappAccount', () => {
  it('starts purchased and unassigned', () => {
    const acc = baseAccount();
    expect(acc.status).toBe('purchased');
    expect(acc.assignedDeviceId).toBeNull();
    expect(acc.version).toBe(0);
  });

  it('assigns to a device and moves purchased -> assigned', () => {
    const acc = transition(assignToDevice(baseAccount(), 'd1'), 'assigned', { clock });
    expect(acc.assignedDeviceId).toBe('d1');
    expect(acc.status).toBe('assigned');
    expect(acc.version).toBe(2);
  });

  it('refuses to go online without an assigned device', () => {
    const acc = baseAccount();
    expect(() => transition(acc, 'online', { clock }))
      .toThrow('ACCOUNT_TRANSITION_INVALID');
  });

  it('rejects an illegal transition', () => {
    expect(() => transition(baseAccount(), 'online', { clock }))
      .toThrow('ACCOUNT_TRANSITION_INVALID');
  });

  it('records a probe failure and bumps consecutiveFailures', () => {
    const acc = recordProbe(baseAccount(), { healthy: false }, { clock });
    expect(acc.health.consecutiveFailures).toBe(1);
    expect(acc.health.lastProbeAt).toBe('2026-07-09T00:00:00.000Z');
  });

  it('resets consecutiveFailures on a healthy probe', () => {
    let acc = recordProbe(baseAccount(), { healthy: false }, { clock });
    acc = recordProbe(acc, { healthy: true }, { clock });
    expect(acc.health.consecutiveFailures).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `yarn workspace @julio/whatsapp test -t "WhatsappAccount"`
Expected: FAIL — cannot find `./account.js`.

- [ ] **Step 3: Implement the aggregate**

`packages/whatsapp/src/domain/account/account.js`:
```js
import { assertTransition } from './status.js';
import { normalizeMsisdn } from '../msisdn.js';
import { domainError } from '../errors.js';

export function createAccount(input, { clock }) {
  const now = clock().toISOString();
  return Object.freeze({
    id: input.id,
    msisdn: normalizeMsisdn(input.msisdn),
    source: input.source,
    secretRefs: input.secretRefs || {},
    status: 'purchased',
    assignedDeviceId: input.assignedDeviceId ?? null,
    health: { consecutiveFailures: 0, lastProbeAt: null },
    version: 0,
    createdAt: now,
    updatedAt: now
  });
}

function next(account, patch, { clock }) {
  return Object.freeze({
    ...account,
    ...patch,
    version: account.version + 1,
    updatedAt: clock().toISOString()
  });
}

export function assignToDevice(account, deviceId) {
  if (!deviceId) throw domainError('DEVICE_ID_REQUIRED', 'deviceId is required');
  return Object.freeze({
    ...account,
    assignedDeviceId: deviceId,
    version: account.version + 1
  });
}

export function transition(account, to, { clock }) {
  assertTransition(account.status, to);
  if (to === 'online' && !account.assignedDeviceId) {
    throw domainError('ACCOUNT_TRANSITION_INVALID', 'online requires an assigned device');
  }
  return next(account, { status: to }, { clock });
}

export function recordProbe(account, result, { clock }) {
  const consecutiveFailures = result.healthy ? 0 : account.health.consecutiveFailures + 1;
  return next(account, {
    health: { consecutiveFailures, lastProbeAt: clock().toISOString() }
  }, { clock });
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `yarn workspace @julio/whatsapp test -t "WhatsappAccount"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp/src/domain/account/account.js packages/whatsapp/src/domain/account/account.test.js
git commit -m "feat(whatsapp): WhatsappAccount aggregate with invariant-guarded transitions"
```

---

### Task 4: DeviceWhatsappQueue aggregate

**Files:**
- Create: `packages/whatsapp/src/domain/device-queue/device-queue.js`
- Test: `packages/whatsapp/src/domain/device-queue/device-queue.test.js`

- [ ] **Step 1: Write the failing test**

`packages/whatsapp/src/domain/device-queue/device-queue.test.js`:
```js
import {
  createQueue, depth, hasFreeActiveSlot, needsFill,
  enqueueWaiting, promoteNext, evict
} from './device-queue.js';

function q(overrides = {}) {
  return createQueue({ deviceId: 'd1', activeSlots: 1, targetDepth: 3, ...overrides });
}

describe('DeviceWhatsappQueue', () => {
  it('starts empty and needs filling', () => {
    const queue = q();
    expect(depth(queue)).toBe(0);
    expect(needsFill(queue)).toBe(true);
    expect(queue.version).toBe(0);
  });

  it('enqueues waiting accounts up to targetDepth and bumps version', () => {
    let queue = enqueueWaiting(q(), 'a1');
    queue = enqueueWaiting(queue, 'a2');
    expect(queue.waitingAccountIds).toEqual(['a1', 'a2']);
    expect(depth(queue)).toBe(2);
    expect(queue.version).toBe(2);
  });

  it('ignores duplicate enqueue', () => {
    let queue = enqueueWaiting(q(), 'a1');
    queue = enqueueWaiting(queue, 'a1');
    expect(queue.waitingAccountIds).toEqual(['a1']);
  });

  it('refuses to enqueue beyond targetDepth', () => {
    let queue = q({ targetDepth: 1 });
    queue = enqueueWaiting(queue, 'a1');
    expect(() => enqueueWaiting(queue, 'a2')).toThrow('QUEUE_FULL');
  });

  it('promotes the next waiting into a free active slot', () => {
    let queue = enqueueWaiting(enqueueWaiting(q(), 'a1'), 'a2');
    expect(hasFreeActiveSlot(queue)).toBe(true);
    const { queue: after, promotedId } = promoteNext(queue);
    expect(promotedId).toBe('a1');
    expect(after.activeAccountIds).toEqual(['a1']);
    expect(after.waitingAccountIds).toEqual(['a2']);
    expect(hasFreeActiveSlot(after)).toBe(false);
  });

  it('returns null promotedId when no free active slot', () => {
    let queue = enqueueWaiting(q(), 'a1');
    queue = promoteNext(queue).queue;
    const { promotedId } = promoteNext(enqueueWaiting(queue, 'a2'));
    expect(promotedId).toBeNull();
  });

  it('evicts from active and waiting', () => {
    let queue = enqueueWaiting(enqueueWaiting(q(), 'a1'), 'a2');
    queue = promoteNext(queue).queue;
    queue = evict(queue, 'a1');
    expect(queue.activeAccountIds).toEqual([]);
    expect(queue.waitingAccountIds).toEqual(['a2']);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `yarn workspace @julio/whatsapp test -t "DeviceWhatsappQueue"`
Expected: FAIL — cannot find `./device-queue.js`.

- [ ] **Step 3: Implement the aggregate**

`packages/whatsapp/src/domain/device-queue/device-queue.js`:
```js
import { domainError } from '../errors.js';

export function createQueue({ deviceId, activeSlots = 1, targetDepth = 3 }) {
  return Object.freeze({
    deviceId,
    activeSlots,
    targetDepth,
    activeAccountIds: [],
    waitingAccountIds: [],
    version: 0
  });
}

export function depth(queue) {
  return queue.activeAccountIds.length + queue.waitingAccountIds.length;
}

export function hasFreeActiveSlot(queue) {
  return queue.activeAccountIds.length < queue.activeSlots;
}

export function needsFill(queue) {
  return depth(queue) < queue.targetDepth;
}

function bump(queue, patch) {
  return Object.freeze({ ...queue, ...patch, version: queue.version + 1 });
}

export function enqueueWaiting(queue, accountId) {
  if (queue.activeAccountIds.includes(accountId) || queue.waitingAccountIds.includes(accountId)) {
    return queue;
  }
  if (depth(queue) >= queue.targetDepth) {
    throw domainError('QUEUE_FULL', `Queue for ${queue.deviceId} is at targetDepth`);
  }
  return bump(queue, { waitingAccountIds: [...queue.waitingAccountIds, accountId] });
}

export function promoteNext(queue) {
  if (!hasFreeActiveSlot(queue) || queue.waitingAccountIds.length === 0) {
    return { queue, promotedId: null };
  }
  const [promotedId, ...rest] = queue.waitingAccountIds;
  const after = bump(queue, {
    activeAccountIds: [...queue.activeAccountIds, promotedId],
    waitingAccountIds: rest
  });
  return { queue: after, promotedId };
}

export function evict(queue, accountId) {
  return bump(queue, {
    activeAccountIds: queue.activeAccountIds.filter((id) => id !== accountId),
    waitingAccountIds: queue.waitingAccountIds.filter((id) => id !== accountId)
  });
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `yarn workspace @julio/whatsapp test -t "DeviceWhatsappQueue"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp/src/domain/device-queue
git commit -m "feat(whatsapp): DeviceWhatsappQueue aggregate (enqueue/promote/evict + opt-lock version)"
```

---

### Task 5: Pool replenishment policy

**Files:**
- Create: `packages/whatsapp/src/domain/pool/pool-policy.js`
- Test: `packages/whatsapp/src/domain/pool/pool-policy.test.js`

- [ ] **Step 1: Write the failing test**

`packages/whatsapp/src/domain/pool/pool-policy.test.js`:
```js
import { needsReplenish, buyQuantity } from './pool-policy.js';

describe('pool policy', () => {
  it('needs replenish when available below threshold', () => {
    expect(needsReplenish({ available: 3, threshold: 10 })).toBe(true);
    expect(needsReplenish({ available: 10, threshold: 10 })).toBe(false);
  });

  it('buys at least the batch size', () => {
    expect(buyQuantity({ available: 9, threshold: 10, batchSize: 5 })).toBe(5);
  });

  it('buys enough to cover a large gap, rounded up to batches', () => {
    expect(buyQuantity({ available: 0, threshold: 12, batchSize: 5 })).toBe(15);
  });

  it('buys nothing when at or above threshold', () => {
    expect(buyQuantity({ available: 10, threshold: 10, batchSize: 5 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `yarn workspace @julio/whatsapp test -t "pool policy"`
Expected: FAIL — cannot find `./pool-policy.js`.

- [ ] **Step 3: Implement the policy**

`packages/whatsapp/src/domain/pool/pool-policy.js`:
```js
export function needsReplenish({ available, threshold }) {
  return available < threshold;
}

export function buyQuantity({ available, threshold, batchSize }) {
  if (available >= threshold) return 0;
  const gap = threshold - available;
  const batches = Math.ceil(gap / batchSize);
  return batches * batchSize;
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `yarn workspace @julio/whatsapp test -t "pool policy"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp/src/domain/pool
git commit -m "feat(whatsapp): pool replenishment policy"
```

---

### Task 6: Report strategy expansion (exactly-once keys)

**Files:**
- Create: `packages/whatsapp/src/domain/report/strategy.js`
- Test: `packages/whatsapp/src/domain/report/strategy.test.js`

- [ ] **Step 1: Write the failing test**

`packages/whatsapp/src/domain/report/strategy.test.js`:
```js
import { REPORT_STRATEGIES, reportTaskKey, expandReportTasks } from './strategy.js';

const campaign = {
  id: 'c1',
  targets: ['+491700000001', '+491700000002'],
  strategy: 'all-accounts-report-each-target'
};

describe('report strategy', () => {
  it('exposes the supported strategies', () => {
    expect(REPORT_STRATEGIES).toEqual([
      'all-accounts-report-each-target',
      'one-target-per-account'
    ]);
  });

  it('builds a stable exactly-once key per (campaign, account, target)', () => {
    const key = reportTaskKey({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' });
    expect(key).toBe('c1:a1:+491700000001');
  });

  it('all-accounts-report-each-target = cross product', () => {
    const tasks = expandReportTasks({ campaign, onlineAccountIds: ['a1', 'a2'] });
    expect(tasks).toHaveLength(4);
    expect(tasks).toContainEqual({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' });
    expect(tasks).toContainEqual({ campaignId: 'c1', accountId: 'a2', targetMsisdn: '+491700000002' });
  });

  it('one-target-per-account round-robins targets across accounts', () => {
    const tasks = expandReportTasks({
      campaign: { ...campaign, strategy: 'one-target-per-account' },
      onlineAccountIds: ['a1', 'a2', 'a3']
    });
    expect(tasks).toEqual([
      { campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' },
      { campaignId: 'c1', accountId: 'a2', targetMsisdn: '+491700000002' },
      { campaignId: 'c1', accountId: 'a3', targetMsisdn: '+491700000001' }
    ]);
  });

  it('excludes already-done (account,target) pairs', () => {
    const tasks = expandReportTasks({
      campaign,
      onlineAccountIds: ['a1'],
      doneKeys: new Set(['c1:a1:+491700000001'])
    });
    expect(tasks).toEqual([
      { campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000002' }
    ]);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `yarn workspace @julio/whatsapp test -t "report strategy"`
Expected: FAIL — cannot find `./strategy.js`.

- [ ] **Step 3: Implement the strategy**

`packages/whatsapp/src/domain/report/strategy.js`:
```js
import { domainError } from '../errors.js';

export const REPORT_STRATEGIES = [
  'all-accounts-report-each-target',
  'one-target-per-account'
];

export function reportTaskKey({ campaignId, accountId, targetMsisdn }) {
  return `${campaignId}:${accountId}:${targetMsisdn}`;
}

function crossProduct(campaign, accountIds) {
  const tasks = [];
  for (const accountId of accountIds) {
    for (const targetMsisdn of campaign.targets) {
      tasks.push({ campaignId: campaign.id, accountId, targetMsisdn });
    }
  }
  return tasks;
}

function roundRobin(campaign, accountIds) {
  return accountIds.map((accountId, index) => ({
    campaignId: campaign.id,
    accountId,
    targetMsisdn: campaign.targets[index % campaign.targets.length]
  }));
}

export function expandReportTasks({ campaign, onlineAccountIds, doneKeys = new Set() }) {
  let tasks;
  if (campaign.strategy === 'all-accounts-report-each-target') {
    tasks = crossProduct(campaign, onlineAccountIds);
  } else if (campaign.strategy === 'one-target-per-account') {
    tasks = roundRobin(campaign, onlineAccountIds);
  } else {
    throw domainError('REPORT_STRATEGY_UNKNOWN', `Unknown strategy ${campaign.strategy}`);
  }
  return tasks.filter((task) => !doneKeys.has(reportTaskKey(task)));
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `yarn workspace @julio/whatsapp test -t "report strategy"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp/src/domain/report
git commit -m "feat(whatsapp): report strategy expansion with exactly-once keys"
```

---

### Task 7: Domain events

**Files:**
- Create: `packages/whatsapp/src/domain/events.js`
- Test: `packages/whatsapp/src/domain/events.test.js`

- [ ] **Step 1: Write the failing test**

`packages/whatsapp/src/domain/events.test.js`:
```js
import { EVENT_TYPES, accountBanned, queueLow, poolLow, campaignCompleted, reportDone } from './events.js';

const clock = () => new Date('2026-07-09T00:00:00.000Z');

describe('domain events', () => {
  it('lists event types', () => {
    expect(EVENT_TYPES).toEqual([
      'account.banned', 'queue.low', 'pool.low', 'campaign.completed', 'report.done'
    ]);
  });

  it('builds account.banned with payload and timestamp', () => {
    const evt = accountBanned({ accountId: 'a1', deviceId: 'd1' }, { clock });
    expect(evt).toEqual({
      type: 'account.banned',
      occurredAt: '2026-07-09T00:00:00.000Z',
      payload: { accountId: 'a1', deviceId: 'd1' }
    });
  });

  it('builds the remaining events', () => {
    expect(queueLow({ deviceId: 'd1', depth: 1 }, { clock }).type).toBe('queue.low');
    expect(poolLow({ available: 2 }, { clock }).type).toBe('pool.low');
    expect(campaignCompleted({ campaignId: 'c1' }, { clock }).type).toBe('campaign.completed');
    expect(reportDone({ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' }, { clock }).type)
      .toBe('report.done');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `yarn workspace @julio/whatsapp test -t "domain events"`
Expected: FAIL — cannot find `./events.js`.

- [ ] **Step 3: Implement events**

`packages/whatsapp/src/domain/events.js`:
```js
export const EVENT_TYPES = [
  'account.banned', 'queue.low', 'pool.low', 'campaign.completed', 'report.done'
];

function make(type, payload, { clock }) {
  return { type, occurredAt: clock().toISOString(), payload };
}

export const accountBanned = (payload, ctx) => make('account.banned', payload, ctx);
export const queueLow = (payload, ctx) => make('queue.low', payload, ctx);
export const poolLow = (payload, ctx) => make('pool.low', payload, ctx);
export const campaignCompleted = (payload, ctx) => make('campaign.completed', payload, ctx);
export const reportDone = (payload, ctx) => make('report.done', payload, ctx);
```

- [ ] **Step 4: Run test — verify it passes**

Run: `yarn workspace @julio/whatsapp test -t "domain events"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/whatsapp/src/domain/events.js packages/whatsapp/src/domain/events.test.js
git commit -m "feat(whatsapp): domain events"
```

---

### Task 8: Reconciler decision function (desired-state → intents)

**Files:**
- Create: `packages/whatsapp/src/domain/reconcile.js`
- Test: `packages/whatsapp/src/domain/reconcile.test.js`

This is the deterministic heart of the Central Scheduler. It is a **pure function**: it takes a snapshot of current state + config and returns an ordered list of intents. It performs no I/O; the orchestrator (Plan 5) turns intents into RabbitMQ jobs.

- [ ] **Step 1: Write the failing test**

`packages/whatsapp/src/domain/reconcile.test.js`:
```js
import { reconcile } from './reconcile.js';

const config = { poolThreshold: 10, buyBatchSize: 5, autobuyEnabled: true };

function snapshot(overrides = {}) {
  return {
    pool: { available: 10 },
    devices: [],
    campaigns: [],
    config,
    ...overrides
  };
}

describe('reconcile', () => {
  it('emits no intents in a satisfied steady state', () => {
    expect(reconcile(snapshot())).toEqual([]);
  });

  it('emits a buy intent when the pool is below threshold', () => {
    const intents = reconcile(snapshot({ pool: { available: 3 } }));
    expect(intents).toContainEqual({ type: 'buy', quantity: 10 });
  });

  it('does not buy when autobuy is disabled', () => {
    const intents = reconcile(snapshot({
      pool: { available: 3 },
      config: { ...config, autobuyEnabled: false }
    }));
    expect(intents.find((i) => i.type === 'buy')).toBeUndefined();
  });

  it('emits a fill-queue intent for an eligible under-filled device with pool available', () => {
    const intents = reconcile(snapshot({
      pool: { available: 10 },
      devices: [{
        eligible: true,
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: [], waitingAccountIds: [] }
      }]
    }));
    expect(intents).toContainEqual({ type: 'fill-queue', deviceId: 'd1', count: 3 });
  });

  it('emits a bring-online intent when a device has a free slot and a waiting account', () => {
    const intents = reconcile(snapshot({
      devices: [{
        eligible: true,
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: [], waitingAccountIds: ['a1'] }
      }]
    }));
    expect(intents).toContainEqual({ type: 'bring-online', deviceId: 'd1', accountId: 'a1' });
  });

  it('emits evict + bring-online when a banned account occupies an active slot', () => {
    const intents = reconcile(snapshot({
      devices: [{
        eligible: true,
        bannedActiveAccountIds: ['a1'],
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: ['a1'], waitingAccountIds: ['a2'] }
      }]
    }));
    expect(intents).toContainEqual({ type: 'evict', deviceId: 'd1', accountId: 'a1' });
    expect(intents).toContainEqual({ type: 'bring-online', deviceId: 'd1', accountId: 'a2' });
  });

  it('skips ineligible devices', () => {
    const intents = reconcile(snapshot({
      devices: [{
        eligible: false,
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: [], waitingAccountIds: [] }
      }]
    }));
    expect(intents).toEqual([]);
  });

  it('emits expand-reports for an active campaign with online accounts', () => {
    const intents = reconcile(snapshot({
      devices: [{
        eligible: true,
        queue: { deviceId: 'd1', activeSlots: 1, targetDepth: 3, activeAccountIds: ['a1'], waitingAccountIds: [] },
        onlineAccountIds: ['a1']
      }],
      campaigns: [{
        id: 'c1', status: 'active', targets: ['+491700000001'],
        strategy: 'all-accounts-report-each-target', doneKeys: []
      }]
    }));
    expect(intents).toContainEqual({
      type: 'expand-reports',
      campaignId: 'c1',
      tasks: [{ campaignId: 'c1', accountId: 'a1', targetMsisdn: '+491700000001' }]
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `yarn workspace @julio/whatsapp test -t "reconcile"`
Expected: FAIL — cannot find `./reconcile.js`.

- [ ] **Step 3: Implement the reconciler**

`packages/whatsapp/src/domain/reconcile.js`:
```js
import { needsReplenish, buyQuantity } from './pool/pool-policy.js';
import { depth, hasFreeActiveSlot } from './device-queue/device-queue.js';
import { expandReportTasks } from './report/strategy.js';

function poolIntents(snapshot) {
  const { pool, config } = snapshot;
  if (!config.autobuyEnabled) return [];
  if (!needsReplenish({ available: pool.available, threshold: config.poolThreshold })) return [];
  const quantity = buyQuantity({
    available: pool.available,
    threshold: config.poolThreshold,
    batchSize: config.buyBatchSize
  });
  return [{ type: 'buy', quantity }];
}

function deviceIntents(snapshot) {
  const intents = [];
  let poolBudget = snapshot.pool.available;
  for (const device of snapshot.devices) {
    if (!device.eligible) continue;
    const { queue } = device;
    const banned = device.bannedActiveAccountIds || [];
    for (const accountId of banned) {
      intents.push({ type: 'evict', deviceId: queue.deviceId, accountId });
    }
    const effectiveActive = queue.activeAccountIds.filter((id) => !banned.includes(id));
    const currentDepth = effectiveActive.length + queue.waitingAccountIds.length;
    const missing = queue.targetDepth - currentDepth;
    if (missing > 0 && poolBudget > 0) {
      const count = Math.min(missing, poolBudget);
      intents.push({ type: 'fill-queue', deviceId: queue.deviceId, count });
      poolBudget -= count;
    }
    const freeSlot = effectiveActive.length < queue.activeSlots;
    const nextWaiting = queue.waitingAccountIds[0];
    if (freeSlot && nextWaiting) {
      intents.push({ type: 'bring-online', deviceId: queue.deviceId, accountId: nextWaiting });
    }
  }
  return intents;
}

function reportIntents(snapshot) {
  const onlineAccountIds = snapshot.devices.flatMap((d) => d.onlineAccountIds || []);
  const intents = [];
  for (const campaign of snapshot.campaigns) {
    if (campaign.status !== 'active') continue;
    const tasks = expandReportTasks({
      campaign,
      onlineAccountIds,
      doneKeys: new Set(campaign.doneKeys || [])
    });
    if (tasks.length > 0) {
      intents.push({ type: 'expand-reports', campaignId: campaign.id, tasks });
    }
  }
  return intents;
}

export function reconcile(snapshot) {
  return [
    ...poolIntents(snapshot),
    ...deviceIntents(snapshot),
    ...reportIntents(snapshot)
  ];
}
```

Note: `depth` and `hasFreeActiveSlot` are imported to keep the module consistent with the queue vocabulary; the banned-aware recompute above is intentionally local because it must exclude banned active accounts before measuring depth.

- [ ] **Step 4: Run test — verify it passes**

Run: `yarn workspace @julio/whatsapp test -t "reconcile"`
Expected: PASS.

- [ ] **Step 5: Remove the unused imports flagged by lint**

If `eslint` flags `depth`/`hasFreeActiveSlot` as unused, delete that import line. Run: `yarn workspace @julio/whatsapp lint`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add packages/whatsapp/src/domain/reconcile.js packages/whatsapp/src/domain/reconcile.test.js
git commit -m "feat(whatsapp): desired-state reconciler decision function"
```

---

### Task 9: Port contracts + barrel export

**Files:**
- Create: `packages/whatsapp/src/ports/index.js`
- Create: `packages/whatsapp/src/index.js`
- Test: `packages/whatsapp/src/index.test.js`

- [ ] **Step 1: Write the port contracts (JSDoc typedefs, no runtime code)**

`packages/whatsapp/src/ports/index.js`:
```js
/**
 * Port contracts for the whatsapp bounded context. These are documentation-only
 * typedefs; adapters live in @julio/whatsapp-infra (Plan 2+).
 *
 * @typedef {Object} PurchasedAccount
 * @property {string} msisdn
 * @property {string} source
 * @property {Object} secretRefs
 *
 * @typedef {Object} ProcurementPort
 * @property {() => Promise<{ balanceUsdCents: number }>} getBalance
 * @property {() => Promise<Array<Object>>} listOffers
 * @property {(quantity: number) => Promise<{ orderId: string }>} purchase
 * @property {(order: { orderId: string }) => Promise<PurchasedAccount[]>} fetchDelivered
 *
 * @typedef {Object} DeviceRegistrationPort
 * @property {(device: Object) => Promise<void>} ensureReady
 *
 * @typedef {Object} WhatsappAutomationPort
 * @property {(ctx: Object) => Promise<{ ok: boolean }>} bringOnline
 * @property {(ctx: Object, target: string) => Promise<{ ok: boolean, banned?: boolean }>} reportTarget
 * @property {(ctx: Object) => Promise<'online'|'banned'|'logged_out'>} probeState
 *
 * @typedef {Object} AccountRepo
 * @property {(filter: Object) => Promise<Object[]>} find
 * @property {(account: Object) => Promise<Object>} save
 * @property {(filter: Object) => Promise<number>} countAvailable
 *
 * @typedef {Object} JobDispatcher
 * @property {(queue: string, job: Object, opts?: Object) => Promise<Object>} dispatch
 *
 * @typedef {Object} EventBus
 * @property {(event: Object) => Promise<void>} publish
 * @property {(type: string, handler: Function) => void} subscribe
 *
 * @typedef {Object} Clock
 * @property {() => Date} now
 */

export const PORTS = Object.freeze([
  'AccountRepo', 'DeviceQueueRepo', 'ReportRepo',
  'ProcurementPort', 'DeviceRegistrationPort', 'WhatsappAutomationPort',
  'JobDispatcher', 'EventBus', 'SecretResolver', 'Clock'
]);
```

- [ ] **Step 2: Write the failing barrel-export test**

`packages/whatsapp/src/index.test.js`:
```js
import * as whatsapp from './index.js';

describe('@julio/whatsapp public surface', () => {
  it('re-exports domain building blocks', () => {
    expect(typeof whatsapp.createMsisdn).toBe('function');
    expect(typeof whatsapp.reconcile).toBe('function');
    expect(typeof whatsapp.expandReportTasks).toBe('function');
    expect(Array.isArray(whatsapp.ACCOUNT_STATUSES)).toBe(true);
    expect(Array.isArray(whatsapp.PORTS)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

Run: `yarn workspace @julio/whatsapp test -t "public surface"`
Expected: FAIL — cannot find `./index.js`.

- [ ] **Step 4: Implement the barrel**

`packages/whatsapp/src/index.js`:
```js
export * from './domain/msisdn.js';
export * from './domain/errors.js';
export * from './domain/account/status.js';
export * from './domain/account/account.js';
export * from './domain/device-queue/device-queue.js';
export * from './domain/pool/pool-policy.js';
export * from './domain/report/strategy.js';
export * from './domain/events.js';
export * from './domain/reconcile.js';
export * from './ports/index.js';
```

- [ ] **Step 5: Run test — verify it passes**

Run: `yarn workspace @julio/whatsapp test -t "public surface"`
Expected: PASS.

- [ ] **Step 6: Run the full package suite**

Run: `yarn workspace @julio/whatsapp test`
Expected: PASS — every domain test green.

- [ ] **Step 7: Commit**

```bash
git add packages/whatsapp/src/ports packages/whatsapp/src/index.js packages/whatsapp/src/index.test.js
git commit -m "feat(whatsapp): port contracts + public barrel"
```

---

### Task 10: `@julio/logger` structured JSON transport

Closes the `REQUIREM §6.1` structured-logging gap. Reused by every service (orchestrator, MCP) for JSON logs + correlation IDs.

**Files:**
- Create: `packages/logger/src/structured.js`
- Create: `packages/logger/jest.config.js`
- Test: `packages/logger/src/structured.test.js`
- Modify: `packages/logger/src/index.js`, `packages/logger/package.json`, `jest.config.js` (root)

- [ ] **Step 1: Add the logger test wiring**

Read `packages/logger/package.json`. Ensure its `scripts.test` and devDeps match the shared template. Set (create keys if missing):
```json
  "scripts": {
    "test": "cross-env NODE_OPTIONS=--experimental-vm-modules jest -c jest.config.js",
    "lint": "eslint .",
    "build": "node -e \"console.log('logger: no build step')\""
  },
  "devDependencies": {
    "cross-env": "^7.0.3",
    "eslint": "^9.17.0",
    "jest": "^29.7.0"
  }
```

`packages/logger/jest.config.js`:
```js
export default {
  displayName: 'logger',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.js']
};
```

In root `jest.config.js`, add to `projects`:
```js
    '<rootDir>/packages/logger/jest.config.js',
```

- [ ] **Step 2: Write the failing test**

`packages/logger/src/structured.test.js`:
```js
import { createStructuredLogger } from './structured.js';

function fakeSink() {
  const lines = [];
  return {
    lines,
    write: (str) => { lines.push(str); }
  };
}

const clock = () => new Date('2026-07-09T00:00:00.000Z');

describe('createStructuredLogger', () => {
  it('emits one JSON line per log with level, time and message', () => {
    const stream = fakeSink();
    const log = createStructuredLogger({ level: 'info', stream, clock });
    log.info('hello', { deviceId: 'd1' });
    expect(stream.lines).toHaveLength(1);
    const parsed = JSON.parse(stream.lines[0]);
    expect(parsed).toEqual({
      level: 'info', time: '2026-07-09T00:00:00.000Z', msg: 'hello', deviceId: 'd1'
    });
    expect(stream.lines[0].endsWith('\n')).toBe(true);
  });

  it('filters below the configured level', () => {
    const stream = fakeSink();
    const log = createStructuredLogger({ level: 'warn', stream, clock });
    log.info('ignored');
    log.error('kept');
    expect(stream.lines).toHaveLength(1);
    expect(JSON.parse(stream.lines[0]).msg).toBe('kept');
  });

  it('child() binds correlation fields onto every line', () => {
    const stream = fakeSink();
    const log = createStructuredLogger({ level: 'info', stream, clock })
      .child({ correlationId: 'corr-1' });
    log.info('work');
    expect(JSON.parse(stream.lines[0]).correlationId).toBe('corr-1');
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

Run: `yarn workspace @julio/logger test`
Expected: FAIL — cannot find `./structured.js`.

- [ ] **Step 4: Implement the structured logger**

`packages/logger/src/structured.js`:
```js
const LEVELS = ['debug', 'info', 'warn', 'error'];

function normalizeLevel(level) {
  return LEVELS.includes(level) ? level : 'info';
}

function shouldLog(currentLevel, level) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel);
}

export function createStructuredLogger({
  level = 'info',
  stream = process.stdout,
  clock = () => new Date(),
  base = {}
} = {}) {
  const currentLevel = normalizeLevel(level);

  function emit(logLevel, message, meta) {
    if (!shouldLog(currentLevel, logLevel)) return;
    const line = {
      level: logLevel,
      time: clock().toISOString(),
      msg: message,
      ...base,
      ...(meta || {})
    };
    stream.write(`${JSON.stringify(line)}\n`);
  }

  return {
    level: currentLevel,
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child(bindings) {
      return createStructuredLogger({
        level: currentLevel,
        stream,
        clock,
        base: { ...base, ...bindings }
      });
    }
  };
}
```

- [ ] **Step 5: Run test — verify it passes**

Run: `yarn workspace @julio/logger test`
Expected: PASS.

- [ ] **Step 6: Export it from the logger barrel**

In `packages/logger/src/index.js`, append at the end:
```js
export { createStructuredLogger } from './structured.js';
```

- [ ] **Step 7: Verify the whole monorepo test run picks up both new projects**

Run: `yarn test`
Expected: PASS — the run now includes `whatsapp` and `logger` projects with all tests green.

- [ ] **Step 8: Commit**

```bash
git add packages/logger jest.config.js
git commit -m "feat(logger): structured JSON transport with level filtering + child bindings"
```

---

## Self-Review (Plan 1)

**Spec coverage (Plan 1 slice):**
- Domain model / VOs / no primitive obsession (`spec §5`) → Tasks 1,3 (Msisdn), 3 (aggregate).
- State-machine (`spec §5.3`) → Task 2 + invariant guards in Task 3.
- Queue aggregate + opt-lock version (`spec §5.1, §12`) → Task 4.
- Pool policy (`spec §6-A`) → Task 5.
- Report exactly-once expansion (`spec §6-F, §12`) → Task 6.
- Domain events (`spec §6, §9 notifications source`) → Task 7.
- Reconciler / Central Scheduler decisions (`spec §6`) → Task 8.
- Ports defined inward (`spec §4, §7`) → Task 9.
- Structured JSON logs (`spec §11, §3 gaps`) → Task 10.
- Deferred to later plans (correctly out of Plan 1 scope): persistence, RabbitMQ/DLQ, procurement, automation, MCP, i18n — see roadmap table.

**Placeholder scan:** none — every step contains real code or an exact command.

**Type consistency check:**
- `clock` is passed as a bare function `() => Date` in domain (Tasks 3,7,8,10) — consistent everywhere. (Note: the `Clock` port typedef in Task 9 wraps it as `{ now() }`; the infra adapter in Plan 2 will expose `clock.now`, while the pure domain takes the bare function. This is intentional and called out here.)
- Queue shape `{ deviceId, activeSlots, targetDepth, activeAccountIds, waitingAccountIds, version }` identical in Tasks 4 and 8.
- `reportTaskKey`/`expandReportTasks` signatures identical in Tasks 6 and 8.
- Reconciler intent shapes (`buy`/`fill-queue`/`bring-online`/`evict`/`expand-reports`) are defined once in Task 8 and will be the contract consumed by the Plan 5 orchestrator.

No unresolved inconsistencies.

---

## Execution Handoff

Plan 1 is complete. Plans 2–7 are authored when reached (per roadmap; vendor/UI plans require verifying real formats by fact first).
