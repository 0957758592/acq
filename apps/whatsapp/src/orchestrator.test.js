import {
  reconcileTick,
  HANDLERS,
  WHATSAPP_QUEUES,
  registerConsumers,
  republishRetries,
  scheduleProbes,
  healthHandler,
  main
} from './orchestrator.js';

// Tiny recorder helper (this suite runs ESM under experimental-vm-modules, where
// the `jest` global is not injected — so we roll our own spies).
function recorder(impl = () => undefined) {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    return impl(...args);
  };
  fn.calls = calls;
  return fn;
}

describe('reconcileTick', () => {
  test('builds snapshot, reconciles, dispatches intents, and returns them', async () => {
    const clock = { now: () => new Date('2026-07-10T09:00:00Z') };
    const jobDispatcher = { dispatch: () => {} };
    const ctx = { jobDispatcher, clock };

    const snapshot = { pool: { available: 3 } };
    const intents = [{ type: 'buy', quantity: 5 }];

    const buildSnapshotFn = recorder(async () => snapshot);
    const reconcileFn = recorder(() => intents);
    const dispatchIntentsFn = recorder(async () => undefined);

    const result = await reconcileTick(ctx, { buildSnapshotFn, reconcileFn, dispatchIntentsFn });

    expect(buildSnapshotFn.calls).toEqual([[ctx]]);
    expect(reconcileFn.calls).toEqual([[snapshot]]);
    expect(dispatchIntentsFn.calls).toHaveLength(1);
    expect(dispatchIntentsFn.calls[0][0]).toBe(intents);
    expect(dispatchIntentsFn.calls[0][1]).toEqual({ jobDispatcher, clock });
    expect(result).toBe(intents);
  });
});

describe('registerConsumers', () => {
  test('registers one DLQ consumer per queue with the right opts, threading correlationId', async () => {
    const clock = { now: () => new Date('2026-07-10T09:00:00Z') };
    const childLogger = { marker: 'child' };
    const logger = { child: recorder(() => childLogger) };
    const ctx = { logger, clock, procurement: {}, accountRepo: {}, expenseRecorder: {} };

    const consume = () => {};
    const publish = () => {};

    // run fake stands in for runJob: it records the call and invokes the inner
    // handler function so we can observe the correlationId-threaded ctx.
    const run = recorder(async (payload, innerFn) => {
      try {
        await innerFn(payload, { _id: 'JR-1' });
      } catch {
        /* real handler may throw on empty ctx — irrelevant here */
      }
      return { ok: true };
    });

    const consumeWithDlq = recorder(async () => undefined);

    await registerConsumers(ctx, {
      consumeWithDlq,
      consume,
      publish,
      run,
      prefetch: 1,
      maxAttempts: 3
    });

    // 6 consumers, one per HANDLERS entry, in order.
    expect(consumeWithDlq.calls).toHaveLength(6);
    expect(HANDLERS).toHaveLength(6);
    expect(consumeWithDlq.calls.map((c) => c[0])).toEqual([
      'whatsapp.buy',
      'whatsapp.queue-fill',
      'whatsapp.bring-online',
      'whatsapp.probe',
      'whatsapp.replace',
      'whatsapp.report'
    ]);

    // Each consumer gets the correctly-shaped opts object.
    for (const call of consumeWithDlq.calls) {
      const opts = call[2];
      expect(opts).toEqual({
        consumeJson: consume,
        publishJson: publish,
        clock,
        logger,
        prefetch: 1,
        maxAttempts: 3
      });
    }

    // Invoke one captured wrapped(payload): it must delegate to `run`, and the
    // inner handler must receive a ctx whose logger is child({ correlationId }).
    const firstWrapped = consumeWithDlq.calls[0][1];
    await firstWrapped({ jobRunId: 'abc' });

    expect(run.calls).toHaveLength(1);
    expect(run.calls[0][0]).toEqual({ jobRunId: 'abc' });
    expect(run.calls[0][2]).toEqual({ clock });
    // correlationId threaded from jobRun._id into logger.child(...)
    expect(logger.child.calls).toContainEqual([{ correlationId: 'JR-1' }]);
  });
});

describe('registerConsumers payload unwrapping', () => {
  test('hands the domain payload (message.payload) to the handler, not the whole message', async () => {
    const clock = { now: () => new Date('2026-07-10T09:00:00Z') };
    const logger = { child: recorder(() => ({})) };

    // buyAccountsHandler -> buyAccounts(...) reads `payload.quantity` and calls
    // procurement.purchase(quantity). Recording purchase's arg proves the handler
    // received the UNWRAPPED domain payload ({ quantity: 5 }) — not the whole
    // message (which would make quantity `undefined`). accountRepo.find returns a
    // non-empty array so buyAccounts short-circuits (idempotent) without I/O.
    const purchaseCalls = [];
    const ctx = {
      logger,
      clock,
      procurement: {
        purchase: (q) => {
          purchaseCalls.push(q);
          return { orderId: 'o1' };
        }
      },
      accountRepo: { find: async () => [{ _id: 'existing' }] },
      expenseRecorder: {}
    };

    const run = recorder(async (message, innerFn) => {
      await innerFn(message, { _id: 'JR-1' });
      return { ok: true };
    });
    const consumeWithDlq = recorder(async () => undefined);

    await registerConsumers(ctx, {
      consumeWithDlq,
      consume: () => {},
      publish: () => {},
      run
    });

    // First consumer is whatsapp.buy -> buyAccountsHandler.
    const buyWrapped = consumeWithDlq.calls[0][1];
    await buyWrapped({ jobRunId: 'jr1', jobName: 'buy-accounts', payload: { quantity: 5 } });

    // runJob still receives the FULL message (it needs message.jobRunId).
    expect(run.calls[0][0]).toEqual({ jobRunId: 'jr1', jobName: 'buy-accounts', payload: { quantity: 5 } });
    // The handler received the domain payload: quantity 5 flowed into purchase().
    expect(purchaseCalls).toEqual([5]);
  });
});

describe('republishRetries', () => {
  test('republishes due queued job runs, preserving payload/shape', async () => {
    const now = new Date('2026-07-10T09:00:00Z');
    const clock = { now: () => now };
    const ctx = { clock };

    const dueRows = [
      {
        _id: 'r1',
        queueName: 'whatsapp.buy',
        jobName: 'buy-accounts',
        targetType: 'account',
        targetId: 't1',
        payload: { quantity: 5 }
      },
      {
        _id: 'r2',
        queueName: 'whatsapp.probe',
        jobName: 'probe-health',
        targetType: '',
        targetId: null,
        payload: { deviceId: 'd1' }
      }
    ];

    let findArg;
    const model = {
      find: (q) => {
        findArg = q;
        return { lean: async () => dueRows };
      }
    };

    const publishCalls = [];
    const publish = async (queue, msg) => {
      publishCalls.push([queue, msg]);
    };

    const count = await republishRetries(ctx, { publish, model });

    // Query targets only whatsapp queues that are queued + due.
    expect(findArg).toEqual({
      queueName: { $in: WHATSAPP_QUEUES },
      status: 'queued',
      nextRetryAt: { $ne: null, $lte: now }
    });

    expect(count).toBe(2);
    expect(publishCalls).toEqual([
      [
        'whatsapp.buy',
        { jobRunId: 'r1', jobName: 'buy-accounts', targetType: 'account', targetId: 't1', payload: { quantity: 5 } }
      ],
      [
        'whatsapp.probe',
        { jobRunId: 'r2', jobName: 'probe-health', targetType: '', targetId: null, payload: { deviceId: 'd1' } }
      ]
    ]);
  });

  test('WHATSAPP_QUEUES mirrors the HANDLERS queue names', () => {
    expect(WHATSAPP_QUEUES).toEqual(HANDLERS.map((h) => h.queue));
  });
});

describe('scheduleProbes', () => {
  test('dispatches an hourly-bucketed probe per assigned online/cooldown account', async () => {
    const clock = { now: () => new Date('2026-07-11T09:00:00Z') };

    let findArg;
    const accountRepo = {
      find: async (q) => {
        findArg = q;
        return [
          { _id: 'a1', status: 'online', assignedDeviceId: 'd1' },
          { _id: 'a2', status: 'cooldown', assignedDeviceId: 'd2' },
          { _id: 'a3', status: 'online', assignedDeviceId: null }
        ];
      }
    };

    const dispatchCalls = [];
    const jobDispatcher = {
      dispatch: async (...args) => {
        dispatchCalls.push(args);
      }
    };

    const ctx = { accountRepo, jobDispatcher, clock };

    const dispatched = await scheduleProbes(ctx);

    // Query targets only online/cooldown accounts.
    expect(findArg).toEqual({ status: { $in: ['online', 'cooldown'] } });

    // a3 skipped (no assigned device) -> 2 dispatches, returns 2.
    expect(dispatched).toBe(2);
    expect(dispatchCalls).toEqual([
      [
        'whatsapp.probe',
        { jobName: 'probe-health', payload: { accountId: 'a1', deviceId: 'd1' } },
        { idempotencyKey: 'probe:a1:2026-07-11T09' }
      ],
      [
        'whatsapp.probe',
        { jobName: 'probe-health', payload: { accountId: 'a2', deviceId: 'd2' } },
        { idempotencyKey: 'probe:a2:2026-07-11T09' }
      ]
    ]);
  });

  test('dispatches nothing when there are no online/cooldown accounts', async () => {
    const clock = { now: () => new Date('2026-07-11T09:00:00Z') };
    const accountRepo = { find: async () => [] };
    const dispatchCalls = [];
    const jobDispatcher = { dispatch: async (...args) => dispatchCalls.push(args) };

    const dispatched = await scheduleProbes({ accountRepo, jobDispatcher, clock });

    expect(dispatched).toBe(0);
    expect(dispatchCalls).toEqual([]);
  });
});

describe('healthHandler', () => {
  function makeRes() {
    const rec = { head: undefined, body: undefined };
    return {
      writeHead(code, headers) {
        rec.head = [code, headers];
        return this;
      },
      end(body) {
        rec.body = body;
        return this;
      },
      rec
    };
  }

  test('answers GET /health with 200 JSON { ok:true, service:"whatsapp" }', () => {
    const res = makeRes();
    healthHandler({ url: '/health', method: 'GET' }, res);

    expect(res.rec.head[0]).toBe(200);
    expect(res.rec.head[1]['Content-Type']).toBe('application/json');
    expect(JSON.parse(res.rec.body)).toEqual({ ok: true, service: 'whatsapp' });
  });

  test('answers any other path with 404', () => {
    const res = makeRes();
    healthHandler({ url: '/other', method: 'GET' }, res);

    expect(res.rec.head[0]).toBe(404);
  });
});

describe('main env preflight', () => {
  test('rejects when MONGODB_URI is missing', async () => {
    await expect(main({ env: {} })).rejects.toThrow('Missing MONGODB_URI');
  });
});
