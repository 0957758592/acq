# @acq — Universal Account & Device Lifecycle Platform

Self-contained platform that **buys (or generates) accounts across many shops, provisions them onto cloud-phone devices from many providers, keeps a healthy pool, and runs mass actions and scraping at scale** — centralized, modular, horizontally scalable, controlled by an AI brain over MCP, or via CLI / HTTP-API / npm.

**Status:** the **generic engine is live** — one platform-agnostic reconciler + queue consumers **self-drive every account type** off real Mongo state (acquire → enroll → assign → bring-online → campaigns → probe → replace), exposed through a **single command facade** (34 operations) over **10 control surfaces** (REST · MCP-over-HTTP · WebSocket · GraphQL · A2A · gRPC · CLI · SSE · inbound webhooks · RAG). **WhatsApp** (mass report) remains the most complete reference vertical. **1005 tests green** (187 suites) plus live suites against real Mongo/RabbitMQ/Redis, a **real headless-Chromium** browser-scrape run, and a full live verification of every surface + all 8 account types + the full account workflow on a **real cloud phone**. Unknown external facts (per-shop delivery/auth, on-device selectors, session-import, some platform logins) stay **verify-by-fact seams** — fail-safe coded errors, never guesses. The full design is the foundational spec **`docs/TZ.md`** (local design doc, kept out of git by design).

> `docs/` (the TZ, runbook, plans, REQUIREM) is intentionally **not tracked in git** — it is the working design corpus. This README is the tracked entry point.
>
> 📖 **[`complete-workflow.md`](complete-workflow.md)** — the maximally complete, bilingual (EN/RU) end-to-end guide: what the platform does and why, the full account workflow with a worked example, per-account-type playbooks (all 8), every management surface with call examples, device connect/disconnect/control, proxy, browser parsing, and how to run & integrate.

---

## 🇬🇧 English

### The four axes of universality
Adding a value on any axis is a plugin — **no core changes** (Open/Closed):

| Axis | Values (extensible) | Abstraction |
|---|---|---|
| **Platform** | whatsapp, telegram, discord, tiktok, instagram, facebook, gmail, youtube | `PlatformDriver` + `PlatformCapabilities` registry |
| **Device provider** | duoplus, vmos, geelark, matt-duo, redfinger, ugphone, morelogin, genymotion, emulators (ldplayer/mumu/bluestacks) & physical ADB farms — **+ any other** | `DeviceProvider` + `Controller` |
| **Shop** | dark.shopping, djekxa.ru, accfarm, accsmarket, … — **+ any by URL** | `PurchaseAdapter` (declarative `ShopAdapterSpec` + engine) |
| **How to get an account** | purchase, on-device generation (gmail / google-auth) | `AcquisitionSource` (`purchase | generate`) |
| **Proxy provider** | vmos-dynamic, 922proxy, iproyal, brightdata, smartproxy, oxylabs — **+ any** | `ProxyProvider` |
| **Verification provider** | sms-activate, 5sim, smshub, twilio, IMAP/temp-mail — **+ any** | `VerificationResourceProvider` |

Cross-cutting over all axes: **AI is used maximally** — brain orchestration, shop-doc scan, content & persona generation, scoring, CAPTCHA assist, scrape parsing (all in the application layer, deterministically validated).

### What it does
Keeps a **pool** of ready accounts, provisions **devices** (install the platform app + proxy/SmartIP + verify subscription), fills per-device **queues**, brings accounts **online** (session-import or login), **probes health**, **auto-replaces** banned and **auto-buys/generates** new ones, runs **action campaigns** (report / publish / warmup / follow / like / comment / join / dm) exactly-once, and **scrapes maximally** — groups, channels, members, followers, follows, likes, comments, commenters/likers, posts/reels/stories, hashtags, contacts — for **every** account type (WA/TG/IG/TikTok/Discord/FB/Gmail/YouTube) via a hybrid `ScrapeProvider` where a **headless-browser tier is first-class and primary** (Puppeteer + CDP), complemented by anon-HTTP, on-device (UI-dump), and API tiers. Today the browser tier is a **real capacity-gated Puppeteer/Chromium pool** (`createPuppeteerBrowserProvider`: lazily-launched, an isolated per-page context with its own proxy/user-agent/cookies for anti-detect, promise-queue concurrency bound) driving **scroll-until-dry** extraction with a **captcha hard-stop** (never solved blind), proven end-to-end against real Chromium. A session-based **`@acq/browser` BrowserProvider** (`createBrowserProvider`, Puppeteer + CDP) adds `createSession`/`extract(schema)`/**live-view devtools URL**/record, exposed via `browser.session.*`. The **design target** (`docs/TZ.md`) is a cloud headless-browser pool of Browserbase class and beyond — thousands of concurrent CDP sessions, stealth, residential proxies, CAPTCHA solving, persistent contexts, live-view/takeover, session replay, AI `act/observe/extract(schema)` — **better because** we also drive real Android phones for app-only data, integrate scraping into the same exactly-once lifecycle engine, and are brain/MCP-native. All account types (WhatsApp today, others next) are **managed identically** — same facade ops (`account.status/retire/cooldown/reassign/refreshSession/probe/action/tag`, bulk), reconciler, campaigns — only the platform driver differs; a device can host **multiple accounts** (app-cloning/switching, up to N:1). Every account runs behind a **1:1 proxy** (residential/mobile, geo-consistent IP↔SIM↔GPS↔timezone), goes through **warmup** and per-account **action budgets**, with **anti-detect fingerprinting** and AI-generated **personas & content**. Self-healing, idempotent, observable, secure.

### Architecture at a glance
Clean Architecture + Hexagonal (Ports & Adapters) + tactical DDD, per `docs/REQUIREM.md`. The domain is pure and dependency-free; infrastructure implements ports; a `reconcile(snapshot) → intents` pure function drives idempotent jobs through RabbitMQ (+ DLQ, retry ledger, opt-lock, exactly-once). Every unknown external fact is a **verify-by-fact seam** — a fail-safe coded error, never a guess.

```
Presentation   apps/control-plane (MCP tools/resources · REST · CLI)
Application     use-cases (acquire · enroll · createCampaign · runScrape …)
Domain          aggregates · VOs · policies · reconcile() · events · PORTS
Infrastructure  Mongo · RabbitMQ · Redis · DeviceProvider · PurchaseAdapter
                · PlatformDriver · ScrapeProvider · SecretResolver · vault
```

### Package map (`@acq/*`, yarn workspaces, Node 20 ESM)
```
packages/
  engine-domain     generic domain (account state-machine, queue, pool, campaign/action, reconcile, ports)
  engine-infra      generic adapters (Mongo repos incl. campaign, DLQ, dispatcher, expense recorder, automation)
  platform-registry PlatformCapabilities descriptors
  core              engine infra (Mongo/Redis/RabbitMQ, job ledger, lease, models, auth)
  device-control    DeviceProvider + Controller: duoplus, vmos, +geelark, +matt-duo (3 channels)
  automation        PlatformDriver: whatsapp/ig/tiktok/yt +telegram/discord/facebook/gmail; human-actor
  integrations      vendor HTTP clients (dark.shopping, djekxa, email-code, totp, llm, proxy)
  procurement       declarative purchase-adapter engine + ShopRegistry + auth-aware shop HTTP client, approval, cookie sessions
  scraping          hybrid ScrapeProvider (browser primary / anon-http / on-device / api), maximal entities;
                    createPuppeteerBrowserProvider = real capacity-gated headless-Chromium pool (Puppeteer+CDP, anti-detect
                    context per page), createBrowserScrapeAdapter = scroll-until-dry + captcha hard-stop
  account-gen       on-device account generation (gmail/google-auth), persona + verification providers
  proxy             ProxyProvider: pool, 1:1 assignment, rotation, health, purchase (residential/mobile)
  media             MediaStore + ContentGenerator (content/media for publish actions)
  intelligence      account/target scoring, targeting, behavior baselines
  control           all management gateways over one facade + RBAC (OPERATIONS catalog, sanitize/injection guard)
  config, logger, validation, humanizer, shared
apps/
  engine            reconciler (cron) + queue consumers, parameterized by active platforms; generic handlers
                    (acquire[buy/generate] · queue-fill · bring-online · action · probe · replace) + shared
                    account-lifecycle & device-enroll services
  control-plane     single facade over REST + MCP (stdio + over-HTTP) + WebSocket + GraphQL + A2A + gRPC + CLI + SSE + inbound webhooks + RAG
  scrape-worker     scrape-queue consumers; wires the real hybrid tiers (browser primary) by default
  dashboard         operator control panel (feature-based SPA, WCAG/CSP) — REQUIREM §7
  whatsapp          most complete reference vertical (mass report); shares the generic engine/infra
```
All packages above exist today. The generic engine + control facade + hybrid scrape tiers are wired and tested; per-platform logins/selectors and per-shop delivery formats remain verify-by-fact seams.

### Quickstart
```bash
yarn install
yarn test           # full unit suite (1005 tests, 187 suites) — proves self-containment
cp .env.example .env && $EDITOR .env

# Run the whole platform in Docker (infra + engine + control-plane + scrape + dashboard):
docker compose -f docker-compose.dev.yml up -d
curl localhost:7401/health                                   # engine (lists active platforms)
curl -XPOST localhost:7500/v1/op/pool.status \               # a facade op over REST
  -H 'authorization: Bearer admin-dev-token' -d '{"platform":"telegram"}'

# Or run services directly:
yarn workspace @acq/engine-app start          # generic reconciler (cron) + queue consumers
yarn workspace @acq/control-plane-app start   # single facade: REST + MCP-HTTP + WS + GraphQL + A2A + gRPC + CLI + SSE + webhooks
yarn workspace @acq/scrape-worker-app start   # hybrid scrape tiers (browser primary)

# Live suites (need Mongo/RabbitMQ/Redis; browser tier needs the Chromium binary):
yarn workspace @acq/engine-app test:live
yarn workspace @acq/control-plane-app test:live
npx puppeteer browsers install chrome && yarn workspace @acq/scraping test:live
```

### How it's controlled — one facade, many surfaces
Every operation is one application use-case exposed to all surfaces (no duplicated logic). **Wired & live-verified today:** REST · MCP-over-HTTP (session-managed StreamableHTTP) · WebSocket · GraphQL · A2A · gRPC · CLI · SSE · inbound webhooks · RAG read-models — all over the one 34-operation facade with shared RBAC, per-op validation, and audit.

Maximal set of management gateways (all over one facade):
- **AI / agent**: **MCP** (brain/Obsidian, stdio+http), **A2A** agent-to-agent, **LLM function/tool-calling**, **RAG** over read-models, autonomous reconciler-loop.
- **Sync APIs**: **REST/HTTP** (contract-first OpenAPI, `{data,error,meta}`, versioned, idempotent), **gRPC**, **GraphQL**.
- **Realtime/streaming**: **WebSocket**, **SSE**, **Webhooks** (in+out), **event-stream** (Kafka/AMQP/Redis Streams).
- **Local/embed**: **CLI** (multi-server), **npm/SDK**.
- **UI**: operator **dashboard** (feature-based SPA, WCAG/CSP) — REQUIREM §7.
- **Gateways/pipelines**: **API Gateway**, **iPaaS** (n8n/Zapier/Make), **cron**.

Multi-tenant: every record carries a `tenantId` with per-tenant isolation, RBAC, and quotas.

### Roadmap (phases, full detail in `docs/TZ.md` §19)
0 Extraction ✅ · 1 DeviceProvider generalization ✅ · 2 Domain generalization ✅ · 3 Declarative purchase + cookie sessions ✅ · 4 Telegram end-to-end (reconciler self-drive live ✅; real login = seam) · 5 Remaining platform drivers (generic lifecycle ✅; some logins = seams) · 6 ScrapeProvider ✅ (browser primary live) · 7 On-device account generation (flow ✅; on-device selectors = seams) · 8 Control plane ✅ (facade over REST + MCP-HTTP + WebSocket + GraphQL + A2A + gRPC + CLI + SSE + webhooks + RAG) · 9 Hardening (observability, scale, compliance) — ongoing.

---

## 🇷🇺 Русский

### Четыре оси универсальности
Добавление значения по любой оси — плагин, **без правок ядра** (Open/Closed):

| Ось | Значения (расширяемо) | Абстракция |
|---|---|---|
| **Платформа** | whatsapp, telegram, discord, tiktok, instagram, facebook, gmail, youtube | `PlatformDriver` + registry `PlatformCapabilities` |
| **Провайдер устройств** | duoplus, vmos, geelark, matt-duo, redfinger, ugphone, morelogin, genymotion, эмуляторы (ldplayer/mumu/bluestacks) и физ. ADB-фермы — **+ любой другой** | `DeviceProvider` + `Controller` |
| **Магазин** | dark.shopping, djekxa.ru, `<любой URL>` | `PurchaseAdapter` (декларативный `ShopAdapterSpec` + движок) |
| **Способ получить аккаунт** | покупка, генерация на устройстве (gmail / google-auth) | `AcquisitionSource` (`purchase | generate`) |
| **Прокси-провайдер** | vmos-dynamic, 922proxy, iproyal, brightdata, smartproxy, oxylabs — **+ любой** | `ProxyProvider` |
| **Провайдер верификации** | sms-activate, 5sim, smshub, twilio, IMAP/temp-mail — **+ любой** | `VerificationResourceProvider` |

Сквозной слой поверх всех осей: **ИИ используется максимально** — brain-оркестрация, scan магазинов, генерация контента и персон, скоринг, captcha-ассист, парсинг скрапа (всё в application-слое, с детерминированной валидацией).

### Что делает
Держит **пул** готовых аккаунтов, провижит **устройства** (ставит приложение платформы + прокси/SmartIP + верифицирует подписку), наполняет **очереди** на устройствах, выводит в **онлайн** (импорт сессии или логин), следит за **здоровьем**, **авто-заменяет** забаненные и **авто-докупает/генерирует** новые, исполняет **кампании действий** (report / publish / warmup / follow / like / comment / join / dm) exactly-once и **скрапит по-максимуму** — группы, каналы, участники, подписчики, подписки, лайки, комментарии, комментаторы/лайкеры, посты/reels/stories, хэштеги, контакты — для **любого** типа аккаунтов (WA/TG/IG/TikTok/Discord/FB/Gmail/YouTube) через гибридный `ScrapeProvider`, где **браузерный тир — первоклассный и приоритетный** (Puppeteer + CDP), дополняемый anon-HTTP, on-device (UI-dump) и API-тирами. Сегодня браузерный тир — **реальный пул Puppeteer/Chromium с ограничением ёмкости** (`createPuppeteerBrowserProvider`: ленивый запуск, изолированный контекст на каждую страницу со своим proxy/user-agent/cookies для анти-детекта, семафор на промисах) с извлечением **scroll-until-dry** и **жёстким стопом на CAPTCHA** (никогда не решается вслепую), проверен end-to-end на реальном Chromium. Session-провайдер **`@acq/browser`** (`createBrowserProvider`, Puppeteer + CDP) добавляет `createSession`/`extract(schema)`/**live-view devtools URL**/record, экспонирован через `browser.session.*`. **Целевой дизайн** (`docs/TZ.md`) — облачный пул headless-браузеров класса Browserbase и выше: тысячи конкуррентных CDP-сессий, stealth, residential-прокси, решение CAPTCHA, persistent-контексты, live-view/перехват, реплей сессий, AI `act/observe/extract(schema)` — **лучше, потому что** мы ещё драйвим реальные Android для app-only данных, интегрируем скрап в тот же exactly-once lifecycle-движок и он brain/MCP-native. Все типы аккаунтов (WhatsApp сейчас, остальные следом) **управляются одинаково** — те же операции фасада (`account.status/retire/cooldown/reassign/refreshSession/probe/action/tag`, bulk), reconciler, кампании — меняется только драйвер платформы; на одном устройстве может быть **несколько аккаунтов** (app-cloning/переключение, до N:1). Каждый аккаунт работает через **1:1 прокси** (residential/mobile, гео-консистентность IP↔SIM↔GPS↔timezone), проходит **прогрев** и per-account **бюджеты действий**, с **анти-детект fingerprint** и ИИ-генерируемыми **персонами и контентом**. Самовосстанавливается, идемпотентно, наблюдаемо, секьюрно.

### Архитектура вкратце
Clean Architecture + Hexagonal (Ports & Adapters) + тактический DDD, по `docs/REQUIREM.md`. Домен чист и без зависимостей; инфраструктура реализует порты; чистая функция `reconcile(snapshot) → intents` гонит идемпотентные джобы через RabbitMQ (+ DLQ, retry-ledger, opt-lock, exactly-once). Каждый неизвестный внешний факт — **verify-by-fact-шов**: fail-safe кодированная ошибка, а не догадка.

### Как управляется — один фасад, много поверхностей
Каждая операция — один application use-case, экспонированный во все поверхности (без дублирования логики). **Смонтировано и проверено вживую сегодня:** REST · MCP-over-HTTP (session-managed StreamableHTTP) · WebSocket · GraphQL · A2A · gRPC · CLI · SSE · входящие webhooks · RAG read-модели — всё поверх одного фасада из 34 операций с общими RBAC, per-op валидацией и аудитом. Полный разбор с примерами вызовов — **[`complete-workflow.md`](complete-workflow.md)** (EN/RU).

Максимальный набор шлюзов управления (всё поверх одного фасада):
- **ИИ / агенты**: **MCP** (мозг/Obsidian, stdio+http), **A2A** (agent-to-agent), **LLM function/tool-calling**, **RAG** поверх read-моделей, автономный reconciler-loop.
- **Синхронные API**: **REST/HTTP** (contract-first OpenAPI, envelope `{data,error,meta}`, версионирование, идемпотентность), **gRPC**, **GraphQL**.
- **Реалтайм/стриминг**: **WebSocket**, **SSE**, **Webhooks** (in+out), **event-stream** (Kafka/AMQP/Redis Streams).
- **Локальные/встраиваемые**: **CLI** (multi-server), **npm/SDK**.
- **UI**: панель оператора — **dashboard** (feature-based SPA, WCAG/CSP) — REQUIREM §7.
- **Шлюзы/пайплайны**: **API Gateway**, **iPaaS** (n8n/Zapier/Make), **cron**.

Мультитенантность: каждая запись несёт `tenantId` с изоляцией, RBAC и квотами per-tenant.

### Запуск и roadmap
Быстрый старт — см. блок Quickstart выше. Полный фундамент проекта — **`docs/TZ.md`** (супер-детальное ТЗ по всем фазам, локальный дизайн-документ вне гита). Фазы: 0 Экстракция ✅ · 1 DeviceProvider ✅ · 2 Обобщение домена ✅ · 3 Декларативные закупки + cookie-сессии ✅ · 4 Telegram end-to-end (self-drive reconciler вживую ✅; реальный логин — шов) · 5 Остальные драйверы (общий lifecycle ✅; часть логинов — швы) · 6 ScrapeProvider ✅ (браузерный тир вживую) · 7 Генерация аккаунтов (поток ✅; on-device селекторы — швы) · 8 Control plane ✅ (фасад: REST + MCP-HTTP + WebSocket + GraphQL + A2A + gRPC + CLI + SSE + webhooks + RAG) · 9 Hardening — в процессе.

> ⚠️ До реального прода нужно снять внешние факты «по факту» (форматы поставки/авторизации магазинов, on-device селекторы, импорт сессии, matt-duo auth) — все они fail-safe заблокированы кодированными ошибками. Каталог швов — `docs/TZ.md` §22.2.
