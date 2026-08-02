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

// LIVE CLI: same operations/RBAC, but over the REST surface of a DEPLOYED server
// (`acq <operation> key=value ...`). Set and get are both `POST /v1/op/:op` — the
// facade decides mutating vs read. The RBAC role comes from the bearer token on
// the server, not the CLI. Returns {code,stdout,stderr} so it is testable without
// touching process. A transport/non-envelope failure is a coded CLI error.
export async function runCliHttp(argv, {
  baseUrl = process.env.ACQ_BASE_URL || 'http://localhost:7500',
  token = process.env.ACQ_TOKEN || process.env.CONTROL_ADMIN_TOKEN || '',
  fetchImpl = globalThis.fetch,
  correlationId
} = {}) {
  const { operation, args } = parseCliArgs(argv);
  if (!operation) {
    return { code: 2, stdout: '', stderr: JSON.stringify({ code: 'USAGE', message: 'usage: acq <operation> [key=value ...]' }) };
  }
  const url = `${String(baseUrl).replace(/\/+$/, '')}/v1/op/${operation}`;
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (correlationId) headers['x-correlation-id'] = correlationId;
  let response;
  let text;
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(args) });
    text = await response.text();
  } catch (err) {
    return { code: 1, stdout: '', stderr: JSON.stringify({ code: 'CLI_REQUEST_FAILED', message: err.message }) };
  }
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    return { code: 1, stdout: '', stderr: JSON.stringify({ code: 'CLI_REQUEST_FAILED', message: `HTTP ${response.status}: ${String(text).slice(0, 200)}` }) };
  }
  if (envelope.error) {
    return { code: 1, stdout: '', stderr: JSON.stringify(envelope.error) };
  }
  return { code: 0, stdout: JSON.stringify(envelope, null, 2), stderr: '' };
}
