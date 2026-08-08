import { serverApi } from '@/shared/api/server';
import { ops } from '@/shared/api/ops';
import { OutputSummary } from '@/features/telemetry/OutputSummary';
import { ErrorNotice } from '@/features/shared/ErrorNotice';
import type { TelemetrySummary } from '@/shared/api/types';

export const dynamic = 'force-dynamic';

const PLATFORMS = ['tiktok', 'instagram', 'telegram', 'linkedin', 'gmail'];

export default async function TelemetryPage({ searchParams }: { searchParams: { platform?: string } }) {
  const platform = searchParams.platform ?? 'tiktok';
  const api = ops(serverApi());
  let summary: TelemetrySummary | null = null;
  let error: string | null = null;
  try {
    summary = await api.telemetrySummary({ platform });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h1>Telemetry</h1>
      <p className="sub">What the parsers and actions produced — output-oriented for tiktok/instagram.</p>
      <nav aria-label="Platform" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {PLATFORMS.map((p) => (
          <a key={p} href={`/telemetry?platform=${p}`} className={p === platform ? 'badge ok' : 'badge'}>
            {p}
          </a>
        ))}
      </nav>
      {error ? <ErrorNotice title="Control-plane unreachable" detail={error} /> : summary ? <OutputSummary summary={summary} /> : null}
    </>
  );
}
