import type { TimeBucket, TimelineBucket } from '../../shared/types';
import type { BucketScale } from '../lib/format';
import { BarChart } from './charts/BarChart';

export function Metric({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return <div className="metric" style={tone ? { '--metric-tone': tone } as React.CSSProperties : undefined}>
    <span className="metric__label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}
  </div>;
}

export function SparkBars({ data, color = '#181818', scale }: { data: TimeBucket[] | TimelineBucket[]; color?: string; scale?: BucketScale }) {
  return <BarChart data={data} color={color} scale={scale ?? inferScale(data)} label="Historical usage chart" />;
}

function inferScale(data: TimeBucket[] | TimelineBucket[]): BucketScale {
  const label = data[0]?.label ?? '';
  if (/^\d{1,2}$/.test(label)) return 'hour';
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return 'day';
  if (/^\d{4}-\d{2}$/.test(label)) return 'month';
  return 'year';
}
