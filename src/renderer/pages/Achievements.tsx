import { motion } from 'framer-motion';
import { LockKeyhole, Medal, Sparkles } from 'lucide-react';
import type { Achievement } from '../../shared/types';
import { formatDate } from '../lib/format';

export function Achievements({ achievements }: { achievements: Achievement[] }) {
  const unlockedItems = achievements.filter((item) => item.unlockedAt);
  const unlocked = unlockedItems.length;
  return <motion.main className="page achievements-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
    <header className="simple-page-heading"><h1>Records</h1><span>{unlocked}/{achievements.length}</span></header>
    <section className="achievement-hero"><Medal /><div><small>Latest</small><h2>{unlockedItems.at(-1)?.title ?? 'No records yet'}</h2></div><span>{String(unlocked).padStart(2, '0')}</span></section>
    <section className="achievement-grid">{achievements.map((item, index) => {
      const done = Boolean(item.unlockedAt);
      const progress = item.target > 0 ? Math.min(100, (item.progress / item.target) * 100) : 0;
      return <motion.article key={item.id} className={`achievement ${done ? 'is-unlocked' : ''}`} style={{ '--achievement-color': item.accent } as React.CSSProperties} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05 }} data-record-state={done ? 'unlocked' : 'locked'}>
        <div className="achievement__seal">{done ? <Sparkles /> : <LockKeyhole />}</div><span>{done ? 'Unlocked' : `${Math.round(progress)}%`}</span><h2>{item.title}</h2><p>{item.description}</p>
        {done ? <small>{item.unlockedAt ? formatDate(item.unlockedAt) : ''}</small> : <div className="progress-line"><i style={{ width: `${progress}%` }} /></div>}
      </motion.article>;
    })}</section>
    {!achievements.length && <section className="empty-state"><Medal /><h2>No records yet</h2></section>}
  </motion.main>;
}
