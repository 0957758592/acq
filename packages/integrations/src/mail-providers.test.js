import { MAIL_PROVIDERS, listMailProviders, providerIdForAddress, resolveMailbox } from './mail-providers.js';

describe('mail provider catalog', () => {
  it('covers the operator-requested providers', () => {
    const ids = Object.keys(MAIL_PROVIDERS);
    expect(ids).toEqual(expect.arrayContaining([
      'gmail', 'outlook', 'yahoo', 'aol', 'gmx', 'mailcom', 'rambler', 'mailru', 'onet', 'seznam', 'proton', 'mailtm', 'firstmail', 'custom'
    ]));
  });

  it('maps an address to its provider by domain (incl. aliases)', () => {
    expect(providerIdForAddress('a@gmail.com')).toBe('gmail');
    expect(providerIdForAddress('a@hotmail.com')).toBe('outlook');
    expect(providerIdForAddress('a@bk.ru')).toBe('mailru');
    expect(providerIdForAddress('a@seznam.cz')).toBe('seznam');
    expect(providerIdForAddress('a@unknown.tld')).toBeNull();
  });

  it('resolves verified IMAP coordinates for known providers', () => {
    expect(resolveMailbox('ops@gmail.com')).toMatchObject({ provider: 'gmail', imapHost: 'imap.gmail.com', imapPort: 993, inferred: false });
    expect(resolveMailbox('ops@onet.pl').imapHost).toBe('imap.poczta.onet.pl');
    expect(resolveMailbox('ops@mail.ru').imapHost).toBe('imap.mail.ru');
  });

  it('flags providers WITHOUT usable IMAP instead of inventing a host', () => {
    const proton = resolveMailbox('a@proton.me');
    expect(proton).toMatchObject({ provider: 'proton', imapHost: null, requiresBridge: true });
    const mailtm = resolveMailbox('a@mail.tm');
    expect(mailtm).toMatchObject({ provider: 'mailtm', apiOnly: true, imapHost: null });
    expect(resolveMailbox('a@firstmail.ltd')).toMatchObject({ provider: 'firstmail', imapHost: null });
  });

  it('an explicit host always wins (per-identity override) and is not marked inferred', () => {
    expect(resolveMailbox('a@proton.me', { imapHost: '127.0.0.1', imapPort: 1143 })).toMatchObject({ imapHost: '127.0.0.1', imapPort: 1143, inferred: false });
    expect(resolveMailbox('a@firstmail.ltd', { imapHost: 'imap.batch7.example' }).imapHost).toBe('imap.batch7.example');
  });

  it('an unknown domain falls back to a HINT, flagged inferred (never silently trusted)', () => {
    expect(resolveMailbox('a@corp.tld')).toMatchObject({ provider: 'custom', imapHost: 'imap.corp.tld', inferred: true });
  });

  it('listMailProviders reports imapReady/apiOnly/bridge so a UI can render the picker', () => {
    const list = listMailProviders();
    expect(list.find((p) => p.provider === 'gmail').imapReady).toBe(true);
    expect(list.find((p) => p.provider === 'mailtm')).toMatchObject({ imapReady: false, apiOnly: true });
    expect(list.find((p) => p.provider === 'proton').requiresBridge).toBe(true);
  });
});
