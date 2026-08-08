'use client';

import { useState, type FormEvent } from 'react';
import type { CommentResult } from '@/shared/api/types';

const TONES = ['friendly', 'enthusiastic', 'supportive', 'witty', 'professional'];

// Interactive AI-comment generator. Posts to the same-origin /api/op proxy (the
// token stays server-side). Predictable states: idle → loading → result | error.
export function CommentGenerator() {
  const [platform, setPlatform] = useState('instagram');
  const [identifier, setIdentifier] = useState('');
  const [tone, setTone] = useState('friendly');
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setComment(null);
    setError(null);
    try {
      const res = await fetch('/api/op/content.comment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: { platform, targetType: 'profile', identifier }, tone })
      });
      const envelope = (await res.json()) as { data: CommentResult | null; error: { code: string; message: string } | null };
      if (envelope.error) setError(`${envelope.error.code}: ${envelope.error.message}`);
      else setComment(envelope.data?.comment ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="stack" onSubmit={onSubmit}>
        <div>
          <label htmlFor="platform">Platform</label>
          <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="instagram">instagram</option>
            <option value="tiktok">tiktok</option>
            <option value="telegram">telegram</option>
            <option value="linkedin">linkedin</option>
          </select>
        </div>
        <div>
          <label htmlFor="identifier">Target identifier</label>
          <input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="@nike" required />
        </div>
        <div>
          <label htmlFor="tone">Tone</label>
          <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading || !identifier}>{loading ? 'Generating…' : 'Generate comment'}</button>
      </form>
      {error ? <div className="notice" role="alert" style={{ marginTop: 16 }}>{error}</div> : null}
      {comment != null ? (
        <div className="result" style={{ marginTop: 16 }} aria-label="Generated comment">{comment}</div>
      ) : null}
    </>
  );
}
