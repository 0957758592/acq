/**
 * Port contracts for the whatsapp bounded context. These are documentation-only
 * typedefs; adapters live in @acq/whatsapp-infra (Plan 2+).
 *
 * @typedef {Object} PurchasedAccount
 * @property {string} msisdn
 * @property {string} source
 * @property {Object} secretRefs
 *
 * @typedef {Object} ProcurementPort
 * @property {() => Promise<{ balanceUsdCents: number }>} getBalance
 * @property {() => Promise<Array<Object>>} listOffers
 * @property {(quantity: number) => Promise<{ orderId: string }>} purchase
 * @property {(order: { orderId: string }) => Promise<PurchasedAccount[]>} fetchDelivered
 *
 * @typedef {Object} DeviceRegistrationPort
 * @property {(device: Object) => Promise<void>} ensureReady
 *
 * @typedef {Object} WhatsappAutomationPort
 * @property {(ctx: Object) => Promise<{ ok: boolean }>} bringOnline
 * @property {(ctx: Object, target: string) => Promise<{ ok: boolean, banned?: boolean }>} reportTarget
 * @property {(ctx: Object) => Promise<'online'|'banned'|'logged_out'>} probeState
 *
 * @typedef {Object} AccountRepo
 * @property {(filter: Object) => Promise<Object[]>} find
 * @property {(account: Object) => Promise<Object>} save
 * @property {(filter: Object) => Promise<number>} countAvailable
 * @property {(accounts: Object[], opts: { orderId: string }) => Promise<Object[]>} insertPurchased
 *
 * @typedef {Object} JobDispatcher
 * @property {(queue: string, job: Object, opts?: Object) => Promise<Object>} dispatch
 *
 * @typedef {Object} EventBus
 * @property {(event: Object) => Promise<void>} publish
 * @property {(type: string, handler: Function) => void} subscribe
 *
 * @typedef {Object} Clock
 * @property {() => Date} now
 */

export const PORTS = Object.freeze([
  'AccountRepo', 'DeviceQueueRepo', 'ReportRepo',
  'ProcurementPort', 'DeviceRegistrationPort', 'WhatsappAutomationPort',
  'JobDispatcher', 'EventBus', 'SecretResolver', 'Clock'
]);
