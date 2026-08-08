import Link from 'next/link';
import { serverApi } from '@/shared/api/server';
import { ops } from '@/shared/api/ops';
import { TargetActions } from '@/features/targets/TargetActions';
import { ErrorNotice } from '@/features/shared/ErrorNotice';
import type { Target } from '@/shared/api/types';

export const dynamic = 'force-dynamic';

export default async function TargetDetailPage({ searchParams }: { searchParams: { platform?: string; targetType?: string; identifier?: string } }) {
  const { platform, targetType, identifier } = searchParams;
  if (!platform || !targetType || !identifier) {
    return <ErrorNotice title="Missing target key" detail="platform, targetType and identifier are required" />;
  }
  const api = ops(serverApi());
  let target: Target | null = null;
  let error: string | null = null;
  try {
    ({ target } = await api.getTarget({ platform, targetType, identifier }));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <p className="sub"><Link href="/targets">← Targets</Link></p>
      <h1 className="mono">{identifier}</h1>
      {error ? (
        <ErrorNotice title="Target not found or control-plane unreachable" detail={error} />
      ) : target ? (
        <>
          <div className="grid">
            <div className="card"><div className="k">Platform</div><div className="v" style={{ fontSize: 20 }}>{target.platform}</div></div>
            <div className="card"><div className="k">Type</div><div className="v" style={{ fontSize: 20 }}>{target.targetType}</div></div>
            <div className="card"><div className="k">Status</div><div className="v" style={{ fontSize: 20 }}>{target.status}</div></div>
            <div className="card"><div className="k">Score</div><div className="v">{target.score ?? '—'}</div></div>
          </div>
          {target.tags?.length ? <p className="sub" style={{ marginTop: 16 }}>Tags: {target.tags.join(', ')}</p> : null}
          <TargetActions platform={target.platform} targetType={target.targetType} identifier={target.identifier} />
        </>
      ) : null}
    </>
  );
}
