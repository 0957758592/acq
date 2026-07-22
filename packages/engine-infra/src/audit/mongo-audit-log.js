// Immutable audit-log adapter (TZ §14.7). Wraps the EngineAuditLog model with a
// single append-only record() that redacts secrets before persisting. Model
// injected.
const SENSITIVE = /^(token|password|secret|session|apiKey|api_key|authorization|cookie)s?$/i;

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redactSecrets(v);
    }
    return out;
  }
  return value;
}

export function createMongoAuditLog({ model } = {}) {
  if (!model) throw new Error('createMongoAuditLog requires a mongoose model');
  return {
    async record(entry = {}) {
      return model.create({
        tenantId: entry.tenantId ?? 'default',
        operation: entry.operation,
        actor: entry.actor ?? null,
        role: entry.role ?? null,
        subjectId: entry.subjectId ?? null,
        correlationId: entry.correlationId ?? null,
        args: redactSecrets(entry.args ?? {}),
        at: new Date()
      });
    }
  };
}
