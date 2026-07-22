import { createVerificationResourceProvider } from './verification-provider.js';

describe('createVerificationResourceProvider', () => {
  it('delegates rentNumber to the configured SMS vendor', async () => {
    const sms = { rentNumber: async ({ country }) => ({ numberId: 'n1', msisdn: `+${country}555` }) };
    const provider = createVerificationResourceProvider({ sms });
    await expect(provider.rentNumber({ country: '1', service: 'gmail' })).resolves.toEqual({
      numberId: 'n1',
      msisdn: '+1555'
    });
  });

  it('rentNumber fails safe with VERIFICATION_NUMBER_UNAVAILABLE when no SMS vendor', async () => {
    const provider = createVerificationResourceProvider({});
    await expect(provider.rentNumber({ country: '1', service: 'gmail' })).rejects.toMatchObject({
      code: 'VERIFICATION_NUMBER_UNAVAILABLE'
    });
  });

  it('provisionEmail delegates to the email vendor', async () => {
    const email = { provisionEmail: async () => ({ email: 'a@mail.tm', secretRef: 'vault:e1' }) };
    const provider = createVerificationResourceProvider({ email });
    await expect(provider.provisionEmail()).resolves.toEqual({ email: 'a@mail.tm', secretRef: 'vault:e1' });
  });

  it('provisionEmail fails safe when no email vendor', async () => {
    const provider = createVerificationResourceProvider({});
    await expect(provider.provisionEmail()).rejects.toMatchObject({ code: 'VERIFICATION_NUMBER_UNAVAILABLE' });
  });
});
