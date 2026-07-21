import { getOperation } from './operations.js';

// Roles (TZ §11.8/§14.2). admin is a superuser; the rest are least-privilege.
export const ROLES = ['admin', 'operator', 'brain', 'readonly'];

// Least-privilege check: admin may do anything; otherwise the role must be in
// the operation's allowed set. Unknown operations deny (fail-closed).
export function can(role, operationName) {
  if (role === 'admin') return true;
  const op = getOperation(operationName);
  if (!op) return false;
  return op.roles.includes(role);
}
