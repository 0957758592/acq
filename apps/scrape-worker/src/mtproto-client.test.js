import { buildMtprotoClientFromEnv } from './mtproto-client.js';

const gramjs = { TelegramClient: class {}, StringSession: class {} };

test('returns null when session/api config is absent (tier simply stays unwired)', () => {
  expect(buildMtprotoClientFromEnv({ gramjs })).toBeNull();
  expect(buildMtprotoClientFromEnv({ apiId: 2040, apiHash: 'h', gramjs })).toBeNull();
  expect(buildMtprotoClientFromEnv({ apiId: 2040, apiHash: 'h', sessionString: 's' })).toBeNull();
});

test('builds the GramJS-backed client when fully configured', () => {
  let passed;
  const createClient = (args) => { passed = args; return { getMessages() {}, getParticipants() {} }; };
  const client = buildMtprotoClientFromEnv({ apiId: 2040, apiHash: 'h', sessionString: '1AZ', gramjs, createClient });
  expect(client.getMessages).toBeInstanceOf(Function);
  expect(client.getParticipants).toBeInstanceOf(Function);
  expect(passed).toMatchObject({ apiId: 2040, apiHash: 'h', sessionString: '1AZ', gramjs });
});
