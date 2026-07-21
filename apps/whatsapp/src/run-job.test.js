import { runJob, nextRetryDate } from './run-job.js';

const clock = { now: () => new Date('2026-07-10T09:00:00.000Z') };

function fakeJobRun(overrides = {}) {
  const snapshots = [];
  const jobRun = {
    status: 'queued',
    attempts: 0,
    maxAttempts: 3,
    nextRetryAt: null,
    startedAt: null,
    completedAt: null,
    workerId: '',
    result: null,
    lastError: null,
    ...overrides,
    snapshots,
    async save() {
      snapshots.push({
        status: this.status,
        attempts: this.attempts,
        nextRetryAt: this.nextRetryAt,
        startedAt: this.startedAt,
        completedAt: this.completedAt,
        workerId: this.workerId,
        result: this.result,
        lastError: this.lastError
      });
      return this;
    }
  };
  return jobRun;
}

function fakeModel(jobRun) {
  const calls = [];
  return {
    calls,
    async findById(id) {
      calls.push(id);
      return jobRun;
    }
  };
}

// Hand-rolled spy (repo ESM jest does not expose the `jest` global; see intents.test.js).
function spy(impl = async () => undefined) {
  const fn = async (...args) => {
    fn.calls.push(args);
    return impl(...args);
  };
  fn.calls = [];
  return fn;
}

describe('nextRetryDate', () => {
  it('computes a 30s backoff for the first attempt', () => {
    expect(nextRetryDate(1, clock)).toEqual(new Date('2026-07-10T09:00:30.000Z'));
  });

  it('caps backoff at 15 minutes', () => {
    expect(nextRetryDate(10, clock)).toEqual(new Date('2026-07-10T09:15:00.000Z'));
  });
});

describe('runJob', () => {
  it('marks the run succeeded when the handler resolves', async () => {
    const jobRun = fakeJobRun();
    const model = fakeModel(jobRun);
    const handler = spy(async () => ({ x: 1 }));

    const result = await runJob({ jobRunId: 'j1' }, handler, { model, clock });

    expect(handler.calls).toHaveLength(1);
    expect(result).toBe(jobRun);
    expect(jobRun.status).toBe('succeeded');
    expect(jobRun.result).toEqual({ x: 1 });
    expect(jobRun.completedAt).toEqual(new Date('2026-07-10T09:00:00.000Z'));
    expect(jobRun.startedAt).toEqual(new Date('2026-07-10T09:00:00.000Z'));
    expect(jobRun.workerId).toBe('whatsapp');
  });

  it('re-queues and re-throws WITHOUT permanent on a transient failure', async () => {
    const jobRun = fakeJobRun({ maxAttempts: 3, attempts: 0 });
    const model = fakeModel(jobRun);
    const error = new Error('boom');
    const handler = spy(async () => {
      throw error;
    });

    await expect(runJob({ jobRunId: 'j1' }, handler, { model, clock })).rejects.toBe(error);

    expect(jobRun.attempts).toBe(1);
    expect(jobRun.status).toBe('queued');
    expect(jobRun.nextRetryAt).toEqual(new Date('2026-07-10T09:00:30.000Z'));
    expect(jobRun.lastError).toEqual({ code: '', message: 'boom', stack: error.stack });
    expect(error.permanent).toBeUndefined();
  });

  it('fails and re-throws tagged terminal when attempts are exhausted', async () => {
    const jobRun = fakeJobRun({ maxAttempts: 3, attempts: 2 });
    const model = fakeModel(jobRun);
    const error = new Error('boom');
    const handler = spy(async () => {
      throw error;
    });

    await expect(runJob({ jobRunId: 'j1' }, handler, { model, clock })).rejects.toBe(error);

    expect(jobRun.attempts).toBe(3);
    expect(jobRun.status).toBe('failed');
    expect(jobRun.nextRetryAt).toBeNull();
    expect(error.permanent).toBe(true);
    expect(error.attempts).toBe(3);
    expect(error.maxAttempts).toBe(3);
  });

  it('short-circuits idempotently when the run already succeeded', async () => {
    const jobRun = fakeJobRun({ status: 'succeeded' });
    const model = fakeModel(jobRun);
    const handler = spy();

    const result = await runJob({ jobRunId: 'j1' }, handler, { model, clock });

    expect(result).toBe(jobRun);
    expect(handler.calls).toHaveLength(0);
    expect(jobRun.snapshots).toHaveLength(0);
  });

  it('short-circuits idempotently when the run was cancelled', async () => {
    const jobRun = fakeJobRun({ status: 'cancelled' });
    const model = fakeModel(jobRun);
    const handler = spy();

    const result = await runJob({ jobRunId: 'j1' }, handler, { model, clock });

    expect(result).toBe(jobRun);
    expect(handler.calls).toHaveLength(0);
    expect(jobRun.snapshots).toHaveLength(0);
  });

  it('returns null and skips the handler when the run is missing', async () => {
    const model = fakeModel(null);
    const handler = spy();

    const result = await runJob({ jobRunId: 'missing' }, handler, { model, clock });

    expect(result).toBeNull();
    expect(handler.calls).toHaveLength(0);
  });
});
