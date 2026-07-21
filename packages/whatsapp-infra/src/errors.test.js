import { conflictError, notFoundError } from './errors.js';
describe('infra errors', () => {
  it('builds a CONFLICT domain error', () => {
    const e = conflictError('queue d1 changed');
    expect(e.code).toBe('CONFLICT');
    expect(() => { throw e; }).toThrow('CONFLICT');
  });
  it('builds a NOT_FOUND domain error', () => {
    expect(notFoundError('acct a1').code).toBe('NOT_FOUND');
  });
});
