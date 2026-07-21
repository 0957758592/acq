# WA_FEAT — Mass WhatsApp Report

Concise feature overview (EN + RU). Full runbook: [`whatsapp-report/README.md`](whatsapp-report/README.md).

---

## 🇬🇧 English

### What the feature is & why
A **headless microservice** that runs **mass WhatsApp reporting** at scale. It keeps a **pool** of ready WhatsApp accounts across **DuoPlus cloud phones**, keeps them healthy, **auto-replaces banned** accounts and **auto-buys** new ones, and executes **report campaigns** against target numbers (open the target → Report / Report & block). Purpose: reliably report many targets from many accounts without a human babysitting devices — self-healing, idempotent, observable.

### How it works
A **cron reconciler** continuously compares "how it should be" vs "how it is" and enqueues **idempotent jobs**; queue consumers execute six flows. Everything is durable (RabbitMQ + DLQ), retried with backoff, opt-locked, and exactly-once for reports (a target is reported once per account).

```
   AI "brain"  ──MCP──▶  ┌───────────────┐        ┌──────────────────────────────────────┐
   or a manual          │  MCP surface   │◀──────▶│        Orchestrator (worker)         │
   MCP client           │  stdio / HTTP  │ events │                                      │
                        └───────────────┘         │  Cron reconciler ─▶ idempotent jobs  │
                                                   │        │                             │
                                                   │        ▼   RabbitMQ (+ DLQ, retries) │
                                                   │  6 consumers:                        │
                                                   │  buy · fill-queue · bring-online ·   │
                                                   │  probe · replace-banned · REPORT     │
                                                   └───────────────┬──────────────────────┘
                                                                   ▼
                                          DuoPlus cloud phones running WhatsApp
                                          (accounts bought from dark.shopping)
```

The six flows: **buy** (dark.shopping → pool) · **fill-queue** (pool → device) · **bring-online** (lease device → import session) · **probe-health** (detect bans) · **replace-banned** (retire → promote → refill) · **run-report-task** (report each target, exactly-once). Domain events (`account.banned`, `queue.low`, `pool.low`, `campaign.completed`, `report.done`) flow back as **MCP notifications**.

### How it's controlled — brain / AI / manual? **All three, via one MCP surface.**
- **Autonomous:** the reconciler + queue consumers run in a **continuous loop** — the mechanics (buying, filling, bringing online, replacing, reporting) need no human. This is the default self-driving behavior.
- **AI brain:** an external **AI/brain drives goals over MCP** — it calls tools (`campaign.create`, `pool.buy`, `device.enroll`, `campaign.pause/resume/stop`) and receives event notifications. The brain decides *what* to do; the service decides *how*.
- **Manual:** the very same MCP tools can be called **by hand** from any MCP client (or a human operator), so you can trigger buys, create/stop campaigns, retire accounts, or force `reconcile.now` yourself.

### How to use it
Talk to the **MCP surface** (as the brain or manually):
- `pool.status` / `pool.buy(quantity)` — inspect / top up the account pool.
- `device.enroll(deviceId, targetDepth)` — provision a device (install WhatsApp + proxy) and give it a queue.
- `campaign.create(targets, strategy)` — start a mass-report campaign; `campaign.status/pause/resume/stop`.
- `account.retire(id)`, `reconcile.now` — admin actions.
- Read-only: `whatsapp://pool/summary`, `whatsapp://devices`, `whatsapp://campaigns/{id}` (secrets stripped).

### How to launch so it runs continuously
Two long-running processes (Procfile-ready) keep it alive forever:
```
whatsapp:     yarn workspace @julio/whatsapp-app start      # orchestrator worker (cron loop + consumers)
whatsapp-mcp: yarn workspace @julio/whatsapp-app mcp:http   # MCP over HTTP (the brain connects here)
```
Run both under a process manager (Procfile / systemd / Docker). The **orchestrator's cron reconciler ticks forever**, so once it's up the system self-drives; the brain (or you) only sends high-level commands. Liveness: `GET :$WHATSAPP_HEALTH_PORT/health`.

> ⚠️ Before real production you must capture the external "verify-by-fact" facts (dark.shopping delivery format, WhatsApp on-device selectors, on-device session import, DuoPlus team-APK id) and set env/secrets — see the go-live checklist in `whatsapp-report/README.md`.

---

## 🇷🇺 Русский

### Что за фича и зачем
**Headless-микросервис** для **массового репорта в WhatsApp** в масштабе. Держит **пул** готовых WhatsApp-аккаунтов на **облачных телефонах DuoPlus**, следит за их здоровьем, **автоматически заменяет забаненные** и **докупает** новые, и исполняет **репорт-кампании** по целевым номерам (открыть цель → Report / Report & block). Зачем: надёжно репортить много целей с многих аккаунтов без ручного присмотра за устройствами — самовосстанавливается, идемпотентно, наблюдаемо.

### Как работает
**Cron-реконсилятор** постоянно сверяет «как должно быть» с «как есть» и ставит **идемпотентные джобы**; консьюмеры очередей исполняют шесть потоков. Всё durable (RabbitMQ + DLQ), с ретраями и backoff, опт-локом и exactly-once для репортов (каждая цель репортится один раз с аккаунта).

```
   ИИ-«мозг»  ──MCP──▶  ┌───────────────┐         ┌──────────────────────────────────────┐
   или ручной          │  MCP-поверх-ть │◀───────▶│         Оркестратор (воркер)         │
   MCP-клиент          │  stdio / HTTP  │ события  │                                      │
                       └───────────────┘          │  Cron-реконсилятор ─▶ идемпот. джобы  │
                                                   │        │                             │
                                                   │        ▼   RabbitMQ (+ DLQ, ретраи)  │
                                                   │  6 консьюмеров:                      │
                                                   │  buy · fill-queue · bring-online ·   │
                                                   │  probe · replace-banned · REPORT     │
                                                   └───────────────┬──────────────────────┘
                                                                   ▼
                                          Облачные телефоны DuoPlus с WhatsApp
                                          (аккаунты куплены в dark.shopping)
```

Шесть потоков: **buy** (dark.shopping → пул) · **fill-queue** (пул → устройство) · **bring-online** (аренда устройства → импорт сессии) · **probe-health** (детект бана) · **replace-banned** (retire → поднять следующего → добор) · **run-report-task** (репорт каждой цели, exactly-once). Доменные события (`account.banned`, `queue.low`, `pool.low`, `campaign.completed`, `report.done`) уходят обратно **MCP-уведомлениями**.

### Как управляется — мозг / ИИ / вручную? **Всё три, через одну MCP-поверхность.**
- **Автономно:** реконсилятор + консьюмеры работают **непрерывным циклом** — механика (закупка, наполнение, вывод в онлайн, замена, репорт) не требует человека. Это поведение по умолчанию — система «сама себя ведёт».
- **ИИ-мозг:** внешний **ИИ/мозг задаёт цели по MCP** — дёргает tools (`campaign.create`, `pool.buy`, `device.enroll`, `campaign.pause/resume/stop`) и получает события. Мозг решает *что* делать, сервис — *как*.
- **Вручную:** те же MCP-tools можно вызывать **руками** из любого MCP-клиента (или человеком-оператором): запустить закупку, создать/остановить кампанию, вывести аккаунт, форсить `reconcile.now`.

### Как использовать
Общаться с **MCP-поверхностью** (как мозг или вручную):
- `pool.status` / `pool.buy(quantity)` — посмотреть / пополнить пул.
- `device.enroll(deviceId, targetDepth)` — провижить устройство (WhatsApp + прокси) и дать ему очередь.
- `campaign.create(targets, strategy)` — запустить массовый репорт; `campaign.status/pause/resume/stop`.
- `account.retire(id)`, `reconcile.now` — админ-действия.
- Read-only: `whatsapp://pool/summary`, `whatsapp://devices`, `whatsapp://campaigns/{id}` (секреты вырезаны).

### Как запустить, чтобы работало постоянно
Два долгоживущих процесса (Procfile готов) держат систему живой:
```
whatsapp:     yarn workspace @julio/whatsapp-app start      # воркер-оркестратор (cron-цикл + консьюмеры)
whatsapp-mcp: yarn workspace @julio/whatsapp-app mcp:http   # MCP по HTTP (сюда коннектится мозг)
```
Запускать под менеджером процессов (Procfile / systemd / Docker). **Cron-реконсилятор оркестратора тикает бесконечно**, поэтому после старта система работает сама; мозг (или вы) только шлёте высокоуровневые команды. Liveness: `GET :$WHATSAPP_HEALTH_PORT/health`.

> ⚠️ До реального прода нужно снять внешние факты «по факту» (формат поставки dark.shopping, селекторы WhatsApp на устройстве, импорт сессии на устройство, id команды-APK DuoPlus) и задать env/секреты — см. go-live чек-лист в `whatsapp-report/README.md`.
