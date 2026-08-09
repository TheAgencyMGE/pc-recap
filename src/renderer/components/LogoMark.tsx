export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? 'brand-lockup--compact' : ''}`} aria-label="PC Recap">
      <span className="brand-lockup__stamp" aria-hidden="true">PC</span>
      {!compact && <span className="brand-lockup__words"><b>PC</b><em>RECAP</em></span>}
    </div>
  );
}
