export function buildDeviceEventChannel(deviceId) {
  return `engine:device:${String(deviceId || '')}:events`;
}

function serializeEvent(event = {}) {
  return {
    id: event._id ? String(event._id) : event.id || '',
    deviceId: event.deviceId ? String(event.deviceId) : '',
    level: event.level || 'info',
    source: event.source || 'system',
    jobRunId: event.jobRunId ? String(event.jobRunId) : null,
    jobName: event.jobName || '',
    message: event.message || '',
    data: event.data || {},
    createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString()
  };
}

export async function recordDeviceEvent({
  eventModel = null,
  redis = null,
  deviceId,
  level = 'info',
  source = 'system',
  jobRunId = null,
  jobName = '',
  message = '',
  data = {}
} = {}) {
  if (!deviceId || !message) return null;
  const eventInput = {
    deviceId,
    level,
    source,
    jobRunId,
    jobName,
    message,
    data,
    createdAt: new Date()
  };

  let event = eventInput;
  try {
    event = eventModel?.create ? await eventModel.create(eventInput) : eventInput;
  } catch {
    event = eventInput;
  }

  const payload = serializeEvent(event?.toObject ? event.toObject() : event);
  try {
    if (redis?.publish) await redis.publish(buildDeviceEventChannel(deviceId), JSON.stringify(payload));
  } catch {
    // Device event emission must never break the engine job that produced the event.
  }
  return payload;
}
