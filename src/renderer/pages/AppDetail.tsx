import { CalendarDays, Clock3, Eye, EyeOff, HeartHandshake, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { AppDetail as AppDetailData } from '../../shared/types';
import { AppIcon } from '../components/AppIcon';
import { SparkBars } from '../components/Visuals';
import { StatCard } from '../components/StatCard';
import { formatDate, formatDuration, formatHour } from '../lib/format';
import { themeForApp } from '../lib/visual-theme';

export function AppDetail({ detail, onSetExcluded }: { detail: AppDetailData; onSetExcluded: (excluded: boolean) => Promise<void> }) {
  const theme = themeForApp(detail.app.id, detail.app.color);
  const [excluded, setExcluded] = useState(Boolean(detail.app.isExcluded));
  const [saving, setSaving] = useState(false);
  const toggleExcluded = async () => {
    const next = !excluded;
    setSaving(true);
    try {
      await onSetExcluded(next);
      setExcluded(next);
    } finally {
      setSaving(false);
    }
  };
  return <motion.main className="page app-detail" style={{ '--page-bg': theme.background, '--page-fg': theme.foreground, '--page-accent': theme.accent } as React.CSSProperties} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <header className="app-cover">
      <div className="app-cover__art"><AppIcon appId={detail.app.id} name={detail.app.name} color={detail.app.color} size="large" /></div>
      <div className="app-cover__copy"><span>Since {formatDate(detail.app.firstSeenAt)}</span><h1>{detail.app.name}</h1><p>{detail.app.executable}</p><button className="app-exclusion" type="button" disabled={saving} aria-label={`${excluded ? 'Include' : 'Exclude'} ${detail.app.name} in tracking`} onClick={() => { void toggleExcluded(); }}>{excluded ? <Eye /> : <EyeOff />}<span>{excluded ? 'Excluded from tracking' : 'Exclude from tracking'}</span></button></div>
      <div className="app-cover__total"><small>Total</small><strong>{formatDuration(detail.totalSeconds)}</strong></div>
    </header>
    <section className="stat-ribbon" aria-label={`${detail.app.name} at a glance`}>
      <StatCard label="Sessions" value={detail.sessionCount.toLocaleString()} note="Times it held the foreground" />
      <StatCard label="Active days" value={detail.activeDays.toLocaleString()} note="Distinct days in your archive" />
      <StatCard label="Favorite hour" value={formatHour(detail.favoriteHour)} note="When you used it most" accent={detail.app.color} />
      <StatCard label="Last seen" value={formatDate(detail.app.lastSeenAt)} note="Most recent recorded session" />
    </section>
    <section className="app-detail__spread">
      <article className="period-print"><header><h2>History by month</h2></header><SparkBars data={detail.timeline} color={detail.app.color} scale="month" /></article>
      <article className="app-liner-notes"><div><Timer /><small>Longest</small><b>{formatDuration(detail.longestSessionSeconds)}</b></div><div><CalendarDays /><small>Days</small><b>{detail.activeDays}</b></div><div><Clock3 /><small>Hour</small><b>{formatHour(detail.favoriteHour)}</b></div></article>
    </section>
    {detail.companions.length > 0 && <section className="companion-list"><header><HeartHandshake /><span><h2>Together</h2></span></header>{detail.companions.map((pair, index) => <div key={`${pair.appA}-${pair.appB}`}><span>{String(index + 1).padStart(2, '0')}</span><b>{pair.appA === detail.app.name ? pair.appB : pair.appA}</b><em>{pair.daysTogether} days</em></div>)}</section>}
  </motion.main>;
}
