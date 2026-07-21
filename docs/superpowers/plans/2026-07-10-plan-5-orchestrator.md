# Mass WhatsApp Report — Plan 5: Orchestrator Process

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `whatsapp-report/apps/whatsapp` deploy process: a cron reconciler that turns `reconcile(snapshot)` intents into idempotent RabbitMQ jobs, RabbitMQ consumers (with DLQ) that execute those jobs via the Plan 2-4 adapters, and a composition root wiring every port.

**Architecture:** Controller pattern (desired-state reconciler + event-driven speed). Mirrors `apps/worker`'s `main()` lifecycle. Cron only ENQUEUES (never works inline); handlers run through a `runEngineJob`-style ledger wrapper for idempotency/backoff; a DLQ wrapper (Plan 2) catches terminal failures. correlationId is threaded per job via `createStructuredLogger().child(...)`.

**Tech Stack:** Node 20 (`.nvmrc`), ESM, `node-cron`, `amqplib`, `ioredis`, `mongoose`, `@julio/config`, `@julio/logger`, `@julio/api` (rabbitmq/db/job-dispatch/EngineJobRun), `@julio/whatsapp` (domain), `@julio/whatsapp-infra` (adapters).

**Depends on:** Plans 1-4.

**Source spec:** design §3, §6, §10, §11; REQUIREM §10, §6, §16, §19.

**Commit trailer:** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Grounding facts (verified — do not re-derive)

- **`apps/whatsapp` and its package do NOT exist.** Model the process on `apps/worker/src/index.js`. `@julio/whatsapp` is taken by the domain package → name the app **`@julio/whatsapp-app`**, located at `whatsapp-report/apps/whatsapp` (root `workspaces` already include `whatsapp-report/apps/*`; add a `jest.config.js` project + a `dev:whatsapp` root script).
- **Cron** (`@julio/api/cron`): `schedule(name, expression, task)` wraps `cron.schedule` with try/catch+log and pushes to a module `tasks[]`; `startCron()`/`stopCron()`. Every engine cron task loads due rows `.lean().limit()` then `dispatchEngineJob({ queueName, jobName, targetType, targetId, payload, idempotencyKey })`. Retry re-delivery is a cron (`engine-job-retries`) re-publishing `EngineJobRun` rows where `status:'queued' && nextRetryAt<=now`.
- **`dispatchEngineJob`** upserts an idempotent `EngineJobRun` (unique `{queueName, idempotencyKey}`), publishes only if `env.rabbitmqUrl`. **`runEngineJob(payload, handler)`** (`apps/worker/src/engine-job-runner.js`) is the execution wrapper: loads `EngineJobRun.findById(payload.jobRunId)`, short-circuits `succeeded/cancelled`, sets `running`/`attempts+=1`, on error computes `nextRetryDate(attempts)=min(15min,30s·2^(n-1))` and re-throws so the consumer nacks.
- **Consumers:** `consumeJson(queue, handler, { prefetch })` (`@julio/api/queue/rabbitmq`) — asserts durable, `JSON.parse`→handler→ack, on throw `nack(false, requeueOnError=false)` → **drops**. Use Plan 2's `consumeJsonWithDlq` to publish terminal failures to `<queue>.dlq`.
- **Lifecycle** (`apps/worker/src/index.js`): env preflight → `connectMongo(env.mongodbUri)` → `getRedis(env.redisUrl)` → `connectRabbitmq(env.rabbitmqUrl)` → `startCron()` → start consumers → `SIGINT/SIGTERM` shutdown (`stopCron`, `releaseLeasesByOwner`, disconnect all). **No HTTP health endpoint on the worker.**
- **Composition:** no container; factory functions read the singleton `env` and pass options to `create*` factories (e.g. `getProvider()` in `worker-context.js`). Lease/model injection: helpers take the Mongoose model as first arg.
- **`@julio/config`:** `defineSchema/loadConfig/rules` (+ `loadRootEnv()`). **No boolean rule** → `WHATSAPP_AUTOBUY_ENABLED: rules.optionalString('false')` compared `=== 'true'`. Ports are `optionalNumber(default)`.
- **`createStructuredLogger({ level, stream, clock, base }).child({ correlationId })`** (Plan 1, `@julio/logger`) is the correlationId mechanism — **currently unused by any app**; threading it is net-new.
- **Domain `reconcile(snapshot)`** returns ordered intents: `{type:'buy',quantity}`, `{type:'fill-queue',deviceId,count}`, `{type:'bring-online',deviceId,accountId}`, `{type:'evict',deviceId,accountId}`, `{type:'expand-reports',campaignId,tasks}`. **These are the contract this process translates into `dispatchEngineJob` calls.**
- **Clock seam:** pass `bareClock(systemClock)` (Plan 2) into domain functions that take `{ clock }`.
- **Service queues** (design §10): `whatsapp.buy`, `whatsapp.queue-fill`, `whatsapp.bring-online`, `whatsapp.probe`, `whatsapp.replace`, `whatsapp.report`.

## Contracts inherited from Plan 2 (MUST honor — verified by Plan 2's final review)

1. **DLQ handler contract.** `consumeJsonWithDlq` (Plan 2) only dead-letters when the handler **throws** an error flagged terminal (`error.permanent === true` OR `error.attempts >= error.maxAttempts`), and only re-drives transient throws via the Mongo ledger. But the engine's `runEngineJob` **swallows** handler errors (it writes `failed`/`queued` to `EngineJobRun` and does NOT re-throw). So a naïve `consumeJsonWithDlq(q, payload => runEngineJob(payload, real))` would NEVER dead-letter and NEVER re-throw. **Each Plan 5 job handler must:** (a) let the ledger own transient retry (record `queued` + `nextRetryAt`), and (b) on attempts-exhaustion re-throw a terminal error carrying `{ attempts, maxAttempts }` (or `permanent:true`) so the DLQ wrapper fires. Add an explicit test that a terminal handler outcome lands in `<queue>.dlq`. Pass a per-queue `prefetch` through `consumeJsonWithDlq` (Plan 2 supports it).
2. **One version-bump per save.** The Mongo repos opt-lock on `version - 1`, assuming exactly ONE domain mutation between load and save. **Handlers MUST persist after each single domain transition** (e.g. save after `assignToDevice`, then load-mutate-save again for `transition`) — composing two bumps before one `save` produces a false `CONFLICT`. When a handler loads an aggregate, map `_id → id` and remember the loaded `version`; feed the domain via `bareClock(systemClock)`.

## Contracts inherited from Plan 4 (MUST honor — verified by Plan 4's final review)

1. **`bringOnline` is a guarded seam that always throws today.** `WhatsappAutomationAdapter.bringOnline` delegates to `bringWhatsappOnline`, which throws `WHATSAPP_SESSION_IMPORT_UNVERIFIED` until the dark.shopping session-import mechanism (Plan 3 seam) is captured live. The **bring-online handler must catch** `WHATSAPP_SESSION_IMPORT_UNVERIFIED` and surface a "blocked-on-session-format" state (do NOT hard-crash the orchestrator; do NOT treat it as a normal transient retry that thrashes).
2. **The whatsapp platform adapter is report-shaped, not publish-shaped.** `whatsappAdapter` exposes only `login`/`healthCheck`/`report` (no `publish`/`setupProfile`/`warmup`). Any generic dispatcher loop over `getPlatformAdapter(platform)` MUST special-case `whatsapp` — never call `publish`/`setupProfile` on it. The infra `WhatsappAutomationAdapter` (`bringOnline`/`reportTarget`/`probeState`) is the correct surface for Plan 5 handlers.
3. **`DuoplusDeviceRegistrationAdapter` needs `config.proxy`.** Proxy provisioning now goes solely through `setSmartIp` and is **skipped when `config.proxy` is absent** (no automatic no-arg call). The composition MUST supply `config.proxy` as `{ host, port, user/username, password }` or `{ id }` for any device that needs a proxy, plus `config.whatsappTeamAppId` (the team-APK id) — both are go-live/verify-by-fact values.
4. **Go-live capture gate.** All WhatsApp selectors (`constants.js`), the session-import mechanism, and the team app id are verify-by-fact seams — they must be captured on a real DuoPlus WhatsApp instance (`getUIDump`/`screenshot`) before any device/report/probe handler runs for real. Until then the report/probe control-flow is tested but the selectors are best-effort seeds.

**File structure:**
- `whatsapp-report/apps/whatsapp/package.json`, `jest.config.js`; modify root `jest.config.js`, root `package.json` (script)
- `src/config/env.js` (+ test)
- `src/composition.js` (+ test)
- `src/snapshot.js` (+ test) — projection → reconcile snapshot
- `src/intents.js` (+ test) — intent → dispatch translation (pure)
- `src/orchestrator.js` — entrypoint (main lifecycle + reconciler cron + consumers)
- `src/handlers/{buy-accounts,fill-queue,bring-online,probe-health,replace-banned,run-report-task}.handler.js` (+ tests)

---

### Task 1: Scaffold `@julio/whatsapp-app`

**Files:** `whatsapp-report/apps/whatsapp/package.json`, `jest.config.js`, `src/orchestrator.js` (stub); modify root `jest.config.js`, root `package.json`.

- [ ] **Step 1:** `package.json` mirroring `apps/worker` scripts (`dev: node --watch ./src/orchestrator.js`, `start: node ./src/orchestrator.js`, `test`, `lint`), `"type":"module"`, name `@julio/whatsapp-app`, deps `@julio/whatsapp`, `@julio/whatsapp-infra`, `@julio/api`, `@julio/config`, `@julio/logger`, `@julio/shared`, `node-cron`, `amqplib`, `ioredis`, `mongoose`.
- [ ] **Step 2:** `jest.config.js` (displayName `whatsapp-app`); add `'<rootDir>/whatsapp-report/apps/whatsapp/jest.config.js'` to root projects; add root script `"dev:whatsapp": "yarn workspace @julio/whatsapp-app dev"`.
- [ ] **Step 3:** `src/orchestrator.js` stub (`export async function main(){}` + guarded `if (import.meta.url === ...) main()`); `yarn install`; `yarn workspace @julio/whatsapp-app test --passWithNoTests`. **Step 4:** Commit `feat(whatsapp-app): scaffold orchestrator process`.

---

### Task 2: `config/env.js`

**Files:** `src/config/env.js` (+ test).

- [ ] **Step 1: Failing test** — with a fake `process.env`, `loadWhatsappEnv(env)` returns `{ mongodbUri, redisUrl, rabbitmqUrl, poolThreshold, deviceTargetDepth, buyBatchSize, probeCron, autobuyEnabled(bool), darkShoppingApiKey, darkShoppingBaseUrl, whatsappTeamAppId, mcpHttpPort, mcpAuthToken, logLevel }`; `autobuyEnabled` is `true` only when `WHATSAPP_AUTOBUY_ENABLED==='true'`.
- [ ] **Step 2:** FAIL. **Step 3: Implement** with `defineSchema`/`loadConfig`/`rules` mirroring `apps/api/src/config/env.js`; keys: `WHATSAPP_POOL_THRESHOLD: optionalNumber(10)`, `WHATSAPP_DEVICE_TARGET_DEPTH: optionalNumber(3)`, `WHATSAPP_BUY_BATCH_SIZE: optionalNumber(5)`, `WHATSAPP_PROBE_CRON: optionalString('*/15 * * * *')`, `WHATSAPP_AUTOBUY_ENABLED: optionalString('false')`, `DARK_SHOPPING_API_KEY/BASE_URL: optionalString()`, `WHATSAPP_APK_URL/WHATSAPP_TEAM_APP_ID: optionalString()`, `WHATSAPP_MCP_HTTP_PORT: optionalNumber(7300)`, `WHATSAPP_MCP_AUTH_TOKEN: optionalString()`, plus reused `MONGODB_URI/REDIS_URL/RABBITMQ_URL/LOG_LEVEL`. Export a factory `loadWhatsappEnv(env=process.env)` (testable) and `export const env = loadWhatsappEnv()`.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-app): 12-factor config`.

---

### Task 3: `composition.js` (wire every port)

**Files:** `src/composition.js` (+ test).

- [ ] **Step 1: Failing test** — `buildContext({ env, deps })` returns `{ accountRepo, deviceQueueRepo, reportRepo, procurement, deviceRegistration, automation, jobDispatcher, eventBus, secretResolver, clock, logger }`; inject fakes for the `create*` factories and assert each is constructed with the right env slice.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — a factory-function module (idiom (a)): construct `createMongoAccountRepo()`, `createMongoDeviceQueueRepo()`, `createMongoReportRepo()`, `createRabbitJobDispatcher()`, `createRabbitRedisEventBus({ redis })`, `createKeychainEnvSecretResolver()`, `systemClock`, `createDarkShoppingProcurementAdapter(...)`, `createDuoplusDeviceRegistrationAdapter(...)`, `createWhatsappAutomationAdapter(...)`, and `logger = createStructuredLogger({ level: env.logLevel, base:{ service:'whatsapp' } })`. Keep it pure wiring — no I/O at import.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-app): composition root`.

---

### Task 4: `snapshot.js` (projection → reconcile input)

**Files:** `src/snapshot.js` (+ test).

- [ ] **Step 1: Failing test** — inject fake repos; `buildSnapshot(ctx)` returns `{ pool:{available}, devices:[{eligible,queue,bannedActiveAccountIds,onlineAccountIds}], campaigns:[{id,status,targets,strategy,doneKeys}], config }` shaped exactly as `reconcile` expects. Assert `pool.available` comes from `accountRepo.countAvailable()`, `doneKeys` from `reportRepo.doneKeys(campaignId)`, device eligibility from the reused `canDeviceAcceptAccount`/`EngineDevice` lease state.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — read models via repos + `EngineDevice` (reuse `device-account-eligibility`); build the snapshot. `.lean()` projections. **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-app): reconcile snapshot builder`.

---

### Task 5: `intents.js` (intent → dispatch, pure)

**Files:** `src/intents.js` (+ test).

- [ ] **Step 1: Failing test** — `dispatchIntents(intents, { jobDispatcher })` maps each intent to a `jobDispatcher.dispatch(queue, job, { idempotencyKey })` call: `buy`→`whatsapp.buy`/`buy-accounts` (`idempotencyKey='buy:'+bucketHour`), `fill-queue`→`whatsapp.queue-fill` (`'fill:'+deviceId+':'+bucket`), `bring-online`→`whatsapp.bring-online` (`'online:'+accountId`), `evict`→`whatsapp.replace` (`'evict:'+accountId`), `expand-reports`→`whatsapp.report` per task (`reportTaskKey`). Assert queue names + idempotency keys.
- [ ] **Step 2:** FAIL. **Step 3: Implement** the pure translation (reuse `reportTaskKey` from `@julio/whatsapp`). **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-app): intent→job translation`.

---

### Task 6-11: Job handlers (one task each)

Each handler runs inside the `runEngineJob` ledger wrapper (import from `@julio/api` if exported, else re-implement the same lifecycle in-app) and takes the composition `ctx`. Each: **Step 1** failing test with fake ctx; **Step 2** FAIL; **Step 3** implement; **Step 4** PASS; **Step 5** commit.

- [ ] **Task 6 — `buy-accounts.handler.js`:** calls `buyAccounts({ quantity }, ctx)` (Plan 3). Idempotent by order id.
- [ ] **Task 7 — `fill-queue.handler.js`:** atomically moves `purchased` pool accounts into the device queue's `waiting` (opt-lock save via `deviceQueueRepo`), transitions accounts `purchased→assigned` (`transition` + `accountRepo.save`, passing `bareClock(clock)`).
- [ ] **Task 8 — `bring-online.handler.js`:** claim device lease (`claimRunningDeviceLease`), `automation.bringOnline(ctx)`, transition `assigned→bringing_online→online`; release lease in `finally`. Ban signal → `banned` + emit `accountBanned` on `eventBus`.
- [ ] **Task 9 — `probe-health.handler.js`:** `automation.probeState(ctx)` → `recordProbe` + transition on ban; emit `accountBanned`/`queueLow` events.
- [ ] **Task 10 — `replace-banned.handler.js`:** evict banned account (`retire`), promote next `waiting`, trigger fill if `queue.depth` low (emit `queueLow`).
- [ ] **Task 11 — `run-report-task.handler.js`:** `reportRepo.upsertTask` (exactly-once), claim lease, `automation.reportTarget(ctx, target)`, mark `done`/`failed`; ban signal → `banned`; emit `reportDone`. Humanized rate-limit per REQUIREM §4.

Commit messages: `feat(whatsapp-app): <handler> job handler`.

---

### Task 12: `orchestrator.js` (entrypoint: lifecycle + reconciler cron + consumers)

**Files:** `src/orchestrator.js`.

- [ ] **Step 1:** Implement `main()` mirroring the worker: env preflight (throw on missing `MONGODB_URI/REDIS_URL/RABBITMQ_URL`), `connectMongo`→`getRedis`→`connectRabbitmq`, build `ctx = buildContext({ env })`, `startCron()` registering a reconciler entry on `env.probeCron` that does `dispatchIntents(reconcile(await buildSnapshot(ctx)), ctx)`, then also subscribe `ctx.eventBus` to `account.banned`/`queue.low`/`pool.low` for immediate reaction (dispatch the same intents without waiting for the tick), start the six `consumeJsonWithDlq(queue, handler, {...})` consumers, and `SIGINT/SIGTERM` shutdown (`stopCron`, `releaseLeasesByOwner(WhatsappDeviceQueue-owner)`, disconnect all). Each job gets a `correlationId` = `jobRunId`; handlers use `ctx.logger.child({ correlationId })`.
- [ ] **Step 2:** Smoke test: a `orchestrator.test.js` that imports `main` with injected fake infra (no real connections) and asserts cron + consumers are registered and a reconcile tick dispatches the expected intents. (No real Mongo/Rabbit per repo convention.)
- [ ] **Step 3:** Run `yarn workspace @julio/whatsapp-app test` (green) and `yarn test` (whole monorepo green). **Step 4:** Commit `feat(whatsapp-app): orchestrator entrypoint (reconciler cron + consumers + DLQ + graceful shutdown)`.

---

### Task 13: Deploy-process registration

**Files:** modify `Procfile` (add `whatsapp: yarn workspace @julio/whatsapp-app start`), document required env in `.env.example`.

- [ ] Add the process line + env keys; commit `chore(whatsapp-app): register deploy process + env template`.

---

## Known follow-ups (from Plan 5's final review)

- **Health-probe scheduling (design Flow D) is DEFERRED.** `reconcile()` emits no probe intent and `dispatchIntents` has no probe case, so the `whatsapp.probe` consumer + `probeHealthHandler` are wired but not yet fed. Proactive/scheduled ban detection is therefore not active; bans are currently caught **reactively** during `bring-online`/`run-report-task`. Follow-up: add a probe-scheduling cron (or a probe intent) that enqueues `whatsapp.probe` for `online`/`cooldown` accounts on `WHATSAPP_PROBE_CRON`. The handler + queue + consumer are ready.
- **Fixed in review:** (1) handlers now receive the unwrapped domain `payload` (was passing the whole broker envelope → undefined inputs); (2) `republishRetries` node-cron re-delivers `queued` `EngineJobRun` rows (the engine's retry cron doesn't run in this process); (3) retriable conditions (`device-busy`, report `not-confirmed`) now THROW (transient → retried) instead of returning success; (4) reconciler idempotency keys for `bring-online`/`evict`/`report` are hourly-bucketed so incomplete work is re-attempted (exactly-once still enforced by `upsertTask` + the unique index); (5) lease `claim` positional→object adapter.

## Self-Review (Plan 5)

**Spec coverage:** reconciler cron (§6) → T12; six flows A-F (§6) → T4-11; DLQ (§10) → T12 (via Plan 2 wrapper); config 12-factor (§11) → T2; composition (§3) → T3; correlationId (§6.1) → T12; graceful shutdown/leases (§19, §3.3) → T12. **Reuse:** cron/`dispatchEngineJob`/`runEngineJob`/rabbitmq/mongo/redis/lease from `@julio/api`+`@julio/shared`; all adapters from Plan 2-4; `reconcile`/`bareClock` from domain+infra.

**Placeholder scan:** none new (external unknowns already isolated in Plans 3-4; this plan only wires them). **Type consistency:** intent shapes match `reconcile`'s output; queue names match design §10 and Plan 6's tool that triggers `reconcile.now`; `ctx` port set matches `PORTS`. **Node 20** per `.nvmrc`. **Deferred:** MCP surface (Plan 6) consumes this process's `ctx`/use-cases.
