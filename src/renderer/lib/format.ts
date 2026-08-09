export const formatDuration = (seconds: number, compact = false) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 100) return compact || remainder === 0 ? `${hours}h${remainder && compact ? ` ${remainder}m` : ''}` : `${hours}h ${remainder}m`;
  return `${Math.round(hours).toLocaleString()}h`;
};

export const formatClock = (iso?: string) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
};

export const formatDate = (iso: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
}).format(new Date(iso));

export const formatHour = (hour: number) => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return `${hour % 12} ${hour > 12 ? 'PM' : 'AM'}`;
};
