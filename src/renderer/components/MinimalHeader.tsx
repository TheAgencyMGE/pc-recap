import { Pause, Play, Search, Settings, X } from 'lucide-react';
import { useState } from 'react';
import type { TrackingStatus } from '../../shared/types';
import type { RouteId } from '../routes';
import { LogoMark } from './LogoMark';

export function MinimalHeader({
  status,
  query,
  onQueryChange,
  onNavigate,
  onToggleTracking,
}: {
  status: TrackingStatus;
  query: string;
  onQueryChange: (value: string) => void;
  onNavigate: (route: RouteId) => void;
  onToggleTracking: () => void;
}) {
  const [searching, setSearching] = useState(false);
  const active = status.state === 'tracking';
  return <header className="minimal-header">
    <LogoMark />
    <div className={`minimal-header__actions ${searching ? 'is-searching' : ''}`}>
      {searching && <label className="collection-search"><Search size={16} /><input autoFocus type="search" aria-label="Search apps" placeholder="Search apps" value={query} onChange={(event) => onQueryChange(event.target.value)} /></label>}
      <button title={searching ? 'Close search' : 'Search'} aria-label={searching ? 'Close search' : 'Search'} onClick={() => { setSearching((value) => !value); if (searching) onQueryChange(''); }}>{searching ? <X /> : <Search />}</button>
      <button title={active ? 'Pause' : 'Resume'} aria-label={active ? 'Pause tracking' : 'Resume tracking'} onClick={onToggleTracking}>{active ? <Pause /> : <Play />}</button>
      <button title="Settings" aria-label="Settings" onClick={() => onNavigate('settings')}><Settings /></button>
    </div>
  </header>;
}
