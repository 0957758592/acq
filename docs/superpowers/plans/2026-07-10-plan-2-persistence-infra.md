# Mass WhatsApp Report — Plan 2: Persistence & Shared Infra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@julio/whatsapp-infra` — the adapter package that implements the Plan-1 domain ports over the existing engine infrastructure (Mongoose, RabbitMQ, Redis, lease, job ledger), plus a dead-letter-queue wrapper that the repo currently lacks.

**Architecture:** Ports & Adapters. The pure domain (`@julio/whatsapp`, Plan 1) declares JSDoc port contracts; this package provides concrete Mongo/Rabbit/Redis/secret/clock adapters. It reuses `@julio/api` subpath exports (`EngineJobRun`, `dispatchEngineJob`, `publishJson`/`consumeJson`, `connectMongo`, `getRedis`), `@julio/shared` (`mongo-lease`), and `@julio/config`. It adds nothing to the domain and introduces the DLQ that engine lacks.

**Tech Stack:** Node 18 ESM, Mongoose 8, `amqplib`, `ioredis`, Jest (`--experimental-vm-modules`). No TypeScript, no zod, no `mongodb-memory-server` (tests use dependency-injected fakes, per repo convention).

**Location:** `whatsapp-report/packages/whatsapp-infra` (bounded-context container; package name `@julio/whatsapp-infra`).

**Source spec:** `docs/superpowers/specs/2026-07-09-mass-whatsapp-report-design.md` (§5.1, §7, §10, §12).

**Commit trailer (every commit):** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Grounding facts (verified against the real codebase — do not re-derive)

- **No optimistic version locking exists anywhere** in the repo (`__v`/`$inc`/`optimisticConcurrency` unused). The domain aggregates (`@julio/whatsapp`) already carry a self-managed `version` integer and bump it in pure functions. This package enforces the opt-lock at the **repository** layer via `findOneAndUpdate({ _id, version: expectedVersion }, { $set: nextDoc })` returning `null` on a version mismatch → surfaced as a `CONFLICT` domain error. There is **no precedent to copy**; the code below is the canonical implementation.
- **`EngineJobRun`** (`@julio/api/models/engine-job-run`): fields are `queueName, jobName, idempotencyKey (sha256 hex), status ∈ {queued,running,succeeded,failed,cancelled}, attempts, maxAttempts, nextRetryAt, lastError{code,message,stack}`. Unique index `{queueName, idempotencyKey}`. **No `nextAttemptAt`, no stored `backoff`.** Backoff is computed in the worker runner `nextRetryDate(attempts) = min(15min, 30_000·2^(attempts-1))`.
- **`dispatchEngineJob({ queueName, jobName, targetType, targetId, payload, maxAttempts, idempotencyKey })`** (`@julio/api/services/job-dispatch.service`): computes `sha256` idempotency key if absent, upserts `EngineJobRun` with `$setOnInsert` on the unique index (re-dispatch = no-op), then `publishJson` only if `env.rabbitmqUrl` is set. Mongo is source of truth.
- **RabbitMQ** (`@julio/api/queue/rabbitmq`): `connectRabbitmq(url)`, `publishJson(queueName, payload)` (asserts `{durable:true}`, `persistent:true`), `consumeJson(queueName, handler, { prefetch=1, requeueOnError=false })` (asserts durable, `JSON.parse`→handler→ack; on throw `nack(msg,false,requeueOnError)`). **No DLQ anywhere** — a failed message with default opts is dropped. Retry durability lives in Mongo, not the broker.
- **Redis** (`@julio/api/db/redis`): `getRedis(url)` lazy `ioredis` singleton. Pub/sub precedent: publisher `redis.publish(channel, JSON.stringify(payload))` (best-effort, errors swallowed); subscriber must use `getRedis(url).duplicate()` then `psubscribe`/`subscribe`.
- **Lease** (`@julio/shared` → `mongo-lease.js`): `claimMongoLease(model, { owner, ttlMs=600000, filter, leaseUntilField='leasedUntil', leaseOwnerField='leasedBy' })`, `renewMongoLease`, `releaseMongoLease`, `releaseLeasesByOwner`. Atomic `findOneAndUpdate`; `owner` required.
- **Secret resolver** precedent (`apps/worker/src/handlers/secret-resolver.js`, worker-local, NOT shared): `resolveSecretRef('scheme:name', { env, readKeychain })` supports `env:` (reads `opts.env||process.env`) and `keychain:` (macOS `security find-generic-password`). We **re-implement** this in the infra package (do not import from the worker app).
- **Mongoose model pattern**: `export const X = mongoose.models.X || mongoose.model('X', schema)`; explicit `{ collection: 'snake_case', timestamps: true }`; sub-docs `new mongoose.Schema({...}, { _id:false })`; indexes via `schema.index(...)`. Connection via `connectMongo(uri)` (idempotent).
- **Cross-package imports** use subpath-export aliases declared in each package's `package.json` `exports` map. `apps/api` is importable as `@julio/api` with subpaths `./models/*`, `./services/*`, `./queue/*`, `./db/*`, `./config/*`, `./logger`.
- **Tests** are colocated `*.test.js`, run under root multi-project `jest.config.js`. No real DB in tests: use `validateSync()` for schema tests and **hand-rolled fake models with a stubbed `findOneAndUpdate`** for repo tests (the `mongo-lease.test.js` pattern).
- **Clock seam**: the domain takes a bare `clock: () => Date`; the `Clock` port typedef is `{ now(): Date }`. This package exposes `systemClock = { now: () => new Date() }` **and** a `bareClock(clock) = () => clock.now()` helper so the orchestrator (Plan 5) passes `bareClock(systemClock)` into domain functions. (Closes final-review flag #1.)

**Dependency note (flag):** the design lists `whatsapp-infra` deps as `@julio/{integrations,device-control,automation,shared,config,logger}` but the reused `EngineJobRun`/`dispatchEngineJob`/`rabbitmq`/`redis`/`mongo` live in `apps/api` (`@julio/api`). This package therefore depends on `@julio/api` subpaths. That is the pragmatic reuse path (mirror existing, no refactor). If you prefer to avoid an infra→app dependency, a later refactor could lift those into `@julio/shared`; out of scope here (YAGNI).

**File structure created in this plan:**
- `whatsapp-report/packages/whatsapp-infra/package.json`, `jest.config.js`, `src/index.js`
- `src/errors.js` (+ test) — infra error mapping helper
- `src/models/whatsapp-account.model.js`, `whatsapp-device-queue.model.js`, `whatsapp-report-campaign.model.js`, `whatsapp-report-task.model.js` (+ tests)
- `src/repositories/mongo-account-repo.js`, `mongo-device-queue-repo.js`, `mongo-report-repo.js` (+ tests)
- `src/messaging/dlq.js` (+ test), `rabbit-job-dispatcher.js` (+ test), `rabbit-redis-event-bus.js` (+ test)
- `src/secrets/keychain-env-secret-resolver.js` (+ test)
- `src/clock/system-clock.js` (+ test)
- Modify: root `jest.config.js` (add project)

---

### Task 1: Scaffold `@julio/whatsapp-infra`

**Files:**
- Create: `whatsapp-report/packages/whatsapp-infra/package.json`
- Create: `whatsapp-report/packages/whatsapp-infra/jest.config.js`
- Create: `whatsapp-report/packages/whatsapp-infra/src/index.js` (temporary empty barrel)
- Modify: root `jest.config.js`

- [ ] **Step 1: package.json** (mirror `@julio/whatsapp` + shared exports map)
```json
{
  "name": "@julio/whatsapp-infra",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./models/*": "./src/models/*.model.js",
    "./repositories/*": "./src/repositories/*.js",
    "./messaging/*": "./src/messaging/*.js"
  },
  "scripts": {
    "test": "cross-env NODE_OPTIONS=--experimental-vm-modules jest -c jest.config.js",
    "lint": "eslint .",
    "build": "node -e \"console.log('whatsapp-infra: no build step')\""
  },
  "dependencies": {
    "@julio/whatsapp": "0.1.0",
    "@julio/api": "*",
    "@julio/shared": "*",
    "@julio/config": "*",
    "@julio/logger": "0.1.0",
    "mongoose": "^8.0.0"
  },
  "devDependencies": {
    "cross-env": "^7.0.3",
    "eslint": "^9.17.0",
    "jest": "^29.7.0"
  }
}
```
> Verify the exact `mongoose` version and the `@julio/api`/`@julio/shared`/`@julio/config` version specifiers by reading `apps/api/package.json` before writing, and match them.

- [ ] **Step 2: jest.config.js**
```js
export default {
  displayName: 'whatsapp-infra',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.js']
};
```

- [ ] **Step 3:** empty barrel `src/index.js` with a single line `export {};` (filled in later tasks).

- [ ] **Step 4:** In root `jest.config.js` `projects` array, add `'<rootDir>/whatsapp-report/packages/whatsapp-infra/jest.config.js'`.

- [ ] **Step 5:** Run `yarn install` (registers the new workspace + symlink), then `yarn workspace @julio/whatsapp-infra test --passWithNoTests`. Expected: passes (no tests yet).

- [ ] **Step 6: Commit** — `feat(whatsapp-infra): scaffold adapter package`.

---

### Task 2: Infra error helper (domain-error passthrough + CONFLICT)

**Files:**
- Create: `src/errors.js`
- Test: `src/errors.test.js`

- [ ] **Step 1: Failing test** — assert `conflictError(msg)` produces a `DomainError` with `code === 'CONFLICT'` and message prefixed `CONFLICT:` (reuse `@julio/whatsapp` `domainError`, so `toThrow('CONFLICT')` works), and `notFoundError` produces `code === 'NOT_FOUND'`.
```js
import { conflictError, notFoundError } from './errors.js';
describe('infra errors', () => {
  it('builds a CONFLICT domain error', () => {
    const e = conflictError('queue d1 changed');
    expect(e.code).toBe('CONFLICT');
    expect(() => { throw e; }).toThrow('CONFLICT');
  });
  it('builds a NOT_FOUND domain error', () => {
    expect(notFoundError('acct a1').code).toBe('NOT_FOUND');
  });
});
```
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3: Implement** — thin wrappers over the domain factory:
```js
import { domainError } from '@julio/whatsapp';
export const conflictError = (message) => domainError('CONFLICT', message);
export const notFoundError = (message) => domainError('NOT_FOUND', message);
```
- [ ] **Step 4:** Run — verify PASS. **Step 5:** Commit `feat(whatsapp-infra): infra error helpers`.

---

### Task 3: `whatsapp_accounts` Mongoose model

**Files:**
- Create: `src/models/whatsapp-account.model.js`
- Test: `src/models/whatsapp-account.model.test.js`

Mirrors `engine-account.model.js` (nested `secretRefs`) and encodes the Plan-1 aggregate shape (`id`→`_id` string, `msisdn`, `source`, `secretRefs`, `status`, `assignedDeviceId`, `health`, `version`).

- [ ] **Step 1: Failing test** (validate-only, no DB connection):
```js
import { WhatsappAccount, ACCOUNT_STATUSES } from './whatsapp-account.model.js';
describe('WhatsappAccount model', () => {
  it('requires msisdn and defaults status/version', () => {
    const doc = new WhatsappAccount({ msisdn: '+491701234567', source: 'dark_shopping' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe('purchased');
    expect(doc.version).toBe(0);
    expect(doc.assignedDeviceId).toBeNull();
  });
  it('rejects an unknown status', () => {
    const doc = new WhatsappAccount({ msisdn: '+491701234567', status: 'bogus' });
    expect(doc.validateSync()).toBeDefined();
  });
  it('exposes the status enum', () => {
    expect(ACCOUNT_STATUSES).toContain('online');
  });
});
```
- [ ] **Step 2:** FAIL. **Step 3: Implement** — reuse the domain enum so DB and domain never drift:
```js
import mongoose from 'mongoose';
import { ACCOUNT_STATUSES } from '@julio/whatsapp';

const healthSchema = new mongoose.Schema(
  { consecutiveFailures: { type: Number, default: 0 }, lastProbeAt: { type: Date, default: null } },
  { _id: false }
);

const accountSchema = new mongoose.Schema({
  msisdn:           { type: String, required: true, unique: true, index: true },
  source:           { type: String, default: '' },
  secretRefs:       { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  status:           { type: String, enum: ACCOUNT_STATUSES, default: 'purchased', index: true },
  assignedDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EngineDevice', default: null, index: true },
  health:           { type: healthSchema, default: () => ({}) },
  version:          { type: Number, default: 0 }
}, { collection: 'whatsapp_accounts', timestamps: true });

// pool availability query path: purchased + unassigned
accountSchema.index({ status: 1, assignedDeviceId: 1 });

export const WhatsappAccount =
  mongoose.models.WhatsappAccount || mongoose.model('WhatsappAccount', accountSchema);
export { ACCOUNT_STATUSES };
```
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): whatsapp_accounts model`.

---

### Task 4: `whatsapp_device_queues` model (opt-lock carrier)

**Files:** `src/models/whatsapp-device-queue.model.js` (+ test).

Encodes the Plan-1 queue aggregate: `deviceId, activeSlots, targetDepth, activeAccountIds[], waitingAccountIds[], version`. One doc per device (`deviceId` unique).

- [ ] **Step 1: Failing test** — unique `deviceId`, arrays default `[]`, `version` default 0, `validateSync()` clean for `{ deviceId }`.
- [ ] **Step 2:** FAIL. **Step 3: Implement**:
```js
import mongoose from 'mongoose';
const queueSchema = new mongoose.Schema({
  deviceId:         { type: mongoose.Schema.Types.ObjectId, ref: 'EngineDevice', required: true, unique: true, index: true },
  activeSlots:      { type: Number, default: 1 },
  targetDepth:      { type: Number, default: 3 },
  activeAccountIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  waitingAccountIds:{ type: [mongoose.Schema.Types.ObjectId], default: [] },
  version:          { type: Number, default: 0 }
}, { collection: 'whatsapp_device_queues', timestamps: true });
export const WhatsappDeviceQueue =
  mongoose.models.WhatsappDeviceQueue || mongoose.model('WhatsappDeviceQueue', queueSchema);
```
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): whatsapp_device_queues model`.

---

### Task 5: `whatsapp_report_campaigns` + `whatsapp_report_tasks` models (exactly-once index)

**Files:** `src/models/whatsapp-report-campaign.model.js`, `src/models/whatsapp-report-task.model.js` (+ tests).

- [ ] **Step 1: Failing test** — campaign: `targets:[String]`, `strategy` enum from `REPORT_STRATEGIES`, `status` enum `['draft','active','paused','completed','stopped']`, counters default 0. Task: the **unique compound index `{ campaignId, accountId, targetMsisdn }`** exists and status enum `['pending','running','done','failed']`. Assert `WhatsappReportTask.schema.indexes()` contains an entry with `{ unique: true }` over those three keys.
- [ ] **Step 2:** FAIL. **Step 3: Implement** campaign:
```js
import mongoose from 'mongoose';
import { REPORT_STRATEGIES } from '@julio/whatsapp';
const campaignSchema = new mongoose.Schema({
  targets:  { type: [String], default: [] },
  strategy: { type: String, enum: REPORT_STRATEGIES, required: true },
  status:   { type: String, enum: ['draft','active','paused','completed','stopped'], default: 'draft', index: true },
  counts:   { requested: { type: Number, default: 0 }, done: { type: Number, default: 0 }, failed: { type: Number, default: 0 } }
}, { collection: 'whatsapp_report_campaigns', timestamps: true });
export const WhatsappReportCampaign =
  mongoose.models.WhatsappReportCampaign || mongoose.model('WhatsappReportCampaign', campaignSchema);
```
and task:
```js
import mongoose from 'mongoose';
const taskSchema = new mongoose.Schema({
  campaignId:   { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsappReportCampaign', required: true, index: true },
  accountId:    { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsappAccount', required: true },
  targetMsisdn: { type: String, required: true },
  status:       { type: String, enum: ['pending','running','done','failed'], default: 'pending', index: true },
  attempts:     { type: Number, default: 0 },
  lastError:    { type: String, default: '' }
}, { collection: 'whatsapp_report_tasks', timestamps: true });
taskSchema.index({ campaignId: 1, accountId: 1, targetMsisdn: 1 }, { unique: true }); // exactly-once per pair
export const WhatsappReportTask =
  mongoose.models.WhatsappReportTask || mongoose.model('WhatsappReportTask', taskSchema);
```
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): report campaign + task models (exactly-once unique index)`.

---

### Task 6: `MongoAccountRepo` (AccountRepo port + opt-lock save)

**Files:** `src/repositories/mongo-account-repo.js` (+ test). Implements `AccountRepo`: `find(filter)`, `save(account)`, `countAvailable(filter)`.

The repo maps between the domain aggregate (plain frozen object with `id`, `version`) and the Mongoose doc. `save` uses opt-lock: for an existing account it does `findOneAndUpdate({ _id: id, version: previousVersion }, { $set: nextFields })`; a `null` result means a concurrent writer moved the version → throw `conflictError`. New accounts (version 0, no `_id` match) are inserted.

- [ ] **Step 1: Failing test** using a **fake model** (no DB), asserting the exact `{filter, update}` passed to `findOneAndUpdate` and the CONFLICT throw:
```js
import { createMongoAccountRepo } from './mongo-account-repo.js';

function fakeModel(returns = {}) {
  const calls = [];
  return {
    calls,
    findOneAndUpdate: (filter, update, options) => { calls.push({ filter, update, options }); return returns.findOneAndUpdate; },
    countDocuments: (filter) => { calls.push({ countFilter: filter }); return returns.countDocuments ?? 0; },
    find: (filter) => { calls.push({ findFilter: filter }); return { lean: () => (returns.find ?? []) }; }
  };
}
const doc = (over = {}) => ({ id: 'a1', msisdn: '+491701234567', status: 'assigned', assignedDeviceId: 'd1',
  secretRefs: {}, health: { consecutiveFailures: 0, lastProbeAt: null }, version: 3, ...over });

describe('MongoAccountRepo.save (opt-lock)', () => {
  it('updates on matching version and bumps nothing itself (domain owns version)', async () => {
    const model = fakeModel({ findOneAndUpdate: { _id: 'a1' } });
    const repo = createMongoAccountRepo({ model });
    await repo.save(doc({ version: 3 }));
    const { filter, update } = model.calls[0];
    expect(filter).toEqual({ _id: 'a1', version: 2 }); // matches the PRE-bump version
    expect(update.$set.status).toBe('assigned');
    expect(update.$set.version).toBe(3);
  });
  it('throws CONFLICT when findOneAndUpdate returns null', async () => {
    const model = fakeModel({ findOneAndUpdate: null });
    const repo = createMongoAccountRepo({ model });
    await expect(repo.save(doc({ version: 5 }))).rejects.toThrow('CONFLICT');
  });
  it('countAvailable counts purchased + unassigned', async () => {
    const model = fakeModel({ countDocuments: 7 });
    const repo = createMongoAccountRepo({ model });
    expect(await repo.countAvailable()).toBe(7);
    expect(model.calls[0].countFilter).toEqual({ status: 'purchased', assignedDeviceId: null });
  });
});
```
> **Design decision baked into the test:** the domain bumps `version` before calling `save`, so the repo matches on `version - 1` and `$set`s the new `version`. Document this clearly in the repo file. (If the team prefers the repo to own the bump, change the domain contract instead — but Plan 1 already bumps in pure functions, so the repo must match `version - 1`.)

- [ ] **Step 2:** FAIL. **Step 3: Implement**:
```js
import { WhatsappAccount } from '../models/whatsapp-account.model.js';
import { conflictError } from '../errors.js';

function toFields(a) {
  return {
    msisdn: a.msisdn, source: a.source, secretRefs: a.secretRefs,
    status: a.status, assignedDeviceId: a.assignedDeviceId,
    health: a.health, version: a.version
  };
}

export function createMongoAccountRepo({ model = WhatsappAccount } = {}) {
  return {
    async find(filter = {}) { return model.find(filter).lean(); },
    async countAvailable(filter = {}) {
      return model.countDocuments({ status: 'purchased', assignedDeviceId: null, ...filter });
    },
    async save(account) {
      const previousVersion = account.version - 1; // domain already bumped
      const updated = await model.findOneAndUpdate(
        { _id: account.id, version: previousVersion },
        { $set: toFields(account) },
        { new: true }
      );
      if (!updated) throw conflictError(`account ${account.id} version conflict`);
      return updated;
    }
  };
}
```
> **Note:** brand-new accounts (fresh from procurement, version 0) are inserted by the procurement handler (Plan 3) via `insertMany`/`create`, not through `save`; `save` is for state transitions of already-persisted accounts. State that explicitly in the file header.

- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): MongoAccountRepo with version opt-lock`.

---

### Task 7: `MongoDeviceQueueRepo` + `MongoReportRepo`

**Files:** `src/repositories/mongo-device-queue-repo.js`, `src/repositories/mongo-report-repo.js` (+ tests). Same opt-lock `save` pattern for the queue (`find(deviceId)`, `save(queue)` matching `{ deviceId, version: version-1 }`). `MongoReportRepo` provides `findCampaign(id)`, `listActiveCampaigns()`, `doneKeys(campaignId)` (returns a Set of `reportTaskKey`s for `status:'done'` tasks — feeds the reconciler), `upsertTask(task)` (uses the unique index + `$setOnInsert` so a duplicate `(campaign,account,target)` is a no-op = exactly-once), `markTask(id, status, error?)`.

- [ ] **Step 1: Failing tests** with fake models: queue opt-lock CONFLICT; `doneKeys` builds `\`${campaignId}:${accountId}:${targetMsisdn}\`` strings; `upsertTask` calls `findOneAndUpdate(uniqueFilter, { $setOnInsert }, { upsert:true })`.
- [ ] **Step 2:** FAIL. **Step 3: Implement** both repos mirroring Task 6. For `doneKeys`, reuse the domain `reportTaskKey` from `@julio/whatsapp` so the key format never drifts from the reconciler.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): device-queue + report repositories`.

---

### Task 8: DLQ wrapper over `consumeJson`

**Files:** `src/messaging/dlq.js` (+ test). Closes REQUIREM §10 — the repo has no dead-letter today; a failed message is nack-dropped.

`consumeJsonWithDlq(queueName, handler, { maxAttempts, publishJson, consumeJson, clock, logger })` wraps the engine consumer. It relies on the Mongo `EngineJobRun` ledger for retry (as engine does), but when a job's `attempts >= maxAttempts` (terminal failure), it publishes the poisoned payload to a durable `<queueName>.dlq` with the failure reason and correlation id, then acks the original so it stops recirculating. Because `consumeJson` swallows retries via Mongo, the DLQ decision is made by inspecting the handler outcome / job-run status passed back.

- [ ] **Step 1: Failing test** — inject fake `consumeJson` (captures the wrapped handler) and fake `publishJson` (captures DLQ publishes). Drive: a handler that throws a terminal error (flagged `permanent: true` or attempts exhausted) → asserts one publish to `\`${queue}.dlq\`` with `{ reason, payload, failedAt }`; a transient error → no DLQ publish (left to Mongo retry).
- [ ] **Step 2:** FAIL. **Step 3: Implement** — the wrapper decides DLQ vs. retry from the error shape (`error.permanent === true` or `error.code` in a terminal set) and/or the `jobRun.attempts >= jobRun.maxAttempts` signal the handler returns. Publish DLQ with `publishJson(\`${queueName}.dlq\`, { reason: error.message, code: error.code, payload, failedAt: clock.now().toISOString() })`, log at `error`, then let the message ack.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): dead-letter-queue wrapper (closes DLQ gap)`.

---

### Task 9: `RabbitJobDispatcher` (JobDispatcher port)

**Files:** `src/messaging/rabbit-job-dispatcher.js` (+ test). Wraps `dispatchEngineJob` so the domain/use-cases depend only on the `JobDispatcher` port (`dispatch(queue, job, opts?) => Promise`).

- [ ] **Step 1: Failing test** — inject a fake `dispatchEngineJob`; assert `dispatch('whatsapp.buy', { jobName:'buy-accounts', payload:{quantity:5} }, { idempotencyKey:'k' })` calls it with `{ queueName:'whatsapp.buy', jobName:'buy-accounts', payload:{quantity:5}, idempotencyKey:'k' }` and returns the job run.
- [ ] **Step 2:** FAIL. **Step 3: Implement**:
```js
import { dispatchEngineJob } from '@julio/api/services/job-dispatch.service';
export function createRabbitJobDispatcher({ dispatch = dispatchEngineJob } = {}) {
  return {
    async dispatch(queueName, job, opts = {}) {
      return dispatch({
        queueName,
        jobName: job.jobName,
        targetType: job.targetType ?? '',
        targetId: job.targetId ?? null,
        payload: job.payload ?? {},
        maxAttempts: opts.maxAttempts ?? 3,
        idempotencyKey: opts.idempotencyKey ?? ''
      });
    }
  };
}
```
> Verify the exact `@julio/api` subpath for `job-dispatch.service` from `apps/api/package.json` exports before importing.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): RabbitJobDispatcher adapter`.

---

### Task 10: `RabbitRedisEventBus` (EventBus port)

**Files:** `src/messaging/rabbit-redis-event-bus.js` (+ test). `publish(event)` writes durably (best-effort persist to a Rabbit `whatsapp.events` queue AND `redis.publish`) so both the orchestrator (low-latency) and the MCP bridge (Plan 6) can react; `subscribe(type, handler)` uses a **duplicated** Redis connection + `subscribe`/`psubscribe`, filtering by `event.type`.

- [ ] **Step 1: Failing test** — inject fake `redis` (records `publish` channel+payload; `duplicate()` returns a fake sub with `subscribe`/`on`); assert `publish(accountBanned(...))` publishes JSON to channel `whatsapp:events` and that `subscribe('account.banned', h)` wires a handler that only fires for matching `event.type`. Errors in publish are swallowed (best-effort), matching the device-events precedent.
- [ ] **Step 2:** FAIL. **Step 3: Implement** mirroring `packages/shared/src/device-events.js` (publish best-effort) and `device-event-stream.service.js` (`.duplicate()` subscriber). **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): RabbitRedisEventBus adapter`.

---

### Task 11: `KeychainEnvSecretResolver` (SecretResolver port)

**Files:** `src/secrets/keychain-env-secret-resolver.js` (+ test). Re-implements the worker's `resolveSecretRef` inside this package (do not import from `apps/worker`). Supports `env:` and `keychain:` schemes with injectable `env` / `readKeychain` for tests.

- [ ] **Step 1: Failing test** — `resolve('env:FOO', { env: { FOO: 'bar' } })` → `'bar'`; `resolve('keychain:wa-a1', { readKeychain })` calls the injected reader; unknown scheme throws `SECRET_SCHEME_UNSUPPORTED`.
- [ ] **Step 2:** FAIL. **Step 3: Implement** (macOS `security find-generic-password -a $USER -s <name> -w` via `execFile`, injectable). Note in the header: keychain is dev/macOS-only; prod uses `env:` refs. **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): KeychainEnvSecretResolver adapter`.

---

### Task 12: `systemClock` + `bareClock` (Clock port + domain seam)

**Files:** `src/clock/system-clock.js` (+ test). Closes final-review flag #1.

- [ ] **Step 1: Failing test**:
```js
import { systemClock, bareClock } from './system-clock.js';
it('systemClock.now returns a Date', () => { expect(systemClock.now()).toBeInstanceOf(Date); });
it('bareClock adapts a Clock port to the domain bare-function form', () => {
  const fixed = new Date('2026-07-10T00:00:00.000Z');
  const clock = { now: () => fixed };
  expect(bareClock(clock)()).toBe(fixed);
});
```
- [ ] **Step 2:** FAIL. **Step 3: Implement**:
```js
export const systemClock = { now: () => new Date() };
export const bareClock = (clock) => () => clock.now();
```
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): system clock + domain clock adapter`.

---

### Task 13: Barrel export + full suite

**Files:** `src/index.js` (+ `src/index.test.js`). Re-export every factory/model/adapter. Test asserts the public surface (`createMongoAccountRepo`, `createRabbitJobDispatcher`, `createRabbitRedisEventBus`, `consumeJsonWithDlq`, `systemClock`, `bareClock`, models) are all defined. Run full `yarn workspace @julio/whatsapp-infra test` (all green) and `yarn test` (whole monorepo green — the new project is picked up). Commit `feat(whatsapp-infra): public barrel + green suite`.

---

## Self-Review (Plan 2)

**Spec coverage:** collections/models (§5.1) → Tasks 3-5; opt-lock (§12) → Tasks 6-7; DLQ (§10) → Task 8; JobDispatcher/EventBus/SecretResolver adapters (§7) → Tasks 9-11; Clock seam → Task 12; barrel/tests (§13) → Task 13. **Reuse (no dup):** `EngineJobRun`/`dispatchEngineJob`/`rabbitmq`/`redis`/`mongo-lease` imported from `@julio/api`/`@julio/shared`.

**Placeholder scan:** external-format stubs — none in Plan 2 (all infra is knowable from the repo). Two flagged decisions: (a) domain-bumps-version → repo matches `version-1` (baked into Task 6 test); (b) no `mongodb-memory-server` → all repo tests use DI-fakes.

**Type consistency:** repo `save` signatures identical across Tasks 6-7; `reportTaskKey` reused from `@julio/whatsapp` in Task 7 `doneKeys` matches the reconciler's key format; queue/account field names match the Plan-1 aggregates and the models in Tasks 3-4.

**Deferred to later plans:** procurement adapter (Plan 3), device/automation adapters (Plan 4), orchestrator wiring (Plan 5), MCP (Plan 6).
