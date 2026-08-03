import { createEmailCodeReader } from './email-reader.js';
import { EmailCodeFetcher } from './email-code.js';

describe('createEmailCodeReader — reader-by-provider (IMAP vs API-only)', () => {
  it('uses the IMAP EmailCodeFetcher for a normal IMAP provider (Gmail)', () => {
    const reader = createEmailCodeReader({ email: 'ops@gmail.com', password: 'app-pass' });
    expect(reader).toBeInstanceOf(EmailCodeFetcher);
    expect(reader.host).toBe('imap.gmail.com');
  });

  it('uses an API-backed reader for an API-only provider (Mail.tm) — no IMAP', async () => {
    const fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      text: async () => {
        if (url.includes('/token')) return JSON.stringify({ token: 't' });
        if (url.includes('/messages/')) return JSON.stringify({ subject: 'code', text: 'verification code 551234' });
        if (url.includes('/messages')) return JSON.stringify({ 'hydra:member': [{ id: 'm1', subject: 'code', intro: 'verification 551234' }] });
        return '{}';
      }
    });
    const reader = createEmailCodeReader({ email: 'temp@mail.tm', password: 'pw', fetchImpl });
    expect(reader).not.toBeInstanceOf(EmailCodeFetcher);
    expect(await reader.fetchLatestCode({ limit: 3 })).toBe('551234');
  });

  it('honors an explicit IMAP host override (firstmail / custom batch)', () => {
    const reader = createEmailCodeReader({ email: 'a@firstmail.ltd', password: 'pw', host: 'mail.fmbatch7.com' });
    expect(reader).toBeInstanceOf(EmailCodeFetcher);
    expect(reader.host).toBe('mail.fmbatch7.com');
  });

  it('carries an OAuth access token through the IMAP reader (Outlook/Hotmail modern auth)', () => {
    const reader = createEmailCodeReader({ email: 'user@outlook.com', accessToken: 'ya29.tok' });
    expect(reader).toBeInstanceOf(EmailCodeFetcher);
    expect(reader.accessToken).toBe('ya29.tok');
    expect(reader.host).toBe('outlook.office365.com');
  });
});
