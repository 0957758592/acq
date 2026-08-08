import { serverConfig } from '@/shared/config';

// Same-origin SSE proxy for the control-plane's /v1/events domain-event stream.
// The bearer token is attached server-side (never in the browser). Named-event
// lines (`event:`/`id:`/`retry:`) are stripped so the browser's default
// `onmessage` receives EVERY event — the event `type` is inside the JSON payload.
export const dynamic = 'force-dynamic';

const SSE_HEADERS = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' };

function sseError(message: string): Response {
  return new Response(`data: ${JSON.stringify({ type: 'events.error', message })}\n\n`, { status: 200, headers: SSE_HEADERS });
}

function stripNamedLines(): TransformStream<string, string> {
  let buf = '';
  return new TransformStream<string, string>({
    transform(chunk, ctrl) {
      buf += chunk;
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const line of parts) {
        if (line.startsWith('event:') || line.startsWith('id:') || line.startsWith('retry:')) continue;
        ctrl.enqueue(line + '\n');
      }
    },
    flush(ctrl) {
      if (buf) ctrl.enqueue(buf);
    }
  });
}

export async function GET() {
  const { apiUrl, token } = serverConfig();
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/events`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch {
    return sseError('control-plane unreachable');
  }
  if (!upstream.ok || !upstream.body) return sseError(`events unavailable (${upstream.status})`);
  const stream = upstream.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(stripNamedLines())
    .pipeThrough(new TextEncoderStream());
  return new Response(stream, { headers: SSE_HEADERS });
}
