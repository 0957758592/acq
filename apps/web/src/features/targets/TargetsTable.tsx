import Link from 'next/link';
import { Target } from '@/shared/api/types';

function detailHref(t: Target) {
  const q = new URLSearchParams({ platform: t.platform, targetType: t.targetType, identifier: t.identifier });
  return `/targets/detail?${q.toString()}`;
}

function scoreBadge(score: number | null) {
  if (score == null) return <span className="badge">unscored</span>;
  const cls = score >= 60 ? 'ok' : score >= 30 ? 'warn' : '';
  return <span className={`badge ${cls}`}>{score}</span>;
}

// Read-only targets table — the callable targets DB, rendered. Horizontally
// scrollable so the page body never scrolls sideways (responsive).
export function TargetsTable({ targets }: { targets: Target[] }) {
  if (!targets.length) return <div className="notice">No targets yet — parsers populate this as they discover accounts.</div>;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Identifier</th>
            <th>Platform</th>
            <th>Type</th>
            <th>Status</th>
            <th>Score</th>
            <th>Source</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t._id ?? `${t.platform}:${t.targetType}:${t.identifier}`}>
              <td className="mono"><Link href={detailHref(t)}>{t.identifier}</Link></td>
              <td>{t.platform}</td>
              <td>{t.targetType}</td>
              <td>{t.status}</td>
              <td>{scoreBadge(t.score)}</td>
              <td>{t.source}</td>
              <td>{(t.tags ?? []).join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
