import tls from 'node:tls';

export function extractVerificationCode(text, { minLength = 4, maxLength = 8 } = {}) {
  const pattern = new RegExp(`\\b\\d{${minLength},${maxLength}}\\b`, 'g');
  const matches = String(text || '').match(pattern) || [];
  return matches[0] || '';
}

function inferImapHost(email, fallbackHost) {
  if (fallbackHost) return fallbackHost;
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  if (!domain) return 'imap.outlook.com';
  if (['hotmail.com', 'outlook.com', 'live.com', 'msn.com'].includes(domain)) return 'imap-mail.outlook.com';
  if (domain === 'gmail.com') return 'imap.gmail.com';
  if (domain === 'yahoo.com') return 'imap.mail.yahoo.com';
  if (domain === 'rambler.ru') return 'imap.rambler.ru';
  if (domain === 'onet.pl') return 'imap.poczta.onet.pl';
  return `imap.${domain}`;
}

class SimpleImapClient {
  constructor({ host, port = 993, username, password, timeoutMs = 30_000 } = {}) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.tagCounter = 0;
    this.socket = null;
    this.buffer = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host: this.host, port: this.port, servername: this.host }, () => {
        this.socket = socket;
      });
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
    this.buffer = '';
    this.socket.write(line);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`IMAP command timeout: ${command}`)), this.timeoutMs);
      const onData = (chunk) => {
        this.buffer += chunk.toString('utf8');
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
    await this.command(`LOGIN "${String(this.username).replace(/"/g, '\\"')}" "${String(this.password).replace(/"/g, '\\"')}"`);
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
    host,
    port = 993,
    timeoutMs = 30_000,
    minLength = 4,
    maxLength = 8,
    keywords = ['instagram', 'tiktok', 'verification', 'security code', 'confirm']
  } = {}) {
    this.email = email;
    this.password = password;
    this.host = inferImapHost(email, host);
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.minLength = minLength;
    this.maxLength = maxLength;
    this.keywords = keywords;
  }

  async fetchLatestCode({ limit = 12 } = {}) {
    if (!this.email || !this.password) return '';
    const client = new SimpleImapClient({
      host: this.host,
      port: this.port,
      username: this.email,
      password: this.password,
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
