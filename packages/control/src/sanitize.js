import { domainError } from '@acq/engine-domain';

// Recursively rejects MongoDB-operator injection in facade args (TZ §14.6):
// any object key starting with `$` or containing `.` is refused. Values pass
// through untouched (validation of shape is a per-operation concern).
function walk(value) {
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        throw domainError('INVALID_ARGS', `illegal key '${key}' in arguments`);
      }
      walk(value[key]);
    }
  }
}

export function assertSafeArgs(args) {
  walk(args);
}
