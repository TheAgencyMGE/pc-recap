import { CalendarRange, LoaderCircle, Play, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { PCRecapAPI } from '../../../shared/ipc';
import { customRecapSelection, seasonRecapSelection, yearRecapSelection } from '../../../shared/periods';
import type { RecapSelection, RecapStoryData, TimelineBucket } from '../../../shared/types';
import { formatDuration } from '../../lib/format';
import { MemoryPinEditor } from '../../components/MemoryPinEditor';

export function RecapStudio({ api, onPlay }: { api: PCRecapAPI; onPlay: (story: RecapStoryData) => void }) {
  const [years, setYears] = useState<TimelineBucket[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const now = new Date();
  const initialStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const inputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const [customStart, setCustomStart] = useState(inputDate(initialStart));
  const [customEnd, setCustomEnd] = useState(inputDate(now));
  const [pinEditor, setPinEditor] = useState(false);
  useEffect(() => {
    let live = true;
    void api.getTimeline('year').then((result) => { if (live) setYears(result); }).catch(() => { if (live) setError('Could not open your recap years.'); });
    return () => { live = false; };
  }, [api]);

  const play = async (selection: RecapSelection) => {
    setBusy(selection.label);
    setError('');
    try { onPlay(await api.getRecap(selection)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not build that recap.'); }
    finally { setBusy(''); }
  };

  return <motion.main className="page recap-studio" initial={false} animate={{ opacity: 1 }}>
    <header className="recap-studio__heading"><div><small>Recap Studio</small><h1>Play it back.</h1></div><Sparkles /></header>
    {error && <div className="toast-note">{error}</div>}
    <section className="recap-studio__years"><h2>Years</h2><div>{years.map((year) => {
      const selection = yearRecapSelection(Number(year.key), now);
      return <button key={year.key} aria-label={`Play ${year.key} recap`} onClick={() => { void play(selection); }}><span>{year.key}</span><strong>{formatDuration(year.seconds)}</strong>{busy === year.key ? <LoaderCircle /> : <Play />}</button>;
    })}</div>{!years.length && <p>Your first year appears after activity is recorded.</p>}</section>
    <section className="recap-studio__seasons"><h2>Seasons</h2><div>{(['Winter', 'Spring', 'Summer', 'Fall'] as const).map((season) => {
      const selection = seasonRecapSelection(now.getFullYear(), season, now);
      const available = new Date(selection.start) <= now;
      return <button key={season} disabled={!available || Boolean(busy)} onClick={() => { void play(selection); }}><b>{season}</b><span>{now.getFullYear()}</span><Play /></button>;
    })}</div></section>
    <section className="recap-studio__custom"><CalendarRange /><div><h2>Custom cut</h2><p>Pick any run of recorded days.</p></div><label>Start<input aria-label="Custom start" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>End<input aria-label="Custom end" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label><div className="recap-studio__custom-actions"><button onClick={() => setPinEditor((value) => !value)}>Pin it</button><button className="primary-button" disabled={Boolean(busy)} onClick={() => {
      try { void play(customRecapSelection(customStart, customEnd)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Choose a valid range.'); }
    }}><Play /> Play</button></div></section>
    {pinEditor && (() => {
      try {
        const selection = customRecapSelection(customStart, customEnd);
        return <MemoryPinEditor api={api} start={selection.start} end={selection.end} onSaved={() => setPinEditor(false)} onCancel={() => setPinEditor(false)} />;
      } catch { return null; }
    })()}
  </motion.main>;
}
