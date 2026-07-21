// stdio MCP entrypoint for @acq/whatsapp-app.
//
// Attaches the transport-agnostic MCP core (tools + resources + notification
// bridge) to a stdio JSON-RPC transport. This is the process an MCP client
// (e.g. Claude Desktop) spawns and speaks to over stdin/stdout.
//
// stdio gotcha: on stdio, stdout IS the JSON-RPC channel — any stray write to
// stdout corrupts the protocol. So `buildContext`'s logger is forced onto
// stderr via the injectable `createStructuredLogger` factory.
//
// No I/O runs at import: the collaborators are all injected with real defaults,
// but the transport is only constructed/connected when `startStdio()` runs.
// Tests call it with fakes; the guarded block below runs it on direct execution.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStructuredLogger } from '@acq/logger';
import { buildContext } from '../composition.js';
import { env } from '../config/env.js';
import { createMcpCore } from './core.js';
import { bridgeNotifications } from './notifications.js';

export async function startStdio({
  buildCtx = () =>
    buildContext({
      env,
      deps: {
        // Force logs to stderr — stdout carries JSON-RPC on stdio transports.
        createStructuredLogger: (opts) => createStructuredLogger({ ...opts, stream: process.stderr })
      }
    }),
  createCore = createMcpCore,
  bridge = bridgeNotifications,
  TransportClass = StdioServerTransport
} = {}) {
  const ctx = buildCtx();
  const core = createCore(ctx);
  bridge({ eventBus: ctx.eventBus, server: core.server, logger: ctx.logger });
  await core.attachTransport(new TransportClass());
  return core;
}

// Guarded direct-run entrypoint: only runs when executed directly, not on import.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  startStdio().catch((err) => {
    process.stderr.write(`mcp-stdio failed to start: ${err.message}\n`);
    process.exit(1);
  });
}
