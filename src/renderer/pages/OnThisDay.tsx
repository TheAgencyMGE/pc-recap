import { motion } from 'framer-motion';
import { CalendarHeart, Clock3 } from 'lucide-react';
import type { OnThisDayEntry } from '../../shared/types';
import { formatClock, formatDuration } from '../lib/format';

export function OnThisDay({ entries }: { entries: OnThisDayEntry[] }) {
  const date = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(new Date());
  return <motion.main className="page on-this-day" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <header className="simple-page-heading"><h1>On this day</h1><span>{date}</span></header>
    <section className="day-echoes">{entries.map((entry, index) => <motion.article key={entry.year} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .08 }}>
      <div className="day-echoes__year"><span>{entry.year}</span><i /></div><div className="day-echoes__card"><CalendarHeart /><div><h2>{entry.topApp}</h2><p>{formatDuration(entry.totalSeconds)}</p></div><dl><div><dt>First</dt><dd>{formatClock(entry.firstActivity)}</dd></div><div><dt>Last</dt><dd>{formatClock(entry.lastActivity)}</dd></div></dl></div>
    </motion.article>)}</section>
    {!entries.length && <div className="empty-state"><Clock3 /><h2>Nothing yet</h2></div>}
  </motion.main>;
}
