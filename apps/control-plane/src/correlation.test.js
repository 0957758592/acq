import { correlationMiddleware } from './correlation.js';

function run(headers, { genId } = {}) {
  const req = { headers };
  let setHeader = null;
  const res = { setHeader: (k, v) => { setHeader = { k, v }; } };
  let nexted = false;
  correlationMiddleware({ genId })(req, res, () => { nexted = true; });
  return { req, setHeader, nexted };
}

describe('correlationMiddleware', () => {
  test('reuses an inbound x-correlation-id', () => {
    const { req, setHeader } = run({ 'x-correlation-id': 'abc' });
    expect(req.correlationId).toBe('abc');
    expect(setHeader).toEqual({ k: 'x-correlation-id', v: 'abc' });
  });

  test('generates one when absent and echoes it back', () => {
    const { req, setHeader, nexted } = run({}, { genId: () => 'gen-1' });
    expect(req.correlationId).toBe('gen-1');
    expect(setHeader.v).toBe('gen-1');
    expect(nexted).toBe(true);
  });
});
