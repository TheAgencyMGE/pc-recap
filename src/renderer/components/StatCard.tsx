export function StatCard({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: string }) {
  return <div className="stat-card" style={accent ? { '--stat-accent': accent } as React.CSSProperties : undefined}>
    <span>{label}</span>
    <strong>{value}</strong>
    {note && <small>{note}</small>}
  </div>;
}
