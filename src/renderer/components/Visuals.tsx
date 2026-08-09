import { motion, useReducedMotion } from 'framer-motion';
import type { TimeBucket, TimelineBucket } from '../../shared/types';
import { formatDuration } from '../lib/format';

export function Metric({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return <div className="metric" style={tone ? { '--metric-tone': tone } as React.CSSProperties : undefined}>
    <span className="metric__label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}
  </div>;
}

export function SparkBars({ data, color = '#181818' }: { data: TimeBucket[] | TimelineBucket[]; color?: string }) {
  const reduceMotion = useReducedMotion();
  const visible = data.slice(-24);
  const max = Math.max(1, ...visible.map((item) => item.seconds));
  return <figure className="spark-bars" aria-label="Historical usage chart">
    {visible.map((item, index) => <div key={`${item.label}-${index}`} className="spark-bars__item" title={`${item.label}: ${formatDuration(item.seconds)}`}>
      <motion.i initial={reduceMotion ? false : { height: 0 }} animate={{ height: `${Math.max(2, item.seconds / max * 100)}%` }} transition={{ delay: reduceMotion ? 0 : index * .018 }} style={{ background: color }} />
      <span>{item.label.slice(-2)}</span>
    </div>)}
  </figure>;
}
