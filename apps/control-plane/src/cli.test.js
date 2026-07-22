import { parseCliArgs, runCli } from './cli.js';

const facade = {
  async execute(operation, { role, args }) {
    if (operation === 'boom') return { data: null, error: { code: 'FORBIDDEN', message: 'no' }, meta: { operation } };
    return { data: { operation, role, args }, error: null, meta: { operation } };
  }
};

describe('parseCliArgs', () => {
  test('reads the operation and --key=value args (JSON-typed)', () => {
    const { operation, args } = parseCliArgs(['pool.status', '--platform=telegram', '--count=5', '--auto=true']);
    expect(operation).toBe('pool.status');
    expect(args).toEqual({ platform: 'telegram', count: 5, auto: true });
  });

  test('supports bare key=value too', () => {
    expect(parseCliArgs(['account.status', 'accountId=a1']).args).toEqual({ accountId: 'a1' });
  });
});

describe('runCli', () => {
  test('executes and returns code 0 with JSON output on success', async () => {
    const res = await runCli(['pool.status', '--platform=telegram'], { facade, role: 'operator' });
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).data).toMatchObject({ operation: 'pool.status', role: 'operator' });
  });

  test('returns a non-zero code and the error on failure', async () => {
    const res = await runCli(['boom'], { facade, role: 'readonly' });
    expect(res.code).toBe(1);
    expect(JSON.parse(res.stderr).code).toBe('FORBIDDEN');
  });

  test('errors when no operation is given', async () => {
    const res = await runCli([], { facade, role: 'admin' });
    expect(res.code).toBe(2);
  });
});
