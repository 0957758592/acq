# @acq — Account-Lifecycle & Mass-Action Orchestrator

Standalone, self-contained platform for **buying accounts across stores, provisioning them onto cloud devices, and running mass actions at scale** — controlled by an external AI brain over MCP, or via CLI / HTTP / npm.

**Status:** **WhatsApp** (mass report) is fully implemented (335 tests green). **Telegram, Discord, TikTok, Instagram** are planned via the same buy → connect → queue → act lifecycle (per the WhatsApp specs + `docs/REQUIREM.md`).

> Extracted from the `julio` monorepo as an independent repo (scope `@acq/*`), fully vendored — it runs with zero dependency on that monorepo.

## What it does (WhatsApp today)
Keeps a **pool** of ready accounts on **DuoPlus cloud phones** as per-device **queues**, brings them online under a device **lease**, monitors **health** (ban detection), **auto-replaces** banned and **auto-buys** new accounts, and executes **report campaigns** against targets. Self-healing, idempotent, observable. See [`WA_FEAT.md`](WA_FEAT.md) (feature overview, RU/EN) and [`docs/whatsapp-runbook.md`](docs/whatsapp-runbook.md) (full runbook + go-live).

## Structure
```
packages/
  whatsapp/          pure domain (state machine, reconciler, policies) — zero deps
  whatsapp-infra/    adapters (Mongo repos, DLQ, dispatcher, event bus, procurement, device, automation)
  core/              vendored engine infra (Mongo/Redis/RabbitMQ, job ledger, lease, models, auth)
  device-control/    DuoPlus cloud-phone control
  automation/        on-device UI flows (whatsapp + instagram/tiktok/youtube) + human-actor
  integrations/      vendor HTTP clients (dark.shopping, …)
  config, logger, validation, humanizer, shared
apps/
  whatsapp/          the running process: orchestrator (cron + consumers) + MCP surface
```

## Quickstart
```bash
yarn install
yarn test           # 335 tests, 9 projects — proves self-containment
cp .env.example .env && $EDITOR .env
# run (two long-lived processes; Procfile-ready):
yarn start:whatsapp   # orchestrator worker (cron reconciler + queue consumers + /health)
yarn mcp:http         # MCP over HTTP (the brain connects here, bearer-authed)
# per-connection stdio MCP:
yarn mcp:stdio
```

## How it's controlled — brain / AI / manual, one MCP surface
- **Autonomous:** the cron reconciler + consumers run a continuous loop (buy, fill, bring-online, probe, replace, report) — no human needed.
- **AI brain (Obsidian):** drives goals over **MCP** — tools like `pool.buy`, `device.enroll`, `campaign.create/pause/resume/stop`, `reconcile.now`; receives event notifications.
- **Manual / CLI / HTTP / npm:** the same tools are callable from any MCP client; the packages are consumable as `@acq/*` npm workspaces; the MCP-HTTP surface is a plain bearer-authed HTTP endpoint. (A dedicated CLI is on the roadmap.)

## Go-live (WhatsApp)
Before real production, capture the external "verify-by-fact" facts (dark.shopping delivery format + auth, WhatsApp on-device selectors, on-device session import, DuoPlus team-APK id) and set env/secrets — the full checklist is in [`docs/whatsapp-runbook.md`](docs/whatsapp-runbook.md). Every un-captured fact **fails safe** (a coded error / hard block), never a guess.

## Roadmap
Multi-platform account purchase (per-store adapters: REST API / login+cookie session / bearer token) → connect to devices → queue → act, all centralized/modular/scalable per `docs/REQUIREM.md`; brain(Obsidian)/MCP + CLI on multiple servers; consumable as npm / standalone / MCP / CLI / HTTP / API.
