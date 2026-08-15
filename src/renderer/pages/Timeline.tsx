import { ArrowLeft, ArrowRight, Archive } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';
import type { TimelineBucket } from '../../shared/types';
import { formatDuration } from '../lib/format';
import { formatBucketLabel } from '../lib/format';
import type { RouteId } from '../routes';

export function Timeline({ api, onNavigate }: { api: PCRecapAPI; onNavigate?: (route: RouteId) => void }) {
  const [level, setLevel] = useState<'year' | 'month' | 'day'>('year');
  const [anchor, setAnchor] = useState<string>();
  const [data, setData] = useState<TimelineBucket[]>([]);
  const reduceMotion = useReducedMotion();
  useEffect(() => { void api.getTimeline(level, anchor).then(setData); }, [api, level, anchor]);
  const zoom = (bucket: TimelineBucket) => {
    if (level === 'year') { setAnchor(bucket.key); setLevel('month'); }
    else if (level === 'month') { setAnchor(bucket.key); setLevel('day'); }
    else onNavigate?.(`day:${bucket.key}`);
  };
  const back = () => {
    if (level === 'day') { setAnchor(anchor?.slice(0, 4)); setLevel('month'); }
    else { setAnchor(undefined); setLevel('year'); }
  };
  const selectLevel = (next: 'year' | 'month' | 'day') => {
    if (next === 'year') { setAnchor(undefined); setLevel('year'); return; }
    const today = new Date();
    if (next === 'month') setAnchor(anchor?.slice(0, 4) ?? String(today.getFullYear()));
    else setAnchor(anchor?.length && anchor.length >= 7 ? anchor.slice(0, 7) : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
    setLevel(next);
  };
  return <motion.main className="page timeline-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <header className="simple-page-heading"><h1>Timeline</h1><span>{level}</span></header>
    <div className="timeline-toolbar">
      {level !== 'year' ? <button className="back-button" onClick={back}><ArrowLeft /> Back</button> : <span />}
      <div className="segmented" aria-label="Timeline scale"><button className={level === 'year' ? 'is-active' : ''} onClick={() => selectLevel('year')}>Years</button><button className={level === 'month' ? 'is-active' : ''} onClick={() => selectLevel('month')}>Months</button><button className={level === 'day' ? 'is-active' : ''} onClick={() => selectLevel('day')}>Days</button></div>
    </div>
    <section className={`archive-shelf archive-shelf--${level}`} aria-label={`${level} archive`}>
      {data.map((bucket, index) => <motion.button
        key={bucket.key}
        data-cover-type={level}
        aria-label={`${level === 'year' ? bucket.label : formatBucketLabel(level, bucket.label)}, ${bucket.topApp}, ${formatDuration(bucket.seconds)}`}
        onClick={() => zoom(bucket)}
        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : index * .035 }}
        style={{ '--cover-intensity': bucket.intensity } as React.CSSProperties}
      >
        <span className="archive-cover__index">{String(index + 1).padStart(2, '0')}</span>
        <span className="archive-cover__stripes" aria-hidden="true" />
        <span className="archive-cover__copy"><small>{level === 'year' ? bucket.label : formatBucketLabel(level, bucket.label)}</small><b>{bucket.topApp}</b><em>{formatDuration(bucket.seconds)}</em></span>
        <ArrowRight />
      </motion.button>)}
      {!data.length && <div className="empty-state"><Archive /><h2>No activity here</h2></div>}
    </section>
  </motion.main>;
}
