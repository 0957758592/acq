# Mass WhatsApp Report — Plan 3: Procurement (dark.shopping)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buy WhatsApp accounts from dark.shopping and import them into the pool as `purchased` accounts, with price/balance guards and `EngineExpense` accounting — via a pluggable `ProcurementPort` adapter and port-injected `buy-accounts`/`replenish-pool` use-cases.

**Architecture:** Ports & Adapters. A new vendor client + importer live in the shared `@julio/integrations` package (mirroring `DjekxaClient`/`DjekxaImporter`). The `DarkShoppingProcurementAdapter` (in `@julio/whatsapp-infra`) implements the domain `ProcurementPort`. Pure `buyAccounts`/`replenishPool` use-cases live in `@julio/whatsapp/application` and depend only on ports.

**Tech Stack:** Node 18/20 ESM, global `fetch` (no axios), Jest. No TypeScript/zod.

**Depends on:** Plan 1 (domain/ports), Plan 2 (`@julio/whatsapp-infra`: `MongoAccountRepo`, models, `systemClock`).

**Source spec:** design §2(1), §6-A, §7, §14; REQUIREM §9 (external APIs), §10.

**Commit trailer:** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Grounding facts (verified — do not re-derive)

- **`IntegrationHttpClient`** (`packages/integrations/src/http-client.js`): `constructor({ baseUrl='', headers={}, fetchImpl=globalThis.fetch })`, `request(path, { method='GET', body=null, headers={} })`. **No** timeout, retry, backoff, circuit-breaker, and **no** `get()`/`post()` helpers. Auth is injected via the `headers` option (subclass passes `Authorization`). On `!ok` throws `Error(data?.message || 'Integration request failed')` with `.status`, `.details`.
- **`DjekxaClient`** (`packages/integrations/src/djekxa-client.js`) is the template: `constructor({ apiKey, baseUrl='...' })` (throws if `!apiKey`), builds `this.http = new IntegrationHttpClient({ baseUrl, headers:{ Authorization:\`Bearer ${apiKey}\` } })`, methods `getBalance()`, `listProducts(params)`, `createOrder(payload)`, `getOrder(id)`, and `fetchCredentialFile(url)` which **bypasses** the JSON client and does a raw `fetch(url).then(r=>r.text())` (delivery artifacts are not JSON). `llm-client.js` shows the `create<Vendor>Client({apiKey})` factory-with-default-baseUrl idiom.
- **`DjekxaImporter`** (`packages/integrations/src/djekxa-importer.js`): pure parse/normalize; **does NOT touch the DB**. `parseCredentialFile(text)`, `importOrder(order)` → `{ externalOrderId, status, totalRub, totalUsdCents, importedAccounts[], rawOrder }`. Persistence lives in the worker handler `apps/worker/src/handlers/procurement.handler.js` (`persistImport`, `createLiveOrder`).
- **Price/balance guards** (`createLiveOrder`, procurement.handler.js) — the exact sequence to mirror: (1) live price drift >10% → throw; (2) `liveTotal > maxTotalRub` → throw; (3) `client.getBalance()` and `liveTotal > available` → throw; only then `createOrder`.
- **`EngineExpense`** (`apps/api/src/models/engine-finance.model.js`, `@julio/api/models/engine-finance`): `{ category, provider, amountCents, currency='USD', description, accountId, deviceId, externalReference, incurredAt, metadata }`. Recorded via `findOneAndUpdate({ provider, externalReference }, {...}, { upsert:true })` only when `amountCents > 0`.
- **Config** (`@julio/config`): `rules.optionalString()`/`optionalNumber(default)`. Precedent `DJEKXA_API_KEY`/`DJEKXA_BASE_URL`/`DJEKXA_FX_RUB_PER_USD: optionalNumber(90)`. New keys `DARK_SHOPPING_API_KEY`/`DARK_SHOPPING_BASE_URL` go in the whatsapp app env (Plan 5) but the adapter reads them from injected config.
- **Domain `ProcurementPort`** (`whatsapp-report/packages/whatsapp/src/ports/index.js`): `getBalance() → { balanceUsdCents }`, `listOffers() → Array`, `purchase(quantity) → { orderId }`, `fetchDelivered(order) → PurchasedAccount[]` where `PurchasedAccount = { msisdn, source, secretRefs }`.
- **`@julio/integrations` layout:** flat — one `<vendor>-client.js` (+ `<vendor>-importer.js`) per vendor, all re-exported from `src/index.js`.

### ⚠️ EXTERNAL UNKNOWN — the delivery format (design §16)
dark.shopping returns a **WhatsApp session** (registered number + session/multi-device keys or a session archive), **not** an IG/TikTok combolist line. What fields it returns, and whether inline in the order JSON or as a downloadable file, is **not knowable from code** and must be **verified by fact** at implementation. Consequence: the client scaffolding, guard sequence, expense accounting, and env wiring below are built now; the importer's field-mapping (`mapDeliveredAccount`) is implemented against the **real observed payload** — until then it is a single, clearly-marked function with a failing contract test and a `PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED` guard so it cannot silently ship a wrong mapping (no mock/stub in prod path).

**File structure:**
- `packages/integrations/src/dark-shopping-client.js` (+ test), `dark-shopping-importer.js` (+ test); modify `packages/integrations/src/index.js`
- `whatsapp-report/packages/whatsapp-infra/src/procurement/dark-shopping-procurement-adapter.js` (+ test); `src/procurement/expense-recorder.js` (+ test)
- `whatsapp-report/packages/whatsapp/src/application/buy-accounts.js` (+ test), `replenish-pool.js` (+ test); modify domain `src/index.js` barrel

---

### Task 1: `DarkShoppingClient` (mirror `DjekxaClient`)

**Files:** `packages/integrations/src/dark-shopping-client.js` (+ test); modify `src/index.js`.

- [ ] **Step 1: Failing test** — inject a fake `fetchImpl` (records URL/method/headers, returns canned JSON) and assert: constructor throws without `apiKey`; `getBalance()` GETs `/balance` with `Authorization: Bearer <key>`; `listOffers()` GETs the offers path; `purchase(3)` POSTs the order path with `{ quantity: 3 }`; `getOrder(id)` GETs `/orders/:id`; `fetchDelivered({ orderId })` calls the delivery endpoint. Use the DjekxaClient test as the shape reference.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — `constructor({ apiKey, baseUrl = 'https://dark.shopping/api' })` (⚠️ confirm the REAL base URL at implementation), `this.http = new IntegrationHttpClient({ baseUrl, headers:{ Authorization:\`Bearer ${apiKey}\` } })`; methods delegate to `this.http.request(path, { method, body })`; `fetchDelivered` mirrors `fetchCredentialFile` (raw fetch if the delivery is a file URL). Export `class DarkShoppingClient` + `createDarkShoppingClient({ apiKey, baseUrl })`.
  > **NO timeout/retry exists in the base client.** REQUIREM §9 wants timeout + retry-with-backoff + circuit-breaker for external APIs. Add a small `withTimeout`/retry wrapper **in this client** (net-new; there's no repo precedent) OR document the gap explicitly. Recommended: wrap `request` with an `AbortController` timeout (default 15s) and a 3-try exponential backoff on 5xx/network — implemented and unit-tested here, reusable by future vendors.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(integrations): dark.shopping client (+ timeout/retry wrapper)`.

---

### Task 2: `DarkShoppingImporter` (parse/normalize — delivery-format seam)

**Files:** `packages/integrations/src/dark-shopping-importer.js` (+ test); modify `src/index.js`.

- [ ] **Step 1: Failing test** — `importDelivered(rawDelivery)` returns `PurchasedAccount[]` (`{ msisdn, source:'dark_shopping', secretRefs }`). Since the real format is unknown, the test encodes the **contract shape** and asserts that an unverified/unknown payload throws `PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED` (so nothing ships a guessed mapping). Include a second, skipped (`it.todo`) test named "maps the REAL dark.shopping delivery payload once observed".
- [ ] **Step 2:** FAIL. **Step 3: Implement** — `importDelivered(raw, { verifiedFormat = false })`: if `!verifiedFormat` throw `domainError('PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED', ...)`. A single `mapDeliveredAccount(item)` function is the ONE place to fill in once the format is observed; it must `normalizeMsisdn(...)` the number (reuse `@julio/whatsapp`) and place session artifacts under `secretRefs` (never inline secrets). Add a header comment: "IMPLEMENT `mapDeliveredAccount` against the real payload; flip `verifiedFormat` default to true only after a live capture is added to the test."
- [ ] **Step 4:** PASS (throws as designed). **Step 5:** Commit `feat(integrations): dark.shopping importer (delivery-format seam, guarded)`.

---

### Task 3: `expense-recorder` (EngineExpense accounting)

**Files:** `whatsapp-report/packages/whatsapp-infra/src/procurement/expense-recorder.js` (+ test).

- [ ] **Step 1: Failing test** — inject a fake `EngineExpense` model; `recordPurchaseExpense({ externalReference, amountUsdCents, quantity })` calls `findOneAndUpdate({ provider:'dark_shopping', externalReference }, { $set:{ category:'account', amountCents, currency:'USD', ... } }, { upsert:true })` **only when `amountUsdCents > 0`**; a zero amount records nothing.
- [ ] **Step 2:** FAIL. **Step 3: Implement** mirroring `persistImport`'s expense upsert, importing `EngineExpense` from `@julio/api/models/engine-finance`. **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): dark.shopping expense recorder`.

---

### Task 4: `DarkShoppingProcurementAdapter` (ProcurementPort + guards)

**Files:** `whatsapp-report/packages/whatsapp-infra/src/procurement/dark-shopping-procurement-adapter.js` (+ test).

Implements the domain `ProcurementPort` and encodes the Djekxa guard sequence.

- [ ] **Step 1: Failing test** — inject a fake `client`; assert: `getBalance()` maps vendor balance → `{ balanceUsdCents }`; `purchase(qty)` runs the guards in order (price-drift >10% throws `PROCUREMENT_PRICE_DRIFT`; `liveTotal > maxTotalUsdCents` throws `PROCUREMENT_MAX_TOTAL_EXCEEDED`; insufficient balance throws `PROCUREMENT_INSUFFICIENT_BALANCE`) then calls `client.purchase(qty)` → `{ orderId }`; `fetchDelivered(order)` → `client.fetchDelivered` → `importer.importDelivered`.
- [ ] **Step 2:** FAIL. **Step 3: Implement** `createDarkShoppingProcurementAdapter({ client, importer, config })` returning the port object; guard thresholds come from `config` (`maxTotalUsdCents`, `priceDriftTolerance=0.1`). Throw coded `domainError`s. **Step 4:** PASS. **Step 5:** Commit `feat(whatsapp-infra): DarkShoppingProcurementAdapter (ProcurementPort + guards)`.

---

### Task 5: `buyAccounts` + `replenishPool` application use-cases (pure, port-injected)

**Files:** `whatsapp-report/packages/whatsapp/src/application/buy-accounts.js`, `replenish-pool.js` (+ tests); modify domain `src/index.js`.

These are the first files in the domain package's `application/` layer. They depend only on **ports** (no concrete infra), so the pure package keeps zero runtime deps.

- [ ] **Step 1: Failing test (buy-accounts)** — inject fake ports `{ procurement, accountRepo, expenseRecorder, clock }`. `buyAccounts({ quantity }, deps)`: calls `procurement.purchase(quantity)`, `procurement.fetchDelivered(order)`, persists each `PurchasedAccount` via `accountRepo.insertPurchased(...)` (new repo method — add to Plan 2's `MongoAccountRepo` or here as a port method), records the expense once, and is **idempotent by `orderId`** (a second call with the same order does not double-insert). Assert the calls and idempotency.
- [ ] **Step 2:** FAIL. **Step 3: Implement** as a pure async function taking `deps`. Encode idempotency: check `accountRepo.find({ 'metadata.orderId': order.orderId })` before inserting (mirrors the engine's `existingOrderIds` set). **Step 4:** PASS.
- [ ] **Step 6: replenish-pool** — `replenishPool(deps)`: `available = await accountRepo.countAvailable()`; if `needsReplenish({ available, threshold })` dispatch a buy via `jobDispatcher.dispatch('whatsapp.buy', { jobName:'buy-accounts', payload:{ quantity: buyQuantity(...) } }, { idempotencyKey })` (reuse the Plan-1 `needsReplenish`/`buyQuantity`). Test with fake dispatcher. Commit `feat(whatsapp): buy-accounts + replenish-pool use-cases`.

> **Note:** `insertPurchased(accounts)` (bulk insert of brand-new `version:0` accounts) belongs on `AccountRepo` — add it to `MongoAccountRepo` (Plan 2) as a follow-up task referenced here, OR include it as Task 5b in this plan. Keep the method name identical across the port typedef, the Mongo repo, and the fake used in tests.

---

## Self-Review (Plan 3)

**Spec coverage:** vendor client (§14) → T1; importer/delivery (§6-A, §16) → T2; expense (§14) → T3; adapter+guards (§6-A) → T4; buy/replenish wiring (§6-A) → T5. **External unknown** (dark.shopping format) is isolated to `mapDeliveredAccount` + a hard `..._UNVERIFIED` guard — no guessed mapping ships. **Reuse:** `IntegrationHttpClient`, `EngineExpense`, `normalizeMsisdn`, `needsReplenish`/`buyQuantity`, `MongoAccountRepo`.

**Placeholder scan:** the delivery-format seam is a deliberate, guarded stub (not a silent placeholder) with a failing contract test and an `it.todo` for the live capture. The base URL is flagged for confirmation. **Type consistency:** `PurchasedAccount = { msisdn, source, secretRefs }` matches the port typedef; `insertPurchased`/`countAvailable` names match Plan 2. **Deferred:** the buy-accounts/probe job handlers that consume `whatsapp.buy` are wired in Plan 5.
