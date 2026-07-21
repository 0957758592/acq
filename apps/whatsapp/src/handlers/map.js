export function toDomainAccount(doc) {
  return {
    id: String(doc._id ?? doc.id),
    msisdn: doc.msisdn,
    source: doc.source,
    secretRefs: doc.secretRefs ?? {},
    status: doc.status,
    assignedDeviceId: doc.assignedDeviceId != null ? String(doc.assignedDeviceId) : null,
    health: doc.health ?? { consecutiveFailures: 0, lastProbeAt: null },
    version: doc.version ?? 0
  };
}

export function toDomainQueue(doc) {
  return {
    deviceId: String(doc.deviceId ?? doc.id),
    activeSlots: doc.activeSlots,
    targetDepth: doc.targetDepth,
    activeAccountIds: (doc.activeAccountIds ?? []).map(String),
    waitingAccountIds: (doc.waitingAccountIds ?? []).map(String),
    version: doc.version ?? 0
  };
}
