import Redis from 'ioredis';

let redis = null;

export function getRedis(url) {
  if (!redis) redis = new Redis(url);
  return redis;
}

export async function disconnectRedis() {
  if (!redis) return;
  const r = redis;
  redis = null;
  await r.quit();
}
