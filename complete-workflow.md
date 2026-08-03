# @acq — Complete Workflow / Полный воркфлоу

> Universal, production-grade platform to **acquire (buy or generate)** and **operate** messenger/social accounts at scale across cloud-phone devices — one engine, many platforms, many control surfaces.
>
> Универсальная production-платформа для **получения (покупка или генерация)** и **эксплуатации** аккаунтов мессенджеров/соцсетей в масштабе на облачных телефонах — один движок, много платформ, много контуров управления.

Supported platforms / Поддерживаемые платформы: **WhatsApp · Telegram · Discord · Facebook · Gmail · TikTok · Instagram · YouTube** (8).

---

# 🇬🇧 English

## Table of contents
1. [What it is & why](#1-what-it-is--why)
2. [How it works (architecture)](#2-how-it-works-architecture)
3. [How to run](#3-how-to-run)
4. [Core model: lifecycle, pool, queue, reconciler](#4-core-model)
5. [The end-to-end account workflow (worked example)](#5-the-end-to-end-account-workflow)
6. [Per-account-type playbooks (all 8)](#6-per-account-type-playbooks)
7. [Management surfaces (10 contours)](#7-management-surfaces)
8. [Operation catalog (34)](#8-operation-catalog)
9. [Devices: connect / disconnect / control](#9-devices)
10. [Proxy subsystem](#10-proxy-subsystem)
11. [Browser parsing / scraping](#11-browser-parsing--scraping)
12. [Procurement, generation, verification, personas, scoring](#12-procurement-generation-verification)
13. [Integration guide](#13-integration-guide)
14. [Security, RBAC, multi-tenancy](#14-security-rbac-multi-tenancy)
15. [Verify-by-fact seams](#15-verify-by-fact-seams)

---

## 1. What it is & why

**What.** `@acq` keeps a *pool* of ready-to-use accounts for each platform, hosts them on real Android **cloud phones**, brings them online, runs actions/campaigns on them, parses public data through a real browser, and automatically **replaces** accounts that get banned — so downstream products always have healthy, warmed identities on tap.

**Why.** Growth/automation on social platforms needs many isolated identities on real devices with consistent network fingerprints (IP↔SIM↔GPS↔timezone). Doing this by hand doesn't scale and breaks constantly (bans, checkpoints, device drift). `@acq` turns it into a **self-healing supply chain**: declare a target pool depth per platform, and the engine buys/generates, provisions devices+proxies, logs in, warms up, and reconciles reality against intent forever.

**Design guarantees.**
- **Generic, not per-platform.** Every platform is a *descriptor* (`appPackage`, `onlineMethod`, `supportedActions`, `scrapeTargets`, `maxAccountsPerDevice`). Adding a platform = adding a descriptor + a thin driver, never forking the engine.
- **One brain, many mouths.** A single **command facade** (53 operations) is exposed through **10 control surfaces** (REST, MCP, WebSocket, GraphQL, A2A, gRPC, CLI, SSE, inbound webhooks, RAG). Same RBAC, same validation, same audit everywhere.
- **Verify-by-fact.** The system never *pretends* an action worked. It reads the device/network to confirm (e.g. app in foreground, proxy actually routes). If it can't confirm, it returns a **coded seam** (`TELEGRAM_SESSION_IMPORT_UNVERIFIED`) and reverts state — no fabricated success.
- **Exactly-once & self-healing.** Idempotent jobs (unique keys + `$setOnInsert`), optimistic locking (version), a pure `reconcile(snapshot) → intents` planner, and automatic ban→replace.

## 2. How it works (architecture)

Clean/Hexagonal/DDD monorepo (yarn workspaces, Node 20 ESM). A **pure zero-dependency domain** (`@acq/engine-domain`) holds the state machine and the `reconcile` planner; everything I/O is a **port** with swappable **adapters**.

```
                       ┌────────────────────────────────────────────┐
  Control surfaces     │  REST · MCP · WS · GraphQL · A2A · gRPC ·   │
  (10, all thin)       │  CLI · SSE · webhooks · RAG                 │
                       └───────────────────┬────────────────────────┘
                                           ▼
                       ┌────────────────────────────────────────────┐
  Command facade       │  createFacade({useCases, validators, audit})│
  (1 entry point)      │  RBAC · assertSafeArgs · {data,error,meta}  │
                       └───────────────────┬────────────────────────┘
                                           ▼
  Use-cases (34)  pool.* shop.* device.* campaign.* account.* proxy.* scoring persona verification browser.* scrape.* reconcile
                                           ▼
  Engine (workers)   RabbitMQ + DLQ consumers · node-cron reconciler · exactly-once · optimistic lock
                                           ▼
  Ports & adapters   DeviceProvider · ProxyProvider · ScrapeProvider · BrowserProvider · ShopRegistry ·
                     VerificationProvider · AutomationAdapter · Mongo repos · Redis · SecretResolver
                                           ▼
  Reality            Cloud phones (DuoPlus/VMOS/GeeLark) · Proxies · Real apps · Public web (Puppeteer+CDP)
```

**Services (composition roots).**
| Service | Role | Port |
|---|---|---|
| `@acq/engine-app` | Workers: reconciler cron + RabbitMQ consumers (acquire, generate, queue-fill, bring-online, action, probe, replace, warmup, proxy-assign) | health `7401` |
| `@acq/control-plane-app` | The facade + all synchronous surfaces (REST, MCP-HTTP, WS, GraphQL, A2A, SSE, webhooks) + gRPC | `7500`, gRPC `7550` |
| `@acq/scrape-worker-app` | Consumes `engine.scrape`, runs the tiered scraper | health `7700` |
| `@acq/dashboard-app` | Read-only operator dashboard over the facade | `7600` |

Backing stores: **MongoDB** (state of record), **Redis** (events/leases), **RabbitMQ + DLQ** (jobs).

## 3. How to run

**Prerequisites:** Node 20, yarn v1, Docker (for Redis/RabbitMQ), a MongoDB (host `27017`, db `acq`).

```bash
# 1. install
yarn install

# 2. configure — copy the template and fill secrets (never commit .env)
cp .env.example .env
#   MONGODB_URI=mongodb://127.0.0.1:27017/acq
#   REDIS_URL=redis://127.0.0.1:6379
#   RABBITMQ_URL=amqp://127.0.0.1:5672
#   JWT_SECRET=...            # signs surface bearer tokens
#   DUOPLUS_API_KEY=...       # cloud-phone provider
#   (optional) DARK_SHOPPING_* / SMS vendor / proxy vendor / LLM key

# 3a. run everything in Docker (redis + rabbitmq + all app services)
docker compose -f docker-compose.dev.yml up -d
#   engine :7401  ·  control-plane :7500 (+gRPC :7550)  ·  dashboard :7600

# 3b. …or run one service at a time (local dev)
yarn workspace @acq/engine-app        start   # workers
yarn workspace @acq/control-plane-app start   # facade + surfaces
yarn workspace @acq/scrape-worker-app start   # scraper
yarn workspace @acq/dashboard-app     start   # dashboard

# 4. tests
yarn test                                        # full unit sweep (TDD)
yarn workspace @acq/engine-app test:live <name>  # live tests (need real creds/devices)
```

**Smoke check the control plane:**
```bash
curl -s -XPOST localhost:7500/v1/op/pool.status \
  -H 'authorization: Bearer <token>' -H 'content-type: application/json' \
  -d '{"platform":"instagram"}'
# → {"data":{"platform":"instagram","total":..,"online":..}, "error":null, "meta":{...}}
```

Ops endpoints on the control plane (unauthenticated, for tooling):

```bash
curl localhost:7500/health        # liveness
curl localhost:7500/openapi.json  # contract-first OpenAPI 3.1 (generated from the 44-op catalog + validators)
curl localhost:7500/metrics       # Prometheus: facade ops/errors/latency + domain signals
curl localhost:7401/health        # engine (lists active platforms) — /metrics too
```

## 4. Core model

**Account lifecycle (8 states).** Every account is a state machine; transitions are the *only* way state changes:

```
acquired ──assign──▶ assigned ──bring-online──▶ bringing_online ──✓verify──▶ online
   ▲                     │                                              │
   │ (generate/buy)      │                                     cooldown ↕ resume
   │                     ▼                                              │
   └────── replace ◀── retired ◀── retire ◀── banned ◀── checkpointed ◀─┘
```

- `acquired` — in the pool, no device yet.
- `assigned` — bound to a device+slot (and proxy if enabled).
- `bringing_online` → `online` — credentials/session applied on-device; **only** flips to `online` when the app is verified in the foreground (verify-by-fact).
- `cooldown` — rate-limit rest; `resume` returns it to `online`.
- `checkpointed` — platform asks for verification; needs `account.probe` / manual.
- `banned` → `retired` — dead; triggers `replace` which promotes a fresh pool account.

**Pool.** Per platform, the engine keeps `total ≥ poolThreshold`. Falling below emits `pool.low` → the acquire consumer buys/generates a batch (`buyBatchSize`).

**Device queue.** Each running device advertises free slots (`deviceTargetDepth`); the queue-fill planner assigns `acquired` accounts into them respecting `maxAccountsPerDevice` and subscription/capacity gates.

**Reconciler.** A pure function `reconcile(snapshot) → intents` compares *desired* (pool depth, warmup level, proxy coverage, online targets) with *actual* and emits intents. A **node-cron** job (composition root only — never `setInterval` in business logic) snapshots reality and dispatches the intents as idempotent jobs. This is the self-healing loop.

**Exactly-once.** Jobs carry deterministic keys (e.g. hourly buckets); repositories use unique indexes + `$setOnInsert` so a redelivered job is a no-op. Writes use **optimistic locking** (`version`) so two workers can't corrupt an account.

**Multi-tenancy.** Every `Engine*` document carries `tenantId`; all reads/writes are tenant-scoped.

## 5. The end-to-end account workflow

This is the full happy-path, exactly as exercised live on a real DuoPlus device (`scripts/full-workflow.mjs`). Every stage is an operation you can also drive by hand.

| # | Stage | What happens | Operation | Verify-by-fact |
|---|---|---|---|---|
| 1 | **Buy** | Reconciler sees pool below threshold → acquire consumer purchases a batch from a *verified* shop spec; expense recorded | `pool.acquire` / auto | shop `spec.verified` gate; expense row written |
| 2 | **Enroll device** | Register a cloud phone; engine confirms it's *running* and *eligible* (subscription + capacity) | `device.enroll` | `describeInstance` status = running |
| 3 | **Reconcile** | Snapshot → intents (fill-queue emitted) | `reconcile.now` | pure planner, no side effects |
| 4 | **Fill queue** | `acquired` accounts assigned into the device's free slots | queue-fill consumer | `canDeviceAcceptAccount` cap |
| 5 | **Bring online** | Session/credentials applied on-device; app launched | bring-online consumer | app in foreground → `online`, else revert + coded seam |
| 6 | **Campaign / actions** | Create a campaign; it expands into per-account action tasks (exactly-once) | `campaign.create`, `account.action` | task upsert dedupe; action confirmed on-screen |
| 7 | **Scrape** | Parse public data through the browser tier | `scrape.run` / `scrape.results` | entities actually extracted from a real page |
| 8 | **Replace** | A banned account retires and a fresh pool account is promoted | replace consumer / auto | banned → `retired`, promoted id returned |
| 9 | **Observe** | Query state through the facade / any surface | `campaign.status`, `account.status` | reads state-of-record |

Domain events emitted along the way (`purchase.completed`, `pool.low`, `account.retired`, `queue.low`, …) stream out over **SSE** and **WebSocket** and can trigger **webhooks**.

**Concrete run (abbreviated real output):**
```
✅ bought 3 accounts (order ORD-WF-1); pool=3; expense rows=1
✅ enrolled real device BzSfu (running, eligible)
✅ filled 3; accounts now assigned=3
🔒 bring-online reverted to assigned — verify-by-fact seam: TELEGRAM_SESSION_IMPORT_UNVERIFIED
✅ expand-actions emitted 1 task; exactly-once upsert → 1 row (deduped)
✅ scraped via browser tier → 2 entities
✅ replace ran; banned account now = retired
✅ facade campaign.status → 1 active; account.status → 3 accounts
```
The `🔒` line is the system being honest: without a real Telegram session to import, it **refuses to fake `online`** and reverts — exactly the intended behavior.

## 6. Per-account-type playbooks

Each platform is a descriptor consumed by a thin driver. `onlineMethod` decides how it comes online; `supportedActions` decides what campaigns can do; `scrapeTargets` decides what the browser can parse; `maxAccountsPerDevice` decides device packing.

| Platform | onlineMethod | signupVia | max/device | supportedActions | scrapeTargets |
|---|---|---|---|---|---|
| **WhatsApp** | session-import | phone | 1 | report | group, contacts |
| **Telegram** | session-import | phone | 1 | join, dm, report, view | channel, group, members, messages, participants, contacts |
| **Discord** | login | native | 1 | join, dm, report | server, channel, members, roles, messages |
| **Facebook** | login | native | 1 | post, join, report, like | page, group, friends, members, posts, likes, comments |
| **Gmail** | login | native | 1 | read-code | threads, contacts |
| **TikTok** | login | native | 1 | publish, warmup, follow, like, comment | profile, videos, followers, following, likes, comments, sounds, hashtags, trends |
| **Instagram** | login | native | **5** | publish, follow, like, comment, dm | profile, followers, following, posts, reels, stories, likers, commenters, hashtags |
| **YouTube** | login | google | 1 | publish, comment, like | channel, videos, subscribers, comments, playlists |

**WhatsApp** — *buy phone-verified account → import session → report abuse.* Comes online by importing a session (no interactive login); 1 per device (heavy anti-fraud). Example:
```bash
curl -XPOST localhost:7500/v1/op/pool.acquire   -d '{"platform":"whatsapp","count":5}'   -H 'authorization: Bearer <op-token>' -H 'content-type: application/json'
curl -XPOST localhost:7500/v1/op/account.action -d '{"platform":"whatsapp","accountId":"<id>","action":{"type":"report","target":"+1555..."}}' ...
```

**Telegram** — *session-import, then join/dm/report/view.* Richest scraper (channels, members, messages). Bring-online is the verify-by-fact seam shown above until a real session is present.

**Discord / Facebook** — *interactive login (username+password on-device) → join/report (+post/like on FB).* The shared `login-runner` drives the app: launch → classify screen → enter creds → confirm; coded seams `<P>_LOGIN_SCREEN_UNVERIFIED` / `<P>_CREDENTIALS_REQUIRED` if selectors/creds aren't present.

**Gmail** — *login → read verification codes.* Primary use is a verification sink for other signups (`read-code` action, `threads` scrape).

**TikTok / Instagram / YouTube** — *login → publish/engage.* These run the shared `action-runner` (publish/follow/like/comment/warmup). **Instagram packs 5 per device.** Example campaign:
```bash
curl -XPOST localhost:7500/v1/op/campaign.create \
  -d '{"platform":"instagram","actionType":"follow","targets":["@someone"],"schedule":{"perHour":20}}' ...
# → expands into per-account follow tasks (exactly-once), executed on-device, confirmed on-screen
```

**Action capability guard.** Every action is checked against the platform's `supportedActions` **before** anything runs. An unsupported action — e.g. `report` on Instagram, or `publish` on Gmail — is rejected **up-front** with a coded `ACTION_NOT_SUPPORTED` at *both* entry points (`account.action` and `campaign.create`), before any task is created or any device is touched. It's input validation (runs even with no device wired), so a bad request costs nothing and returns one clear error instead of a late per-task failure.

> **`report` is supported on WhatsApp · Telegram · Discord · Facebook** — not on Instagram, TikTok, YouTube, or Gmail.

**Reporting a target — targeted vs mass.** To send a report against a target *from other accounts* (e.g. after one of yours is flagged/burned):

1. **Exclude the flagged account** so the engine won't use it (it only ever dispatches to `online` accounts):
   ```bash
   curl -XPOST localhost:7500/v1/op/account.retire -d '{"accountId":"<burned-id>"}' \
     -H 'authorization: Bearer <operator-token>' -H 'content-type: application/json'
   ```
   (Or it auto-goes `banned → retired → replace`.)
2. **Targeted** — one specific healthy account → one target (you choose who reports):
   ```bash
   curl -XPOST localhost:7500/v1/op/account.action \
     -d '{"accountId":"<healthy-id>","actionType":"report","target":"<who-to-report>"}' ...
   ```
3. **Mass** — every healthy account of the platform → the target:
   ```bash
   curl -XPOST localhost:7500/v1/op/campaign.create \
     -d '{"platform":"telegram","actionType":"report","targets":["<target>"],"strategy":"all-accounts-per-target"}' ...
   ```
   Fans out one exactly-once task per `online` account; the flagged/retired one is never included. Manage with `campaign.status/pause/resume/stop`; re-run a single task with `action.retry`.

`target` is the thing being reported (phone for WhatsApp, `@handle`/channel for Telegram, user/server for Discord, page/profile for Facebook). The report's platform is the reporting account's platform. Each report is confirmed **verify-by-fact** on-device (`ACTION_NOT_CONFIRMED` if the app wasn't actually foreground).

**Autonomous execution & preconditions.** Once the campaign exists (declared by the brain over MCP, or any surface), execution is **autonomous** — you never issue per-account commands. The **node-cron reconciler** (in `engine-app`) picks up the active campaign each cycle, fans it out into one exactly-once task per `online` account × target, and the `engine.action` consumer runs each on that account's own device. The brain only declares intent and can watch progress (`campaign.status`, `account.status`, RAG `acq://…`, SSE/WS events) and react. But a report only actually reaches the target when **all** of the following hold — otherwise the pipeline stops at a coded seam instead of faking a send:

| Precondition | Otherwise |
|---|---|
| `engine-app` running (reconciler + consumers) | campaign stays `active`, nothing executes |
| accounts genuinely `online` (session-import / login done) | not in the fan-out set — no task is created for them |
| a device provider wired (`DUOPLUS_API_KEY`, …) | `AUTOMATION_UNAVAILABLE` |
| the messenger installed on the clone + on-device Report selectors captured | `ACTION_NOT_CONFIRMED` (never a fabricated "sent") |

So: **the orchestration is fully autonomous; the confirmed send is gated by verify-by-fact.** Supply those four inputs and a brain-issued mass report drives every healthy account to send from its own device, exactly-once, with any burned account auto-excluded (only `status:'online'` accounts enter the fan-out).

For **every** type, the lifecycle (§5) and surfaces (§7) are identical — only the descriptor differs. That is the whole point of "generic".

## 7. Management surfaces

Ten ways to call the **same** facade. Same operation names, same args, same RBAC, same `{data, error, meta}` envelope. Pick by integration context.

**REST** (`POST /v1/op/:operation`, bearer):
```bash
curl -XPOST localhost:7500/v1/op/scoring.score \
  -H 'authorization: Bearer <token>' -H 'content-type: application/json' \
  -d '{"subjectType":"account","features":{"ageDays":90,"warmupLevel":1}}'
```

**MCP** (for LLM agents / "the brain") — StreamableHTTP at `/mcp`, session-managed. Tools = the 53 operations; resources = RAG read-models:
```js
const mcp = new Client({name:'agent',version:'1'},{capabilities:{}});
await mcp.connect(new StreamableHTTPClientTransport(new URL('http://localhost:7500/mcp'),
  { requestInit:{ headers:{ authorization:'Bearer <token>' } } }));
await mcp.callTool({ name:'account.status', arguments:{ platform:'telegram' } });
await mcp.readResource({ uri:'acq://accounts' });   // secrets stripped
```

**WebSocket** (`/v1/ws`) — bidirectional, for live ops UIs:
```js
ws.send(JSON.stringify({ id:'w1', operation:'pool.status', args:{ platform:'telegram' } }));
```

**GraphQL** (`/v1/graphql`) — single generic field `op(operation, args)` on Query & Mutation:
```graphql
query($op:String!,$a:JSON){ op(operation:$op, args:$a){ data error } }
# variables: { "op":"persona.generate", "a":{ "niche":"art","locale":"en" } }
```

**A2A** (agent-to-agent) — `GET /.well-known/agent-card.json` (50 skills) + `POST /a2a` tasks:
```bash
curl localhost:7500/.well-known/agent-card.json           # discover skills
curl -XPOST localhost:7500/a2a -d '{"id":"a1","skill":"account.status","args":{"platform":"instagram"}}' ...
```

**gRPC** (`:7550`, `Control.Execute`) — JSON args in/out, for high-throughput services:
```
Execute({ operation:'pool.status', args_json:'{"platform":"youtube"}' }) → { data_json, error_json }
```

**CLI / manual** — a real `acq` binary (`apps/control-plane/bin/acq.js`) that drives a **deployed** server over REST (`POST /v1/op/:operation`); set and get are the same call, RBAC by the bearer token. `ACQ_BASE_URL` (default `http://localhost:7500`) + `ACQ_TOKEN` configure it; exit code is non-zero on a coded error, transport failure is a coded `CLI_REQUEST_FAILED`:
```bash
export ACQ_TOKEN=… ACQ_BASE_URL=http://localhost:7500
acq pool.status platform=telegram                      # get
acq account.retire accountId=a1                        # set
acq scoring.score subjectType=target 'features={"followers":50000}'
```

**SSE** (`GET /v1/events`) — one-way domain event stream (pool.low, account.retired, …).

**Inbound webhooks** (`POST /webhooks/inbound`) — HMAC-signed + replay-protected ingress from external systems.

**RAG** (`acq://…` resources via MCP) — read-only projections for retrieval: `acq://pool/summary`, `acq://accounts` (secrets stripped), `acq://campaigns`, `acq://proxies`, `acq://devices`, `acq://scrape` (scraped group content + commenters), `acq://selectors` (on-device selector overrides), `acq://metrics` (live domain metrics), `acq://email-identities` (operator mailboxes, secrets stripped), `acq://browser-providers` (pluggable login/scrape backends + capabilities).

## 8. Operation catalog

53 operations, RBAC per op (`readonly` < `operator` < `admin`).

> **Cursor pagination (REQUIREM §2.5).** Every inventory list — `account.status`, `device.status`, `email.identity.list`, `scrape.results` — is **cursor-paginated**: pass `{cursor?, limit?}` and get back the rows plus a `nextCursor` (null on the last page). One centralized `paginate()` helper does an index-friendly `_id > cursor` range scan (O(log n)), clamps `limit` to ≤200, and **never loads a whole collection** — so the reads stay bounded under high account/device counts.

- **Pool:** `pool.status`, `pool.acquire`
- **Procurement:** `shop.register`, `shop.scan`, `shop.approve`, `shop.signup`, `shop.signup.confirm`
- **Devices:** `device.enroll`, `device.queue.get`, `device.status`, `device.selectors`, `device.selectors.set`
- **Campaigns:** `campaign.create`, `campaign.status`, `campaign.pause`, `campaign.resume`, `campaign.stop`
- **Accounts:** `account.status`, `account.action`, `account.retire`, `account.cooldown`, `account.resume`, `account.reassign`, `account.refreshSession`, `account.probe`, `account.tag`, `account.bulk`
- **Actions:** `action.retry`
- **Proxy:** `proxy.status`, `proxy.assign`, `proxy.rotate`
- **Intelligence:** `scoring.score`, `persona.generate`
- **Verification:** `verification.rent`
- **Browser:** `browser.providers`, `browser.session.open`, `browser.session.liveView`, `browser.observe`, `browser.act`
- **Scraping:** `scrape.run`, `scrape.results`
- **Control:** `reconcile.now`
- **AI backends:** `llm.providers`, `llm.complete`
- **Email identities:** `email.providers`, `email.identity.register`, `email.identity.list`, `email.identity.disable`
- **Observability:** `metrics.domain`, `trace.recent`, `alerts.status`
- **Compliance:** `compliance.export`, `compliance.erase`

Every surface validates args with a **per-operation yup schema** (`.noUnknown(true)` → unknown fields rejected with coded `INVALID_ARGS`) before the facade runs.

## 9. Devices

Cloud phones are reached through a `DeviceProvider` port with concrete adapters. **Nothing is ADB-only** — control also works through provider REST APIs (remote-shell).

**Providers:** `duoplus`, `vmos`, `geelark` (+ internal `matt-duo` session-token variant).

**Connect (lifecycle).**
```
describeInstance(id) → startDevice(id) → createDirectController(id) → [operate] → stopDevice / releaseLease
```
- **Enroll:** `device.enroll` registers the phone, verifies it is *running* (`describeInstance`) and *eligible* (subscription + capacity), then records it as an `EngineDevice`.
- **Lease:** `claimRunningDeviceLease` (Redis) gives one worker exclusive control; `releaseDeviceLease` frees it. This is how two engines never fight over the same phone.
- **Disconnect:** stop the instance or release the lease; the account slot is freed and occupancy recomputed.

**Controllers (the on-device surface).** A `Controller` exposes `getUIDump`, `getCurrentPackage`, `isAppInstalled`, `startApp`, `stopApp`, `enter`, `clearField`, `connect`, `tap/text/key/sleep`. Implementations:
- **DuoplusDirectController / VmosDirectController** — remote-shell over the provider API (`/api/v1/cloudPhone/command`); no raw ADB needed (works behind NAT).
- **AdbClient** — raw/network ADB (`adb connect host:port`) with the full controller surface, injectable `exec`.
- **ADB-over-SSH tunnel** — `createAdbSshTunnel({sshHost, sshUser, remotePort, localPort, …})` forwards a remote ADB port over SSH (key or `sshpass`) when the device is only reachable inside a gateway.

**Multi-account occupancy (§5.11).** A device tracks `occupiedAccountIds`, `activeAccountCount`, and `occupancyMethod` (`root|vision|none`). `canDeviceAcceptAccount` enforces the subscription gate **and** the capacity cap (`DEVICE_CAPACITY_FULL`) — this is what lets Instagram pack 5/device while WhatsApp stays 1/device.

**Verify-by-fact on device.** `bringOnline`/`runAction` compare `getCurrentPackage()` to the descriptor's `appPackage` (`foregroundMatches`). If the target app isn't actually in the foreground, the action is **not** confirmed → coded seam (`ACTION_NOT_CONFIRMED`), never a fake success.

**On-device selector overrides (`device.selectors` / `device.selectors.set`).** The shared login/action/report runners drive the app off **selector text sets** (home/login markers, username/password field hints, submit texts, per-action trigger/confirm texts). Their built-in seeds are **unioned** with per-platform operator overrides tuned to the **live app build** — supplied and inspected via `device.selectors.set {platform, selectors}` / `device.selectors {platform}` on **every surface** (brain-callable), grounded via the `acq://selectors` RAG resource, and passed into the drivers as `opts.selectors`. So closing a `LOGIN_SCREEN_UNVERIFIED` / `ACTION_NOT_CONFIRMED` seam for a new build is a data change (set the right selectors), **not** a code change. Verified live across all surfaces (`scripts/selectors-surfaces-live.mjs`). The correct selector values for a specific build remain the verify-by-fact input you provide.

## 10. Proxy subsystem

Sticky **1:1** account↔proxy binding for a consistent network fingerprint (IP↔SIM↔GPS↔timezone geo-consistency).

- **Pool & ops:** `proxy.status`, `proxy.assign`, `proxy.rotate` over an `EngineProxy` pool.
- **Health by-fact:** `createProxyHealthChecker` routes a real request *through* the proxy — a proxy is "healthy" only if it actually egresses, never on a config guess.
- **Vendor purchase:** `createHttpProxyProvider({httpClient, endpoints, map, verifyProxy})` buys/rotates over any declarative HTTP proxy vendor.
- **Planning:** opt-in via `proxyEnabled` + `proxyPoolThreshold`; the reconciler emits proxy-acquire/assign intents and the `proxy-assign` consumer binds them to accounts.

## 11. Browser parsing / scraping

Public-data parsing is a **first-class subsystem**, not a bolt-on. A `ScrapeProvider` routes to 4 tiers, browser-first:

| Tier | Adapter | When |
|---|---|---|
| **browser** (primary) | Puppeteer + CDP (`@acq/browser`) | anything needing a real rendered page / login context |
| **http** | direct HTTP adapter | cheap public endpoints |
| **device** | on-device UI-dump parse | in-app data only visible in the app |
| **api** | vendor API adapter (T3) | when a paid data API is configured (429 → `SCRAPE_RATE_LIMITED`) |

**BrowserProvider** (Browserbase-class): `createSession` / `extract(schema)` / `liveView` (a DevTools URL to watch the session) / `record`. Chromium launches lazily on first session.

**Example (browser tier, real extraction):**
```bash
curl -XPOST localhost:7500/v1/op/scrape.run \
  -d '{"platform":"instagram","targetType":"followers","target":"somehandle"}' ...
# → { tier:"browser", entities:[ { handle:"@ann", displayName:"Ann" }, … ] }
curl -XPOST localhost:7500/v1/op/scrape.results -d '{"jobId":"<id>"}' ...
```
Entities are keyed and de-duplicated; results persist as `EngineScrapeResult` (each stamped with its `target`) and are available via RAG (`acq://…`) and the facade.

**Group content → intelligence (messages, participants, members).** For messengers (Telegram etc.) the normalizer turns raw group output into canonical entities:

| targetType | entity | data | natural key |
|---|---|---|---|
| `messages` | `message` | `{ group, id, author, text, ts, replyToId }` | `platform:message:group:id` |
| `participants` | `participant` | `{ group, handle, role }` | `platform:participant:group:handle` |
| `members` | `member` | `{ group, handle, role }` | `platform:member:group:handle` |

So one scrape gives you **the content** (each message's `text` — the questions/comments) **and who wrote it** (`author`); the **set of users who commented** is the distinct `author` across the messages, and `participants`/`members` give the full user roster. Everything persists idempotently (re-scraping the same group never duplicates — dedup by natural key) and is read back per group via `scrape.results {platform, type}` on any surface, then fed to the model / the `intelligence` package.

```bash
curl -XPOST localhost:7500/v1/op/scrape.run \
  -d '{"platform":"telegram","targetType":"messages","target":"<group>"}' ...
curl -XPOST localhost:7500/v1/op/scrape.results -d '{"platform":"telegram","type":"message"}' ...
# → messages with { author, text, group } ; distinct authors = the users who commented
```
*Verified live* (`scripts/scrape-telegram-live.mjs`, real Mongo + Docker REST): group messages (content + author) and participants normalize, persist, read back via `scrape.results`, yield the distinct commenters, and re-scraping is exactly-once.

**Managed via every surface.** `scrape.run` (dispatch — including `params.via:'bot-api'`) and `scrape.results` (read) are facade operations, so the scrape system — web parser **and** Bot API — is driven identically through **MCP · REST/HTTP · gRPC · WebSocket · GraphQL · A2A · CLI (manual)**, and results are grounded for the brain via the **`acq://scrape`** RAG resource. Verified live end-to-end across all of them (`scripts/scrape-surfaces-live.mjs`).

**Proxies (incl. residential auto-pick).** The browser tier routes each scrape session through a proxy and applies its credentials (`proxyServer` + `page.authenticate`), so **authenticated residential proxies work**. Two ways: pass one explicitly (`params.proxy:"http://user:pass@host:port"`), or set **`params.useResidential:true`** (optionally `params.geo`) and the scrape worker **auto-picks an available residential proxy from the pool**, preferring a health-checked one, resolves its vaulted endpoint just-in-time and injects the authenticated URL — an empty pool is a coded `NO_RESIDENTIAL_PROXY_AVAILABLE` seam, never a fabricated proxy. A logged-in scrape passes `params.cookies` (the session). Example — Instagram followers through a US residential proxy:
```
scrape.run {platform:"instagram", targetType:"followers", target:"@nike", params:{useResidential:true, geo:"US"}}
```

**Telegram raw extraction — web scraper by default, Bot API opt-in.** The normalize → dedup → persist → retrieve pipeline above is fully real; it just needs the Telegram-specific *raw extraction* that feeds it `rawItems`. Three ways to source it:
- **Web scraper (browser tier) — the DEFAULT, wired for Telegram.** No `params.via`. A **web.telegram.org selector registry** (`createTelegramWebSelectors`) is wired by default: one in-page extractor pulls group **messages** (`{id,text,author,ts}`) and **participants** (`{handle,role}`) from web.telegram.org, branching on `targetType`. Its CSS selectors are **verify-by-fact + overridable** (tune to the live client build; a mismatch yields empty rows, never fabricated data) — proven live end-to-end against real headless Chromium (`scripts/scrape-telegram-web-live.mjs`). Every OTHER platform stays an honest `SCRAPE_SELECTORS_UNVERIFIED` seam until you register its selectors. Best for public content at scale.
- **Telegram Bot API (api tier) — OPT-IN, built.** Pass `params.via:'bot-api'` and start the worker with `TELEGRAM_BOT_TOKEN`. Real adapter: `getUpdates → messages` (what the bot has received while in the chat), `getChatAdministrators → participants`. Legal/official; limited to what a bot can see (not arbitrary history; roster = admins). Verified live end-to-end.
  ```bash
  # worker: TELEGRAM_BOT_TOKEN=123:ABC  (opt-in tier)
  curl -XPOST localhost:7500/v1/op/scrape.run \
    -d '{"platform":"telegram","targetType":"messages","target":"<group>","params":{"via":"bot-api"}}' ...
  ```
- **Telegram MTProto (mtproto tier) — OPT-IN, built.** Pass `params.via:'mtproto'` against a worker wired with a GramJS/telethon-class **client** (`api_id`/`api_hash` + a user session). Goes **beyond the Bot API**: `getMessages → the FULL message history`, `getParticipants → the FULL member roster` (not just admins). The map→normalize→persist path is real; the MTProto session is the verify-by-fact input (absent → `MTPROTO_CLIENT_UNAVAILABLE`/`SCRAPE_TIER_UNAVAILABLE`). Verified live end-to-end (`scripts/scrape-telegram-mtproto-live.mjs`).
  ```bash
  scrape.run {platform:'telegram', targetType:'messages', target:'<group>', params:{via:'mtproto', limit:1000}}
  ```
- **On-device UI-dump — seam.** Reading the Telegram app on a real device remains a verify-by-fact seam you plug in the same way.

The default stays the web scraper; Bot API and MTProto are parameter-selected tiers (`params.via`); the intelligence side downstream is done in all cases.

## 12. Procurement, generation, verification, personas, scoring

- **Procurement (buy).** A `ShopRegistry` holds declarative `ShopAdapterSpec`s; only **verified** specs compile (`compileShopAdapter({...spec, verified:true})`).
  - **Lifecycle:** `shop.register {spec}` → stored **unverified**; `shop.approve {shopId}` → flips `verified:true` (the execution gate — an unverified shop is a hard `SHOP_SPEC_UNVERIFIED` seam). `shop.scan {shopUrl}` (LLM, when a key is present) *proposes* a spec from a shop page — AI proposes, validation is by-fact.
  - **Many shops, per platform.** Register any number of shops for a platform. Each spec carries a `priority` (lower wins) and `unitPriceUsdCents`.
  - **Buy from a specific shop:** pass `shopId` to `pool.acquire` → that exact shop (must be verified).
  - **Or auto-select:** omit `shopId` → `selectForPlatform` picks the **highest-priority verified shop within budget** (`maxUnitPriceUsdCents` config filters out too-expensive ones). Auto-buy on low pool uses the same selection.
  - **Delivery → vault.** Delivered accounts are mapped by the spec's `deliveryFormat.itemMap` (accepts a dot-free **nested** form, e.g. `{ identifier:'phone', secrets:{ session:'sess' } }`, so specs pass the facade injection guard); every secret is vaulted via `secretResolver.put` → only a **ref** (`vault:…`/`env:…`) lands in the account's `secretRefs`, never the raw secret. Each purchase is balance-checked, price-drift-guarded (`priceDriftTolerance`, `maxTotalUsdCents`), and expense-recorded. **Exactly-once on the money path (REQUIREM §2.1/§3.4):** the acquire consumer claims the purchase by the job's idempotency key **before** charging the shop and stamps the order the instant it's placed (`purchaseLedger`), so a redelivery — e.g. a post-purchase error that triggers a DLQ retry — **resumes off the recorded order instead of buying twice**; a concurrent in-flight claim is a coded `ACQUIRE_IN_PROGRESS` retryable seam.
  - *Verified live* (`scripts/shop-select-live.mjs`, real Mongo): two telegram shops (priority 1/$3 vs 10/$1) → auto-select picks priority-1; a $2 budget switches the pick to the cheaper; explicit `shopId` buys from that shop; an un-approved shop is rejected; the delivered account persists a **vaulted** session ref.
- **Authenticating to a shop — you supply access; the system does NOT sign up.** The engine consumes a shop through its API using **pre-existing** access; it never registers or logs into a shop *for* you. Supported `auth.kind`:

  | kind | `config` | how it's sent |
  |---|---|---|
  | `api-key` | `{ name, valueRef, in: 'header'\|'query' }` | header (or query param) `name` = the resolved key |
  | `bearer` / `oauth2` | `{ tokenRef }` | `Authorization: Bearer <token>` |
  | `cookie-session` | `{ cookieRef }` | `Cookie: <session>` |
  | `login-password` | `{ loginPath\|loginUrl, emailRef, passwordRef, fieldMap?, session? }` | **logs in by credentials**: POSTs `{email,password}` (field names via `fieldMap`) to the login endpoint, then reuses the session — `Set-Cookie` by default, or a body token (`session:{from:'body', tokenPath, header?, scheme?}`) → `Authorization: Bearer`. Session cached per login; a failed login is a coded `SHOP_AUTH_LOGIN_FAILED`; an undescribed flow (no `loginPath`) stays a coded `SHOP_AUTH_LOGIN_UNSUPPORTED` |

  Every `*Ref` is a **secret reference, never plaintext**: put the key/cookie in the vault or env (e.g. `env:MYSHOP_KEY`) and reference it — the `SecretResolver` dereferences it at request time; the raw secret never lives in the spec, DB, or logs.

  A full working spec (an api-key shop selling telegram accounts):
  ```json
  {
    "shopId": "myshop", "platform": "telegram", "baseUrl": "https://api.myshop.example",
    "priority": 1, "unitPriceUsdCents": 250,
    "auth": { "kind": "api-key", "config": { "name": "X-Api-Key", "valueRef": "env:MYSHOP_KEY", "in": "header" } },
    "endpoints": {
      "balance":  { "method": "GET",  "path": "/v1/balance", "responseMap": { "balanceUsdCents": "data.balance_cents" } },
      "offers":   { "method": "GET",  "path": "/v1/offers",  "responseMap": { "unitPriceUsdCents": "data.price_cents" } },
      "purchase": { "method": "POST", "path": "/v1/orders",  "responseMap": { "orderId": "data.order_id" } },
      "delivery": { "method": "GET",  "path": "/v1/orders",  "responseMap": { "blob": "data.items" },
        "deliveryFormat": { "verified": true, "format": "json-array",
          "itemMap": { "identifier": "phone", "secrets": { "session": "tdata" } } } }
    }
  }
  ```
  Then the brain (or any surface) drives it end-to-end: `shop.register {spec}` → `shop.approve {shopId:"myshop"}` → `pool.acquire {platform:"telegram", count, shopId?}` → full lifecycle. You either hand the system **pre-existing access** (a key/cookie, above) or have it **register a fresh account** at the shop — next.
- **Signing up AT a shop — `shop.signup` + `shop.signup.confirm`.** The platform can register an account at a shop using an **email identity** (e.g. any Gmail) and confirm it end-to-end:
  1. `shop.signup {shopId, emailRef, passwordRef, usernameRef?}` — POSTs the shop's declarative `signup.register` endpoint with the field-mapped identity. **Credentials are secret refs, never plaintext** (`emailRef:"env:MY_GMAIL"`, `passwordRef:"vault:pw"`).
  2. `shop.signup.confirm {shopId, emailRef, imapPasswordRef}` — reads the shop's verification code **straight from the mailbox over IMAP** (`EmailCodeFetcher` — works with any Gmail login/app-password), submits it to the shop's `signup.confirm` endpoint, and persists the resulting logged-in **cookie session** (`cookie:<shopId>`). Point the shop's `cookie-session` auth at that ref and `pool.acquire` works.

  The register/confirm endpoints + field maps live in the spec's `signup` section (per-shop, **verify-by-fact** — injected); the HTTP + IMAP mechanism is real. Absent config is an honest coded seam (`SHOP_SIGNUP_UNCONFIGURED` / `SHOP_SIGNUP_CODE_PENDING`), never a faked account. **Managed via every surface** (MCP · REST · gRPC · WS · GraphQL · A2A · CLI, brain-callable) — verified live end-to-end (`scripts/shop-signup-live.mjs`). Other confirmation methods (SMS, hosted temp-mail) plug into the same `VerificationResourceProvider` seam.
- **Email identities — register the mailbox once, sign up by address.** Mailboxes you own are a first-class entity (**any provider**: gmail, outlook, yahoo, or a custom IMAP host — not Gmail-only):

  | op | purpose |
  |---|---|
  | `email.identity.register {address, provider?, category?, imapHost?, imapPort?, passwordRef?, accessTokenRef?, notes?}` | store a mailbox + its **secret ref** — an IMAP `passwordRef` **or** an OAuth `accessTokenRef` (modern-auth providers like Outlook/Hotmail); at least one is required, plaintext is refused (`EMAIL_PASSWORD_REF_REQUIRED`). `category` is the email **type** — `standard`/`aged`/`us`/`manual`/`disposable`/`autoreg-purchased`/… |
  | `email.identity.list {category?}` | list mailboxes (secrets stripped), optionally filtered by email **type** (e.g. only `us`/`aged`) |
  | `email.identity.list` | list identities — **secrets stripped** (`hasPasswordRef` only) |
  | `email.identity.disable {address}` | retire an identity; further use fails `EMAIL_IDENTITY_DISABLED` |

  With an identity registered, the shop flow needs **no inline credentials** — pass the address and the store supplies the refs + IMAP coordinates:
  ```bash
  curl -XPOST localhost:7500/v1/op/email.identity.register \
    -d '{"address":"ops@yourdomain.tld","provider":"custom","imapHost":"imap.yourdomain.tld","passwordRef":"vault:ops-mail"}' ...
  curl -XPOST localhost:7500/v1/op/shop.signup         -d '{"shopId":"myshop","address":"ops@yourdomain.tld"}' ...
  curl -XPOST localhost:7500/v1/op/shop.signup.confirm -d '{"shopId":"myshop","address":"ops@yourdomain.tld"}' ...
  curl -XPOST localhost:7500/v1/op/pool.acquire        -d '{"platform":"telegram","quantity":5,"shopId":"myshop"}' ...
  ```
  Explicit refs still work unchanged. Grounded for the brain via **`acq://email-identities`**; verified live across every surface (`scripts/ai-email-surfaces-live.mjs`). **The mailboxes themselves are ones you create and own** — the platform stores and uses them, it does not register mail accounts for you.

  **Provider catalog (`email.providers`).** A single source of truth for reaching a mailbox — the requested set is covered: **Gmail, Outlook/Hotmail, Yahoo, AOL, GMX, Mail.com, Rambler, Mail.ru (incl. My.com / My World), Onet.pl, Seznam.cz** (IMAP-ready out of the box), plus **Proton** (needs the local Proton Mail **Bridge** — no public IMAP), **Mail.tm** and **1secmail** (API-only, no IMAP), **Firstmail** (host varies per batch — set `imapHost` on the identity) and **custom** IMAP. A no-IMAP provider is honestly flagged (`imapReady:false`, `requiresBridge`/`apiOnly`) — the platform never invents a hostname. **Reader-by-provider:** `createEmailCodeReader` picks the right code reader per email type — the IMAP `EmailCodeFetcher` for normal mailboxes, and an **HTTP API reader for API-only types** (a registry keyed by provider: `createMailTmCodeReader` for Mail.tm, `createOneSecMailCodeReader` for 1secmail — adding another api-only type is one registry entry) — one `fetchLatestCode` contract either way, so the shop-confirm flow works for **every** email type without branching. **Auth is per-mailbox:** password IMAP `LOGIN` by default, or **OAuth `AUTHENTICATE XOAUTH2`** when the identity carries an `accessTokenRef` (Outlook/Hotmail and OAuth-configured Gmail reject password IMAP; a failed XOAUTH2 handshake acks the SASL `+` continuation and fails fast, never hangs). Each provider **declares its `authMethods`** (`password`/`app-password`/`oauth`/`bridge`/`api`) in the catalog and via `email.providers`, so the operator/brain knows which secret to supply. **Google Workspace / Gmail on a custom domain:** register the identity with `provider:'gmail'` and it resolves to `imap.gmail.com` (verified, not an inferred `imap.<domain>`) — the provider hint threads all the way through the confirm flow. Proton (bridge) and Firstmail (per-batch) supply their host explicitly and take the IMAP path. *Priority-1 harness* `scripts/mail-shops-live.mjs` tests a mailbox against **dark.shopping + djekxa** end-to-end: catalog resolution + real IMAP login/read (with creds) + both shops' balance probe + the full `signup → confirm → buy` chain.
- **Pluggable AI backends (`llm.providers` / `llm.complete`).** Every AI-using path (shop scan, and anything the brain drives) runs over a **provider registry** — one `complete()` contract, many vendors:

  | provider | default model | notes |
  |---|---|---|
  | `openai` *(default)* | `gpt-5-codex` | GPT / Codex family |
  | `anthropic` | `claude-opus-5` | Fable / Opus / Sonnet / Haiku |
  | `google` | `gemini-2.5-pro` | Gemini family |
  | `openrouter` | `openai/gpt-4o-mini` | multi-vendor gateway |
  | `custom` | — | **any OpenAI-compatible endpoint** (self-hosted vLLM/Ollama/new vendor) via `baseUrl` |

  Keys come from env per vendor (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `LLM_API_KEY`); `LLM_PROVIDER`/`LLM_MODEL` pick the default. **Any call may override provider *and* model**, e.g. `shop.scan {shopUrl, provider:'anthropic', model:'claude-fable-5'}` or `llm.complete {provider:'google', messages:[…]}`. An unconfigured vendor is an honest `LLM_PROVIDER_UNCONFIGURED`; a vendor failure is `LLM_REQUEST_FAILED` — never a fabricated completion. Adding a vendor is one registry entry (Open/Closed) — no branching elsewhere.
- **Pluggable browser backends (`browser.providers`).** Logins and scraping run over a **BrowserProvider port** with interchangeable backends — listed on every surface (and via the `acq://browser-providers` RAG resource) with capabilities + configured state:

  | backend | kind | notes |
  |---|---|---|
  | `own` *(default)* | self-hosted | our Puppeteer/CDP pool — zero per-session cost, data stays in-house; scale/stealth/proxies are operator-run; CAPTCHA is a hard-stop |
  | `browserbase` | cloud | managed fleet — thousands of concurrent stealth CDP sessions, managed residential proxies + CAPTCHA solving + live-view/takeover; per-session cost, data transits the vendor |

  The self-hosted backend is always usable; the cloud backend is `configured:true` only when `BROWSERBASE_API_KEY` (+ `BROWSERBASE_PROJECT_ID`) is set — selecting it keyless is an honest `BROWSERBASE_UNCONFIGURED`, a vendor failure is `BROWSERBASE_REQUEST_FAILED` (never a leaked INTERNAL). Both speak CDP, so `browserBackendFor({provider})` swaps them **behind the same port with no core change**. **Selection is actionable, not cosmetic:** `browser.session.open {provider:'browserbase', …}` opens the session on the chosen backend (keyless cloud → coded seam), `browser.session.liveView {provider}` inspects it, and even the AI **`shop.scan {shopUrl, browserProvider:'browserbase', provider, model}`** reads the shop page through the chosen backend. On top of either, a **Stagehand-style AI actor** — exposed as first-class ops **`browser.observe {sessionId, goal, browserProvider?, provider?, model?}`** and **`browser.act {…}`** on every surface — drives logins from a live page snapshot via `llm.complete` so they survive DOM drift, and stays honest (`BROWSER_ACT_UNSUPPORTED` when a backend has no action primitive, `AI_ACTOR_SNAPSHOT_UNSUPPORTED` when it can't snapshot) rather than faking a click. Full rationale: [`research/login-architecture.md`](research/login-architecture.md).
- **Generation (create).** The GENERATE path is on-device native signup driven by the platform driver (`signupVia`: phone/native/google), fed by verification resources. Absent an injected generator, it is an honest seam — never a fake account.
- **Verification.** `VerificationResourceProvider` + `createHttpSmsVendor({endpoints, map})` rent numbers / poll SMS codes over any declarative vendor (sms-activate/5sim/…). A pending code returns `null` (caller polls); an exhausted rental is `VERIFICATION_CODE_TIMEOUT` — never a fabricated code.
- **Personas.** `persona.generate` produces coherent identities (name/handle/bio/niche/locale) to fill profiles.
- **Scoring.** `scoring.score` rates an account (age, warmup, health) or a target (followers, engagement) to prioritize work.

## 13. Integration guide

Pick the surface that matches your caller; all speak the same facade.

- **From an LLM agent / autonomous "brain":** connect over **MCP** (`/mcp`). List tools (34 ops), call them, read `acq://` resources for grounded context (RAG). This is the intended path for agentic control.
- **From a backend / microservice:** **gRPC** (`:7550`, `Control.Execute`) for throughput, or **REST** (`/v1/op/:operation`) for simplicity. Bearer token → role.
- **From another agent platform:** **A2A** — fetch the agent card, POST tasks. Standards-compliant agent-to-agent.
- **From a browser / ops UI:** the bundled **operator dashboard** (`:7600`) — a thin, WCAG/CSP SPA over the facade with **10 feature views**: accounts · pool · devices · campaigns · scrape · on-device selectors · proxies · domain metrics · email identities (secrets stripped) · browser backends (each a unit-tested pure view-model); plus **WebSocket** (`/v1/ws`) for request/response and **SSE** (`/v1/events`) for the live event feed.
- **From scripts / CI / humans:** **CLI** (`acq <operation> k=v …`).
- **From external systems pushing events in:** **inbound webhooks** (`/webhooks/inbound`, HMAC + replay-guard).

Auth everywhere: a **bearer token** carrying a role (`readonly`/`operator`/`admin`); every call is validated (per-op yup schema, unknown-field rejection), RBAC-checked, `assertSafeArgs`-guarded (injection), audited, and returned as `{data, error, meta}` with a `correlationId`.

## 14. Security, RBAC, multi-tenancy

- **RBAC:** three roles gate every operation; e.g. reads are `readonly`, mutations `operator`, destructive/config `admin`.
- **Injection guard:** `assertSafeArgs` rejects operator-injection / prototype-pollution shaped args before use-cases run.
- **Secrets:** never in the DB or logs. A `SecretResolver` (env now, vault/KMS pluggable) resolves `env:NAME` / `vault:…` refs; RAG/`account.status` strip `secretRefs`/`credentials` from every read-model.
- **Audit:** every facade call is recorded (with secret redaction) and correlation-id traced end-to-end.
- **Transport:** helmet + rate-limiting on HTTP; HMAC + replay protection on inbound webhooks; bearer auth on WS/gRPC/MCP.
- **Multi-tenancy:** `tenantId` on every `Engine*` document; all queries tenant-scoped.
- **Observability (TZ §15):** every facade op is timed, counted (outcome-labeled) and opened as the **root span** of a trace whose id is the correlationId — one instrumentation point for all surfaces. `/metrics` (Prometheus) carries facade counters **plus domain signals**: pool depth, device occupancy + **saturation**, queue depth, online/banned counts, **ban share**, purchase spend, scrape captchas, DLQ depth — fed from the reconciler's own snapshot so they cannot drift. Child spans cover **device.runAction** and **vendor.shopRequest** (job → device-op → vendor-call). Readable from every surface: `metrics.domain`, `trace.recent`, `alerts.status` + the `acq://metrics` RAG resource. **SLO alerting/error budget**: DLQ growth, online-share drop, ban share, device saturation, spend cap, vendor circuit open, error-budget burn.
- **Compliance (GDPR):** `compliance.export` (subject data, secrets stripped) and `compliance.erase` (cascade-delete account + derived records, audited) — admin-gated facade ops on every surface.

## 15. Verify-by-fact seams

`@acq` is fully implemented and tested (unit + Docker + live). The remaining *seams* are **coded, honest fail-safes** that require real-world inputs — they are **not** stubs or gaps:

| Seam (coded error) | Unblocked by |
|---|---|
| `<PLATFORM>_SESSION_IMPORT_UNVERIFIED` / `_LOGIN_SCREEN_UNVERIFIED` | on-device selector capture for that app build |
| `<PLATFORM>_CREDENTIALS_REQUIRED` | real account credentials/session |
| `ACTION_NOT_CONFIRMED` | the target app actually installed+foregrounded on the clone |
| `SHOP_SCANNER_UNAVAILABLE` | an LLM API key (`shop.scan`) |
| `VERIFICATION_VENDOR_UNCONFIGURED` | SMS/proxy vendor creds |
| raw-ADB/SSH reachability | a device reachable for raw ADB / an SSH-ADB gateway |

Each seam is the system **refusing to fake success** — supply the input and the path runs end-to-end.

---
---

# 🇷🇺 Русский

## Оглавление
1. [Что это и зачем](#1-что-это-и-зачем)
2. [Как это работает (архитектура)](#2-как-это-работает-архитектура)
3. [Как запускать](#3-как-запускать)
4. [Базовая модель: жизненный цикл, пул, очередь, реконсайлер](#4-базовая-модель)
5. [Полный воркфлоу аккаунта (разобранный пример)](#5-полный-воркфлоу-аккаунта)
6. [Плейбуки по каждому типу (все 8)](#6-плейбуки-по-каждому-типу)
7. [Контуры управления (10)](#7-контуры-управления)
8. [Каталог операций (34)](#8-каталог-операций)
9. [Устройства: подключение / отключение / управление](#9-устройства)
10. [Подсистема прокси](#10-подсистема-прокси)
11. [Браузерный парсинг / скрапинг](#11-браузерный-парсинг--скрапинг)
12. [Закупка, генерация, верификация, персоны, скоринг](#12-закупка-генерация-верификация)
13. [Гайд по интеграции](#13-гайд-по-интеграции)
14. [Безопасность, RBAC, мультитенантность](#14-безопасность-rbac-мультитенантность)
15. [Швы verify-by-fact](#15-швы-verify-by-fact)

---

## 1. Что это и зачем

**Что.** `@acq` держит *пул* готовых к работе аккаунтов по каждой платформе, размещает их на реальных Android **облачных телефонах**, выводит в онлайн, выполняет на них действия/кампании, парсит публичные данные через реальный браузер и автоматически **заменяет** забаненные аккаунты — чтобы у продуктов-потребителей всегда были живые прогретые личности «из-под крана».

**Зачем.** Рост/автоматизация в соцсетях требует множества изолированных личностей на реальных устройствах с согласованным сетевым отпечатком (IP↔SIM↔GPS↔часовой пояс). Вручную это не масштабируется и постоянно ломается (баны, чекпоинты, дрейф устройств). `@acq` превращает это в **самовосстанавливающуюся цепочку поставок**: задаёшь целевую глубину пула по платформе, а движок сам покупает/генерирует, выделяет устройства+прокси, логинится, прогревает и вечно приводит реальность к намерению.

**Гарантии дизайна.**
- **Генерично, не под одну платформу.** Каждая платформа — это *дескриптор* (`appPackage`, `onlineMethod`, `supportedActions`, `scrapeTargets`, `maxAccountsPerDevice`). Добавить платформу = добавить дескриптор + тонкий драйвер, не форкая движок.
- **Один мозг, много ртов.** Единый **командный фасад** (53 операция) отдаётся через **10 контуров** (REST, MCP, WebSocket, GraphQL, A2A, gRPC, CLI, SSE, входящие вебхуки, RAG). Везде один RBAC, одна валидация, один аудит.
- **Verify-by-fact.** Система никогда не *делает вид*, что действие сработало. Она читает устройство/сеть для подтверждения (приложение на переднем плане, прокси реально маршрутизирует). Не может подтвердить — возвращает **кодированный шов** (`TELEGRAM_SESSION_IMPORT_UNVERIFIED`) и откатывает состояние. Никакого выдуманного успеха.
- **Exactly-once и самовосстановление.** Идемпотентные джобы (уникальные ключи + `$setOnInsert`), оптимистичные блокировки (version), чистый планировщик `reconcile(snapshot) → intents`, автоматический бан→замена.

## 2. Как это работает (архитектура)

Монорепо Clean/Hexagonal/DDD (yarn workspaces, Node 20 ESM). **Чистый домен без зависимостей** (`@acq/engine-domain`) содержит машину состояний и планировщик `reconcile`; весь ввод-вывод — это **порт** со сменными **адаптерами**.

```
                       ┌────────────────────────────────────────────┐
  Контуры управления   │  REST · MCP · WS · GraphQL · A2A · gRPC ·   │
  (10, все тонкие)     │  CLI · SSE · вебхуки · RAG                  │
                       └───────────────────┬────────────────────────┘
                                           ▼
                       ┌────────────────────────────────────────────┐
  Командный фасад      │  createFacade({useCases, validators, audit})│
  (1 точка входа)      │  RBAC · assertSafeArgs · {data,error,meta}  │
                       └───────────────────┬────────────────────────┘
                                           ▼
  Use-cases (34)  pool.* shop.* device.* campaign.* account.* proxy.* scoring persona verification browser.* scrape.* reconcile
                                           ▼
  Движок (воркеры)   RabbitMQ + DLQ · node-cron реконсайлер · exactly-once · оптимистичные блокировки
                                           ▼
  Порты и адаптеры   DeviceProvider · ProxyProvider · ScrapeProvider · BrowserProvider · ShopRegistry ·
                     VerificationProvider · AutomationAdapter · Mongo-репозитории · Redis · SecretResolver
                                           ▼
  Реальность         Облачные телефоны (DuoPlus/VMOS/GeeLark) · Прокси · Реальные приложения · Веб (Puppeteer+CDP)
```

**Сервисы (композиционные корни).**
| Сервис | Роль | Порт |
|---|---|---|
| `@acq/engine-app` | Воркеры: cron-реконсайлер + консьюмеры RabbitMQ (acquire, generate, queue-fill, bring-online, action, probe, replace, warmup, proxy-assign) | health `7401` |
| `@acq/control-plane-app` | Фасад + все синхронные контуры (REST, MCP-HTTP, WS, GraphQL, A2A, SSE, вебхуки) + gRPC | `7500`, gRPC `7550` |
| `@acq/scrape-worker-app` | Слушает `engine.scrape`, запускает тирный скрапер | health `7700` |
| `@acq/dashboard-app` | Read-only дашборд оператора поверх фасада | `7600` |

Хранилища: **MongoDB** (состояние-источник истины), **Redis** (события/лизы), **RabbitMQ + DLQ** (джобы).

## 3. Как запускать

**Предпосылки:** Node 20, yarn v1, Docker (для Redis/RabbitMQ), MongoDB (хост `27017`, БД `acq`).

```bash
# 1. установка
yarn install

# 2. конфигурация — скопируй шаблон и заполни секреты (.env НЕ коммитить)
cp .env.example .env
#   MONGODB_URI=mongodb://127.0.0.1:27017/acq
#   REDIS_URL=redis://127.0.0.1:6379
#   RABBITMQ_URL=amqp://127.0.0.1:5672
#   JWT_SECRET=...            # подписывает bearer-токены контуров
#   DUOPLUS_API_KEY=...       # провайдер облачных телефонов
#   (опц.) DARK_SHOPPING_* / SMS-вендор / прокси-вендор / LLM-ключ

# 3a. всё в Docker (redis + rabbitmq + все сервисы)
docker compose -f docker-compose.dev.yml up -d
#   engine :7401  ·  control-plane :7500 (+gRPC :7550)  ·  dashboard :7600

# 3b. …или по одному сервису (локальная разработка)
yarn workspace @acq/engine-app        start   # воркеры
yarn workspace @acq/control-plane-app start   # фасад + контуры
yarn workspace @acq/scrape-worker-app start   # скрапер
yarn workspace @acq/dashboard-app     start   # дашборд

# 4. тесты
yarn test                                        # полный юнит-свип (TDD)
yarn workspace @acq/engine-app test:live <name>  # live-тесты (нужны реальные креды/устройства)
```

**Smoke-проверка control plane:**
```bash
curl -s -XPOST localhost:7500/v1/op/pool.status \
  -H 'authorization: Bearer <token>' -H 'content-type: application/json' \
  -d '{"platform":"instagram"}'
# → {"data":{"platform":"instagram","total":..,"online":..}, "error":null, "meta":{...}}
```

Ops-эндпоинты control plane (без авторизации, для тулинга):

```bash
curl localhost:7500/health        # liveness
curl localhost:7500/openapi.json  # contract-first OpenAPI 3.1 (генерируется из каталога 53 операций + валидаторов)
curl localhost:7500/metrics       # Prometheus: ops/errors/latency фасада + доменные сигналы
curl localhost:7401/health        # engine (список активных платформ) — там же /metrics
```

## 4. Базовая модель

**Жизненный цикл аккаунта (8 состояний).** Каждый аккаунт — машина состояний; переходы — *единственный* способ поменять состояние:

```
acquired ──assign──▶ assigned ──bring-online──▶ bringing_online ──✓проверка──▶ online
   ▲                     │                                               │
   │ (генерация/покупка) │                                      cooldown ↕ resume
   │                     ▼                                               │
   └────── replace ◀── retired ◀── retire ◀── banned ◀── checkpointed ◀──┘
```

- `acquired` — в пуле, устройства ещё нет.
- `assigned` — привязан к устройству+слоту (и прокси, если включено).
- `bringing_online` → `online` — креды/сессия применены на устройстве; в `online` переходит **только** если приложение подтверждено на переднем плане (verify-by-fact).
- `cooldown` — отдых от rate-limit; `resume` возвращает в `online`.
- `checkpointed` — платформа просит верификацию; нужен `account.probe` / вручную.
- `banned` → `retired` — мёртв; запускает `replace`, который продвигает свежий аккаунт из пула.

**Пул.** По каждой платформе движок держит `total ≥ poolThreshold`. Падение ниже → событие `pool.low` → консьюмер acquire покупает/генерирует батч (`buyBatchSize`).

**Очередь устройств.** Каждое запущенное устройство объявляет свободные слоты (`deviceTargetDepth`); планировщик queue-fill назначает `acquired`-аккаунты в них, соблюдая `maxAccountsPerDevice` и гейты подписки/ёмкости.

**Реконсайлер.** Чистая функция `reconcile(snapshot) → intents` сравнивает *желаемое* (глубина пула, уровень прогрева, покрытие прокси, цели онлайна) с *фактическим* и выдаёт intents. Джоба на **node-cron** (только в композиционном корне — никогда `setInterval` в бизнес-логике) снимает снапшот реальности и диспатчит intents как идемпотентные джобы. Это и есть петля самовосстановления.

**Exactly-once.** Джобы несут детерминированные ключи (напр. почасовые бакеты); репозитории используют уникальные индексы + `$setOnInsert`, поэтому повторно доставленная джоба — no-op. Записи — через **оптимистичные блокировки** (`version`), чтобы два воркера не испортили аккаунт.

**Мультитенантность.** Каждый документ `Engine*` несёт `tenantId`; все чтения/записи ограничены тенантом.

## 5. Полный воркфлоу аккаунта

Полный happy-path, ровно как отрабатывается вживую на реальном устройстве DuoPlus (`scripts/full-workflow.mjs`). Каждая стадия — это операция, которую можно вызвать и вручную.

| # | Стадия | Что происходит | Операция | Verify-by-fact |
|---|---|---|---|---|
| 1 | **Покупка** | Реконсайлер видит пул ниже порога → консьюмер acquire покупает батч по *верифицированной* спеке магазина; расход записан | `pool.acquire` / авто | гейт `spec.verified`; строка расхода записана |
| 2 | **Enroll устройства** | Регистрируем облачный телефон; движок подтверждает *running* и *eligible* (подписка + ёмкость) | `device.enroll` | статус `describeInstance` = running |
| 3 | **Reconcile** | Снапшот → intents (эмитится fill-queue) | `reconcile.now` | чистый планировщик, без сайд-эффектов |
| 4 | **Заполнение очереди** | `acquired`-аккаунты назначаются в свободные слоты устройства | консьюмер queue-fill | кап `canDeviceAcceptAccount` |
| 5 | **Вывод в онлайн** | Сессия/креды применяются на устройстве; приложение запущено | консьюмер bring-online | приложение на переднем плане → `online`, иначе откат + кодированный шов |
| 6 | **Кампания / действия** | Создаём кампанию; она разворачивается в per-account экшн-таски (exactly-once) | `campaign.create`, `account.action` | дедуп upsert; действие подтверждено на экране |
| 7 | **Скрапинг** | Парсим публичные данные через браузерный тир | `scrape.run` / `scrape.results` | сущности реально извлечены с реальной страницы |
| 8 | **Замена** | Забаненный аккаунт уходит в retired, свежий из пула продвигается | консьюмер replace / авто | banned → `retired`, возвращён id продвинутого |
| 9 | **Наблюдение** | Запрос состояния через фасад / любой контур | `campaign.status`, `account.status` | чтение источника истины |

По пути эмитятся доменные события (`purchase.completed`, `pool.low`, `account.retired`, `queue.low`, …) — они стримятся через **SSE** и **WebSocket** и могут запускать **вебхуки**.

**Конкретный прогон (сокращённый реальный вывод):**
```
✅ куплено 3 аккаунта (заказ ORD-WF-1); пул=3; строк расхода=1
✅ enrolled реальное устройство BzSfu (running, eligible)
✅ заполнено 3; аккаунтов assigned=3
🔒 bring-online откатан в assigned — шов verify-by-fact: TELEGRAM_SESSION_IMPORT_UNVERIFIED
✅ expand-actions выдал 1 таск; exactly-once upsert → 1 строка (дедуп)
✅ скрап через браузерный тир → 2 сущности
✅ replace отработал; забаненный аккаунт теперь = retired
✅ фасад campaign.status → 1 активная; account.status → 3 аккаунта
```
Строка `🔒` — это честность системы: без реальной сессии Telegram для импорта она **отказывается фейкать `online`** и откатывает. Ровно ожидаемое поведение.

## 6. Плейбуки по каждому типу

Каждая платформа — дескриптор, потребляемый тонким драйвером. `onlineMethod` решает, как выходить в онлайн; `supportedActions` — что могут делать кампании; `scrapeTargets` — что может парсить браузер; `maxAccountsPerDevice` — плотность упаковки на устройство.

| Платформа | onlineMethod | signupVia | макс/устр. | supportedActions | scrapeTargets |
|---|---|---|---|---|---|
| **WhatsApp** | session-import | phone | 1 | report | group, contacts |
| **Telegram** | session-import | phone | 1 | join, dm, report, view | channel, group, members, messages, participants, contacts |
| **Discord** | login | native | 1 | join, dm, report | server, channel, members, roles, messages |
| **Facebook** | login | native | 1 | post, join, report, like | page, group, friends, members, posts, likes, comments |
| **Gmail** | login | native | 1 | read-code | threads, contacts |
| **TikTok** | login | native | 1 | publish, warmup, follow, like, comment | profile, videos, followers, following, likes, comments, sounds, hashtags, trends |
| **Instagram** | login | native | **5** | publish, follow, like, comment, dm | profile, followers, following, posts, reels, stories, likers, commenters, hashtags |
| **YouTube** | login | google | 1 | publish, comment, like | channel, videos, subscribers, comments, playlists |

**WhatsApp** — *купить phone-verified аккаунт → импорт сессии → репорт.* В онлайн выходит импортом сессии (без интерактивного логина); 1 на устройство (жёсткий антифрод). Пример:
```bash
curl -XPOST localhost:7500/v1/op/pool.acquire   -d '{"platform":"whatsapp","count":5}'   -H 'authorization: Bearer <op-token>' -H 'content-type: application/json'
curl -XPOST localhost:7500/v1/op/account.action -d '{"platform":"whatsapp","accountId":"<id>","action":{"type":"report","target":"+1555..."}}' ...
```

**Telegram** — *импорт сессии, затем join/dm/report/view.* Самый богатый скрапер (каналы, участники, сообщения). Bring-online — тот самый шов verify-by-fact, пока нет реальной сессии.

**Discord / Facebook** — *интерактивный логин (логин+пароль на устройстве) → join/report (+post/like у FB).* Общий `login-runner` ведёт приложение: запуск → классификация экрана → ввод кредов → подтверждение; кодированные швы `<P>_LOGIN_SCREEN_UNVERIFIED` / `<P>_CREDENTIALS_REQUIRED`, если нет селекторов/кредов.

**Gmail** — *логин → чтение кодов верификации.* Основное применение — приёмник верификаций для регистраций на других платформах (действие `read-code`, скрап `threads`).

**TikTok / Instagram / YouTube** — *логин → публикация/вовлечение.* Работают через общий `action-runner` (publish/follow/like/comment/warmup). **Instagram упаковывает 5 на устройство.** Пример кампании:
```bash
curl -XPOST localhost:7500/v1/op/campaign.create \
  -d '{"platform":"instagram","actionType":"follow","targets":["@someone"],"schedule":{"perHour":20}}' ...
# → разворачивается в per-account follow-таски (exactly-once), выполняется на устройстве, подтверждается на экране
```

**Guard возможностей действия.** Каждый экшн проверяется против `supportedActions` платформы **до** запуска. Неподдерживаемый экшн — напр. `report` на Instagram или `publish` на Gmail — отклоняется **на входе** кодированной ошибкой `ACTION_NOT_SUPPORTED` в *обеих* точках (`account.action` и `campaign.create`), до создания тасков и до любого обращения к устройству. Это валидация входа (срабатывает даже без подключённого провайдера), поэтому плохой запрос ничего не стоит и возвращает одну чёткую ошибку вместо поздних падений по каждому таску.

> **`report` поддержан на WhatsApp · Telegram · Discord · Facebook** — не на Instagram, TikTok, YouTube, Gmail.

**Report на цель — точечно vs массово.** Чтобы отправить report на цель *с других аккаунтов* (напр. когда один из твоих спалился):

1. **Исключи спалённый аккаунт**, чтобы движок его не использовал (действия шлются только `online`-аккаунтам):
   ```bash
   curl -XPOST localhost:7500/v1/op/account.retire -d '{"accountId":"<burned-id>"}' \
     -H 'authorization: Bearer <operator-token>' -H 'content-type: application/json'
   ```
   (Либо он сам уйдёт `banned → retired → replace`.)
2. **Точечно** — один конкретный здоровый аккаунт → одна цель (ты выбираешь, кто репортит):
   ```bash
   curl -XPOST localhost:7500/v1/op/account.action \
     -d '{"accountId":"<healthy-id>","actionType":"report","target":"<кого-репортим>"}' ...
   ```
3. **Массово** — все здоровые аккаунты платформы → цель:
   ```bash
   curl -XPOST localhost:7500/v1/op/campaign.create \
     -d '{"platform":"telegram","actionType":"report","targets":["<цель>"],"strategy":"all-accounts-per-target"}' ...
   ```
   Разворачивается в по одному exactly-once таску на каждый `online`-аккаунт; спалённый/retired не попадает. Управление — `campaign.status/pause/resume/stop`; отдельный таск — `action.retry`.

`target` — это цель репорта (телефон для WhatsApp, `@handle`/канал для Telegram, user/server для Discord, page/profile для Facebook). Платформа репорта = платформа репортящего аккаунта. Каждый report подтверждается **verify-by-fact** на устройстве (`ACTION_NOT_CONFIRMED`, если приложения не было на переднем плане).

**Автономное исполнение и предусловия.** Как только кампания создана (задекларирована brain по MCP или с любого контура), исполнение **автономно** — ты не отдаёшь команды по каждому аккаунту. **node-cron реконсайлер** (в `engine-app`) каждый цикл подхватывает активную кампанию, разворачивает её в по одному exactly-once таску на каждый `online`-аккаунт × target, а консьюмер `engine.action` исполняет каждый на устройстве самого аккаунта. Brain только декларирует намерение и может следить за прогрессом (`campaign.status`, `account.status`, RAG `acq://…`, события SSE/WS) и реагировать. Но реальный репорт доходит до цели, только когда выполнены **все** условия — иначе конвейер останавливается на кодированном шве, не фейкая отправку:

| Предусловие | Иначе |
|---|---|
| `engine-app` запущен (реконсайлер + консьюмеры) | кампания висит `active`, ничего не исполняется |
| аккаунты реально `online` (импорт сессии / логин выполнен) | не попадают в выборку — таск для них не создаётся |
| подключён провайдер устройств (`DUOPLUS_API_KEY`, …) | `AUTOMATION_UNAVAILABLE` |
| мессенджер установлен на клоне + сняты on-device селекторы экрана Report | `ACTION_NOT_CONFIRMED` (никогда не выдуманное «отправлено») |

Итого: **оркестрация полностью автономна; подтверждённая отправка гейтится verify-by-fact.** Дай эти четыре входа — и массовый report, поставленный через brain, заставит каждый здоровый аккаунт отправить со своего устройства, exactly-once, а спалённый автоматически исключится (в выборку идут только `status:'online'`).

Для **каждого** типа жизненный цикл (§5) и контуры (§7) идентичны — отличается только дескриптор. В этом весь смысл «генеричности».

## 7. Контуры управления

Десять способов вызвать **один и тот же** фасад. Одни имена операций, одни аргументы, один RBAC, один конверт `{data, error, meta}`. Выбор — по контексту интеграции.

**REST** (`POST /v1/op/:operation`, bearer):
```bash
curl -XPOST localhost:7500/v1/op/scoring.score \
  -H 'authorization: Bearer <token>' -H 'content-type: application/json' \
  -d '{"subjectType":"account","features":{"ageDays":90,"warmupLevel":1}}'
```

**MCP** (для LLM-агентов / «мозга») — StreamableHTTP на `/mcp`, с сессиями. Tools = 53 операция; resources = RAG-read-модели:
```js
const mcp = new Client({name:'agent',version:'1'},{capabilities:{}});
await mcp.connect(new StreamableHTTPClientTransport(new URL('http://localhost:7500/mcp'),
  { requestInit:{ headers:{ authorization:'Bearer <token>' } } }));
await mcp.callTool({ name:'account.status', arguments:{ platform:'telegram' } });
await mcp.readResource({ uri:'acq://accounts' });   // секреты вырезаны
```

**WebSocket** (`/v1/ws`) — двунаправленный, для live-UI операторов:
```js
ws.send(JSON.stringify({ id:'w1', operation:'pool.status', args:{ platform:'telegram' } }));
```

**GraphQL** (`/v1/graphql`) — единое генеричное поле `op(operation, args)` в Query и Mutation:
```graphql
query($op:String!,$a:JSON){ op(operation:$op, args:$a){ data error } }
# variables: { "op":"persona.generate", "a":{ "niche":"art","locale":"en" } }
```

**A2A** (agent-to-agent) — `GET /.well-known/agent-card.json` (41 скилла) + `POST /a2a` таски:
```bash
curl localhost:7500/.well-known/agent-card.json           # обнаружение скиллов
curl -XPOST localhost:7500/a2a -d '{"id":"a1","skill":"account.status","args":{"platform":"instagram"}}' ...
```

**gRPC** (`:7550`, `Control.Execute`) — JSON-аргументы вход/выход, для high-throughput сервисов:
```
Execute({ operation:'pool.status', args_json:'{"platform":"youtube"}' }) → { data_json, error_json }
```

**CLI / вручную** — реальный бинарь `acq` (`apps/control-plane/bin/acq.js`), который управляет **развёрнутым** сервером по REST (`POST /v1/op/:operation`); set и get — один и тот же вызов, RBAC по bearer-токену. Настройка через `ACQ_BASE_URL` (дефолт `http://localhost:7500`) + `ACQ_TOKEN`; код выхода ненулевой при кодированной ошибке, сбой транспорта — кодированный `CLI_REQUEST_FAILED`:
```bash
export ACQ_TOKEN=… ACQ_BASE_URL=http://localhost:7500
acq pool.status platform=telegram                      # get
acq account.retire accountId=a1                        # set
acq scoring.score subjectType=target 'features={"followers":50000}'
```

**SSE** (`GET /v1/events`) — односторонний поток доменных событий (pool.low, account.retired, …).

**Входящие вебхуки** (`POST /webhooks/inbound`) — HMAC-подпись + защита от повторов, приём событий от внешних систем.

**RAG** (ресурсы `acq://…` через MCP) — read-only проекции для retrieval: `acq://pool/summary`, `acq://accounts` (секреты вырезаны), `acq://campaigns`, `acq://proxies`, `acq://devices`, `acq://scrape` (контент групп + комментаторы), `acq://selectors` (on-device селекторы), `acq://metrics` (живые доменные метрики), `acq://email-identities` (почтовые ящики оператора, секреты вырезаны), `acq://browser-providers` (подключаемые backend'ы для логина/скрейпа + возможности).

## 8. Каталог операций

53 операции, RBAC на каждую (`readonly` < `operator` < `admin`).

> **Курсорная пагинация (REQUIREM §2.5).** Каждый список инвентаря — `account.status`, `device.status`, `email.identity.list`, `scrape.results` — **пагинируется курсором**: передаёшь `{cursor?, limit?}`, получаешь строки + `nextCursor` (null на последней странице). Один централизованный хелпер `paginate()` делает index-friendly range-scan `_id > cursor` (O(log n)), ограничивает `limit` до ≤200 и **никогда не грузит всю коллекцию** — чтения остаются ограниченными при больших объёмах аккаунтов/устройств.

- **Пул:** `pool.status`, `pool.acquire`
- **Закупка:** `shop.register`, `shop.scan`, `shop.approve`, `shop.signup`, `shop.signup.confirm`
- **Устройства:** `device.enroll`, `device.queue.get`, `device.status`, `device.selectors`, `device.selectors.set`
- **Кампании:** `campaign.create`, `campaign.status`, `campaign.pause`, `campaign.resume`, `campaign.stop`
- **Аккаунты:** `account.status`, `account.action`, `account.retire`, `account.cooldown`, `account.resume`, `account.reassign`, `account.refreshSession`, `account.probe`, `account.tag`, `account.bulk`
- **Действия:** `action.retry`
- **Прокси:** `proxy.status`, `proxy.assign`, `proxy.rotate`
- **Интеллект:** `scoring.score`, `persona.generate`
- **Верификация:** `verification.rent`
- **Браузер:** `browser.providers`, `browser.session.open`, `browser.session.liveView`, `browser.observe`, `browser.act`
- **Скрапинг:** `scrape.run`, `scrape.results`
- **Управление:** `reconcile.now`
- **AI backends:** `llm.providers`, `llm.complete`
- **Email identities:** `email.providers`, `email.identity.register`, `email.identity.list`, `email.identity.disable`
- **Observability:** `metrics.domain`, `trace.recent`, `alerts.status`
- **Compliance:** `compliance.export`, `compliance.erase`

Каждый контур валидирует аргументы **per-operation yup-схемой** (`.noUnknown(true)` → неизвестные поля отклоняются кодом `INVALID_ARGS`) до запуска фасада.

## 9. Устройства

Облачные телефоны достигаются через порт `DeviceProvider` с конкретными адаптерами. **Ничего не завязано только на ADB** — управление работает и через REST API провайдера (remote-shell).

**Провайдеры:** `duoplus`, `vmos`, `geelark` (+ внутренний вариант `matt-duo` с session-token).

**Подключение (жизненный цикл).**
```
describeInstance(id) → startDevice(id) → createDirectController(id) → [работа] → stopDevice / releaseLease
```
- **Enroll:** `device.enroll` регистрирует телефон, проверяет что он *running* (`describeInstance`) и *eligible* (подписка + ёмкость), затем записывает как `EngineDevice`.
- **Лиз (lease):** `claimRunningDeviceLease` (Redis) даёт одному воркеру эксклюзивный контроль; `releaseDeviceLease` освобождает. Так два движка никогда не дерутся за один телефон.
- **Отключение:** остановить инстанс или отпустить лиз; слот аккаунта освобождается, occupancy пересчитывается.

**Контроллеры (surface на устройстве).** `Controller` даёт `getUIDump`, `getCurrentPackage`, `isAppInstalled`, `startApp`, `stopApp`, `enter`, `clearField`, `connect`, `tap/text/key/sleep`. Реализации:
- **DuoplusDirectController / VmosDirectController** — remote-shell через API провайдера (`/api/v1/cloudPhone/command`); raw ADB не нужен (работает за NAT).
- **AdbClient** — raw/сетевой ADB (`adb connect host:port`) с полным surface контроллера, инъектируемый `exec`.
- **ADB-over-SSH туннель** — `createAdbSshTunnel({sshHost, sshUser, remotePort, localPort, …})` пробрасывает удалённый ADB-порт по SSH (ключ или `sshpass`), когда устройство доступно только внутри шлюза.

**Мультиаккаунтная occupancy (§5.11).** Устройство отслеживает `occupiedAccountIds`, `activeAccountCount` и `occupancyMethod` (`root|vision|none`). `canDeviceAcceptAccount` применяет гейт подписки **и** кап ёмкости (`DEVICE_CAPACITY_FULL`) — именно это позволяет Instagram паковать 5/устройство, а WhatsApp оставаться 1/устройство.

**Verify-by-fact на устройстве.** `bringOnline`/`runAction` сравнивают `getCurrentPackage()` с `appPackage` дескриптора (`foregroundMatches`). Если целевого приложения нет на переднем плане, действие **не** подтверждается → кодированный шов (`ACTION_NOT_CONFIRMED`), никакого фейк-успеха.

**On-device селекторы (`device.selectors` / `device.selectors.set`).** Общие login/action/report runner'ы ведут приложение по **наборам текстовых селекторов** (маркеры home/login, подсказки полей username/password, submit-тексты, per-action trigger/confirm тексты). Их встроенные seed'ы **юнионятся** с per-platform overrides оператора, настроенными под **живой билд** приложения — задаются и читаются через `device.selectors.set {platform, selectors}` / `device.selectors {platform}` на **всех контурах** (вызывается brain), заземляются через RAG-ресурс `acq://selectors`, прокидываются в драйверы как `opts.selectors`. То есть снять шов `LOGIN_SCREEN_UNVERIFIED` / `ACTION_NOT_CONFIRMED` под новый билд — это изменение **данных** (задать правильные селекторы), а **не** кода. Проверено вживую по всем контурам (`scripts/selectors-surfaces-live.mjs`). Правильные значения селекторов под конкретный билд остаются verify-by-fact входом, который даёшь ты.

## 10. Подсистема прокси

Липкая **1:1** привязка аккаунт↔прокси для согласованного сетевого отпечатка (гео-консистентность IP↔SIM↔GPS↔часовой пояс).

- **Пул и операции:** `proxy.status`, `proxy.assign`, `proxy.rotate` поверх пула `EngineProxy`.
- **Здоровье по факту:** `createProxyHealthChecker` гонит реальный запрос *через* прокси — прокси «здоров» только если реально выпускает трафик, никогда по догадке о конфиге.
- **Закупка у вендора:** `createHttpProxyProvider({httpClient, endpoints, map, verifyProxy})` покупает/ротирует через любой декларативный HTTP прокси-вендор.
- **Планирование:** опционально через `proxyEnabled` + `proxyPoolThreshold`; реконсайлер выдаёт intents proxy-acquire/assign, консьюмер `proxy-assign` привязывает их к аккаунтам.

## 11. Браузерный парсинг / скрапинг

Парсинг публичных данных — **полноценная подсистема**, не «прикрутка». `ScrapeProvider` роутит на 4 тира, браузер — первым:

| Тир | Адаптер | Когда |
|---|---|---|
| **browser** (основной) | Puppeteer + CDP (`@acq/browser`) | всё, что требует реально отрендеренной страницы / контекста логина |
| **http** | прямой HTTP-адаптер | дешёвые публичные эндпоинты |
| **device** | парс UI-dump на устройстве | внутриприложенческие данные, видимые только в приложении |
| **api** | адаптер API-вендора (T3) | когда настроен платный data-API (429 → `SCRAPE_RATE_LIMITED`) |

**BrowserProvider** (класса Browserbase): `createSession` / `extract(schema)` / `liveView` (DevTools-URL для наблюдения за сессией) / `record`. Chromium запускается лениво при первой сессии.

**Пример (браузерный тир, реальное извлечение):**
```bash
curl -XPOST localhost:7500/v1/op/scrape.run \
  -d '{"platform":"instagram","targetType":"followers","target":"somehandle"}' ...
# → { tier:"browser", entities:[ { handle:"@ann", displayName:"Ann" }, … ] }
curl -XPOST localhost:7500/v1/op/scrape.results -d '{"jobId":"<id>"}' ...
```
Сущности ключуются и дедуплицируются; результаты сохраняются как `EngineScrapeResult` (каждый со своим `target`) и доступны через RAG (`acq://…`) и фасад.

**Контент группы → intelligence (messages, participants, members).** Для мессенджеров (Telegram и т.д.) нормализатор превращает сырой вывод группы в канонические сущности:

| targetType | entity | data | натуральный ключ |
|---|---|---|---|
| `messages` | `message` | `{ group, id, author, text, ts, replyToId }` | `platform:message:group:id` |
| `participants` | `participant` | `{ group, handle, role }` | `platform:participant:group:handle` |
| `members` | `member` | `{ group, handle, role }` | `platform:member:group:handle` |

То есть один скрап даёт **контент** (у каждого сообщения `text` — вопросы/комменты) **и кто его написал** (`author`); **множество юзеров, кто комментил** — это уникальные `author` по сообщениям, а `participants`/`members` дают полный ростер пользователей. Всё сохраняется идемпотентно (повторный скрап той же группы не дублирует — дедуп по натуральному ключу) и читается по группе через `scrape.results {platform, type}` на любом контуре, затем скармливается модели / пакету `intelligence`.

```bash
curl -XPOST localhost:7500/v1/op/scrape.run \
  -d '{"platform":"telegram","targetType":"messages","target":"<group>"}' ...
curl -XPOST localhost:7500/v1/op/scrape.results -d '{"platform":"telegram","type":"message"}' ...
# → сообщения с { author, text, group } ; уникальные author = юзеры, которые комментили
```
*Проверено вживую* (`scripts/scrape-telegram-live.mjs`, реальный Mongo + Docker REST): сообщения группы (контент + автор) и участники нормализуются, сохраняются, читаются через `scrape.results`, дают уникальных комментаторов, повторный скрап — exactly-once.

**Управляется через все контуры.** `scrape.run` (диспатч — включая `params.via:'bot-api'`) и `scrape.results` (чтение) — это операции фасада, поэтому система скрапа — веб-парсер **и** Bot API — управляется одинаково через **MCP · REST/HTTP · gRPC · WebSocket · GraphQL · A2A · CLI (вручную)**, а результаты заземляются для brain через RAG-ресурс **`acq://scrape`**. Проверено вживую end-to-end по всем контурам (`scripts/scrape-surfaces-live.mjs`).

**Прокси (вкл. автоподбор резидента).** Браузерный тир роутит каждую скрап-сессию через прокси и применяет его креды (`proxyServer` + `page.authenticate`), поэтому **резидентные с авторизацией работают**. Два способа: передать явно (`params.proxy:"http://user:pass@host:port"`), либо задать **`params.useResidential:true`** (опц. `params.geo`) — и scrape-воркер **сам берёт доступный резидентный прокси из пула** (предпочитая health-checked), резолвит его vault-эндпоинт just-in-time и подставляет авторизованный URL; пустой пул = кодированный шов `NO_RESIDENTIAL_PROXY_AVAILABLE`, а не выдуманный прокси. Залогиненный скрап передаёт `params.cookies` (сессию). Пример — подписчики Instagram через US-резидент:
```
scrape.run {platform:"instagram", targetType:"followers", target:"@nike", params:{useResidential:true, geo:"US"}}
```

**Сырое извлечение из Telegram — по умолчанию веб-скрапер, Bot API опционально.** Конвейер normalize → dedup → persist → retrieve выше полностью реальный; ему нужно лишь Telegram-специфичное *сырое извлечение*, подающее `rawItems`. Три источника:
- **Веб-скрапер (браузерный тир) — ДЕФОЛТ, подключён для Telegram.** Без `params.via`. **Реестр селекторов web.telegram.org** (`createTelegramWebSelectors`) подключён по умолчанию: один in-page экстрактор тянет **messages** (`{id,text,author,ts}`) и **participants** (`{handle,role}`) с web.telegram.org, ветвясь по `targetType`. Его CSS-селекторы **verify-by-fact + переопределяемы** (подстрой под живой билд клиента; несовпадение даёт пустые строки, никогда не выдуманные данные) — проверено вживую end-to-end на реальном headless Chromium (`scripts/scrape-telegram-web-live.mjs`). Каждая ДРУГАЯ платформа остаётся честным швом `SCRAPE_SELECTORS_UNVERIFIED`, пока не зарегистрируешь её селекторы. Лучше для публичного контента в масштабе.
- **Telegram Bot API (api-тир) — ОПЦИЯ, реализовано.** Передаёшь `params.via:'bot-api'` и стартуешь воркер с `TELEGRAM_BOT_TOKEN`. Реальный адаптер: `getUpdates → messages` (что бот получил, будучи в чате), `getChatAdministrators → participants`. Легально/официально; ограничено тем, что видит бот (не вся история; ростер = админы). Проверено вживую end-to-end.
  ```bash
  # воркер: TELEGRAM_BOT_TOKEN=123:ABC  (опциональный тир)
  curl -XPOST localhost:7500/v1/op/scrape.run \
    -d '{"platform":"telegram","targetType":"messages","target":"<group>","params":{"via":"bot-api"}}' ...
  ```
- **Telegram MTProto (mtproto-тир) — ОПЦИЯ, реализовано.** Передаёшь `params.via:'mtproto'` против воркера с подключённым **клиентом** класса GramJS/telethon (`api_id`/`api_hash` + пользовательская сессия). Идёт **сверх Bot API**: `getMessages → ВСЯ история сообщений`, `getParticipants → ВЕСЬ ростер участников` (не только админы). Путь map→normalize→persist реальный; MTProto-сессия — verify-by-fact вход (нет → `MTPROTO_CLIENT_UNAVAILABLE`/`SCRAPE_TIER_UNAVAILABLE`). Проверено вживую end-to-end (`scripts/scrape-telegram-mtproto-live.mjs`).
  ```bash
  scrape.run {platform:'telegram', targetType:'messages', target:'<group>', params:{via:'mtproto', limit:1000}}
  ```
- **On-device UI-dump — шов.** Чтение приложения Telegram на реальном устройстве остаётся verify-by-fact швом, подключается так же.

Дефолт остаётся веб-скрапером; Bot API и MTProto — тиры, выбираемые параметром (`params.via`); intelligence-часть ниже по потоку готова во всех случаях.

## 12. Закупка, генерация, верификация, персоны, скоринг

- **Закупка (buy).** `ShopRegistry` хранит декларативные `ShopAdapterSpec`; компилируются только **верифицированные** спеки (`compileShopAdapter({...spec, verified:true})`).
  - **Жизненный цикл:** `shop.register {spec}` → сохраняется **unverified**; `shop.approve {shopId}` → ставит `verified:true` (гейт исполнения — неаппрувнутый магазин это жёсткий шов `SHOP_SPEC_UNVERIFIED`). `shop.scan {shopUrl}` (LLM, при наличии ключа) *предлагает* спеку по странице — ИИ предлагает, валидация по факту.
  - **Много магазинов на платформу.** Регистрируешь сколько угодно магазинов под платформу. У каждой спеки есть `priority` (меньше = приоритетнее) и `unitPriceUsdCents`.
  - **Покупка из конкретного:** передаёшь `shopId` в `pool.acquire` → именно этот магазин (должен быть verified).
  - **Или авто-выбор:** без `shopId` → `selectForPlatform` берёт **самый приоритетный verified-магазин в рамках бюджета** (`maxUnitPriceUsdCents` отсекает слишком дорогих). Авто-докупка при падении пула использует тот же выбор.
  - **Доставка → vault.** Доставленные аккаунты мапятся `deliveryFormat.itemMap` спеки (принимает бесточечную **вложенную** форму, напр. `{ identifier:'phone', secrets:{ session:'sess' } }`, чтобы спека проходила injection-guard фасада); каждый секрет уходит в vault через `secretResolver.put` → в `secretRefs` аккаунта попадает только **ссылка** (`vault:…`/`env:…`), никогда сырой секрет. Каждая покупка проверяется по балансу, защищена от дрейфа цены (`priceDriftTolerance`, `maxTotalUsdCents`) и пишет расход. **Exactly-once на денежном пути (REQUIREM §2.1/§3.4):** acquire-consumer claim'ит покупку по idempotency-ключу задачи **до** списания у магазина и штампует заказ в момент размещения (`purchaseLedger`), поэтому повторная доставка — напр. пост-покупочная ошибка вызвала DLQ-retry — **возобновляется по записанному заказу, а не покупает второй раз**; параллельный in-flight claim = кодированный retryable-шов `ACQUIRE_IN_PROGRESS`.
  - *Проверено вживую* (`scripts/shop-select-live.mjs`, реальный Mongo): два telegram-магазина (priority 1/$3 vs 10/$1) → авто-выбор берёт priority-1; бюджет $2 переключает на дешёвый; явный `shopId` покупает из него; неаппрувнутый магазин отклонён; доставленный аккаунт сохраняет **vaulted** ссылку сессии.
- **Авторизация в магазине — доступ даёшь ты; система сама НЕ регистрируется.** Движок работает с магазином через его API по **уже существующему** доступу; он никогда не заводит и не логинит аккаунт в магазине *за тебя*. Поддерживаемые `auth.kind`:

  | kind | `config` | как отправляется |
  |---|---|---|
  | `api-key` | `{ name, valueRef, in: 'header'\|'query' }` | заголовок (или query-параметр) `name` = разрезолвленный ключ |
  | `bearer` / `oauth2` | `{ tokenRef }` | `Authorization: Bearer <token>` |
  | `cookie-session` | `{ cookieRef }` | `Cookie: <session>` |
  | `login-password` | `{ loginPath\|loginUrl, emailRef, passwordRef, fieldMap?, session? }` | **логинится по кредам**: POST `{email,password}` (имена полей через `fieldMap`) на login-эндпоинт, затем переиспользует сессию — по умолчанию `Set-Cookie`, либо токен из тела (`session:{from:'body', tokenPath, header?, scheme?}`) → `Authorization: Bearer`. Сессия кэшируется; неудачный логин — код `SHOP_AUTH_LOGIN_FAILED`; неописанный flow (нет `loginPath`) остаётся кодом `SHOP_AUTH_LOGIN_UNSUPPORTED` |

  Каждый `*Ref` — это **ссылка на секрет, не открытый текст**: кладёшь ключ/куку в vault или env (напр. `env:MYSHOP_KEY`) и ссылаешься — `SecretResolver` разрешает её в момент запроса; сырой секрет не живёт ни в спеке, ни в базе, ни в логах.

  Полная рабочая спека (магазин с api-key, продаёт telegram-аккаунты):
  ```json
  {
    "shopId": "myshop", "platform": "telegram", "baseUrl": "https://api.myshop.example",
    "priority": 1, "unitPriceUsdCents": 250,
    "auth": { "kind": "api-key", "config": { "name": "X-Api-Key", "valueRef": "env:MYSHOP_KEY", "in": "header" } },
    "endpoints": {
      "balance":  { "method": "GET",  "path": "/v1/balance", "responseMap": { "balanceUsdCents": "data.balance_cents" } },
      "offers":   { "method": "GET",  "path": "/v1/offers",  "responseMap": { "unitPriceUsdCents": "data.price_cents" } },
      "purchase": { "method": "POST", "path": "/v1/orders",  "responseMap": { "orderId": "data.order_id" } },
      "delivery": { "method": "GET",  "path": "/v1/orders",  "responseMap": { "blob": "data.items" },
        "deliveryFormat": { "verified": true, "format": "json-array",
          "itemMap": { "identifier": "phone", "secrets": { "session": "tdata" } } } }
    }
  }
  ```
  Дальше brain (или любой контур) гонит end-to-end: `shop.register {spec}` → `shop.approve {shopId:"myshop"}` → `pool.acquire {platform:"telegram", count, shopId?}` → полный жизненный цикл. Ты либо даёшь системе **уже существующий доступ** (ключ/куку, выше), либо она **регистрирует свежий аккаунт** в магазине — ниже.
- **Регистрация В магазине — `shop.signup` + `shop.signup.confirm`.** Платформа умеет зарегистрировать аккаунт в магазине по **email-идентичности** (напр. любой Gmail) и подтвердить его end-to-end:
  1. `shop.signup {shopId, emailRef, passwordRef, usernameRef?}` — POST-ит декларативный эндпоинт магазина `signup.register` с замапленной идентичностью. **Креды — это ссылки на секреты, не открытый текст** (`emailRef:"env:MY_GMAIL"`, `passwordRef:"vault:pw"`).
  2. `shop.signup.confirm {shopId, emailRef, imapPasswordRef}` — читает код подтверждения магазина **прямо из почты по IMAP** (`EmailCodeFetcher` — работает с любым Gmail login/app-password), отправляет его на `signup.confirm` магазина и сохраняет полученную залогиненную **cookie-сессию** (`cookie:<shopId>`). Направляешь `cookie-session` auth магазина на эту ссылку — и `pool.acquire` работает.

  Эндпоинты register/confirm + маппинг полей живут в секции `signup` спеки (per-shop, **verify-by-fact** — инъектируются); HTTP + IMAP механизм реальный. Отсутствие конфига — честный шов (`SHOP_SIGNUP_UNCONFIGURED` / `SHOP_SIGNUP_CODE_PENDING`), никогда не фейк-аккаунт. **Управляется через все контуры** (MCP · REST · gRPC · WS · GraphQL · A2A · CLI, вызывается brain) — проверено вживую end-to-end (`scripts/shop-signup-live.mjs`). Другие методы подтверждения (SMS, hosted temp-mail) подключаются в тот же шов `VerificationResourceProvider`.
- **Email-идентичности — зарегистрируй ящик один раз, дальше регистрация по адресу.** Твои почтовые ящики — first-class сущность (**любой провайдер**: gmail, outlook, yahoo или свой IMAP-хост — не только Gmail):

  | операция | назначение |
  |---|---|
  | `email.identity.register {address, provider?, category?, imapHost?, imapPort?, passwordRef?, accessTokenRef?, notes?}` | сохранить ящик + **ссылку на секрет** — IMAP `passwordRef` **или** OAuth `accessTokenRef` (modern-auth провайдеры вроде Outlook/Hotmail); хотя бы один обязателен, открытый пароль отклоняется (`EMAIL_PASSWORD_REF_REQUIRED`). `category` — **тип** почты: `standard`/`aged`/`us`/`manual`/`disposable`/`autoreg-purchased`/… |
  | `email.identity.list {category?}` | список ящиков (секреты вырезаны), с опциональным фильтром по **типу** почты (напр. только `us`/`aged`) |
  | `email.identity.list` | список идентичностей — **секреты вырезаны** (только `hasPasswordRef`) |
  | `email.identity.disable {address}` | вывести идентичность из оборота; дальнейшее использование → `EMAIL_IDENTITY_DISABLED` |

  С зарегистрированной идентичностью магазинному флоу **не нужны inline-креды** — передаёшь адрес, а хранилище само подставит refs и IMAP-координаты:
  ```bash
  curl -XPOST localhost:7500/v1/op/email.identity.register \
    -d '{"address":"ops@yourdomain.tld","provider":"custom","imapHost":"imap.yourdomain.tld","passwordRef":"vault:ops-mail"}' ...
  curl -XPOST localhost:7500/v1/op/shop.signup         -d '{"shopId":"myshop","address":"ops@yourdomain.tld"}' ...
  curl -XPOST localhost:7500/v1/op/shop.signup.confirm -d '{"shopId":"myshop","address":"ops@yourdomain.tld"}' ...
  curl -XPOST localhost:7500/v1/op/pool.acquire        -d '{"platform":"telegram","quantity":5,"shopId":"myshop"}' ...
  ```
  Явные refs продолжают работать без изменений. Для brain заземляется через **`acq://email-identities`**; проверено вживую по всем контурам (`scripts/ai-email-surfaces-live.mjs`). **Сами ящики — те, что создаёшь и которыми владеешь ты**: платформа их хранит и использует, но не регистрирует почтовые аккаунты за тебя.

  **Каталог провайдеров (`email.providers`).** Единый источник истины для доступа к ящику — покрыт запрошенный список: **Gmail, Outlook/Hotmail, Yahoo, AOL, GMX, Mail.com, Rambler, Mail.ru (incl. My.com / My World), Onet.pl, Seznam.cz** (IMAP из коробки), плюс **Proton** (нужен локальный Proton Mail **Bridge** — публичного IMAP нет), **Mail.tm** и **1secmail** (только API, IMAP нет), **Firstmail** (хост меняется по партиям — задай `imapHost` на идентичности) и **custom** IMAP. Провайдер без IMAP честно помечается (`imapReady:false`, `requiresBridge`/`apiOnly`) — платформа не выдумывает хост. **Reader-by-provider:** `createEmailCodeReader` выбирает правильный ридер кода под тип ящика — IMAP-`EmailCodeFetcher` для обычных, и **HTTP-API-ридер для API-only типов** (реестр по провайдеру: `createMailTmCodeReader` для Mail.tm, `createOneSecMailCodeReader` для 1secmail — добавить ещё api-only тип = одна запись в реестре) — контракт `fetchLatestCode` один в обоих случаях, поэтому confirm в магазине работает для **любого** типа почты без ветвлений. **Аутентификация per-ящик:** по умолчанию парольный IMAP `LOGIN`, либо **OAuth `AUTHENTICATE XOAUTH2`**, если у идентичности есть `accessTokenRef` (Outlook/Hotmail и OAuth-Gmail отклоняют парольный IMAP; при провале XOAUTH2 клиент подтверждает SASL `+`-continuation и падает быстро, а не висит). Каждый провайдер **объявляет свои `authMethods`** (`password`/`app-password`/`oauth`/`bridge`/`api`) в каталоге и через `email.providers`, поэтому оператор/brain знает, какой секрет давать. **Google Workspace / Gmail на своём домене:** регистрируй идентичность с `provider:'gmail'` — она резолвится в `imap.gmail.com` (verified, а не inferred `imap.<domain>`); подсказка провайдера проходит через весь confirm-флоу. Proton (bridge) и Firstmail (per-batch) задают хост явно и идут по IMAP-пути. *Харнесс приоритета 1* `scripts/mail-shops-live.mjs` тестирует ящик на **dark.shopping + djekxa** end-to-end: резолв каталога + реальный IMAP-логин/чтение (при кредах) + балансы обоих магазинов + вся цепочка `signup → confirm → buy`.
- **Подключаемые AI-бэкенды (`llm.providers` / `llm.complete`).** Любой путь с ИИ (скан магазина и всё, что ведёт brain) идёт через **реестр провайдеров** — один контракт `complete()`, много вендоров:

  | провайдер | модель по умолчанию | примечание |
  |---|---|---|
  | `openai` *(дефолт)* | `gpt-5-codex` | семейство GPT / Codex |
  | `anthropic` | `claude-opus-5` | Fable / Opus / Sonnet / Haiku |
  | `google` | `gemini-2.5-pro` | семейство Gemini |
  | `openrouter` | `openai/gpt-4o-mini` | мульти-вендорный шлюз |
  | `custom` | — | **любой OpenAI-совместимый эндпоинт** (self-hosted vLLM/Ollama/новый вендор) через `baseUrl` |

  Ключи — из env по вендорам (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `LLM_API_KEY`); `LLM_PROVIDER`/`LLM_MODEL` задают дефолт. **Любой вызов может переопределить и провайдера, и модель**, напр. `shop.scan {shopUrl, provider:'anthropic', model:'claude-fable-5'}` или `llm.complete {provider:'google', messages:[…]}`. Ненастроенный вендор — честный `LLM_PROVIDER_UNCONFIGURED`; сбой вендора — `LLM_REQUEST_FAILED`, никогда не выдуманный ответ. Добавить вендора = одна запись в реестре (Open/Closed), без ветвлений в остальном коде.
- **Подключаемые браузерные backend'ы (`browser.providers`).** Логины и скрейп идут через **порт BrowserProvider** со взаимозаменяемыми backend'ами — перечислены на всех контурах (и через RAG-ресурс `acq://browser-providers`) с возможностями + состоянием настройки:

  | backend | тип | заметки |
  |---|---|---|
  | `own` *(дефолт)* | self-hosted | наш пул Puppeteer/CDP — ноль платы за сессию, данные дома; масштаб/стелс/прокси на операторе; CAPTCHA — стоп-кран |
  | `browserbase` | cloud | управляемый флот — тысячи конкуррентных стелс-CDP-сессий, управляемые residential-прокси + решение CAPTCHA + live-view/перехват; плата за сессию, данные идут через вендора |

  Self-hosted backend доступен всегда; облачный — `configured:true` только при заданном `BROWSERBASE_API_KEY` (+ `BROWSERBASE_PROJECT_ID`) — выбрать его без ключа = честный `BROWSERBASE_UNCONFIGURED`, сбой вендора = `BROWSERBASE_REQUEST_FAILED` (никогда не утёкший INTERNAL). Оба говорят по CDP, поэтому `browserBackendFor({provider})` меняет их **за тем же портом без правок ядра**. **Выбор — реальный, а не косметика:** `browser.session.open {provider:'browserbase', …}` открывает сессию на выбранном backend'е (облако без ключа → кодированный шов), `browser.session.liveView {provider}` инспектирует её, и даже AI **`shop.scan {shopUrl, browserProvider:'browserbase', provider, model}`** читает страницу магазина через выбранный backend. Поверх любого — **AI-актор в стиле Stagehand** — экспонирован как first-class операции **`browser.observe {sessionId, goal, browserProvider?, provider?, model?}`** и **`browser.act {…}`** на всех контурах — ведёт логин по живому снимку страницы через `llm.complete`, переживая дрейф DOM, и остаётся честным (`BROWSER_ACT_UNSUPPORTED` если у backend'а нет action-примитива, `AI_ACTOR_SNAPSHOT_UNSUPPORTED` если не может снять снимок), а не имитирует клик. Полное обоснование: [`research/login-architecture.md`](research/login-architecture.md).
- **Генерация (create).** Путь GENERATE — нативная регистрация на устройстве драйвером платформы (`signupVia`: phone/native/google), питается ресурсами верификации. Без инъектированного генератора — честный шов, никогда не фейк-аккаунт.
- **Верификация.** `VerificationResourceProvider` + `createHttpSmsVendor({endpoints, map})` арендуют номера / поллят SMS-коды через любой декларативный вендор (sms-activate/5sim/…). Ожидающий код возвращает `null` (вызывающий поллит); исчерпанная аренда — `VERIFICATION_CODE_TIMEOUT`, никогда не выдуманный код.
- **Персоны.** `persona.generate` производит связные личности (имя/хендл/био/ниша/локаль) для заполнения профилей.
- **Скоринг.** `scoring.score` оценивает аккаунт (возраст, прогрев, здоровье) или цель (подписчики, вовлечённость) для приоритизации работы.

## 13. Гайд по интеграции

Выбирай контур под своего вызывающего; все говорят с одним фасадом.

- **Из LLM-агента / автономного «мозга»:** подключайся по **MCP** (`/mcp`). Список tools (53 операция), их вызов, чтение ресурсов `acq://` для заземлённого контекста (RAG). Это целевой путь для агентного управления.
- **Из бэкенда / микросервиса:** **gRPC** (`:7550`, `Control.Execute`) для throughput, или **REST** (`/v1/op/:operation`) для простоты. Bearer-токен → роль.
- **Из другой агентной платформы:** **A2A** — забрать agent card, POST-ить таски. Стандартизованный agent-to-agent.
- **Из браузера / UI операторов:** встроенная **операторская панель** (`:7600`) — тонкая WCAG/CSP SPA над фасадом с **10 фичами**: accounts · pool · devices · campaigns · scrape · on-device селекторы · proxies · доменные метрики · email-идентичности (секреты вырезаны) · браузерные backend'ы (каждая — юнит-тестируемая чистая view-model); плюс **WebSocket** (`/v1/ws`) и **SSE** (`/v1/events`).
- **Из скриптов / CI / людей:** **CLI** (`acq <operation> k=v …`).
- **Из внешних систем, пушащих события:** **входящие вебхуки** (`/webhooks/inbound`, HMAC + защита от повторов).

Аутентификация везде: **bearer-токен** с ролью (`readonly`/`operator`/`admin`); каждый вызов валидируется (per-op yup-схема, отклонение неизвестных полей), проверяется RBAC, защищается `assertSafeArgs` (инъекции), аудируется и возвращается как `{data, error, meta}` с `correlationId`.

## 14. Безопасность, RBAC, мультитенантность

- **RBAC:** три роли гейтят каждую операцию; напр. чтения — `readonly`, мутации — `operator`, деструктив/конфиг — `admin`.
- **Защита от инъекций:** `assertSafeArgs` отклоняет аргументы вида operator-injection / prototype-pollution до запуска use-cases.
- **Секреты:** никогда в БД и логах. `SecretResolver` (сейчас env, подключаемый vault/KMS) резолвит ссылки `env:NAME` / `vault:…`; RAG/`account.status` вырезают `secretRefs`/`credentials` из каждой read-модели.
- **Аудит:** каждый вызов фасада записывается (с редактированием секретов) и трассируется по correlation-id сквозняком.
- **Транспорт:** helmet + rate-limiting на HTTP; HMAC + защита от повторов на входящих вебхуках; bearer-аутентификация на WS/gRPC/MCP.
- **Мультитенантность:** `tenantId` на каждом документе `Engine*`; все запросы ограничены тенантом.
- **Observability (TZ §15):** каждая операция фасада таймится, считается (метка outcome) и открывает **корневой span** трейса с id = correlationId — одна точка инструментирования для всех контуров. На `/metrics` (Prometheus) — счётчики фасада **плюс доменные сигналы**: глубина пула, occupancy + **saturation** устройств, глубина очередей, online/banned, **доля банов**, спенд закупок, капчи скрапа, глубина DLQ — питаются из снапшота реконсайлера, поэтому не расходятся. Дочерние span'ы: **device.runAction** и **vendor.shopRequest** (job → device-op → vendor-call). Читается со всех контуров: `metrics.domain`, `trace.recent`, `alerts.status` + RAG-ресурс `acq://metrics`. **SLO-алертинг/error-budget**: рост DLQ, падение online-доли, доля банов, saturation устройств, спенд-кап, circuit open вендора, прожиг бюджета ошибок.
- **Compliance (GDPR):** `compliance.export` (данные субъекта, секреты вырезаны) и `compliance.erase` (каскадное удаление аккаунта + производных, с аудитом) — admin-операции фасада на всех контурах.

## 15. Швы verify-by-fact

`@acq` полностью реализован и протестирован (юнит + Docker + вживую). Оставшиеся *швы* — это **кодированные честные fail-safe**, требующие реальных входных данных; это **не** заглушки и **не** пробелы:

| Шов (кодированная ошибка) | Разблокируется |
|---|---|
| `<PLATFORM>_SESSION_IMPORT_UNVERIFIED` / `_LOGIN_SCREEN_UNVERIFIED` | захват селекторов на устройстве под конкретную сборку приложения |
| `<PLATFORM>_CREDENTIALS_REQUIRED` | реальные креды/сессия аккаунта |
| `ACTION_NOT_CONFIRMED` | целевое приложение реально установлено+на переднем плане на клоне |
| `SHOP_SCANNER_UNAVAILABLE` | LLM API-ключ (`shop.scan`) |
| `VERIFICATION_VENDOR_UNCONFIGURED` | креды SMS/прокси-вендора |
| доступность raw-ADB/SSH | устройство, доступное для raw ADB / SSH-ADB-шлюз |

Каждый шов — это система, **отказывающаяся фейкать успех**: дай вход — и путь отрабатывает от начала до конца.

---

*Generated for the `@acq` platform. Single facade · 53 operations · 10 surfaces · 8 platforms · verify-by-fact throughout.*
