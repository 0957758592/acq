// Maps persisted Mongo lean docs to the pure domain shapes the engine-domain
// functions expect (id as string, version for opt-lock).
export function toDomainAccount(doc) {
  return {
    id: String(doc._id ?? doc.id),
    platform: doc.platform,
    identifier: doc.identifier,
    source: doc.source,
    shopId: doc.shopId ?? null,
    secretRefs: doc.credentials?.secretRefs ?? doc.secretRefs ?? {},
    status: doc.status,
    assignedDeviceId: doc.assignedDeviceId ?? null,
    assignedProxyId: doc.assignedProxyId ?? null,
    health: doc.health ?? { consecutiveFailures: 0, lastProbeAt: null },
    checkpointReason: doc.checkpointReason ?? null,
    version: doc.version ?? 0
  };
}

export function toDomainQueue(doc) {
  return {
    deviceId: doc.deviceId,
    platform: doc.platform,
    activeSlots: doc.activeSlots ?? 1,
    targetDepth: doc.targetDepth ?? 3,
    activeAccountIds: (doc.activeAccountIds ?? []).map(String),
    waitingAccountIds: (doc.waitingAccountIds ?? []).map(String),
    version: doc.version ?? 0
  };
}
