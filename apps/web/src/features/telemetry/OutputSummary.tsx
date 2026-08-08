import { TelemetrySummary } from '@/shared/api/types';

// Output-oriented telemetry panel. For tiktok/instagram (outputMax) the headline
// is produced OUTPUT (reach/engagement) — the thing to maximize; otherwise it is
// throughput. Renders the focus bundle the backend computed (summarizeTelemetry).
export function OutputSummary({ summary }: { summary: TelemetrySummary }) {
  const focusEntries = Object.entries(summary.focus).filter(([, v]) => v > 0);
  return (
    <section aria-label={`Telemetry summary for ${summary.platform ?? 'all'}`}>
      <div className="grid">
        <div className="card">
          <div className="k">{summary.outputMax ? 'Output score (produced)' : 'Throughput'}</div>
          <div className="v">{summary.outputScore.toLocaleString()}</div>
          <span className={`badge ${summary.outputMax ? 'ok' : ''}`}>{summary.outputMax ? 'output-max' : 'throughput'}</span>
        </div>
        <div className="card">
          <div className="k">Events</div>
          <div className="v">{summary.events.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="k">Error rate</div>
          <div className="v">{(summary.errorRate * 100).toFixed(1)}%</div>
          <span className="k">{summary.outcomes.ok} ok · {summary.outcomes.failed} failed</span>
        </div>
      </div>
      {focusEntries.length ? (
        <>
          <h2>{summary.outputMax ? 'Produced output' : 'Throughput'} breakdown</h2>
          <div className="grid">
            {focusEntries.map(([k, v]) => (
              <div className="card" key={k}>
                <div className="k">{k}</div>
                <div className="v">{v.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
