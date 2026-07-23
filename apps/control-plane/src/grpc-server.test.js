import { createFacade } from '@acq/control';

import { makeExecuteHandler, loadControlProto } from './grpc-server.js';
import { buildUseCases } from './use-cases.js';

function facade() {
  const ctx = { config: {}, accountRepo: { countAvailable: async () => 8 }, campaignRepo: {}, clock: { now: () => new Date('2026-07-23T00:00:00Z') } };
  return createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
}

const tokens = { 'op-token': 'operator', 'ro-token': 'readonly' };
const authenticate = (header, { tokens: t }) => {
  const token = header?.replace(/^Bearer\s+/i, '');
  return t[token] ? { role: t[token], actor: token } : null;
};

function call(request, authHeader) {
  return { request, metadata: { get: (k) => (k === 'authorization' && authHeader ? [authHeader] : []) } };
}
const invoke = (handler, request, authHeader) => new Promise((res) => handler(call(request, authHeader), (_e, reply) => res(reply)));

describe('gRPC control surface', () => {
  it('loads the proto with a Control.Execute service', () => {
    const proto = loadControlProto();
    expect(proto.Control?.service).toBeDefined();
  });

  it('Execute routes through the facade and returns JSON envelope', async () => {
    const handler = makeExecuteHandler({ facade: facade(), authenticate, tokens });
    const reply = await invoke(handler, { operation: 'pool.status', args_json: JSON.stringify({ platform: 'telegram' }) }, 'Bearer ro-token');
    expect(JSON.parse(reply.data_json)).toMatchObject({ platform: 'telegram', available: 8 });
    expect(reply.error_json).toBe('');
  });

  it('rejects a missing/invalid bearer via metadata', async () => {
    const handler = makeExecuteHandler({ facade: facade(), authenticate, tokens });
    const reply = await invoke(handler, { operation: 'pool.status', args_json: '{}' }, 'Bearer nope');
    expect(JSON.parse(reply.error_json).code).toBe('UNAUTHORIZED');
  });

  it('surfaces a facade RBAC denial as error_json', async () => {
    const handler = makeExecuteHandler({ facade: facade(), authenticate, tokens });
    const reply = await invoke(handler, { operation: 'campaign.create', args_json: '{}' }, 'Bearer ro-token');
    expect(JSON.parse(reply.error_json).code).toBe('FORBIDDEN');
  });

  it('handles malformed args_json', async () => {
    const handler = makeExecuteHandler({ facade: facade(), authenticate, tokens });
    const reply = await invoke(handler, { operation: 'pool.status', args_json: '{bad' }, 'Bearer ro-token');
    expect(JSON.parse(reply.error_json).code).toBe('BAD_JSON');
  });
});
