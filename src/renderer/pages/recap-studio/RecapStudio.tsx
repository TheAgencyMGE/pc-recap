import { CalendarRange, LoaderCircle, Play, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { PCRecapAPI } from '../../../shared/ipc';
import { currentRecapSelection, customRecapSelection, decadeRecapSelection, seasonRecapSelection, yearRecapSelection } from '../../../shared/periods';
import type { RecapSelection, RecapStoryData, TimelineBucket } from '../../../shared/types';
import { formatDuration } from '../../lib/format';
import { MemoryPinEditor } from '../../components/MemoryPinEditor';

export function RecapStudio({ api, onPlay }: { api: PCRecapAPI; onPlay: (story: RecapStoryData) => void }) {
  const [years, setYears] = useState<TimelineBucket[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const now = new Date();
  const initialStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const inputDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const [customStart, setCustomStart] = useState(inputDate(initialStart));
  const [customEnd, setCustomEnd] = useState(inputDate(now));
  const [pinEditor, setPinEditor] = useState(false);
  const seasonYears = years.length
    ? [...new Set(years.flatMap((year) => [Number(year.key), Number(year.key) - 1]))].filter(Number.isFinite).sort((a, b) => b - a)
    : [now.getFullYear()];
  useEffect(() => {
    let live = true;
    void api.getTimeline('year').then((result) => {
      if (!live) return;
      setYears(result);
      const latest = Math.max(...result.map((item) => Number(item.key)).filter(Number.isFinite));
      if (Number.isFinite(latest)) setSeasonYear(latest);
    }).catch(() => { if (live) setError('Could not open your recap years.'); });
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
    <section className="recap-studio__quick"><h2>Right now</h2><div>{([
      ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['decade', 'This decade'],
    ] as const).map(([kind, label]) => {
      const selection = currentRecapSelection(kind, now);
      return <button key={kind} disabled={Boolean(busy)} onClick={() => { void play(selection); }}><span>{label}</span>{busy === selection.label ? <LoaderCircle /> : <Play />}</button>;
    })}</div></section>
    <section className="recap-studio__years"><h2>Years</h2><div>{years.map((year) => {
      const selection = yearRecapSelection(Number(year.key), now);
      return <button key={year.key} aria-label={`Play ${year.key} recap`} onClick={() => { void play(selection); }}><span>{year.key}</span><strong>{formatDuration(year.seconds)}</strong>{busy === year.key ? <LoaderCircle /> : <Play />}</button>;
    })}</div>{!years.length && <p>Your first year appears after activity is recorded.</p>}</section>
    {years.length > 0 && <section className="recap-studio__decades"><h2>Decades</h2><div>{[...new Set(years.map((year) => Math.floor(Number(year.key) / 10) * 10))].sort((a, b) => b - a).map((decade) => {
      const selection = decadeRecapSelection(decade, now);
      const seconds = years.filter((year) => Number(year.key) >= decade && Number(year.key) < decade + 10).reduce((sum, year) => sum + year.seconds, 0);
      return <button key={decade} aria-label={`Play ${selection.label} recap`} disabled={Boolean(busy)} onClick={() => { void play(selection); }}><span>{selection.label}</span><strong>{formatDuration(seconds)}</strong><Play /></button>;
    })}</div></section>}
    <section className="recap-studio__seasons"><header><h2>Seasons</h2><label>Year<select aria-label="Season year" value={seasonYear} onChange={(event) => setSeasonYear(Number(event.target.value))}>{seasonYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></header><div>{(['Winter', 'Spring', 'Summer', 'Fall'] as const).map((season) => {
      const selection = seasonRecapSelection(seasonYear, season, now);
      const available = new Date(selection.start) <= now;
      return <button key={season} disabled={!available || Boolean(busy)} onClick={() => { void play(selection); }}><b>{season}</b><span>{selection.label.replace(`${season} `, '')}</span><Play /></button>;
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
