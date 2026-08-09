import { motion, useReducedMotion } from 'framer-motion';
import type { AppUsage } from '../../shared/types';
import { formatDuration } from '../lib/format';
import { AppIcon } from './AppIcon';

export function TrackList({ apps, label, limit = 7, onSelect }: { apps: AppUsage[]; label: string; limit?: number; onSelect?: (appId: string) => void }) {
  const reduceMotion = useReducedMotion();
  return <ol className="track-list" aria-label={label}>
    {apps.slice(0, limit).map((app, index) => <motion.li key={app.appId} initial={reduceMotion ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : index * .045 }}>
      <button onClick={() => onSelect?.(app.appId)} disabled={!onSelect}>
        <span className="track-list__rank">{String(index + 1).padStart(2, '0')}</span>
        <AppIcon appId={app.appId} name={app.name} color={app.color} />
        <span className="track-list__name"><b>{app.name}</b><small>{app.share}% of this period</small></span>
        <span className="track-list__rule" aria-hidden="true"><i style={{ width: `${Math.max(2, app.share)}%`, background: app.color }} /></span>
        <strong>{formatDuration(app.seconds, true)}</strong>
      </button>
    </motion.li>)}
  </ol>;
}
