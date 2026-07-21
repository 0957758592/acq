import { domainError } from '../errors.js';

// Explicit domain events (TZ §3.9). Published to the EventBus (Redis pub/sub +
// durable RabbitMQ mirror) and bridged to MCP notifications.
export const EVENT_TYPES = [
  'account.acquired',
  'account.online',
  'account.warmed',
  'account.banned',
  'account.checkpointed',
  'account.retired',
  'queue.low',
  'pool.low',
  'campaign.completed',
  'action.done',
  'scrape.done',
  'device.unhealthy',
  'proxy.unhealthy',
  'purchase.completed'
];

const KNOWN = new Set(EVENT_TYPES);

export function isKnownEventType(type) {
  return KNOWN.has(type);
}

export function makeEvent(type, payload, { clock }) {
  if (!isKnownEventType(type)) {
    throw domainError('EVENT_TYPE_UNKNOWN', `unknown event type '${type}'`);
  }
  return { type, occurredAt: clock().toISOString(), payload };
}
