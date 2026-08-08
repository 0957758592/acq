'use client';

import { useEffect, useState } from 'react';

interface DomainEvent {
  type: string;
  ts?: string;
  [k: string]: unknown;
}

// Live domain-event feed over the same-origin SSE proxy (/api/events). One-way,
// read-only; the token stays server-side. Connection status is explicit.
export function LiveEvents() {
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setStatus('live');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as DomainEvent;
        if (ev.type === 'events.error') { setStatus('error'); return; }
        setEvents((prev) => [ev, ...prev].slice(0, 15));
      } catch { /* ignore keep-alive / non-JSON frames */ }
    };
    es.onerror = () => setStatus('error');
    return () => es.close();
  }, []);

  return (
    <section aria-label="Live events" style={{ marginTop: 8 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        Live events
        <span className={`badge ${status === 'live' ? 'ok' : status === 'error' ? 'warn' : ''}`}>{status}</span>
      </h2>
      {events.length === 0 ? (
        <div className="notice">{status === 'error' ? 'Event stream unavailable (is the control-plane running?).' : 'Waiting for domain events…'}</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Event</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td><span className="badge">{e.type}</span></td>
                  <td className="mono">{JSON.stringify(rest(e)).slice(0, 120)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function rest(e: DomainEvent): Record<string, unknown> {
  const { type, ...r } = e;
  void type;
  return r;
}
