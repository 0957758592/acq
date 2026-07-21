import { initValidation, loginSchema, validationKeys } from '../index.js';

test('loginSchema: rejects invalid input with key messages', async () => {
  // i18next-like behavior (missing keys return the key)
  initValidation({ t: (k) => k });

  await expect(
    loginSchema.validate(
      { email: 'not-an-email', password: '123' },
      { abortEarly: false }
    )
  ).rejects.toMatchObject({
    errors: expect.arrayContaining([
      validationKeys.auth.login.email.invalid,
      validationKeys.auth.login.password.min
    ])
  });
});

test('loginSchema: accepts valid input', async () => {
  initValidation({ t: (k) => k });
  await expect(
    loginSchema.validate({ email: 'a@b.com', password: '123456' })
  ).resolves.toEqual({ email: 'a@b.com', password: '123456' });
});






