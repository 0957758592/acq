'use client';

import { useState } from 'react';
import { postOp } from '@/shared/api/browser';
import type { CommentResult, Target } from '@/shared/api/types';

const STATUSES = ['new', 'enriched', 'queued', 'acted', 'excluded'];
const TONES = ['friendly', 'enthusiastic', 'supportive', 'witty', 'professional'];

// Per-target action panel — score / set status / tag / generate an AI comment.
// Every mutation goes through the same-origin /api/op proxy (allow-listed), so
// the token never reaches the browser.
export function TargetActions({ platform, targetType, identifier }: { platform: string; targetType: string; identifier: string }) {
  const sel = { platform, targetType, identifier };
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('queued');
  const [tone, setTone] = useState('friendly');

  async function run(label: string, op: string, args: Record<string, unknown>, onData?: (d: unknown) => void) {
    setBusy(label); setErr(null); setMsg(null);
    const { data, error } = await postOp(op, { ...sel, ...args });
    setBusy(null);
    if (error) setErr(`${error.code}: ${error.message}`);
    else { setMsg(`${label} ✓`); onData?.(data); }
  }

  return (
    <section aria-label="Target actions" style={{ marginTop: 20 }}>
      <h2>Actions</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <button disabled={!!busy} onClick={() => run('Score', 'target.score', { features: {} }, (d) => setMsg(`Scored: ${(d as { score: number }).score}`))}>
          {busy === 'Score' ? '…' : 'Re-score'}
        </button>

        <div>
          <label htmlFor="st">Status</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select id="st" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button disabled={!!busy} onClick={() => run('Status', 'target.status', { status }, (d) => setMsg(`Status → ${(d as { target: Target }).target.status}`))}>Set</button>
          </div>
        </div>

        <div>
          <label htmlFor="tg">Tag</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="tg" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="fitness" />
            <button disabled={!!busy || !tag} onClick={() => run('Tag', 'target.tag', { add: [tag] }, () => { setMsg(`Tagged “${tag}”`); setTag(''); })}>Add</button>
          </div>
        </div>

        <div>
          <label htmlFor="tn">AI comment tone</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select id="tn" value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button disabled={!!busy} onClick={() => run('Comment', 'content.comment', { tone }, (d) => setComment((d as CommentResult).comment))}>Generate</button>
          </div>
        </div>
      </div>

      {msg ? <div className="badge ok" style={{ marginTop: 14 }}>{msg}</div> : null}
      {err ? <div className="notice" role="alert" style={{ marginTop: 14 }}>{err}</div> : null}
      {comment != null ? <div className="result" style={{ marginTop: 14 }} aria-label="Generated comment">{comment}</div> : null}
    </section>
  );
}
