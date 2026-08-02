# Login/scrape browser architecture — own vs Browserbase, Stagehand, Codex

Research + decision for how `@acq` drives browser logins and scraping at scale.
Tracked here (the `docs/` design folder is intentionally out of git). This is the
written form of the decision now encoded in code (`browser.providers` op +
`@acq/browser` backends + AI actor).

## Question

1. Own browser vs Browserbase for the login architecture?
2. Stagehand (cloud, scalable) — where does it fit?
3. Codex CLI / plugins — "the codex GOAL": what runs there?

## The four things, and what each actually is

| Thing | What it is | Role here |
|---|---|---|
| **Own Puppeteer/CDP pool** | Our self-hosted headless-Chromium fleet (`createPuppeteerBrowserProvider` + `@acq/browser` session provider) | The **browser** — default backend |
| **Browserbase** | Managed cloud browser fleet (stealth, residential proxies, CAPTCHA solving, thousands of concurrent CDP sessions, live-view/takeover, persistent contexts, replay) | The **browser** — cloud backend for scale |
| **Stagehand** | AI automation SDK (`act/observe/extract(schema)`) on top of Playwright; runs on your own browser **or** on Browserbase | The **action layer** on top of a browser |
| **Codex CLI / plugins** | Agentic execution/orchestration CLI | The **orchestrator** that drives our facade — not a browser |

The key insight: **Browserbase and our pool are interchangeable *browsers*; Stagehand
is an *action layer* over either; Codex is an *agent* that calls our operations.**
They are not competing choices — they stack.

## Own pool — trade-offs

Already built and integrated into the exactly-once lifecycle engine, brain/MCP-native,
per-page anti-detect context, live-view devtools URL, scroll-until-dry, CAPTCHA
hard-stop.

- **Pros:** full control; zero per-session cost; data stays in-house (privacy/compliance);
  already wired into the engine.
- **Cons:** *we* run the hard infrastructure — horizontal scale (servers), stealth
  fingerprinting, **residential proxies must be sourced/paid for**, and there is no
  built-in CAPTCHA solver (we stop). Thousands of concurrent stealth sessions on our
  own hardware is operationally heavy.

## Browserbase — trade-offs

The exact "design target" already referenced in `docs/TZ.md`, and it is **CDP-compatible**,
so it drops in behind our existing `BrowserProvider` port.

- **Pros:** instant horizontal scale; managed stealth + residential proxies + CAPTCHA
  solving; live-view/takeover and session replay as a service.
- **Cons:** per-session cost; **data transits a third party** (privacy/compliance
  review needed for account credentials); external dependency/availability.

## Decision — hybrid behind one port (no core rewrite)

1. **Own pool = default and backbone.** Baseline volume and privacy-sensitive flows
   run in-house: free per session, data never leaves, already in the engine.
2. **Browserbase = pluggable adapter behind the same `BrowserProvider` port**, selected
   by config/env per tenant or per job — when we need thousands of stealth sessions,
   managed residential proxies, or CAPTCHA solving. **The core does not change**; the
   hexagonal port was designed for exactly this swap.
3. **Stagehand-style `observe→act` for logins**, on top of whichever backend, driven by
   our unified `llm.complete` (default `gpt-5-codex` → Anthropic/Gemini/OpenRouter/custom).
   The LLM reads a live page snapshot and decides the action, so a login **survives DOM
   drift** instead of breaking on a renamed selector.
4. **Codex is the agent/orchestrator, not a browser.** A Codex-style agent drives the
   facade over MCP/A2A; our provider registry already defaults to `gpt-5-codex`. "Running
   on Codex CLI" = the brain contour we already expose — no browser runs "on Codex".
5. **CAPTCHA stays a hard-stop.** We never solve blind; a licensed solver is wired only
   explicitly, under authorized use.

## What this maps to in code (implemented)

- **`@acq/browser` `BROWSER_PROVIDERS` registry + `listBrowserProviders({configured})`** —
  `own` (self-hosted, always ready) and `browserbase` (cloud, ready only when keyed).
- **`createBrowserbaseProvider(...)`** — Browserbase adapter implementing the same port
  (`createSession/connect/liveView/record/close`); real REST calls; keyless →
  coded `BROWSERBASE_API_KEY_REQUIRED`; vendor error → coded `BROWSERBASE_REQUEST_FAILED`
  (never a leaked INTERNAL).
- **`createAiActor({llm, browser})`** — Stagehand-style `observe(session,{goal})` →
  `act(session,{goal})` over `llm.complete`; honest coded seams when the LLM/browser is
  absent or the backend has no action primitive (`BROWSER_ACT_UNSUPPORTED`) — it never
  fakes a click.
- **`browser.providers` facade op** (role: all, read-only) — exposed on **every surface**
  (MCP · RAG · REST · gRPC · WS · GraphQL · A2A · CLI) plus the **`acq://browser-providers`**
  RAG read-model. The operator/brain lists backends + capabilities + configured state and
  picks one per job.
- **`composition.js`** wires `browserProviders()`, `defaultBrowserProvider` (`own`),
  `browserBackendFor({provider})` (own pool or Browserbase adapter; keyless cloud →
  coded `BROWSERBASE_UNCONFIGURED`), and `aiActorFor({provider,model,browserProvider})`.

## To run cloud + AI-actor for real

- `BROWSERBASE_API_KEY` (+ `BROWSERBASE_PROJECT_ID`) — flips the `browserbase` backend to
  `configured: true`; sessions then run on the managed fleet.
- an LLM key (`OPENAI_API_KEY` default, or Anthropic/Google/OpenRouter/custom) — enables
  the `observe→act` actor for logins.

Everything is off by default and fails safe with coded seams until keyed — nothing is
hardcoded, no bot-protection is bypassed.
