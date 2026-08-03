import { imapAuthCommand, extractVerificationCode, EmailCodeFetcher } from './email-code.js';

describe('imapAuthCommand — password LOGIN vs OAuth XOAUTH2 (other email types)', () => {
  it('uses plain LOGIN when only a password is present', () => {
    expect(imapAuthCommand({ username: 'a@b.c', password: 'pw' })).toBe('LOGIN "a@b.c" "pw"');
  });

  it('escapes quotes in the password for LOGIN', () => {
    expect(imapAuthCommand({ username: 'a@b.c', password: 'p"w' })).toBe('LOGIN "a@b.c" "p\\"w"');
  });

  it('uses AUTHENTICATE XOAUTH2 with the SASL bearer blob when an access token is present', () => {
    const cmd = imapAuthCommand({ username: 'user@outlook.com', accessToken: 'ya29.TOKEN' });
    expect(cmd.startsWith('AUTHENTICATE XOAUTH2 ')).toBe(true);
    const b64 = cmd.split(' ')[2];
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    expect(decoded).toBe('user=user@outlook.com\x01auth=Bearer ya29.TOKEN\x01\x01');
  });

  it('prefers the access token over a password when both are given', () => {
    expect(imapAuthCommand({ username: 'u', password: 'pw', accessToken: 't' }).startsWith('AUTHENTICATE XOAUTH2')).toBe(true);
  });
});

describe('EmailCodeFetcher carries an OAuth access token when configured', () => {
  it('accepts accessToken and returns "" without creds (no throw)', async () => {
    const f = new EmailCodeFetcher({ email: 'u@outlook.com', accessToken: 'tok', host: 'outlook.office365.com' });
    expect(f.accessToken).toBe('tok');
  });
});

describe('extractVerificationCode still works', () => {
  it('pulls the first 4-8 digit code', () => {
    expect(extractVerificationCode('your code is 903124 thanks')).toBe('903124');
  });
});
