# @acq — Universal Account & Device Lifecycle Platform

Self-contained platform that **buys (or generates) accounts across many shops, provisions them onto cloud-phone devices from many providers, keeps a healthy pool, and runs mass actions and scraping at scale** — centralized, modular, horizontally scalable, controlled by an AI brain over MCP, or via CLI / HTTP-API / npm.

**Status:** **WhatsApp** (mass report) is fully implemented and is the reference vertical (335 tests green). The platform is being generalized along four independent axes; the full design is the foundational spec **`docs/TZ.md`** (local design doc, kept out of git by design).

> `docs/` (the TZ, runbook, plans, REQUIREM) is intentionally **not tracked in git** — it is the working design corpus. This README is the tracked entry point.

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
Keeps a **pool** of ready accounts, provisions **devices** (install the platform app + proxy/SmartIP + verify subscription), fills per-device **queues**, brings accounts **online** (session-import or login), **probes health**, **auto-replaces** banned and **auto-buys/generates** new ones, runs **action campaigns** (report / publish / warmup / follow / like / comment / join / dm) exactly-once, and **scrapes maximally** — groups, channels, members, followers, follows, likes, comments, commenters/likers, posts/reels/stories, hashtags, contacts — for **every** account type (WA/TG/IG/TikTok/Discord/FB/Gmail/YouTube) via a hybrid `ScrapeProvider` where a **headless-browser tier is first-class and primary** (playwright/puppeteer), complemented by anon-HTTP, on-device (UI-dump), and API tiers. Every account runs behind a **1:1 proxy** (residential/mobile, geo-consistent IP↔SIM↔GPS↔timezone), goes through **warmup** and per-account **action budgets**, with **anti-detect fingerprinting** and AI-generated **personas & content**. Self-healing, idempotent, observable, secure.

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
  engine-domain*    generic domain (account state-machine, queue, pool, campaign/action, reconcile, ports)
  engine-infra*     generic adapters (Mongo repos, DLQ, dispatcher, event bus)
  platform-registry* PlatformCapabilities descriptors
  core              engine infra (Mongo/Redis/RabbitMQ, job ledger, lease, models, auth)
  device-control    DeviceProvider + Controller: duoplus, vmos, +geelark, +matt-duo (3 channels)
  automation        PlatformDriver: whatsapp/ig/tiktok/yt +telegram/discord/facebook/gmail; human-actor
  integrations      vendor HTTP clients (dark.shopping, djekxa, email-code, totp, llm, proxy)
  procurement*      declarative purchase-adapter engine, approval, cookie sessions
  scraping*         hybrid ScrapeProvider (browser / on-device / api)
  account-gen*      on-device account generation (gmail/google-auth), persona + verification providers
  proxy*            ProxyProvider: pool, 1:1 assignment, rotation, health, purchase (residential/mobile)
  media*            MediaStore + ContentGenerator (content/media for publish actions)
  intelligence*     account/target scoring, targeting, behavior baselines
  control*          all management gateways over one facade + RBAC
  config, logger, validation, humanizer, shared
apps/
  engine*           reconciler (cron) + queue consumers, parameterized by active platforms
  control-plane*    MCP (stdio+http) + REST API + CLI
  scrape-worker*    scrape-queue consumers
  whatsapp          current orchestrator (migrates into apps/engine as a platform module)
```
`*` = to be built per the phased plan (`docs/TZ.md` §19). Everything else exists today.

### Quickstart
```bash
yarn install
yarn test           # proves self-containment (currently 335 tests, 9 projects)
cp .env.example .env && $EDITOR .env
yarn start:whatsapp   # orchestrator worker (cron reconciler + consumers + /health)
yarn mcp:http         # MCP over HTTP (the brain connects here, bearer-authed)
yarn mcp:stdio        # per-connection stdio MCP
```

### How it's controlled — one facade, many surfaces
Every operation is one application use-case exposed to all surfaces (no duplicated logic):
Maximal set of management gateways (all over one facade):
- **AI / agent**: **MCP** (brain/Obsidian, stdio+http), **A2A** agent-to-agent, **LLM function/tool-calling**, **RAG** over read-models, autonomous reconciler-loop.
- **Sync APIs**: **REST/HTTP** (contract-first OpenAPI, `{data,error,meta}`, versioned, idempotent), **gRPC**, **GraphQL**.
- **Realtime/streaming**: **WebSocket**, **SSE**, **Webhooks** (in+out), **event-stream** (Kafka/AMQP/Redis Streams).
- **Local/embed**: **CLI** (multi-server), **npm/SDK**.
- **Gateways/pipelines**: **API Gateway**, **iPaaS** (n8n/Zapier/Make), **cron**.

### Roadmap (phases, full detail in `docs/TZ.md` §19)
0 Extraction ✅ · 1 DeviceProvider generalization · 2 Domain generalization · 3 Declarative purchase + cookie sessions · 4 Telegram end-to-end · 5 Remaining platform drivers · 6 ScrapeProvider · 7 On-device account generation · 8 Control plane (CLI + REST + RAG) · 9 Hardening (observability, scale, compliance).

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
Держит **пул** готовых аккаунтов, провижит **устройства** (ставит приложение платформы + прокси/SmartIP + верифицирует подписку), наполняет **очереди** на устройствах, выводит в **онлайн** (импорт сессии или логин), следит за **здоровьем**, **авто-заменяет** забаненные и **авто-докупает/генерирует** новые, исполняет **кампании действий** (report / publish / warmup / follow / like / comment / join / dm) exactly-once и **скрапит по-максимуму** — группы, каналы, участники, подписчики, подписки, лайки, комментарии, комментаторы/лайкеры, посты/reels/stories, хэштеги, контакты — для **любого** типа аккаунтов (WA/TG/IG/TikTok/Discord/FB/Gmail/YouTube) через гибридный `ScrapeProvider`, где **браузерный тир — первоклассный и приоритетный** (playwright/puppeteer), дополняемый anon-HTTP, on-device (UI-dump) и API-тирами. Каждый аккаунт работает через **1:1 прокси** (residential/mobile, гео-консистентность IP↔SIM↔GPS↔timezone), проходит **прогрев** и per-account **бюджеты действий**, с **анти-детект fingerprint** и ИИ-генерируемыми **персонами и контентом**. Самовосстанавливается, идемпотентно, наблюдаемо, секьюрно.

### Архитектура вкратце
Clean Architecture + Hexagonal (Ports & Adapters) + тактический DDD, по `docs/REQUIREM.md`. Домен чист и без зависимостей; инфраструктура реализует порты; чистая функция `reconcile(snapshot) → intents` гонит идемпотентные джобы через RabbitMQ (+ DLQ, retry-ledger, opt-lock, exactly-once). Каждый неизвестный внешний факт — **verify-by-fact-шов**: fail-safe кодированная ошибка, а не догадка.

### Как управляется — один фасад, много поверхностей
Каждая операция — один application use-case, экспонированный во все поверхности (без дублирования логики):
Максимальный набор шлюзов управления (всё поверх одного фасада):
- **ИИ / агенты**: **MCP** (мозг/Obsidian, stdio+http), **A2A** (agent-to-agent), **LLM function/tool-calling**, **RAG** поверх read-моделей, автономный reconciler-loop.
- **Синхронные API**: **REST/HTTP** (contract-first OpenAPI, envelope `{data,error,meta}`, версионирование, идемпотентность), **gRPC**, **GraphQL**.
- **Реалтайм/стриминг**: **WebSocket**, **SSE**, **Webhooks** (in+out), **event-stream** (Kafka/AMQP/Redis Streams).
- **Локальные/встраиваемые**: **CLI** (multi-server), **npm/SDK**.
- **Шлюзы/пайплайны**: **API Gateway**, **iPaaS** (n8n/Zapier/Make), **cron**.

### Запуск и roadmap
Быстрый старт — см. блок Quickstart выше. Полный фундамент проекта — **`docs/TZ.md`** (супер-детальное ТЗ по всем фазам, локальный дизайн-документ вне гита). Фазы: 0 Экстракция ✅ · 1 DeviceProvider · 2 Обобщение домена · 3 Декларативные закупки + cookie-сессии · 4 Telegram end-to-end · 5 Остальные драйверы · 6 ScrapeProvider · 7 Генерация аккаунтов · 8 Control plane · 9 Hardening.

> ⚠️ До реального прода нужно снять внешние факты «по факту» (форматы поставки/авторизации магазинов, on-device селекторы, импорт сессии, matt-duo auth) — все они fail-safe заблокированы кодированными ошибками. Каталог швов — `docs/TZ.md` §22.2.
