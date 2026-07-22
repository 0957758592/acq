import { createAccountGenerator } from './generator.js';

const personaGenerator = {
  generate: ({ seed }) => ({ displayName: `User ${seed}`, personaKey: `pk-${seed}`, nicheKey: 'fitness' })
};

describe('createAccountGenerator.generate', () => {
  it('produces AcquiredAccounts with source generate and persona linkage', async () => {
    const signup = async ({ persona }) => ({
      identifier: `${persona.personaKey}@gmail.com`,
      secretRefs: { session: `vault:${persona.personaKey}` }
    });
    const gen = createAccountGenerator({ signup, personaGenerator });
    const accounts = await gen.generate({ platform: 'gmail', deviceId: 'd1', count: 2, niche: 'fitness' });

    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({
      platform: 'gmail',
      source: 'generate',
      identifier: 'pk-0@gmail.com',
      personaRef: 'pk-0',
      secretRefs: { session: 'vault:pk-0' }
    });
  });

  it('surfaces a captcha as GEN_CAPTCHA_ENCOUNTERED (hard stop, no guessing)', async () => {
    const signup = async () => ({ captcha: true });
    const gen = createAccountGenerator({ signup, personaGenerator });
    await expect(gen.generate({ platform: 'gmail', deviceId: 'd1', count: 1 })).rejects.toMatchObject({
      code: 'GEN_CAPTCHA_ENCOUNTERED'
    });
  });

  it('surfaces a failed signup as GEN_VERIFICATION_FAILED', async () => {
    const signup = async () => ({ ok: false });
    const gen = createAccountGenerator({ signup, personaGenerator });
    await expect(gen.generate({ platform: 'gmail', deviceId: 'd1', count: 1 })).rejects.toMatchObject({
      code: 'GEN_VERIFICATION_FAILED'
    });
  });
});
