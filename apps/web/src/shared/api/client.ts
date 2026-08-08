// Typed API client for the control-plane REST facade (TZ §11.4, REQUIREM §7.3).
// Every call is one operation: POST {baseUrl}/v1/op/{operation} with a JSON args
// body and a bearer token; the response is the standard { data, error } envelope.
// Transient (network/5xx) failures retry with exponential backoff; a coded facade
// error is terminal and surfaces as an ApiError with .code so features can branch.
// Holds NO business logic — the facade owns it. `fetchImpl` is injectable (tests +
// server-side usage). This module is React/Next-free so it is unit-testable.

export interface FacadeError {
  code: string;
  message: string;
}

export interface Envelope<T> {
  data: T | null;
  error: FacadeError | null;
  meta?: Record<string, unknown>;
}

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export interface ApiClient {
  execute<T = unknown>(operation: string, args?: Record<string, unknown>): Promise<T>;
}

export interface ApiClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createApiClient({
  baseUrl,
  token,
  fetchImpl = globalThis.fetch,
  retries = 2,
  sleep
}: ApiClientOptions): ApiClient {
  const wait = sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function execute<T = unknown>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await fetchImpl(`${baseUrl}/v1/op/${operation}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(args),
          cache: 'no-store'
        });
        const envelope = (await res.json()) as Envelope<T>;
        if (envelope.error) throw new ApiError(envelope.error.code, envelope.error.message || envelope.error.code);
        return envelope.data as T;
      } catch (err) {
        // A coded facade error is terminal (never retry a 403/400/etc.).
        if (err instanceof ApiError) throw err;
        lastErr = err;
        if (attempt < retries) await wait(2 ** attempt * 100);
      }
    }
    throw lastErr;
  }

  return { execute };
}
