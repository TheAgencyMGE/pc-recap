import { motion, useReducedMotion } from 'framer-motion';
import type { TimeBucket } from '../../shared/types';
import { buildTapeBands, MIXTAPE_COLORS } from '../lib/visual-theme';

const DEFAULT_COLORS = [
  MIXTAPE_COLORS.red,
  MIXTAPE_COLORS.lilac,
  MIXTAPE_COLORS.acid,
  MIXTAPE_COLORS.cobalt,
  MIXTAPE_COLORS.yellow,
  MIXTAPE_COLORS.pink,
];

export function ActivityTape({ data, colors = DEFAULT_COLORS, label = 'Activity by hour' }: { data: TimeBucket[]; colors?: string[]; label?: string }) {
  const reduceMotion = useReducedMotion();
  const bands = buildTapeBands(data, colors);
  return <figure className="activity-tape" aria-label={label}>
    <div className="activity-tape__line" aria-hidden="true">
      {bands.map((band, index) => <motion.i
        key={`${band.label}-${index}`}
        initial={reduceMotion ? false : { flexGrow: 0, opacity: 0 }}
        animate={{ flexGrow: band.share, opacity: 1 }}
        transition={{ duration: .45, delay: reduceMotion ? 0 : index * .025, ease: [0.22, 1, 0.36, 1] }}
        style={{ backgroundColor: band.color }}
      />)}
      {!bands.length && <span />}
    </div>
    <figcaption><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></figcaption>
  </figure>;
}
