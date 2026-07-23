import { createFacade } from '@acq/control';

import { buildGraphqlSchema, runGraphql } from './graphql-surface.js';
import { buildUseCases } from './use-cases.js';

function schema() {
  const ctx = { config: {}, accountRepo: { countAvailable: async () => 6 }, campaignRepo: { createCampaign: async (i) => ({ _id: 'c1', ...i }) }, clock: { now: () => new Date('2026-07-23T00:00:00Z') } };
  const facade = createFacade({ useCases: buildUseCases(ctx), audit: { record: async () => {} } });
  return buildGraphqlSchema(facade);
}

const OP = 'query($op:String!,$a:JSON){ op(operation:$op, args:$a){ data error } }';
const MUT = 'mutation($op:String!,$a:JSON){ op(operation:$op, args:$a){ data error } }';

describe('GraphQL control surface', () => {
  it('routes a query op through the facade', async () => {
    const res = await runGraphql(schema(), { query: OP, variables: { op: 'pool.status', a: { platform: 'telegram' } }, context: { role: 'readonly' } });
    expect(res.errors).toBeUndefined();
    expect(res.data.op.data).toMatchObject({ platform: 'telegram', available: 6 });
  });

  it('routes a mutation op through the facade with RBAC from context', async () => {
    const res = await runGraphql(schema(), { query: MUT, variables: { op: 'campaign.create', a: { platform: 'telegram', actionType: 'report' } }, context: { role: 'operator' } });
    expect(res.data.op.data).toMatchObject({ platform: 'telegram', actionType: 'report' });
  });

  it('surfaces a facade RBAC denial as an envelope error (not a GraphQL throw)', async () => {
    const res = await runGraphql(schema(), { query: MUT, variables: { op: 'campaign.create', a: {} }, context: { role: 'readonly' } });
    expect(res.data.op.error).toMatchObject({ code: 'FORBIDDEN' });
  });
});
