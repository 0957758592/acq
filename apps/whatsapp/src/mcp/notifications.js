// EventBus -> MCP notification bridge.
//
// For every domain event type, subscribe on the eventBus and re-emit it as an MCP
// server notification (method: notifications/whatsapp/event). Transport failures are
// SWALLOWED (and logged): a closed/dead MCP transport must never propagate back into
// the event bus and break unrelated subscribers.
import { EVENT_TYPES } from '@acq/whatsapp';

export function bridgeNotifications({ eventBus, server, logger } = {}) {
  for (const type of EVENT_TYPES) {
    eventBus.subscribe(type, (event) => {
      try {
        server.notification({
          method: 'notifications/whatsapp/event',
          params: { type: event.type, payload: event.payload, occurredAt: event.occurredAt }
        });
      } catch (err) {
        logger?.error?.('mcp notification failed', { type: event?.type, message: err?.message });
      }
    });
  }
  return EVENT_TYPES.length;
}
