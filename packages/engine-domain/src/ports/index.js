/**
 * Generic engine-domain ports (TZ §4) — inward contracts implemented by
 * adapters in @acq/engine-infra and vendor packages, injected in the
 * composition root. Documentation-only JSDoc typedefs.
 *
 * @typedef {Object} AcquiredAccount
 * @property {string} identifier
 * @property {string} platform
 * @property {'purchase'|'generate'} source
 * @property {string} [shopId]
 * @property {Object} secretRefs
 *
 * @typedef {Object} AccountRepo
 * @property {(filter: Object) => Promise<Object[]>} find
 * @property {(account: Object) => Promise<Object>} save
 * @property {(q: Object) => Promise<number>} countAvailable
 * @property {(accounts: Object[], opts: { orderId: string }) => Promise<Object[]>} insertAcquired
 *
 * @typedef {Object} DeviceQueueRepo
 * @property {(deviceId: string, platform: string, targetDepth: number) => Promise<Object>} ensureQueue
 * @property {(deviceId: string, platform: string) => Promise<Object>} find
 * @property {(platform?: string) => Promise<Object[]>} listAll
 * @property {(queue: Object) => Promise<Object>} save
 *
 * @typedef {Object} CampaignRepo
 * @property {(input: Object) => Promise<Object>} createCampaign
 * @property {(id: string) => Promise<Object>} findCampaign
 * @property {(platform?: string) => Promise<Object[]>} listActiveCampaigns
 * @property {(id: string, status: string) => Promise<Object>} setCampaignStatus
 *
 * @typedef {Object} ActionTaskRepo
 * @property {(task: Object) => Promise<Object>} upsertTask
 * @property {(key: string, status: string) => Promise<Object>} markTask
 * @property {(campaignId: string) => Promise<string[]>} doneKeys
 * @property {(campaignId: string) => Promise<boolean>} hasOpenTasks
 *
 * @typedef {Object} PlatformAutomationPort
 * @property {(ctx: Object) => Promise<{ ok: boolean }>} bringOnline
 * @property {(ctx: Object, persona: Object) => Promise<{ ok: boolean }>} setupProfile
 * @property {(ctx: Object) => Promise<{ ok: boolean, level: number }>} warmup
 * @property {(ctx: Object, action: Object) => Promise<{ ok: boolean, banned?: boolean, checkpointed?: boolean }>} runAction
 * @property {(ctx: Object) => Promise<'online'|'banned'|'checkpointed'|'logged_out'>} probeState
 *
 * @typedef {Object} DeviceRegistrationPort
 * @property {(device: Object, platform: string) => Promise<void>} ensureReady
 *
 * @typedef {Object} JobDispatcher
 * @property {(queue: string, job: Object, opts?: Object) => Promise<Object>} dispatch
 *
 * @typedef {Object} EventBus
 * @property {(event: Object) => Promise<void>} publish
 * @property {(type: string, handler: Function) => void} subscribe
 *
 * @typedef {Object} SecretResolver
 * @property {(ref: string) => Promise<string>} resolve
 * @property {(name: string, value: string) => Promise<string>} put
 *
 * @typedef {Object} Clock
 * @property {() => Date} now
 */

export const PORTS = Object.freeze([
  'AccountRepo',
  'DeviceQueueRepo',
  'CampaignRepo',
  'ActionTaskRepo',
  'ScrapeResultRepo',
  'DeviceProvider',
  'PurchaseAdapter',
  'AccountGenerator',
  'PlatformAutomationPort',
  'ScrapeProvider',
  'DeviceRegistrationPort',
  'JobDispatcher',
  'EventBus',
  'SecretResolver',
  'CookieSessionStore',
  'Clock',
  'ApprovalPort',
  'ProxyProvider',
  'VerificationResourceProvider',
  'PersonaGenerator',
  'ContentGenerator',
  'MediaStore',
  'ScoringPort',
  'BrowserProvider'
]);
