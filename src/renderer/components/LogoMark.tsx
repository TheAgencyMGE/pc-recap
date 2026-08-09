export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? 'brand-lockup--compact' : ''}`} aria-label="PC Wrapped">
      <span className="brand-lockup__stamp" aria-hidden="true">PC</span>
      {!compact && <span className="brand-lockup__words"><b>PC</b><em>WRAPPED</em></span>}
    </div>
  );
}
