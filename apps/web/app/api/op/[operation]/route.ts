import { NextRequest, NextResponse } from 'next/server';
import { serverApi } from '@/shared/api/server';
import { ApiError } from '@/shared/api/client';

// Same-origin proxy for the handful of MUTATING ops client components trigger.
// The bearer token is attached server-side here and never reaches the browser
// (REQUIREM §7.5). An allow-list keeps the browser from invoking arbitrary ops.
const CLIENT_ALLOWED = new Set(['content.comment', 'target.score', 'target.tag', 'target.status', 'target.add']);

export async function POST(req: NextRequest, { params }: { params: { operation: string } }) {
  const operation = params.operation;
  if (!CLIENT_ALLOWED.has(operation)) {
    return NextResponse.json({ data: null, error: { code: 'OPERATION_NOT_ALLOWED', message: `client cannot call ${operation}` } }, { status: 403 });
  }
  const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const data = await serverApi().execute(operation, args);
    return NextResponse.json({ data, error: null });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ data: null, error: { code: err.code, message: err.message } }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'upstream error';
    return NextResponse.json({ data: null, error: { code: 'UPSTREAM_UNAVAILABLE', message } }, { status: 502 });
  }
}
