// Browser-side op caller for client components. Posts to the same-origin
// /api/op/* proxy (the bearer token is attached server-side there, never in the
// browser). Returns the {data,error} envelope; client components branch on error.
export interface OpEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

export async function postOp<T = unknown>(operation: string, args: Record<string, unknown>): Promise<OpEnvelope<T>> {
  try {
    const res = await fetch(`/api/op/${operation}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args)
    });
    return (await res.json()) as OpEnvelope<T>;
  } catch (err) {
    return { data: null, error: { code: 'REQUEST_FAILED', message: err instanceof Error ? err.message : 'request failed' } };
  }
}
