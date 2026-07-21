const order = ['user', 'contributor', 'admin', 'su'];

export function roleAtLeast(role, minRole) {
  const a = order.indexOf(String(role || ''));
  const b = order.indexOf(String(minRole || ''));
  if (a === -1 || b === -1) return false;
  return a >= b;
}
