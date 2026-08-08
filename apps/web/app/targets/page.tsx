import { serverApi } from '@/shared/api/server';
import { ops } from '@/shared/api/ops';
import { TargetsTable } from '@/features/targets/TargetsTable';
import { ErrorNotice } from '@/features/shared/ErrorNotice';
import type { Target } from '@/shared/api/types';

export const dynamic = 'force-dynamic';

const PLATFORMS = ['', 'tiktok', 'instagram', 'telegram', 'linkedin'];

export default async function TargetsPage({ searchParams }: { searchParams: { platform?: string; status?: string } }) {
  const platform = searchParams.platform || undefined;
  const status = searchParams.status || undefined;
  const api = ops(serverApi());
  let targets: Target[] = [];
  let error: string | null = null;
  try {
    const res = await api.listTargets({ platform, status, limit: 100 });
    targets = res.items;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h1>Targets</h1>
      <p className="sub">The callable targets database — accounts, channels, posts the AI acts on. Populated by parsers.</p>
      <nav aria-label="Platform filter" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {PLATFORMS.map((p) => (
          <a key={p || 'all'} href={p ? `/targets?platform=${p}` : '/targets'} className={(p || undefined) === platform ? 'badge ok' : 'badge'}>
            {p || 'all'}
          </a>
        ))}
      </nav>
      {error ? <ErrorNotice title="Control-plane unreachable" detail={error} /> : <TargetsTable targets={targets} />}
    </>
  );
}
