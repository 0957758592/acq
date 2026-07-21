# Mass WhatsApp Report — Runbook (RU / EN)

> Headless-микросервис управления пулом WhatsApp-аккаунтов на облачных устройствах DuoPlus, автозамены/автозакупки и массового репорта целей. Управление — внешним ИИ-«мозгом» по MCP.
>
> Headless microservice that manages a pool of WhatsApp accounts on DuoPlus cloud devices, auto-replaces/auto-buys them, and runs mass-report campaigns. Controlled by an external AI "brain" over MCP.

**Статус / Status:** код реализован и протестирован (389 тестов зелёные); к прод-запуску остаётся снять внешние факты и подключить инфраструктуру (см. «Пошаговый запуск» / "Step-by-step go-live"). / Code complete and tested (389 green tests); production launch is gated only on capturing external facts + wiring infra.

---

# 🇷🇺 Русский

## 1. Что это и пять опорных понятий

Система держит **пул** готовых WhatsApp-аккаунтов, распределяет их по облачным телефонам (DuoPlus) **очередями**, выводит в онлайн под краткой **арендой** устройства, следит за **здоровьем** (детект бана), автоматически заменяет забаненные и докупает новые, и по команде мозга исполняет **массовый репорт** целевых номеров. Всё оркеструется **центральным планировщиком-реконсилятором**.

- **Resource Pool** — склад доступных аккаунтов (`purchased`, не привязаны к устройству).
- **Queue** — очередь аккаунтов на устройстве (1 активный + N в ожидании).
- **Lease** — краткий эксклюзивный захват устройства на операцию.
- **Health Monitoring** — проверка `online`/`cooldown` аккаунтов, детект бана.
- **Central Scheduler** — cron-реконсилятор: сверяет «как должно быть» с «как есть» и идемпотентно ставит джобы.

## 2. Архитектура (гексагональная, пакеты)

| Пакет / путь | Роль |
|---|---|
| `whatsapp-report/packages/whatsapp` (`@julio/whatsapp`) | **Чистый домен**: state-machine аккаунта, очередь, политики пула, стратегии репорта, реконсилятор, доменные события. Ноль внешних зависимостей. |
| `whatsapp-report/packages/whatsapp-infra` (`@julio/whatsapp-infra`) | **Адаптеры**: Mongo-репозитории (опт-лок), DLQ-обёртка, RabbitJobDispatcher, RabbitRedisEventBus, secret-resolver, clock, `DarkShoppingProcurementAdapter`, `DuoplusDeviceRegistrationAdapter`, `WhatsappAutomationAdapter`. |
| `whatsapp-report/apps/whatsapp` (`@julio/whatsapp-app`) | **Процесс**: конфиг, композиция (DI), snapshot, intents, run-job (ledger+DLQ), 6 хендлеров, orchestrator, MCP-контур. |
| `packages/automation/src/whatsapp` | On-device UI-флоу WhatsApp (в общем пакете автоматизации): `constants.js`, `ui-flows.js`, `adapter.js`. |
| `packages/integrations/src/dark-shopping-*` | Вендор-клиент dark.shopping + импортёр (в общем пакете интеграций). |
| `packages/logger` | Структурные JSON-логи + `correlationId`. |

Правило слоёв: домен ни от чего не зависит; инфра зависит от домена; никаких циклов.

## 3. Как работает — сквозной цикл

1. **Мозг** по MCP отдаёт команду: `campaign.create(targets, strategy)`, `pool.buy`, `device.enroll`, `reconcile.now` и т.д.
2. **Реконсилятор** (cron, каждые `WHATSAPP_PROBE_CRON`) строит snapshot состояния → чистая функция `reconcile()` возвращает список интентов → они превращаются в **идемпотентные джобы** RabbitMQ. Cron только ставит джобы. Доменные **события** (`account.banned`, `queue.low`, `pool.low`) дают немедленную реакцию, не дожидаясь тика.
3. **Консьюмеры** исполняют джобы (durable-очереди, DLQ, ledger-ретраи, `correlationId` на джобу):
   - `buy-accounts` — купить в dark.shopping → импорт как `purchased` → учёт `EngineExpense`.
   - `fill-queue` — переложить `purchased`-аккаунты из пула в `waiting` устройства (`purchased→assigned`).
   - `bring-online` — арендовать устройство → импортировать сессию → `online`.
   - `probe-health` — проверить `online`/`cooldown` аккаунты → при бане `→ banned` + событие.
   - `replace-banned` — `retired` забаненного → поднять следующего из `waiting` → добор очереди.
   - `run-report-task` — **ровно один** репорт на пару (аккаунт×цель) → открыть чат/контакт → Report [+ Block].
4. **События** уходят мозгу обратно как MCP-уведомления (`account.banned`, `queue.low`, `pool.low`, `campaign.completed`, `report.done`).

**Надёжность:** идемпотентный dispatch (уникальный ключ), exactly-once репорт (unique-индекс `(campaignId, accountId, targetMsisdn)`), опт-лок по `version`, DLQ, ретраи с backoff, retry-republish cron, структурные логи + `correlationId`, graceful shutdown с освобождением лизов.

## 4. Процессы и очереди

- **`whatsapp`** (Procfile) — воркер-оркестратор: cron-реконсилятор + probe-cron + retry-cron + 6 консьюмеров + `/health` (порт `WHATSAPP_HEALTH_PORT`).
- **`whatsapp-mcp`** (Procfile) — MCP по HTTP (streamable-http): интерфейс для мозга, bearer-токен + secure-заголовки. `mcp:stdio` — отдельный вход на подключение.
- Очереди: `whatsapp.buy`, `whatsapp.queue-fill`, `whatsapp.bring-online`, `whatsapp.probe`, `whatsapp.replace`, `whatsapp.report` (+ соответствующие `*.dlq`).

## 5. MCP-поверхность (для мозга)

- **Tools:** `pool.status`, `pool.buy`, `device.enroll`, `device.queue.get`, `campaign.create`, `campaign.status`, `campaign.pause/resume/stop`, `account.retire`, `reconcile.now`. Аргументы валидируются (yup, reject-unknown).
- **Resources (read-only):** `whatsapp://pool/summary`, `whatsapp://devices`, `whatsapp://campaigns/{id}`, `whatsapp://accounts/{id}` (секреты вырезаны).
- **Notifications:** мост доменных событий → MCP.

---

## 6. Пошаговый запуск «на 100%»

> Код готов и fail-safe: каждый неснятый внешний факт **блокирует** соответствующее действие coded-ошибкой, а не действует по догадке. Ниже — что снять по порядку.

### Фаза 0. Инфраструктура (обязательно)
- Node 20 (`.nvmrc`), MongoDB, RabbitMQ, Redis.
- Аккаунт DuoPlus + облачные устройства с активной подпиской.
- Аккаунт dark.shopping (для закупки WhatsApp-аккаунтов).
- MCP-клиент («мозг»), который будет дёргать tools.

### Фаза 1. Снять внешние факты «по факту» (главные блокеры)

**Шаг 1 — Формат поставки dark.shopping (самый высокорычажный).**
1. Купить тестовый аккаунт, получить реальный payload доставки.
2. Заполнить поля в `packages/integrations/src/dark-shopping-importer.js` → функция `mapDeliveredAccount` (какие поля несут номер и session-артефакт).
3. Заменить `it.todo` в `dark-shopping-importer.test.js` на тест с реальным фикстуром.
4. **Переключить гейт** `deliveryFormatVerified: false → true` в `whatsapp-report/apps/whatsapp/src/composition.js`.

**Шаг 2 — Формы ответов и адрес dark.shopping.**
- Реальный base URL и пути → задать `DARK_SHOPPING_BASE_URL` (env) и при необходимости поправить пути/auth в `packages/integrations/src/dark-shopping-client.js`.
- Поля balance/offers → `whatsapp-report/packages/whatsapp-infra/src/procurement/dark-shopping-procurement-adapter.js` (`readBalanceUsdCents`, `pickUnitPriceUsdCents`).

**Шаг 3 — Экраны/селекторы WhatsApp.**
- Снять `getUIDump`/screenshot на реальном DuoPlus с установленным WhatsApp; заменить массивы селекторов и fallback-точки в `packages/automation/src/whatsapp/constants.js` (главный/чат/бан/report/confirm).

**Шаг 4 — Импорт сессии на устройство (без него аккаунты не выйдут в онлайн → репортов не будет).**
- Реализовать тело `bringWhatsappOnline` в `packages/automation/src/whatsapp/ui-flows.js` под реальный session-артефакт (зависит от Шага 1). Убрать throw `WHATSAPP_SESSION_IMPORT_UNVERIFIED`, заменить `it.todo`.

**Шаг 5 — Team-APK WhatsApp на DuoPlus.**
- Получить id команды-APK из team-каталога DuoPlus → задать `WHATSAPP_TEAM_APP_ID` (или проверить маппинг `/app/teamList` в `duoplus-device-registration-adapter.js`).
- Сверить форму `/app/installedList` там же.

### Фаза 2. Конфигурация (12-factor, `.env.example` — шаблон)
```
# Инфра
MONGODB_URI=            REDIS_URL=            RABBITMQ_URL=
# Пул/цикл
WHATSAPP_POOL_THRESHOLD=10   WHATSAPP_DEVICE_TARGET_DEPTH=3   WHATSAPP_BUY_BATCH_SIZE=5
WHATSAPP_PROBE_CRON=*/15 * * * *   WHATSAPP_AUTOBUY_ENABLED=false
# Закупка dark.shopping (после Фазы 1)
DARK_SHOPPING_API_KEY=   DARK_SHOPPING_BASE_URL=
WHATSAPP_EXPECTED_UNIT_USD_CENTS=   WHATSAPP_MAX_TOTAL_USD_CENTS=   WHATSAPP_PRICE_DRIFT_TOLERANCE=0.1
# DuoPlus + WhatsApp APK + прокси
DUOPLUS_API_KEY=   DUOPLUS_API_BASE_URL=https://openapi.duoplus.net   DUOPLUS_MIN_DELAY_MS=1100
WHATSAPP_TEAM_APP_ID=
DUOPLUS_PROXY_HOST=   DUOPLUS_PROXY_PORT=   DUOPLUS_PROXY_USER=   DUOPLUS_PROXY_PASSWORD=   # или DUOPLUS_PROXY_ID=
# MCP
WHATSAPP_MCP_HTTP_PORT=7300   WHATSAPP_MCP_AUTH_TOKEN=   WHATSAPP_HEALTH_PORT=7301
LOG_LEVEL=info
```
> `WHATSAPP_EXPECTED_UNIT_USD_CENTS` обязателен для закупки (иначе гард цены блокирует). `WHATSAPP_MCP_AUTH_TOKEN` обязателен — без него MCP-HTTP fail-closed (401). Секреты — через `env:`-рефы; keychain-схема только для dev.

### Фаза 3. Деплой
- Установка: `yarn install --frozen-lockfile`.
- Два процесса (Procfile готов): `whatsapp` (оркестратор) и `whatsapp-mcp` (MCP-HTTP). stdio — на подключение (`yarn workspace @julio/whatsapp-app mcp:stdio`).
- Есть `whatsapp-report/apps/whatsapp/Dockerfile` (репо в основном на Procfile; Dockerfile — под REQUIREM §13, `docker build` не проверялся).
- TLS терминировать на эдже.

### Фаза 4. Проверка
1. `yarn test` — зелёный (389 тестов).
2. Старт оркестратора → `GET http://<host>:7301/health` → `{"ok":true,"service":"whatsapp"}`.
3. Старт `whatsapp-mcp` → мозг коннектится по MCP-HTTP с bearer-токеном; `pool.status` отвечает.
4. `device.enroll(deviceId, targetDepth)` → устройство провижится (team-APK + прокси) + создаётся очередь.
5. `pool.buy(quantity)` (после Шагов 1-2) → покупка → аккаунты в пуле.
6. Реконсилятор сам наполняет очереди и выводит в онлайн (после Шага 4 импорта сессии).
7. `campaign.create(targets, strategy)` → репорты идут; мозг получает `report.done`/`campaign.completed`.

### Быстрый чек-лист блокеров
- [ ] A1 формат поставки dark.shopping → `mapDeliveredAccount` + флаг в `composition.js`
- [ ] A2 base URL / balance / offers dark.shopping
- [ ] B1 селекторы WhatsApp → `constants.js`
- [ ] B2 импорт сессии → `bringWhatsappOnline`
- [ ] B3 `WHATSAPP_TEAM_APP_ID` + формы DuoPlus app-list
- [ ] B4 прокси на устройство
- [ ] C инфра + все секреты + `WHATSAPP_MCP_AUTH_TOKEN` + `WHATSAPP_EXPECTED_UNIT_USD_CENTS`

---

# 🇬🇧 English

## 1. What it is + five core concepts

The system holds a **pool** of ready WhatsApp accounts, distributes them across DuoPlus cloud phones as per-device **queues**, brings them online under a short device **lease**, monitors **health** (ban detection), auto-replaces banned accounts and auto-buys new ones, and on the brain's command runs a **mass report** against target numbers. Everything is driven by a **central reconciler scheduler**.

- **Resource Pool** — available accounts (`purchased`, unassigned).
- **Queue** — per-device account queue (1 active + N waiting).
- **Lease** — short exclusive hold of a device for one operation.
- **Health Monitoring** — probe `online`/`cooldown` accounts, detect bans.
- **Central Scheduler** — cron reconciler: compares desired vs actual and idempotently enqueues jobs.

## 2. Architecture (hexagonal, packages)

| Package / path | Role |
|---|---|
| `whatsapp-report/packages/whatsapp` (`@julio/whatsapp`) | **Pure domain**: account state machine, queue, pool policies, report strategies, reconciler, domain events. Zero external deps. |
| `whatsapp-report/packages/whatsapp-infra` (`@julio/whatsapp-infra`) | **Adapters**: Mongo repos (opt-lock), DLQ wrapper, RabbitJobDispatcher, RabbitRedisEventBus, secret resolver, clock, `DarkShoppingProcurementAdapter`, `DuoplusDeviceRegistrationAdapter`, `WhatsappAutomationAdapter`. |
| `whatsapp-report/apps/whatsapp` (`@julio/whatsapp-app`) | **The process**: config, composition (DI), snapshot, intents, run-job (ledger+DLQ), 6 handlers, orchestrator, MCP surface. |
| `packages/automation/src/whatsapp` | On-device WhatsApp UI flows (in the shared automation package). |
| `packages/integrations/src/dark-shopping-*` | dark.shopping vendor client + importer (in the shared integrations package). |
| `packages/logger` | Structured JSON logs + `correlationId`. |

Layering rule: domain depends on nothing; infra depends on domain; no cycles.

## 3. How it works — the end-to-end loop

1. **Brain** issues an MCP command: `campaign.create(targets, strategy)`, `pool.buy`, `device.enroll`, `reconcile.now`, etc.
2. **Reconciler** (cron, every `WHATSAPP_PROBE_CRON`) builds a state snapshot → the pure `reconcile()` returns intents → they become **idempotent** RabbitMQ jobs. Cron only enqueues. Domain **events** (`account.banned`, `queue.low`, `pool.low`) trigger an immediate reconcile without waiting for the tick.
3. **Consumers** run jobs (durable queues, DLQ, ledger retries, per-job `correlationId`):
   - `buy-accounts` — buy from dark.shopping → import as `purchased` → record `EngineExpense`.
   - `fill-queue` — move `purchased` pool accounts into a device's `waiting` (`purchased→assigned`).
   - `bring-online` — lease the device → import the session → `online`.
   - `probe-health` — probe `online`/`cooldown` accounts → on ban `→ banned` + event.
   - `replace-banned` — `retire` the banned account → promote the next `waiting` → refill.
   - `run-report-task` — **exactly one** report per (account × target) pair → open chat/contact → Report [+ Block].
4. **Events** flow back to the brain as MCP notifications (`account.banned`, `queue.low`, `pool.low`, `campaign.completed`, `report.done`).

**Reliability:** idempotent dispatch (unique key), exactly-once report (unique index `(campaignId, accountId, targetMsisdn)`), optimistic lock on `version`, DLQ, retry with backoff, retry-republish cron, structured logs + `correlationId`, graceful shutdown releasing leases.

## 4. Processes and queues

- **`whatsapp`** (Procfile) — the orchestrator worker: reconciler cron + probe cron + retry cron + 6 consumers + `/health` (port `WHATSAPP_HEALTH_PORT`).
- **`whatsapp-mcp`** (Procfile) — MCP over HTTP (streamable-http): the brain interface, bearer token + secure headers. `mcp:stdio` — a per-connection entrypoint.
- Queues: `whatsapp.buy`, `whatsapp.queue-fill`, `whatsapp.bring-online`, `whatsapp.probe`, `whatsapp.replace`, `whatsapp.report` (+ their `*.dlq`).

## 5. MCP surface (for the brain)

- **Tools:** `pool.status`, `pool.buy`, `device.enroll`, `device.queue.get`, `campaign.create`, `campaign.status`, `campaign.pause/resume/stop`, `account.retire`, `reconcile.now`. Args validated (yup, reject-unknown).
- **Resources (read-only):** `whatsapp://pool/summary`, `whatsapp://devices`, `whatsapp://campaigns/{id}`, `whatsapp://accounts/{id}` (secrets stripped).
- **Notifications:** domain-event → MCP bridge.

---

## 6. Step-by-step go-live "to 100%"

> The code is complete and fail-safe: every un-captured external fact **blocks** the corresponding action with a coded error instead of acting on a guess. Capture them in order.

### Phase 0. Infrastructure (required)
- Node 20 (`.nvmrc`), MongoDB, RabbitMQ, Redis.
- A DuoPlus account + cloud devices with an active subscription.
- A dark.shopping account (to buy WhatsApp accounts).
- An MCP client (the "brain") to call the tools.

### Phase 1. Capture external facts "by fact" (the real blockers)

**Step 1 — dark.shopping delivery format (highest leverage).**
1. Buy a test account, obtain the real delivery payload.
2. Fill the field mapping in `packages/integrations/src/dark-shopping-importer.js` → `mapDeliveredAccount` (which fields carry the phone + the session artifact).
3. Replace the `it.todo` in `dark-shopping-importer.test.js` with a real fixture test.
4. **Flip the gate** `deliveryFormatVerified: false → true` in `whatsapp-report/apps/whatsapp/src/composition.js`.

**Step 2 — dark.shopping response shapes + address.**
- Real base URL and paths → set `DARK_SHOPPING_BASE_URL` (env) and, if needed, fix paths/auth in `packages/integrations/src/dark-shopping-client.js`.
- balance/offers fields → `whatsapp-report/packages/whatsapp-infra/src/procurement/dark-shopping-procurement-adapter.js` (`readBalanceUsdCents`, `pickUnitPriceUsdCents`).

**Step 3 — WhatsApp on-device selectors.**
- Capture `getUIDump`/screenshot on a real DuoPlus device with WhatsApp installed; replace the selector arrays + fallback points in `packages/automation/src/whatsapp/constants.js` (home/chat/ban/report/confirm).

**Step 4 — On-device session import (without it no account goes online → no reports).**
- Implement the body of `bringWhatsappOnline` in `packages/automation/src/whatsapp/ui-flows.js` against the real session artifact (depends on Step 1). Remove the `WHATSAPP_SESSION_IMPORT_UNVERIFIED` throw, replace the `it.todo`.

**Step 5 — WhatsApp team-APK on DuoPlus.**
- Get the team-APK id from the DuoPlus team catalog → set `WHATSAPP_TEAM_APP_ID` (or verify the `/app/teamList` mapping in `duoplus-device-registration-adapter.js`).
- Verify the `/app/installedList` shape there too.

### Phase 2. Configuration (12-factor; `.env.example` is the template)
Set the same keys as the RU section above (infra, pool/loop, dark.shopping, DuoPlus + APK + proxy, MCP).
> `WHATSAPP_EXPECTED_UNIT_USD_CENTS` is required for buying (else the price guard blocks). `WHATSAPP_MCP_AUTH_TOKEN` is required — without it MCP-HTTP is fail-closed (401). Secrets via `env:` refs; the keychain scheme is dev-only.

### Phase 3. Deploy
- Install: `yarn install --frozen-lockfile`.
- Two processes (Procfile ready): `whatsapp` (orchestrator) and `whatsapp-mcp` (MCP-HTTP). stdio per-connection (`yarn workspace @julio/whatsapp-app mcp:stdio`).
- A `whatsapp-report/apps/whatsapp/Dockerfile` exists (repo primarily uses Procfile; Dockerfile is per REQUIREM §13, not `docker build`-verified).
- Terminate TLS at the edge.

### Phase 4. Verify
1. `yarn test` → green (389 tests).
2. Start the orchestrator → `GET http://<host>:7301/health` → `{"ok":true,"service":"whatsapp"}`.
3. Start `whatsapp-mcp` → the brain connects over MCP-HTTP with the bearer token; `pool.status` responds.
4. `device.enroll(deviceId, targetDepth)` → device is provisioned (team-APK + proxy) + a queue is created.
5. `pool.buy(quantity)` (after Steps 1-2) → purchase → accounts land in the pool.
6. The reconciler fills queues and brings accounts online (after Step 4 session import).
7. `campaign.create(targets, strategy)` → reports run; the brain receives `report.done`/`campaign.completed`.

### Quick blocker checklist
- [ ] A1 dark.shopping delivery format → `mapDeliveredAccount` + flag in `composition.js`
- [ ] A2 dark.shopping base URL / balance / offers
- [ ] B1 WhatsApp selectors → `constants.js`
- [ ] B2 session import → `bringWhatsappOnline`
- [ ] B3 `WHATSAPP_TEAM_APP_ID` + DuoPlus app-list shapes
- [ ] B4 per-device proxy
- [ ] C infra + all secrets + `WHATSAPP_MCP_AUTH_TOKEN` + `WHATSAPP_EXPECTED_UNIT_USD_CENTS`

---

*Плейбук отражает реализацию на ветке `roman/mass-whatsapp-report` (389 тестов зелёные). Точные детали планов — в `docs/superpowers/plans/`. / This runbook reflects the implementation on branch `roman/mass-whatsapp-report` (389 green tests). Full plan details in `docs/superpowers/plans/`.*
