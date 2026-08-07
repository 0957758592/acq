import { createLocalVault } from './credential-vault.js';

const key = Buffer.alloc(32, 7); // deterministic 32-byte test key

test('put returns a vault: ref that contains no plaintext; resolve decrypts it back', async () => {
  const v = createLocalVault({ key });
  const ref = await v.put('user1:pass1:mail@x.com');
  expect(ref).toMatch(/^vault:/);
  expect(ref).not.toContain('user1');
  expect(ref).not.toContain('pass1');
  expect(await v.resolve(ref)).toBe('user1:pass1:mail@x.com');
});

test('resolve passes a non-vault ref through unchanged (drop-in with env refs)', async () => {
  const v = createLocalVault({ key });
  expect(await v.resolve('env:FOO')).toBe('env:FOO');
  expect(await v.resolve(null)).toBe(null);
});

test('two puts of the same value differ (random IV) but both decrypt', async () => {
  const v = createLocalVault({ key });
  const a = await v.put('same');
  const b = await v.put('same');
  expect(a).not.toBe(b);
  expect(await v.resolve(a)).toBe('same');
  expect(await v.resolve(b)).toBe('same');
});

test('requires a 32-byte key', () => {
  expect(() => createLocalVault({ key: Buffer.alloc(16) })).toThrow();
  expect(() => createLocalVault({})).toThrow();
});

test('accepts a 64-char hex key string', async () => {
  const v = createLocalVault({ key: '00'.repeat(32) });
  expect(await v.resolve(await v.put('x'))).toBe('x');
});

test('a tampered ciphertext fails to decrypt (GCM auth)', async () => {
  const v = createLocalVault({ key });
  const ref = await v.put('secret');
  const tampered = ref.slice(0, -2) + (ref.slice(-2) === 'AA' ? 'BB' : 'AA');
  await expect(v.resolve(tampered)).rejects.toThrow();
});
