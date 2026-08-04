import amqplib from 'amqplib';

let conn = null;
let channel = null;
let intentionalClose = false;

// On an UNEXPECTED broker drop (restart/network), the singleton conn/channel go
// dead but nothing re-establishes them (publish leaks INTERNAL, consumers vanish).
// "Let it crash": exit so `restart: on-failure` restarts the process and it
// reconnects + re-registers consumers at startup (§16 failover). Extracted +
// injectable (exit/log) so the decision is testable. Guarded by intentionalClose
// so a graceful disconnectRabbitmq() is a no-op.
export function handleConnectionGone({ intentional, event, error, exit = () => process.exit(1), log = console.error } = {}) {
  if (intentional) return false;
  conn = null;
  channel = null;
  log(`rabbitmq connection ${event}${error ? `: ${error.message}` : ''} — exiting so restart reconnects`);
  exit();
  return true;
}

export async function connectRabbitmq(url, { exit, log } = {}) {
  if (conn && channel) return { conn, channel };
  conn = await amqplib.connect(url);
  channel = await conn.createChannel();
  conn.on('error', (err) => handleConnectionGone({ intentional: intentionalClose, event: 'error', error: err, exit, log }));
  conn.on('close', () => handleConnectionGone({ intentional: intentionalClose, event: 'close', exit, log }));
  return { conn, channel };
}

export async function disconnectRabbitmq() {
  intentionalClose = true;
  if (channel) {
    const ch = channel;
    channel = null;
    await ch.close();
  }
  if (conn) {
    const c = conn;
    conn = null;
    await c.close();
  }
}

export async function publishJson(queueName, payload) {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  await channel.assertQueue(queueName, { durable: true });
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), { persistent: true });
}

export async function consumeJson(queueName, handler, { prefetch = 1, requeueOnError = false } = {}) {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  if (prefetch) channel.prefetch(prefetch);
  await channel.assertQueue(queueName, { durable: true });
  channel.consume(queueName, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString('utf8'));
      await handler(payload);
      channel.ack(msg);
    } catch {
      channel.nack(msg, false, requeueOnError);
    }
  });
}
