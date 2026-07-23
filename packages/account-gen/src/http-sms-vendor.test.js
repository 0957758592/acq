import { createHttpSmsVendor } from './http-sms-vendor.js';
import { createVerificationResourceProvider } from './verification-provider.js';

function fakeHttp(byUrl) {
  return { request: async ({ url, body }) => (typeof byUrl[url] === 'function' ? byUrl[url](body) : byUrl[url]) };
}

const endpoints = {
  rent: { method: 'POST', url: 'https://sms/rent' },
  status: { method: 'GET', url: 'https://sms/status' },
  cancel: { method: 'POST', url: 'https://sms/cancel' }
};
const map = { numberId: 'data.id', msisdn: 'data.phone', code: 'data.code', status: 'data.status', exhaustedStatuses: ['cancelled', 'expired'] };

describe('createHttpSmsVendor (§6.7 SMS verification vendor)', () => {
  it('rents a number', async () => {
    const vendor = createHttpSmsVendor({ httpClient: fakeHttp({ 'https://sms/rent': { data: { id: 'n1', phone: '+15551234567' } } }), endpoints, map });
    expect(await vendor.rentNumber({ country: 'US', service: 'telegram' })).toEqual({ numberId: 'n1', msisdn: '+15551234567' });
  });

  it('pollSms returns null while pending, then the code once it arrives', async () => {
    let arrived = false;
    const vendor = createHttpSmsVendor({ httpClient: fakeHttp({ 'https://sms/status': () => (arrived ? { data: { status: 'ok', code: '123456' } } : { data: { status: 'waiting' } }) }), endpoints, map });
    expect(await vendor.pollSms('n1')).toBeNull();
    arrived = true;
    expect(await vendor.pollSms('n1')).toBe('123456');
  });

  it('pollSms throws VERIFICATION_CODE_TIMEOUT when the rental is exhausted', async () => {
    const vendor = createHttpSmsVendor({ httpClient: fakeHttp({ 'https://sms/status': { data: { status: 'cancelled' } } }), endpoints, map });
    await expect(vendor.pollSms('n1')).rejects.toMatchObject({ code: 'VERIFICATION_CODE_TIMEOUT' });
  });

  it('plugs into createVerificationResourceProvider (rentNumber routed to the SMS vendor)', async () => {
    const sms = createHttpSmsVendor({ httpClient: fakeHttp({ 'https://sms/rent': { data: { id: 'n2', phone: '+15550000000' } } }), endpoints, map });
    const provider = createVerificationResourceProvider({ sms });
    expect(await provider.rentNumber({ country: 'US', service: 'discord' })).toMatchObject({ numberId: 'n2' });
  });

  it('is an honest seam when the vendor is unconfigured', async () => {
    const vendor = createHttpSmsVendor({ httpClient: fakeHttp({}), endpoints: {}, map });
    await expect(vendor.rentNumber({})).rejects.toMatchObject({ code: 'VERIFICATION_VENDOR_UNCONFIGURED' });
  });
});
