// CLI surface over the single command facade (TZ §11.6). Thin: parse -> execute
// -> print the envelope. Same operations/RBAC as REST/MCP (one facade). runCli
// returns {code, stdout, stderr} so it is testable without touching process.
function coerce(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function parseCliArgs(argv) {
  const [operation, ...rest] = argv;
  const args = {};
  for (const token of rest) {
    const m = /^-{0,2}([^=]+)=(.*)$/.exec(token);
    if (m) args[m[1]] = coerce(m[2]);
  }
  return { operation, args };
}

export async function runCli(argv, { facade, role = 'operator', correlationId } = {}) {
  const { operation, args } = parseCliArgs(argv);
  if (!operation) {
    return { code: 2, stdout: '', stderr: JSON.stringify({ code: 'USAGE', message: 'usage: acq <operation> [--key=value ...]' }) };
  }
  const envelope = await facade.execute(operation, { role, args, correlationId });
  if (envelope.error) {
    return { code: 1, stdout: '', stderr: JSON.stringify(envelope.error) };
  }
  return { code: 0, stdout: JSON.stringify(envelope, null, 2), stderr: '' };
}
