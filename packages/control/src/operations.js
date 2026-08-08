// Single catalog of facade operations (TZ §11.1). Each surface (MCP/REST/CLI/…)
// exposes exactly these — one definition, many surfaces (SoC/DRY). Each op
// declares whether it mutates and which roles may call it (admin is implicit
// everywhere via rbac.can).
const R = {
  all: ['admin', 'operator', 'brain', 'readonly'],
  ops: ['admin', 'operator', 'brain'],
  staff: ['admin', 'operator'],
  admin: ['admin']
};

export const OPERATIONS = [
  { name: 'pool.status', mutating: false, roles: R.all },
  { name: 'pool.acquire', mutating: true, roles: R.ops },
  { name: 'shop.register', mutating: true, roles: R.staff },
  { name: 'shop.scan', mutating: true, roles: R.staff },
  { name: 'shop.approve', mutating: true, roles: R.admin },
  { name: 'shop.signup', mutating: true, roles: R.ops },
  { name: 'shop.signup.confirm', mutating: true, roles: R.ops },
  { name: 'shop.balance', mutating: false, roles: R.ops },
  { name: 'shop.search', mutating: false, roles: R.ops },
  { name: 'shop.buy', mutating: true, roles: R.ops },
  { name: 'shop.deliver', mutating: true, roles: R.ops },
  { name: 'device.enroll', mutating: true, roles: R.staff },
  { name: 'device.queue.get', mutating: false, roles: R.all },
  { name: 'device.status', mutating: false, roles: R.all },
  { name: 'device.selectors', mutating: false, roles: R.all },
  { name: 'device.selectors.set', mutating: true, roles: R.ops },
  { name: 'campaign.create', mutating: true, roles: R.ops },
  { name: 'campaign.status', mutating: false, roles: R.all },
  { name: 'campaign.pause', mutating: true, roles: R.ops },
  { name: 'campaign.resume', mutating: true, roles: R.ops },
  { name: 'campaign.stop', mutating: true, roles: R.ops },
  { name: 'action.retry', mutating: true, roles: R.ops },
  { name: 'account.status', mutating: false, roles: R.all },
  { name: 'account.retire', mutating: true, roles: R.staff },
  { name: 'account.cooldown', mutating: true, roles: R.ops },
  { name: 'account.resume', mutating: true, roles: R.ops },
  { name: 'account.reassign', mutating: true, roles: R.staff },
  { name: 'account.refreshSession', mutating: true, roles: R.ops },
  { name: 'account.probe', mutating: true, roles: R.ops },
  { name: 'account.action', mutating: true, roles: R.ops },
  { name: 'account.browserLogin', mutating: true, roles: R.ops },
  { name: 'account.tag', mutating: true, roles: R.ops },
  { name: 'account.bulk', mutating: true, roles: R.staff },
  { name: 'proxy.status', mutating: false, roles: R.all },
  { name: 'proxy.assign', mutating: true, roles: R.ops },
  { name: 'proxy.rotate', mutating: true, roles: R.staff },
  { name: 'scoring.score', mutating: false, roles: R.all },
  { name: 'persona.generate', mutating: true, roles: R.ops },
  { name: 'verification.rent', mutating: true, roles: R.ops },
  { name: 'browser.providers', mutating: false, roles: R.all },
  { name: 'browser.session.open', mutating: true, roles: R.ops },
  { name: 'browser.session.liveView', mutating: false, roles: R.ops },
  { name: 'browser.observe', mutating: false, roles: R.ops },
  { name: 'browser.act', mutating: true, roles: R.ops },
  { name: 'scrape.run', mutating: true, roles: R.ops },
  { name: 'scrape.results', mutating: false, roles: R.all },
  { name: 'reconcile.now', mutating: true, roles: R.ops },
  // Callable targets database (TZ §3.5/§10.5) — CRUD + score/tag/status on all surfaces
  { name: 'target.add', mutating: true, roles: R.ops },
  { name: 'target.import', mutating: true, roles: R.ops },
  { name: 'target.list', mutating: false, roles: R.all },
  { name: 'target.get', mutating: false, roles: R.all },
  { name: 'target.score', mutating: true, roles: R.ops },
  { name: 'target.tag', mutating: true, roles: R.ops },
  { name: 'target.status', mutating: true, roles: R.ops },
  // Parser/action telemetry stream (TZ §15) — record + query + output-max summary
  { name: 'telemetry.record', mutating: true, roles: R.ops },
  { name: 'telemetry.query', mutating: false, roles: R.all },
  { name: 'telemetry.summary', mutating: false, roles: R.all },
  // AI content generation (TZ §9.8) — LLM comment for a target
  { name: 'content.comment', mutating: false, roles: R.ops },
  { name: 'email.providers', mutating: false, roles: R.all },
  { name: 'email.identity.register', mutating: true, roles: R.staff },
  { name: 'email.identity.list', mutating: false, roles: R.all },
  { name: 'email.identity.disable', mutating: true, roles: R.staff },
  { name: 'llm.providers', mutating: false, roles: R.all },
  { name: 'llm.complete', mutating: false, roles: R.ops },
  { name: 'metrics.domain', mutating: false, roles: R.all },
  { name: 'trace.recent', mutating: false, roles: R.all },
  { name: 'alerts.status', mutating: false, roles: R.all },
  { name: 'compliance.export', mutating: false, roles: R.admin },
  { name: 'compliance.erase', mutating: true, roles: R.admin }
];

const BY_NAME = new Map(OPERATIONS.map((op) => [op.name, op]));

export function getOperation(name) {
  return BY_NAME.get(name);
}
