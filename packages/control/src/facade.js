import { getOperation } from './operations.js';
import { can } from './rbac.js';
import { assertSafeArgs } from './sanitize.js';

// Single command facade (TZ §11.1/§11.8). Every management surface calls
// execute() — one place for RBAC, validation, the response envelope, error
// mapping and audit. Surfaces stay thin (presentation only).
function envelope({ data = null, error = null, operation, correlationId }) {
  return { data, error, meta: { operation, correlationId: correlationId ?? null } };
}

// Never leak stack traces (REQUIREM §8.1): map known DomainErrors to their code,
// everything else to a generic INTERNAL.
function toError(err) {
  if (err && typeof err.code === 'string') {
    return { code: err.code, message: err.message.replace(/^[A-Z0-9_]+:\s*/, '') };
  }
  return { code: 'INTERNAL', message: 'internal error' };
}

export function createFacade({ useCases = {}, validators = {}, audit = null } = {}) {
  async function execute(operationName, { role = 'readonly', args = {}, correlationId, actor } = {}) {
    const op = getOperation(operationName);
    if (!op) {
      return envelope({ error: { code: 'UNKNOWN_OPERATION', message: `unknown operation ${operationName}` }, operation: operationName, correlationId });
    }
    if (!can(role, operationName)) {
      return envelope({ error: { code: 'FORBIDDEN', message: `role ${role} may not call ${operationName}` }, operation: operationName, correlationId });
    }
    const handler = useCases[operationName];
    if (typeof handler !== 'function') {
      return envelope({ error: { code: 'NOT_IMPLEMENTED', message: `no handler for ${operationName}` }, operation: operationName, correlationId });
    }

    try {
      // Security: reject Mongo-operator injection, then run the op's validator.
      assertSafeArgs(args);
      const validated = validators[operationName] ? validators[operationName](args) : args;
      const data = await handler(validated, { role, actor, correlationId });
      if (op.mutating && audit?.record) {
        await audit.record({ operation: operationName, actor: actor ?? null, role, args, correlationId: correlationId ?? null });
      }
      return envelope({ data, operation: operationName, correlationId });
    } catch (err) {
      return envelope({ error: toError(err), operation: operationName, correlationId });
    }
  }

  return { execute };
}
