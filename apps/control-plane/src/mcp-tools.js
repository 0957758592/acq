import { OPERATIONS } from '@acq/control';

// MCP tool surface over the single command facade (TZ §11.3 — the brain contour).
// Tool definitions are GENERATED from the OPERATIONS catalog, so MCP and REST
// expose exactly the same operations from one source (no rico drift). Calls
// route through the facade (RBAC + validation + audit + error mapping) and the
// envelope is wrapped in MCP content.
export function buildMcpToolDefs() {
  return OPERATIONS.map((op) => ({
    name: op.name,
    description: `${op.mutating ? '[mutating] ' : '[read] '}${op.name} (roles: ${op.roles.join(', ')})`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true }
  }));
}

export function createMcpToolRouter({ facade, role = 'brain' } = {}) {
  return {
    listTools: buildMcpToolDefs,
    async callTool(name, args = {}, { correlationId, actor } = {}) {
      const envelope = await facade.execute(name, { role, args, correlationId, actor });
      if (envelope.error) {
        return { content: [{ type: 'text', text: JSON.stringify(envelope.error) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(envelope.data) }], isError: false };
    }
  };
}
