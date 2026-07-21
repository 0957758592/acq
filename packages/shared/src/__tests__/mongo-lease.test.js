import { claimMongoLease, releaseMongoLease, renewMongoLease } from '../index.js';

function createFakeModel() {
  const calls = [];
  return {
    calls,
    async findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      return { _id: 'device-1', ...update.$set };
    }
  };
}

test('claimMongoLease atomically claims an expired lease', async () => {
  const model = createFakeModel();
  const result = await claimMongoLease(model, {
    owner: 'worker-1',
    ttlMs: 1000,
    filter: { status: 'running' }
  });

  expect(result.leasedBy).toBe('worker-1');
  expect(model.calls[0].filter.status).toBe('running');
  expect(model.calls[0].filter.$or).toHaveLength(3);
  expect(model.calls[0].options.new).toBe(true);
});

test('renewMongoLease requires the current owner', async () => {
  const model = createFakeModel();
  await renewMongoLease(model, 'device-1', { owner: 'worker-1', ttlMs: 1000 });

  expect(model.calls[0].filter).toEqual({ _id: 'device-1', leasedBy: 'worker-1' });
  expect(model.calls[0].update.$set.leasedUntil).toBeInstanceOf(Date);
});

test('releaseMongoLease clears lease fields', async () => {
  const model = createFakeModel();
  await releaseMongoLease(model, 'device-1', { owner: 'worker-1' });

  expect(model.calls[0].filter).toEqual({ _id: 'device-1', leasedBy: 'worker-1' });
  expect(model.calls[0].update.$set.leasedUntil).toBeNull();
  expect(model.calls[0].update.$unset.leasedBy).toBe('');
});
