import { motion, useReducedMotion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { TimeBucket, TimelineBucket } from '../../../shared/types';
import { formatBucketLabel, formatDurationLong, type BucketScale } from '../../lib/format';

export function BarChart({
  data,
  scale,
  color = '#181818',
  label = 'Usage over time',
}: {
  data: TimeBucket[] | TimelineBucket[];
  scale: BucketScale;
  color?: string;
  label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const visible = data.slice(-24);
  const max = Math.max(1, ...visible.map((item) => item.seconds));
  const [selected, setSelected] = useState<number>();
  const stats = useMemo(() => {
    const peak = [...visible].sort((a, b) => b.seconds - a.seconds)[0];
    const average = visible.length ? Math.round(visible.reduce((sum, item) => sum + item.seconds, 0) / visible.length) : 0;
    return { peak, average };
  }, [visible]);
  const active = selected === undefined ? undefined : visible[selected];

  return <figure className="bar-chart" aria-label={label}>
    <div className="bar-chart__plot">
      {visible.map((item, index) => {
        const bucketLabel = formatBucketLabel(scale, item.label);
        const height = item.seconds === 0 ? 0 : item.seconds / max * 100;
        return <div className="bar-chart__bucket" key={`${item.label}-${index}`}>
          <motion.button
            type="button"
            className="bar-chart__bar"
            style={{ height: `${height}%`, background: color }}
            initial={reduceMotion ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: reduceMotion ? 0 : index * .018, duration: .32 }}
            aria-label={`${bucketLabel}, ${formatDurationLong(item.seconds)}`}
            aria-describedby={active && selected === index ? 'bar-chart-tooltip' : undefined}
            onFocus={() => setSelected(index)}
            onBlur={() => setSelected(undefined)}
            onMouseEnter={() => setSelected(index)}
            onMouseLeave={() => setSelected(undefined)}
          />
          <span>{axisLabel(scale, item.label, index, visible.length)}</span>
        </div>;
      })}
      {active && <div id="bar-chart-tooltip" className="bar-chart__tooltip" role="tooltip" style={{ left: `${((selected ?? 0) + .5) / Math.max(1, visible.length) * 100}%` }}>
        <b>{formatBucketLabel(scale, active.label)}</b><span>{formatDurationLong(active.seconds)}</span>
      </div>}
    </div>
    <figcaption>
      <span>Peak: {stats.peak ? `${formatBucketLabel(scale, stats.peak.label)} at ${formatDurationLong(stats.peak.seconds)}` : 'No activity'}</span>
      <span>Average: {formatDurationLong(stats.average)}</span>
    </figcaption>
  </figure>;
}

function axisLabel(scale: BucketScale, label: string, index: number, length: number) {
  if (scale === 'hour') return index % 3 === 0 ? formatBucketLabel(scale, label) : '';
  if (length > 12 && index % 2 !== 0) return '';
  return formatBucketLabel(scale, label).replace(/^\w{3}, /, '');
}
