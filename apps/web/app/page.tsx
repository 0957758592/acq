import { serverApi } from '@/shared/api/server';
import { ops } from '@/shared/api/ops';
import { OutputSummary } from '@/features/telemetry/OutputSummary';
import { LiveEvents } from '@/features/events/LiveEvents';
import { ErrorNotice } from '@/features/shared/ErrorNotice';
import type { TelemetrySummary } from '@/shared/api/types';

// SSR at request time (the data is live) — opt out of static generation so the
// build never needs a running control-plane.
export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const api = ops(serverApi());
  let tiktok: TelemetrySummary | null = null;
  let instagram: TelemetrySummary | null = null;
  let error: string | null = null;
  try {
    [tiktok, instagram] = await Promise.all([
      api.telemetrySummary({ platform: 'tiktok' }),
      api.telemetrySummary({ platform: 'instagram' })
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h1>Overview</h1>
      <p className="sub">Produced output across the maximize-output platforms.</p>
      {error ? (
        <ErrorNotice title="Control-plane unreachable" detail={error} />
      ) : (
        <>
          <h2>TikTok</h2>
          {tiktok ? <OutputSummary summary={tiktok} /> : null}
          <h2>Instagram</h2>
          {instagram ? <OutputSummary summary={instagram} /> : null}
        </>
      )}
      <LiveEvents />
    </>
  );
}
