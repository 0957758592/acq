// Typed API client for the dashboard (TZ §11.9, REQUIREM §7.3). Thin wrapper
// over the control-plane REST facade: every call is one operation. Retries with
// exponential backoff on transient (network/5xx) failures; a coded error
// envelope is thrown as an Error with .code so features can branch. The client
// holds NO business logic — the facade owns it.
export function createApiClient({ baseUrl, token, fetchImpl = globalThis.fetch, retries = 2, sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));

  async function execute(operation, args = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await fetchImpl(`${baseUrl}/v1/op/${operation}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(args)
        });
        const envelope = await res.json();
        if (envelope.error) {
          const err = new Error(envelope.error.message || envelope.error.code);
          err.code = envelope.error.code;
          throw err;
        }
        return envelope.data;
      } catch (err) {
        // A coded facade error is terminal (do not retry a 403/400 etc.).
        if (err.code) throw err;
        lastErr = err;
        if (attempt < retries) await wait(2 ** attempt * 100);
      }
    }
    throw lastErr;
  }

  return { execute };
}
