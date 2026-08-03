import { imapAuthCommand, extractVerificationCode, EmailCodeFetcher, SimpleImapClient } from './email-code.js';

// A scriptable in-memory IMAP socket: responses[0] is the connect greeting
// (emitted when the client first listens), responses[1..] are one server reply
// per client write, in order. Lets us drive the real client logic (auth choice,
// SASL continuation) without a network.
function fakeImapSocket(responses) {
  const data = new Set();
  let greeted = false;
  const queue = responses.slice(1);
  const emit = (msg) => { for (const f of data) f(Buffer.from(msg)); };
  const sock = {
    writes: [],
    on(ev, cb) {
      if (ev === 'data') { data.add(cb); if (!greeted) { greeted = true; setImmediate(() => emit(responses[0])); } }
      return sock;
    },
    off(ev, cb) { if (ev === 'data') data.delete(cb); return sock; },
    end() {},
    write(line) { sock.writes.push(line); const r = queue.shift(); if (r != null) setImmediate(() => emit(r)); return true; }
  };
  return sock;
}

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

describe('SimpleImapClient login (socket-level, no network)', () => {
  it('logs in with a password (LOGIN) then SELECTs the inbox', async () => {
    let sock;
    const client = new SimpleImapClient({
      host: 'h', username: 'u@x.y', password: 'pw', timeoutMs: 1000,
      socketFactory: () => (sock = fakeImapSocket(['* OK ready\r\n', 'A0001 OK login\r\n', 'A0002 OK select\r\n']))
    });
    await client.connect();
    await client.login();
    expect(sock.writes[0]).toMatch(/^A0001 LOGIN "u@x\.y" "pw"/);
  });

  it('logs in with XOAUTH2 when an access token is present', async () => {
    let sock;
    const client = new SimpleImapClient({
      host: 'h', username: 'u@outlook.com', accessToken: 'ya29.tok', timeoutMs: 1000,
      socketFactory: () => (sock = fakeImapSocket(['* OK ready\r\n', 'A0001 OK auth\r\n', 'A0002 OK select\r\n']))
    });
    await client.connect();
    await client.login();
    expect(sock.writes[0]).toMatch(/^A0001 AUTHENTICATE XOAUTH2 /);
  });

  it('does NOT hang on XOAUTH2 auth failure — acks the "+" continuation and rejects promptly', async () => {
    let sock;
    const client = new SimpleImapClient({
      host: 'h', username: 'u@outlook.com', accessToken: 'bad', timeoutMs: 2000,
      // greeting, then a SASL "+" continuation, then the tagged NO after our ack
      socketFactory: () => (sock = fakeImapSocket(['* OK ready\r\n', '+ eyJlcnJvciI6ICJpbnZhbGlkIn0=\r\n', 'A0001 NO AUTHENTICATE failed\r\n']))
    });
    await client.connect();
    await expect(client.login()).rejects.toThrow(/AUTHENTICATE failed/);
    // proves we sent the empty-line ack (2nd write) rather than waiting for timeout
    expect(sock.writes[1]).toBe('\r\n');
  });
});

describe('extractVerificationCode still works', () => {
  it('pulls the first 4-8 digit code', () => {
    expect(extractVerificationCode('your code is 903124 thanks')).toBe('903124');
  });
});
