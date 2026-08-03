import { emailIdentitiesViewModel } from './email-identities.js';

describe('emailIdentitiesViewModel', () => {
  test('rows show address/provider/type/auth/status; never a secret', () => {
    const vm = emailIdentitiesViewModel([
      { address: 'a@gmail.com', provider: 'gmail', category: 'aged', status: 'active', hasPasswordRef: true, hasAccessTokenRef: false },
      { address: 'b@outlook.com', provider: 'outlook', category: 'manual', status: 'active', hasPasswordRef: false, hasAccessTokenRef: true }
    ]);
    expect(vm.total).toBe(2);
    expect(vm.byCategory).toEqual({ aged: 1, manual: 1 });
    expect(vm.rows[0]).toMatchObject({ address: 'a@gmail.com', provider: 'gmail', category: 'aged', auth: 'password', status: 'active' });
    expect(vm.rows[1].auth).toBe('token');
    expect(JSON.stringify(vm)).not.toMatch(/vault:|secret/i);
  });
});
