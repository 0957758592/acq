import { REPORT_STRATEGIES } from '@acq/whatsapp';
import {
  poolBuySchema,
  deviceEnrollSchema,
  deviceQueueGetSchema,
  campaignCreateSchema,
  campaignIdSchema,
  accountRetireSchema,
  emptySchema,
  validateArgs
} from './schemas.js';

describe('validateArgs', () => {
  it('resolves valid pool-buy args to the coerced object', async () => {
    await expect(validateArgs(poolBuySchema, { quantity: 5 })).resolves.toEqual({ quantity: 5 });
  });

  it('rejects unknown fields with MCP_ARGS_INVALID', async () => {
    await expect(validateArgs(poolBuySchema, { quantity: 5, extra: 1 })).rejects.toThrow('MCP_ARGS_INVALID');
  });

  it('rejects quantity below the minimum', async () => {
    await expect(validateArgs(poolBuySchema, { quantity: 0 })).rejects.toThrow('MCP_ARGS_INVALID');
  });

  it('rejects a campaign with no targets (min 1)', async () => {
    await expect(
      validateArgs(campaignCreateSchema, { targets: [], strategy: REPORT_STRATEGIES[0] })
    ).rejects.toThrow('MCP_ARGS_INVALID');
  });

  it('rejects a campaign with an unknown strategy (oneOf)', async () => {
    await expect(
      validateArgs(campaignCreateSchema, { targets: ['+491700000001'], strategy: 'bogus' })
    ).rejects.toThrow('MCP_ARGS_INVALID');
  });

  it('resolves a valid campaign create', async () => {
    await expect(
      validateArgs(campaignCreateSchema, { targets: ['+491700000001'], strategy: REPORT_STRATEGIES[0] })
    ).resolves.toEqual({ targets: ['+491700000001'], strategy: REPORT_STRATEGIES[0] });
  });

  it('resolves valid device-enroll args', async () => {
    await expect(validateArgs(deviceEnrollSchema, { deviceId: 'd1', targetDepth: 3 }))
      .resolves.toEqual({ deviceId: 'd1', targetDepth: 3 });
  });

  it('rejects device-enroll missing deviceId', async () => {
    await expect(validateArgs(deviceEnrollSchema, { targetDepth: 3 })).rejects.toThrow('MCP_ARGS_INVALID');
  });

  it('resolves valid device-queue-get / campaign-id / account-retire id args', async () => {
    await expect(validateArgs(deviceQueueGetSchema, { deviceId: 'd1' })).resolves.toEqual({ deviceId: 'd1' });
    await expect(validateArgs(campaignIdSchema, { id: 'c1' })).resolves.toEqual({ id: 'c1' });
    await expect(validateArgs(accountRetireSchema, { id: 'a1' })).resolves.toEqual({ id: 'a1' });
  });

  it('emptySchema resolves {} and rejects unknown fields', async () => {
    await expect(validateArgs(emptySchema, {})).resolves.toEqual({});
    await expect(validateArgs(emptySchema, undefined)).resolves.toEqual({});
    await expect(validateArgs(emptySchema, { anything: 1 })).rejects.toThrow('MCP_ARGS_INVALID');
  });
});
