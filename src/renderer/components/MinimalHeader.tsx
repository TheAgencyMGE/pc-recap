import { Pause, Play, Search, Settings, Shapes } from 'lucide-react';
import type { TrackingStatus } from '../../shared/types';
import type { RouteId } from '../routes';
import { LogoMark } from './LogoMark';

export function MinimalHeader({
  status,
  trackingEnabled,
  onSearch,
  onNavigate,
  onToggleTracking,
}: {
  status: TrackingStatus;
  trackingEnabled: boolean;
  onSearch: () => void;
  onNavigate: (route: RouteId) => void;
  onToggleTracking: () => void;
}) {
  const active = trackingEnabled;
  return <header className="minimal-header" data-tracking-state={status.state}>
    <LogoMark />
    <div className="minimal-header__actions">
      <button title="Search" aria-label="Search" onClick={onSearch}><Search /></button>
      <button title="Categories" aria-label="Categories" onClick={() => onNavigate('categories')}><Shapes /></button>
      <button title={active ? 'Pause' : 'Resume'} aria-label={active ? 'Pause tracking' : 'Resume tracking'} onClick={onToggleTracking}>{active ? <Pause /> : <Play />}</button>
      <button title="Settings" aria-label="Settings" onClick={() => onNavigate('settings')}><Settings /></button>
    </div>
  </header>;
}
