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

  it('uses a provider hint to read Google Workspace / custom-domain Gmail via imap.gmail.com', () => {
    const reader = createEmailCodeReader({ email: 'ceo@mycompany.com', password: 'app-pass', provider: 'gmail' });
    expect(reader).toBeInstanceOf(EmailCodeFetcher);
    expect(reader.host).toBe('imap.gmail.com');
  });

  it('picks the RIGHT API reader per api-only provider — 1secmail, not Mail.tm', async () => {
    // 1secmail's API is queried (getMessages), proving it did not fall back to Mail.tm.
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return {
        ok: true, status: 200,
        text: async () =>
          url.includes('getMessages') ? JSON.stringify([{ id: 1, subject: 'verification' }])
            : url.includes('readMessage') ? JSON.stringify({ textBody: 'code 224466' })
              : '[]'
      };
    };
    const reader = createEmailCodeReader({ email: 'z@1secmail.com', fetchImpl });
    expect(reader).not.toBeInstanceOf(EmailCodeFetcher);
    expect(await reader.fetchLatestCode({ limit: 3 })).toBe('224466');
    expect(seen.some((u) => u.includes('1secmail') && u.includes('getMessages'))).toBe(true);
  });
});
