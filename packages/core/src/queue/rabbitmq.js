import amqplib from 'amqplib';

let conn = null;
let channel = null;

export async function connectRabbitmq(url) {
  if (conn && channel) return { conn, channel };
  conn = await amqplib.connect(url);
  channel = await conn.createChannel();
  return { conn, channel };
}

export async function disconnectRabbitmq() {
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
