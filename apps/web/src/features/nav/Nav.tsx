import Link from 'next/link';

// Primary navigation (feature-isolated). Plain links — server-rendered, a11y-first.
export function Nav() {
  return (
    <nav className="nav" aria-label="Primary">
      <span className="brand">ACQ Console</span>
      <Link href="/">Overview</Link>
      <Link href="/targets">Targets</Link>
      <Link href="/telemetry">Telemetry</Link>
      <Link href="/campaigns">AI Comments</Link>
    </nav>
  );
}
