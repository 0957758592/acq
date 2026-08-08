// User-friendly error surface (REQUIREM §8.2). The control-plane may be
// unreachable or return a coded error — render it calmly, never a stack trace.
export function ErrorNotice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="notice" role="status">
      <strong>{title}</strong>
      {detail ? <div className="mono" style={{ marginTop: 6 }}>{detail}</div> : null}
    </div>
  );
}
