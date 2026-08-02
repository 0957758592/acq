import * as yup from 'yup';

// Per-operation input validators (TZ §11.1, REQUIREM §2.2 "strict schema
// validation, reject unknown fields"). ONE schema per facade operation; the
// facade runs validators[op](args) before the handler. Every schema rejects
// unknown fields (noUnknown) and coerces a validation failure into a single
// coded INVALID_ARGS error — no stack, no leaked internals.
const str = yup.string();
const num = yup.number();
const bool = yup.boolean();
const obj = yup.object();
const arr = yup.array();

function schema(shape) {
  return yup.object(shape).noUnknown(true);
}

// Compiles a schema into a validator fn: returns the validated args or throws a
// coded DomainError-shaped error the facade maps to INVALID_ARGS.
function compile(s) {
  return (args = {}) => {
    try {
      return s.validateSync(args, { abortEarly: false, stripUnknown: false });
    } catch (err) {
      throw Object.assign(new Error(`INVALID_ARGS: ${(err.errors || [err.message]).join('; ')}`), { code: 'INVALID_ARGS' });
    }
  };
}

export const SCHEMAS = {
  // Pool / acquisition
  'pool.status': schema({ platform: str, source: str }),
  'pool.acquire': schema({ platform: str.required(), source: str, quantity: num.integer().positive(), shopId: str, deviceId: str, niche: str, locale: str }),
  // Shops
  'shop.register': schema({ spec: obj.required() }),
  'shop.scan': schema({ shopUrl: str.required(), dryRun: bool, provider: str, model: str }),
  'shop.approve': schema({ shopId: str.required(), approvedBy: str.nullable() }),
  'shop.signup': schema({ shopId: str.required(), address: str, emailRef: str, passwordRef: str, usernameRef: str, extraFields: obj }),
  'shop.signup.confirm': schema({ shopId: str.required(), address: str, emailRef: str, imapPasswordRef: str, extraFields: obj }),
  'device.status': schema({ status: str, provider: str }),
  'device.selectors': schema({ platform: str.required() }),
  'device.selectors.set': schema({ platform: str.required(), selectors: obj.required(), updatedBy: str.nullable() }),
  'email.providers': schema({}),
  'email.identity.register': schema({ address: str.required(), provider: str, imapHost: str, imapPort: num.integer().positive(), passwordRef: str.required(), notes: str }),
  'email.identity.list': schema({}),
  'email.identity.disable': schema({ address: str.required() }),
  'llm.providers': schema({}),
  'llm.complete': schema({ provider: str, model: str, messages: arr.of(obj).required(), temperature: num, maxTokens: num.integer().positive(), responseFormat: obj }),
  'metrics.domain': schema({ platform: str }),
  'trace.recent': schema({ traceId: str, limit: num.integer().positive() }),
  'alerts.status': schema({ platform: str }),
  'compliance.export': schema({ accountId: str.required() }),
  'compliance.erase': schema({ accountId: str.required(), identifier: str.nullable() }),
  // Devices
  'device.enroll': schema({ provider: str, providerDeviceId: str.required(), name: str, region: str, capacity: obj, status: str }),
  'device.queue.get': schema({ deviceId: str.required(), platform: str.required() }),
  // Campaigns
  'campaign.create': schema({ platform: str.required(), actionType: str.required(), strategy: str, targets: arr.of(str), params: obj, status: str }),
  'campaign.status': schema({ platform: str, campaignId: str }),
  'campaign.pause': schema({ campaignId: str.required() }),
  'campaign.resume': schema({ campaignId: str.required() }),
  'campaign.stop': schema({ campaignId: str.required() }),
  'action.retry': schema({ campaignId: str.required(), accountId: str.required(), target: str.required(), actionType: str.required() }),
  // Accounts
  'account.status': schema({ accountId: str, platform: str }),
  'account.retire': schema({ accountId: str.required() }),
  'account.cooldown': schema({ accountId: str.required() }),
  'account.resume': schema({ accountId: str.required() }),
  'account.reassign': schema({ accountId: str.required(), deviceId: str.required() }),
  'account.refreshSession': schema({ accountId: str.required() }),
  'account.probe': schema({ accountId: str.required() }),
  'account.action': schema({ accountId: str.required(), actionType: str.required(), target: str.required() }),
  'account.tag': schema({ accountId: str.required(), add: arr.of(str), remove: arr.of(str) }),
  'account.bulk': schema({ platform: str, status: str, to: str.required(), limit: num.integer().positive() }),
  // Proxies
  'proxy.status': schema({ deviceId: str }),
  'proxy.assign': schema({ deviceId: str.required(), proxyId: str, geo: str }),
  'proxy.rotate': schema({ deviceId: str.required(), geo: str, force: bool }),
  // Intelligence / generation
  'scoring.score': schema({ subjectType: str.oneOf(['account', 'target']), subjectId: str, features: obj }),
  'persona.generate': schema({ niche: str, locale: str, seed: num.integer() }),
  'verification.rent': schema({ country: str.required(), service: str.required() }),
  // Browser sessions
  'browser.providers': schema({}),
  'browser.session.open': schema({ provider: str, proxy: str, userAgent: str, contextId: str, geo: str }),
  'browser.session.liveView': schema({ sessionId: str.required(), provider: str }),
  'browser.observe': schema({ sessionId: str.required(), goal: str.required(), url: str, browserProvider: str, provider: str, model: str }),
  'browser.act': schema({ sessionId: str.required(), goal: str.required(), url: str, browserProvider: str, provider: str, model: str }),
  // Scrape
  'scrape.run': schema({ platform: str.required(), targetType: str.required(), target: str.required(), params: obj }),
  'scrape.results': schema({ platform: str, type: str, cursor: str.nullable(), limit: num.integer().positive() }),
  // Reconciliation
  'reconcile.now': schema({ platform: str, source: str })
};

export function buildValidators() {
  return Object.fromEntries(Object.entries(SCHEMAS).map(([name, s]) => [name, compile(s)]));
}
