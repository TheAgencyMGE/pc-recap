import { BookmarkPlus, Clock3, GitCompareArrows, LoaderCircle, MoonStar, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { PCRecapAPI } from '../../../shared/ipc';
import type { DayReplayData, MemoryPin } from '../../../shared/types';
import { formatClock, formatDate, formatDurationLong, formatHour } from '../../lib/format';
import { ReplayRibbon } from './ReplayRibbon';
import { MemoryPinEditor } from '../../components/MemoryPinEditor';

export function DayReplay({ api, day }: { api: PCRecapAPI; day: string }) {
  const [data, setData] = useState<DayReplayData>();
  const [error, setError] = useState('');
  const [appId, setAppId] = useState<string>();
  const [hour, setHour] = useState<number>();
  const [editing, setEditing] = useState<MemoryPin | 'new'>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    void api.getDayReplay(day).then((result) => { if (live) setData(result); }).catch((reason: unknown) => {
      if (live) setError(reason instanceof Error ? reason.message : 'Could not replay this day.');
    });
    return () => { live = false; };
  }, [api, day, revision]);
  const apps = useMemo(() => data ? [...new Map(data.segments.map((segment) => [segment.appId, segment])).values()] : [], [data]);
  const filtered = data?.segments.filter((segment) => !appId || segment.appId === appId) ?? [];
  const hours = useMemo(() => data ? [...new Set(data.segments.flatMap((segment) => {
    const start = new Date(segment.startedAt).getHours();
    const end = new Date(segment.endedAt).getHours();
    return Array.from({ length: Math.max(1, end - start + 1) }, (_, index) => (start + index) % 24);
  }))].sort((a, b) => a - b) : [], [data]);

  if (error) return <main className="page replay-page"><div className="empty-state"><h2>{error}</h2></div></main>;
  if (!data) return <main className="page replay-page"><div className="replay-loading"><LoaderCircle /> Opening day</div></main>;
  return <motion.main className="page replay-page" initial={false} animate={{ opacity: 1 }}>
    <header className="replay-heading"><div><small>Day Replay</small><h1>{formatDate(`${day}T12:00:00`)}</h1></div><div><strong>{formatDurationLong(data.totalSeconds)}</strong><button onClick={() => setEditing(editing ? undefined : 'new')}><BookmarkPlus /> Add memory</button></div></header>
    {editing && <MemoryPinEditor api={api} {...dayBounds(day)} pin={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(undefined); setRevision((value) => value + 1); }} onCancel={() => setEditing(undefined)} />}
    {!data.segments.length ? <div className="empty-state"><Sparkles /><h2>No exact activity this day</h2>{data.recoveredClues.length > 0 && <p>{data.recoveredClues.length} recovered clues are still shown below.</p>}</div> : <>
      <div className="replay-controls">
        <div className="replay-filters"><button className={!appId ? 'is-active' : ''} onClick={() => setAppId(undefined)}>All apps</button>{apps.map((app) => <button key={app.appId} aria-label={`Filter to ${app.appName}`} className={appId === app.appId ? 'is-active' : ''} onClick={() => setAppId(appId === app.appId ? undefined : app.appId)}><i style={{ background: app.color }} />{app.appName}</button>)}</div>
        <label>Zoom <select aria-label="Zoom to hour" value={hour ?? ''} onChange={(event) => setHour(event.target.value ? Number(event.target.value) : undefined)}><option value="">All day</option>{hours.map((value) => <option value={value} key={value}>{formatHour(value)}</option>)}</select></label>
      </div>
      <ReplayRibbon data={data} segments={filtered} hour={hour} />
      <section className="replay-facts">
        <article><Clock3 /><span><small>First to last</small><b>{formatClock(data.firstActivity)} to {formatClock(data.lastActivity)}</b></span></article>
        <article><MoonStar /><span><small>Busiest hour</small><b>{data.busiestHour === undefined ? 'No peak' : formatHour(data.busiestHour)}</b></span></article>
        <article><GitCompareArrows /><span><small>App switches</small><b>{data.appSwitches.toLocaleString()}</b></span></article>
        <article><Sparkles /><span><small>Longest gap</small><b>{data.idleGaps.length ? formatDurationLong(Math.max(...data.idleGaps.map((gap) => gap.durationSeconds))) : 'No gap'}</b></span></article>
      </section>
    </>}
    {(data.recoveredClues.length > 0 || data.pins.length > 0) && <section className="replay-notes"><h2>Along the way</h2>{data.pins.map((pin) => <button key={pin.id} onClick={() => setEditing(pin)}><b>{pin.title}</b><span>{pin.note}</span></button>)}{data.recoveredClues.map((clue) => <article key={clue.id}><b>{clue.appName}</b><span>{clue.detail ?? clue.eventType}</span></article>)}</section>}
  </motion.main>;
}

function dayBounds(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return {
    start: new Date(year, month - 1, date).toISOString(),
    end: new Date(year, month - 1, date + 1).toISOString(),
  };
}
