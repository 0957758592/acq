import tls from 'node:tls';

import { resolveMailbox } from './mail-providers.js';

export function extractVerificationCode(text, { minLength = 4, maxLength = 8 } = {}) {
  const pattern = new RegExp(`\\b\\d{${minLength},${maxLength}}\\b`, 'g');
  const matches = String(text || '').match(pattern) || [];
  return matches[0] || '';
}

// The IMAP auth command for a mailbox: OAuth (AUTHENTICATE XOAUTH2 with a SASL
// bearer blob) when an access token is supplied — required by providers that
// enforce modern auth (Outlook/Hotmail, OAuth-configured Gmail) — otherwise plain
// password LOGIN. One helper so the choice is testable and lives in one place.
export function imapAuthCommand({ username, password, accessToken } = {}) {
  if (accessToken) {
    const sasl = `user=${username}\x01auth=Bearer ${accessToken}\x01\x01`;
    return `AUTHENTICATE XOAUTH2 ${Buffer.from(sasl, 'utf8').toString('base64')}`;
  }
  const esc = (s) => String(s).replace(/"/g, '\\"');
  return `LOGIN "${esc(username)}" "${esc(password)}"`;
}

// Host resolution lives in the mail provider catalog (single source of truth for
// every provider: gmail/outlook/yahoo/aol/gmx/mail.com/rambler/mail.ru/onet/
// seznam/proton-bridge/firstmail/custom). No duplicated host table here.
function inferImapHost(email, fallbackHost) {
  return resolveMailbox(email, { imapHost: fallbackHost }).imapHost;
}

const defaultSocketFactory = ({ host, port }) => tls.connect({ host, port, servername: host });

export class SimpleImapClient {
  constructor({ host, port = 993, username, password, accessToken = null, timeoutMs = 30_000, socketFactory = defaultSocketFactory } = {}) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.accessToken = accessToken;
    this.timeoutMs = timeoutMs;
    this.socketFactory = socketFactory;
    this.tagCounter = 0;
    this.socket = null;
    this.buffer = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = this.socketFactory({ host: this.host, port: this.port });
      this.socket = socket;
      const timeout = setTimeout(() => reject(new Error('IMAP connect timeout')), this.timeoutMs);
      const onData = (chunk) => {
        this.buffer += chunk.toString('utf8');
        if (this.buffer.includes('* OK')) {
          clearTimeout(timeout);
          socket.off('data', onData);
          resolve();
        }
      };
      socket.on('data', onData);
      socket.on('error', (error) => {
        clearTimeout(timeout);
        socket.off('data', onData);
        reject(error);
      });
    });
  }

  async command(command) {
    const tag = `A${String((this.tagCounter += 1)).padStart(4, '0')}`;
    const line = `${tag} ${command}\r\n`;
    const isSasl = command.startsWith('AUTHENTICATE');
    let ackedContinuation = false;
    this.buffer = '';
    this.socket.write(line);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`IMAP command timeout: ${command}`)), this.timeoutMs);
      const onData = (chunk) => {
        this.buffer += chunk.toString('utf8');
        // A SASL command (XOAUTH2) that FAILS gets a `+ <base64 error>` server
        // continuation and expects an empty line before the tagged NO. Ack it once
        // so auth failure resolves promptly instead of hanging to the timeout.
        if (isSasl && !ackedContinuation && /(^|\r\n)\+ /.test(this.buffer)
          && !this.buffer.includes(`${tag} OK`) && !this.buffer.includes(`${tag} NO`) && !this.buffer.includes(`${tag} BAD`)) {
          ackedContinuation = true;
          this.socket.write('\r\n');
          return;
        }
        if (this.buffer.includes(`${tag} OK`) || this.buffer.includes(`${tag} NO`) || this.buffer.includes(`${tag} BAD`)) {
          clearTimeout(timeout);
          this.socket.off('data', onData);
          if (this.buffer.includes(`${tag} OK`)) resolve(this.buffer);
          else reject(new Error(this.buffer));
        }
      };
      this.socket.on('data', onData);
    });
  }

  async login() {
    await this.command(imapAuthCommand({ username: this.username, password: this.password, accessToken: this.accessToken }));
    await this.command('SELECT INBOX');
  }

  async fetchRecentMessages({ limit = 12 } = {}) {
    const search = await this.command('UID SEARCH ALL');
    const ids = [...search.matchAll(/\* SEARCH\s+([0-9\s]+)/g)]
      .flatMap((match) => match[1].trim().split(/\s+/))
      .filter(Boolean)
      .slice(-limit);
    const messages = [];
    for (const id of ids.reverse()) {
      const raw = await this.command(`UID FETCH ${id} BODY.PEEK[]`);
      messages.push(raw);
    }
    return messages;
  }

  async logout() {
    if (!this.socket) return;
    await this.command('LOGOUT').catch(() => {});
    this.socket.end();
  }
}

export class EmailCodeFetcher {
  constructor({
    email,
    password,
    accessToken = null,
    host,
    port = 993,
    timeoutMs = 30_000,
    minLength = 4,
    maxLength = 8,
    keywords = ['instagram', 'tiktok', 'verification', 'security code', 'confirm']
  } = {}) {
    this.email = email;
    this.password = password;
    // OAuth bearer token (XOAUTH2) for providers that reject password IMAP LOGIN
    // (Outlook/Hotmail, OAuth-configured Gmail). When present, it is used instead
    // of the password.
    this.accessToken = accessToken;
    this.host = inferImapHost(email, host);
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.minLength = minLength;
    this.maxLength = maxLength;
    this.keywords = keywords;
  }

  async fetchLatestCode({ limit = 12 } = {}) {
    if (!this.email || (!this.password && !this.accessToken)) return '';
    const client = new SimpleImapClient({
      host: this.host,
      port: this.port,
      username: this.email,
      password: this.password,
      accessToken: this.accessToken,
      timeoutMs: this.timeoutMs
    });
    await client.connect();
    try {
      await client.login();
      const messages = await client.fetchRecentMessages({ limit });
      for (const message of messages) {
        const lower = message.toLowerCase();
        if (!this.keywords.some((keyword) => lower.includes(keyword))) continue;
        const code = extractVerificationCode(message, {
          minLength: this.minLength,
          maxLength: this.maxLength
        });
        if (code) return code;
      }
      return '';
    } finally {
      await client.logout();
    }
  }
}
