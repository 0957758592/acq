import { importDelivered, mapDeliveredAccount } from './dark-shopping-importer.js';

// A CONTRACT-shaped fixture. This encodes the shape we EXPECT the real
// dark.shopping delivery payload to have, and is explicitly provisional until a
// live payload is captured (see it.todo below). The importer must NEVER map an
// unverified payload — that guard is the crux of this seam.
const contractPayload = {
  accounts: [{ phone: '+49 170 1234567', session: 'keychain:wa-x' }]
};

describe('importDelivered (dark.shopping delivery-format seam)', () => {
  test('refuses an unverified delivery format by default', () => {
    expect(() => importDelivered(contractPayload)).toThrow(
      'PROCUREMENT_DELIVERY_FORMAT_UNVERIFIED'
    );
  });

  test('maps a verified, contract-shaped payload to PurchasedAccount[]', () => {
    const result = importDelivered(contractPayload, { verifiedFormat: true });
    expect(result).toEqual([
      {
        msisdn: '+491701234567',
        source: 'dark_shopping',
        secretRefs: { session: 'keychain:wa-x' }
      }
    ]);
  });

  test('mapDeliveredAccount normalizes the msisdn and keeps secrets under secretRefs', () => {
    expect(mapDeliveredAccount({ phone: '+49 170 1234567', session: 'keychain:wa-x' })).toEqual({
      msisdn: '+491701234567',
      source: 'dark_shopping',
      secretRefs: { session: 'keychain:wa-x' }
    });
  });

  // The one thing we CANNOT know from code: the real wire shape. Capture it,
  // then implement mapDeliveredAccount against it and drop a real fixture here.
  it.todo('maps the REAL dark.shopping delivery payload once observed');
});
