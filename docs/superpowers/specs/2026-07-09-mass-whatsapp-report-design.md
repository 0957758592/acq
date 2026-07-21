# Mass WhatsApp Report — дизайн микросервиса

- **Дата:** 2026-07-09
- **Бранч:** `roman/mass-whatsapp-report`
- **Статус:** дизайн согласован, ожидает ревью спеки перед планом реализации
- **Источник требований:** `docs/REQUIREM.md` + постановка Романа/MassDM (Telegram)

---

## 1. Контекст и цель

Нужен отдельный модуль-микросервис, который управляет пулом WhatsApp-аккаунтов, распределяет их по облачным устройствам (DuoPlus) очередями, следит за здоровьем, автоматически заменяет забаненные и пополняет пул, и исполняет **массовый репорт целевых номеров**. Управление — из внешнего «мозга» (Obsidian-репо VANTA-Brain) **по MCP**, с обратной связью (события) в мозг.

Пять опорных концептов из постановки:
- **Resource Pool** — пул доступных аккаунтов.
- **Queue** — очередь аккаунтов, привязанная к устройству (1 активный + N ожидающих).
- **Lease** — краткоживущий эксклюзивный захват устройства на операцию.
- **Health Monitoring** — мониторинг статуса/здоровья аккаунтов, детект бана.
- **Central Scheduler** — центральный оркестратор распределения ресурсов.

Система обязана оставаться детерминированной, наблюдаемой, безопасной, масштабируемой и поддерживаемой (`REQUIREM §20`).

---

## 2. Закреплённые решения (снятые развилки)

| # | Развилка | Решение |
|---|---|---|
| 1 | Источник WhatsApp-аккаунтов и OTP | **Готовые аккаунты (dark.shopping)** — импорт купленной сессии/данных на устройство, без OTP-регистрации. «Register» = вывести купленный аккаунт в онлайн на устройстве. Порт закупки **плагинный**, dark.shopping — первый и единственный адаптер v1. |
| 2 | Форма деплоя | **Модуль в монорепо + свой деплой-процесс.** Bounded-context: чистый пакет + инфра-пакет + отдельное приложение-процесс. Переиспользует общую инфру (Mongo/RabbitMQ/Redis/`EngineJobRun`/lease), без дублирования. |
| 3 | Транспорт MCP | **Оба** — транспорт-агностичное MCP-ядро с двумя entrypoint'ами: `stdio` и `streamable-http`. |
| 4 | Движок оркестрации | **Реконсилятор desired-state (cron) + доменные события для скорости** (controller-паттерн). Cron идемпотентно сходится к желаемому состоянию; события дают низкую задержку реакции. |

---

## 3. Границы контекста и размещение в монорепо

Новый bounded-context **`whatsapp-report`**. Чистый домен и логика (zero deps), инфраструктура снаружи — Ports & Adapters (`REQUIREM §1`).

```
packages/whatsapp/                 @julio/whatsapp — ЧИСТОЕ ядро (domain + application + ports), нулевые внешние зависимости
  src/domain/        account/ (агрегат + MSISDN VO + state-machine), device-queue/, report/, pool/ (политики/пороги), events.js
  src/application/   use-cases: fill-device-queue, bring-account-online, replace-banned-account,
                     replenish-pool, buy-accounts, run-report-task, probe-health, reconcile
  src/ports/         AccountRepo, DeviceQueueRepo, ReportRepo, ProcurementPort,
                     DeviceRegistrationPort, WhatsappAutomationPort, JobDispatcher, EventBus, SecretResolver, Clock
  src/index.js

packages/whatsapp-infra/           @julio/whatsapp-infra — АДАПТЕРЫ портов
  src/repositories/  MongoAccountRepo, MongoDeviceQueueRepo, MongoReportRepo (Mongoose-модели + атомарные ops)
  src/procurement/   DarkShoppingProcurementAdapter
  src/device/        DuoplusDeviceRegistrationAdapter
  src/automation/    WhatsappAutomationAdapter
  src/messaging/     RabbitJobDispatcher, RabbitRedisEventBus
  src/secrets/       KeychainEnvSecretResolver
  зависит от @julio/{integrations, device-control, automation, shared, config, logger}

packages/automation/src/whatsapp/  НОВЫЙ модуль автоматизации (по образцу instagram/tiktok/youtube)
  constants.js, ui-flows.js, adapter.js

packages/integrations/src/dark-shopping-client.js   НОВЫЙ вендор-клиент (шаблон DjekxaClient)

apps/whatsapp/                     СВОЙ ДЕПЛОЙ-ПРОЦЕСС (bounded-context наружу)
  src/config/env.js       конфиг на @julio/config
  src/composition.js      сборка зависимостей (manual DI-фабрики, как в engine)
  src/orchestrator.js     ENTRYPOINT: reconciler (cron) + RabbitMQ-консьюмеры + DLQ
  src/mcp/
    core.js               транспорт-агностичное MCP-ядро (tools/resources/notifications)
    stdio.js              ENTRYPOINT: MCP по stdio
    streamable-http.js    ENTRYPOINT: MCP по HTTP (+ SSE-нотификации)
```

**Общие усиления (закрывают пробелы по `REQUIREM`, переиспользуются всем репо):**
- JSON-транспорт в `@julio/logger` — structured logs (`§6.1`).
- Dead-letter обёртка над очередью — DLQ (`§10`), которого сейчас нет.
- Локали `ru`/`ua` в `SUPPORTED_LOCALES` + словари (6 языков).

---

## 4. Архитектура (слои)

Clean/Hexagonal (`REQUIREM §1.1–1.3`):
- **Domain** (`packages/whatsapp/src/domain`) — агрегаты, value objects, state-machine, инварианты. Чистые функции, ноль внешних зависимостей.
- **Application** (`.../application`) — use-cases; зависят только от портов.
- **Ports** (`.../ports`) — интерфейсы, определены внутрь.
- **Infrastructure** (`packages/whatsapp-infra`, `apps/whatsapp`) — реализации портов, БД, вендоры, очереди, MCP.

Правила: домен не зависит ни от чего; инфра зависит от домена, не наоборот; никаких циклов.

---

## 5. Доменная модель

### 5.1 Агрегаты (новые коллекции — в `@julio/whatsapp-infra`)

| Агрегат | Коллекция | Роль | Инварианты |
|---|---|---|---|
| **WhatsappAccount** | `whatsapp_accounts` | член пула; идентичность = **MSISDN** (VO, E.164) | секреты только `secretRefs`; нельзя `online` без `assignedDeviceId` + активного lease |
| **DeviceWhatsappQueue** | `whatsapp_device_queues` (1 на устройство) | `activeAccountIds[]` + `waitingAccountIds[]`, `targetDepth`, `version` | атомарный держатель «≤ activeSlots активных + N ожидающих»; опт-лок по `version` |
| **ReportCampaign** | `whatsapp_report_campaigns` | `targets:[MSISDN]`, `strategy`, счётчики, статус | — |
| **ReportTask** | `whatsapp_report_tasks` | `(campaignId, accountId, targetMsisdn)`, статус | **unique-индекс** на тройку → exactly-once на пару аккаунт×цель |

**Переиспользуем (не дублируем):** `EngineDevice` — идентичность устройства + `capacity` + lease + eligibility (`canDeviceAcceptAccount`); `EngineExpense` — учёт закупки; `EngineJobRun` — ledger джоб (идемпотентность SHA-256 + backoff).

### 5.2 Value Objects
- **Msisdn** — нормализация/валидация E.164; равенство по значению (`REQUIREM §2.3`, no primitive obsession).
- **AccountStatus**, **QueueSlot**, **PoolThreshold**, **ReportStrategy** (`all-accounts-report-each-target` | `one-target-per-account`).

### 5.3 State-machine жизненного цикла аккаунта (чистая функция в `domain/account`)

Статусы: `purchased → assigned → bringing_online → online ⇄ cooldown → banned → retired`.

Переходы:
- `purchased → assigned` (fill-device-queue) — попал в waiting очереди устройства.
- `assigned → bringing_online` (activate) — есть свободный active-слот; захвачен device-lease.
- `bringing_online → online` (успех) | `→ cooldown` (soft challenge) | `→ assigned` (retryable, назад в waiting) | `→ banned` (hard fail) | `→ retired` (unrecoverable).
- `online → cooldown` (сигнал rate-limit) | `→ banned` (health-probe/report детектит бан).
- `cooldown → online` (probe ok после backoff) | `→ banned`.
- `banned → retired` (evict с устройства) → триггер замены.
- Любое исчерпание ретраев → `retired` (терминал).

Репорт — на уровне `ReportTask` (аккаунт остаётся `online`), состояния компактны (YAGNI). Все переходы чистые, с проверкой инвариантов; побочные эффекты изолированы (`§0.2`).

---

## 6. Оркестрация (Central Scheduler) — реконсилятор + события

**Источник истины** — `reconcile` use-case: на каждом cron-тике идемпотентно сверяет желаемое vs фактическое и ставит джобы. **События** (`account.banned`, `queue.low`, `pool.low`) дают немедленную реакцию, не дожидаясь тика. Cron **только ставит** идемпотентные джобы (как текущий engine-cron), сам работу не делает.

### Потоки

- **A. Пул + авто-закупка** (`replenish-pool` → `buy-accounts`): `available = count(status=purchased ∧ assignedDeviceId=null)`. Если `available < WHATSAPP_POOL_THRESHOLD` — идемпотентная джоба закупки через `ProcurementPort` (dark.shopping): купить `WHATSAPP_BUY_BATCH_SIZE` → импорт как `purchased` → запись `EngineExpense` (гарды по цене/балансу, как у Djekxa). Докупаем только когда несвязанный список пуст/ниже порога.
- **B. Заполнение очереди** (`fill-device-queue`): для каждого eligible-устройства держим `queue.depth = targetDepth`, атомарно перекладывая `purchased` из пула в `waiting`. Не хватает пула → триггер A.
- **C. Вывод в онлайн + Lease** (`bring-account-online`): свободный active-слот + waiting-аккаунт → claim device-lease (`device-lease.service`) → `WhatsappAutomationPort.bringOnline()` (импорт сессии на устройстве) → `online`; ошибка → retry/backoff через `EngineJobRun`; lease освобождается в `finally`.
- **D. Health + детект бана** (`probe-health`): cron-кадэнс (`WHATSAPP_PROBE_CRON`) проверяет `online`/`cooldown` через `WhatsappAutomationPort.probeState` on-device (паттерн `check*LoginState`) → апдейт `health`; при бане — событие `account.banned`. Провал report-таски с признаком бана даёт тот же сигнал.
- **E. Авто-замена** (`replace-banned-account`): по событию `account.banned` (мгновенно) или по реконсилятору → evict (`retired`, снять с active-слота) → поднять следующий `waiting` (C). Падение `queue.depth` → B добирает из пула → A докупает. Каскад из ТЗ.
- **F. Репорт-кампания** (бизнес-цель): диспетчер создаёт по одной `ReportTask` на каждую пару (online-аккаунт × target), exactly-once по unique-индексу. `run-report-task`: claim lease → `WhatsappAutomationPort.reportTarget(account, target)` (открыть чат/контакт цели → Report [+ Block]) → done; ретраи/backoff; сигнал бана → `banned`. Гуманизация + rate-limit.

---

## 7. Порты и адаптеры

### Порты (в `@julio/whatsapp/ports`)
- `AccountRepo`, `DeviceQueueRepo`, `ReportRepo` — атомарные переходы, опт-лок по `version`.
- `ProcurementPort` — `getBalance() / listOffers() / purchase(qty) / fetchDelivered(order) → PurchasedAccount[]`.
- `DeviceRegistrationPort` — `ensureReady(device)`: провижн DuoPlus (APK WhatsApp + прокси + готовность).
- `WhatsappAutomationPort` — `bringOnline(ctx) / reportTarget(ctx, target) / probeState(ctx) → online|banned|logged_out`.
- `JobDispatcher`, `EventBus`, `SecretResolver`, `Clock`.

### Адаптеры (в `@julio/whatsapp-infra`)
- `MongoAccountRepo / MongoDeviceQueueRepo / MongoReportRepo` — Mongoose + `findOneAndUpdate` с `version`.
- `DarkShoppingProcurementAdapter` — на `packages/integrations/src/dark-shopping-client.js` (шаблон `DjekxaClient` на `IntegrationHttpClient`) + импортёр формата поставки.
- `DuoplusDeviceRegistrationAdapter` — оборачивает `createCloudPhoneProvider({type:'duoplus'})` + `DuoplusDirectController`; WhatsApp через **team-APK** (`app/teamList`+`app/install`, в каталоге DuoPlus WhatsApp отсутствует) + `initProxy`.
- `WhatsappAutomationAdapter` → модуль `packages/automation/src/whatsapp`.
- `RabbitJobDispatcher` (обёртка `dispatchEngineJob`/`publishJson`) · `RabbitRedisEventBus` (durable + Redis pub/sub) · `KeychainEnvSecretResolver` (worker-паттерн `secret-resolver`).

---

## 8. Модуль автоматизации `packages/automation/src/whatsapp/`

По образцу `instagram/tiktok/youtube`:
- `constants.js` — пакет `com.whatsapp`, сигнатуры экранов (главный/чат/бан), селекторы.
- `ui-flows.js` — `bringWhatsappOnline(controller, {sessionRef})`, `reportTarget(controller, {targetMsisdn, alsoBlock})`, `checkWhatsappState(controller) → logged_in|logged_out|banned|unknown`, `detectBanScreen`.
- `adapter.js` — регистрируем `'whatsapp'` в `getPlatformAdapter`.

Переиспользует `DuoplusDirectController`, `parseUIDump`/`findElement`, `human-actor`, `@julio/humanizer`.

---

## 9. MCP-контур (`apps/whatsapp/src/mcp`)

Транспорт-агностичное ядро на `@modelcontextprotocol/sdk` (новая зависимость — MCP в репо нет) + entrypoints `stdio.js` и `streamable-http.js`. Слой тонкий: tool → use-case/джоба, resource → чтение проекции; **бизнес-логики в MCP нет** (`§2.4`).

- **Tools:** `pool.status`, `pool.buy`, `device.enroll(deviceId,targetDepth)`, `device.queue.get`, `campaign.create(targets,strategy)`, `campaign.status`, `campaign.pause/resume/stop`, `account.retire`, `reconcile.now`. Аргументы валидируются схемой (reject unknown, `§2.2`).
- **Resources (read-only проекции):** `whatsapp://pool/summary`, `whatsapp://devices`, `whatsapp://campaigns/{id}`, `whatsapp://accounts/{id}`.
- **Notifications (обратная связь мозгу):** мост `EventBus → MCP notifications` на `account.banned`, `queue.low`, `pool.low`, `campaign.completed`, `report.done` (HTTP — через SSE-стрим; stdio — через поток stdio).

---

## 10. Инфраструктура очередей

RabbitMQ (`amqplib`) — durable-очереди; идемпотентность и ретраи — через ledger `EngineJobRun` (SHA-256 idempotencyKey, экспоненциальный backoff, `maxAttempts`), как в engine. Cron (`node-cron`) ставит идемпотентные джобы. **Никаких `setTimeout/setInterval`** (`REQUIREM`).

Очереди сервиса: `whatsapp.buy`, `whatsapp.queue-fill`, `whatsapp.bring-online`, `whatsapp.probe`, `whatsapp.replace`, `whatsapp.report`.

**DLQ (`§10`):** обёртка над `consumeJson` — при исчерпании ретраев (`EngineJobRun.status='failed'`) публикация в durable `<queue>.dlq` + запись причины. Закрывает текущий пробел (в репо DLQ нет; nack-нутое сообщение сейчас просто дропается).

---

## 11. Сквозные требования

- **Config** (`§11`, 12-factor): `apps/whatsapp/src/config/env.js` на `@julio/config` — `WHATSAPP_POOL_THRESHOLD`, `WHATSAPP_DEVICE_TARGET_DEPTH`, `WHATSAPP_BUY_BATCH_SIZE`, `WHATSAPP_PROBE_CRON`, `DARK_SHOPPING_API_KEY/BASE_URL`, `WHATSAPP_APK_URL`, `WHATSAPP_MCP_HTTP_PORT`, `WHATSAPP_MCP_AUTH_TOKEN`, лимиты репорта, feature-flag авто-закупки `WHATSAPP_AUTOBUY_ENABLED`. Без хардкода.
- **Structured logs** (`§6.1`): JSON-транспорт в `@julio/logger` + `correlationId` на джобу/запрос.
- **Security** (`§4`): секреты только через `SecretResolver` (никогда в БД/коде); MCP-HTTP за bearer-токеном + TLS; валидация аргументов tools; rate-limit репорта (гуманизация + конфиг); RBAC — токен мозга; least privilege.
- **i18n** (6 языков de/fr/en/it/ru/ua): добавить `ru` + `ua`(uk) в `packages/shared/src/locale-constants.js`, словари `apps/web-next/src/i18n/*`, флаги и 2 захардкоженных массива локалей (найдены разведкой в `admin/blog/[id]/page.jsx`, `seo/page.jsx`); доменный каталог сообщений whatsapp на 6 языках. Существующие `es/pt/he` не трогаем (удаление вне scope).
- **Observability** (`§6`): метрики pool size / queue depth / ban-rate / report-throughput / task-latency через структурные логи + счётчики; health-эндпоинты процесса.
- **Error handling** (`§8`): типизированные доменные ошибки с `code` → маппинг в MCP-ошибки; без стектрейсов наружу.

---

## 12. Конкурентность и консистентность (`§3.3–3.4`)

- Опт-лок (`version`) на переходах `DeviceWhatsappQueue`/`WhatsappAccount`.
- Эксклюзив устройства — существующий `mongo-lease` (`claimMongoLease`/`renewMongoLease`/`releaseMongoLease`).
- Exactly-once репорта — unique-индекс `(campaignId, accountId, targetMsisdn)` + idempotencyKey в `EngineJobRun`.
- At-least-once доставка джоб + идемпотентные хендлеры → эффект exactly-once.
- Eventual consistency: реконсилятор гарантирует сходимость даже при потере события.

---

## 13. Тестирование (`§14`)

- **Unit (домен):** state-machine переходы, политики pool/queue, решения `reconcile` — детерминированно с инъектируемым `Clock`.
- **Integration:** репозитории/адаптеры против Mongo/Rabbit.
- **Contract:** `ProcurementPort`, `WhatsappAutomationPort` (фиктивные реализации по контракту, без реальных вендоров — но без «моков-заглушек» в проде).
- **Ключевые цели:** идемпотентная закупка (двойной dispatch → одна закупка) и exactly-once репорт (двойная таска → один репорт).
- Co-located `*.test.js` + jest (`--experimental-vm-modules`), как в репо.

---

## 14. Переиспользование существующего кода (без дублирования)

| Существующее | Как используем |
|---|---|
| `EngineDevice` (`capacity`, `leasedUntil/By`) + `device-account-eligibility` | идентичность устройства, ёмкость, eligibility DuoPlus-подписки |
| `services/device-lease.service.js` + `shared/mongo-lease` | Lease на устройство |
| `services/job-dispatch.service.js` + `models/engine-job-run` | идемпотентный dispatch + ledger ретраев/backoff |
| `apps/api/src/queue/rabbitmq.js` (`publishJson`/`consumeJson`) | durable-очереди |
| `apps/api/src/cron/index.js` паттерн | добавляем cron-записи реконсилятора |
| `packages/integrations` (`IntegrationHttpClient`, `DjekxaClient`, `djekxa-importer`) | шаблон вендор-клиента + импортёра для dark.shopping |
| `models/engine-finance` (`EngineExpense`) | учёт закупки |
| `packages/device-control` (`DuoplusClient`, `DuoplusDirectController`, `ui-parser`) | провижн устройства + on-device автоматизация |
| `packages/automation` (`instagram/tiktok/youtube` ui-flows, `human-actor`) | шаблон whatsapp-модуля |
| `packages/config`, `packages/logger`, `packages/shared` | конфиг, логи, утилиты, locale |
| `worker/src/handlers/secret-resolver.js` паттерн | резолвинг secretRefs |

---

## 15. Вне scope v1 (YAGNI)

- Админ-UI панель в web-next (по образцу Engine/Djekxa) — опционально позже.
- OTP-регистрация номеров и адаптеры smsfast.io / DuoPlus Cloud Number (порт закупки готов, адаптеры — по мере надобности).
- Удаление лишних локалей `es/pt/he`.
- Мульти-компанийность/ATS-телефония из `REQUIREM §430` — это про широкую платформу, не про данный контекст.

---

## 16. Риски и открытые вопросы

- **Формат поставки dark.shopping** (какие поля/сессия отдаются на купленный аккаунт) — уточнить при реализации адаптера; влияет на `bringOnline`.
- **Установка WhatsApp APK на DuoPlus** — нужен `WHATSAPP_APK_URL` (team-APK), т.к. в каталоге DuoPlus WhatsApp нет.
- **UI-флоу репорта в WhatsApp** — верифицировать реальные экраны на устройстве (Report contact / Report and block), возможна регионально-версионная вариативность → нужна `EngineCoordinateMap`-подобная устойчивость к координатам.
- **Anti-abuse WhatsApp** — массовость репортов повышает риск бана самих репортящих; rate-limit и гуманизация обязательны.

---

## 17. Критерии готовности (маппинг к `REQUIREM §18`)

- [ ] Домен и state-machine покрыты unit-тестами (детерминированно).
- [ ] Идемпотентная закупка и exactly-once репорт доказаны тестами.
- [ ] Auth на MCP-HTTP + валидация аргументов tools.
- [ ] Structured logs + correlationId; метрики наблюдаемости.
- [ ] Ретраи/backoff + DLQ работают.
- [ ] Индексы БД (unique/partial) заданы.
- [ ] Конфиг 12-factor, без хардкода; секреты через resolver.
- [ ] Оба MCP-транспорта (stdio + HTTP) поднимаются.
- [ ] Локали ru/ua добавлены.
- [ ] CI: lint + typecheck-эквивалент + tests зелёные.
