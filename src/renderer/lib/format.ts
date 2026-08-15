export const formatDuration = (seconds: number, compact = false) => {
  if (seconds > 0 && seconds < 60) return '<1m';
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 100) return compact || remainder === 0 ? `${hours}h${remainder && compact ? ` ${remainder}m` : ''}` : `${hours}h ${remainder}m`;
  return `${Math.round(hours).toLocaleString()}h`;
};

export const formatClock = (iso?: string) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
};

export const formatDate = (iso: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', year: 'numeric',
}).format(new Date(iso));

export const formatHour = (hour: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
  .format(new Date(2026, 0, 1, hour));

export const formatDurationLong = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  if (safeSeconds === 0) return '0 minutes';
  if (safeSeconds < 60) return `${safeSeconds} ${safeSeconds === 1 ? 'second' : 'seconds'}`;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours.toLocaleString()} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ') || '0 minutes';
};

export type BucketScale = 'hour' | 'day' | 'month' | 'year';

export const formatBucketLabel = (scale: BucketScale, label: string) => {
  if (scale === 'hour') return formatHour(Number(label));
  if (scale === 'day') {
    const [year, month, day] = label.split('-').map(Number);
    if (!year || !month || !day) return label;
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      .format(new Date(year, month - 1, day));
  }
  if (scale === 'month') {
    const [year, month] = label.split('-').map(Number);
    if (!year || !month) return label;
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
      .format(new Date(year, month - 1, 1));
  }
  return label;
};
