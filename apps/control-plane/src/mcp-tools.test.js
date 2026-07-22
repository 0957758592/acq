import { buildMcpToolDefs, createMcpToolRouter } from './mcp-tools.js';

const facade = {
  async execute(operation, { role, args, correlationId }) {
    if (operation === 'pool.status') {
      return { data: { available: 5 }, error: null, meta: { operation, correlationId } };
    }
    return { data: null, error: { code: 'FORBIDDEN', message: 'no' }, meta: { operation, correlationId } };
  }
};

describe('buildMcpToolDefs', () => {
  test('exposes one MCP tool per facade operation', () => {
    const defs = buildMcpToolDefs();
    const names = defs.map((d) => d.name);
    expect(names).toContain('pool.status');
    expect(names).toContain('reconcile.now');
    defs.forEach((d) => {
      expect(typeof d.description).toBe('string');
      expect(d.inputSchema.type).toBe('object');
    });
  });

  test('marks mutating tools in the description', () => {
    const retire = buildMcpToolDefs().find((d) => d.name === 'account.retire');
    expect(retire.description).toMatch(/mutating/i);
  });
});

describe('createMcpToolRouter', () => {
  test('routes a successful call to MCP content', async () => {
    const router = createMcpToolRouter({ facade, role: 'brain' });
    const res = await router.callTool('pool.status', { platform: 'telegram' }, { correlationId: 'c1' });
    expect(res.isError).toBe(false);
    expect(JSON.parse(res.content[0].text)).toEqual({ available: 5 });
  });

  test('wraps an error envelope as an MCP error result', async () => {
    const router = createMcpToolRouter({ facade, role: 'readonly' });
    const res = await router.callTool('account.retire', {}, {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/FORBIDDEN/);
  });
});
