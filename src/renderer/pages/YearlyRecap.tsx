import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Download, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';
import type { MemoryPin, PeriodSummary, RecapSelection, RecoveredEvent, TimelineBucket } from '../../shared/types';
import { AppIcon } from '../components/AppIcon';
import { formatDuration } from '../lib/format';
import { saveShareCard } from '../lib/share-card';
import { buildRecapHeading, buildRecapScenes, formatRecapTotal, type RecapSceneId } from '../lib/recap-scenes';

interface Props {
  api: PCRecapAPI;
  summary: PeriodSummary;
  timeline: TimelineBucket[];
  onClose: () => void;
  selection?: RecapSelection;
  recoveredClues?: RecoveredEvent[];
  pins?: MemoryPin[];
}

function SceneKicker({ children }: { children: React.ReactNode }) {
  return <span className="recap-kicker">{children}</span>;
}

function Scene({ id, summary, timeline, api, selection, recoveredClues = [], pins = [] }: {
  id: RecapSceneId; summary: PeriodSummary; timeline: TimelineBucket[]; api: PCRecapAPI;
  selection: RecapSelection; recoveredClues?: RecoveredEvent[]; pins?: MemoryPin[];
}) {
  const [saved, setSaved] = useState('');
  const favorite = summary.topApps[0];
  const maxCategory = Math.max(...summary.categories.map((category) => category.seconds), 1);
  const busiestMonth = [...timeline].filter((bucket) => bucket.seconds > 0).sort((a, b) => b.seconds - a.seconds)[0];
  const era = summary.eras[0];
  const observation = summary.observations[0];
  const total = formatRecapTotal(summary.totalSeconds);
  const relationship = summary.relationships[0];
  const routine = summary.routines[0];
  const lifecycle = summary.lifecycle[0];
  const clue = recoveredClues[0];
  const pin = pins.find((item) => item.includeInRecaps);

  if (id === 'cover') return (
    <section className="recap-scene recap-scene--cover">
      <h1>{buildRecapHeading(selection)}</h1>
      <div className="recap-cover-mark" aria-hidden="true"><span>PC</span><b>{summary.label}</b><i>RECAP</i></div>
    </section>
  );

  if (id === 'total') return (
    <section className="recap-scene recap-scene--total">
      <SceneKicker>Time</SceneKicker>
      <h1><strong>{total.value}</strong> {total.unit}, recorded.</h1>
      <p>{formatDuration(summary.totalSeconds)} of real activity across {summary.activeDays.toLocaleString()} active {summary.activeDays === 1 ? 'day' : 'days'}.</p>
      <div className="recap-time-rule" aria-hidden="true"><i /><i /><i /><i /><i /></div>
    </section>
  );

  if (id === 'favorite' && favorite) return (
    <section className="recap-scene recap-scene--favorite">
      <div className="recap-favorite-copy">
        <SceneKicker>Top app</SceneKicker>
        <h1>{favorite.name}</h1>
        <p>{formatDuration(favorite.seconds)} across {favorite.sessions.toLocaleString()} {favorite.sessions === 1 ? 'session' : 'sessions'}.</p>
      </div>
      <div className="recap-favorite-art">
        <AppIcon appId={favorite.appId} name={favorite.name} color={favorite.color} size="large" />
        <span>NO. 1</span>
      </div>
      {summary.topApps.length > 1 && <ol className="recap-mini-chart" aria-label="Most-used apps">
        {summary.topApps.slice(1, 5).map((app, index) => <li key={app.appId}><span>0{index + 2}</span><b>{app.name}</b><em>{formatDuration(app.seconds)}</em></li>)}
      </ol>}
    </section>
  );

  if (id === 'categories') return (
    <section className="recap-scene recap-scene--categories">
      <SceneKicker>Categories</SceneKicker>
      <h1>This recap had range.</h1>
      <div className="recap-category-stack" aria-label="Category usage">
        {summary.categories.filter((category) => category.seconds > 0).slice(0, 5).map((category, index) => (
          <div key={category.categoryId} style={{ '--category-size': `${Math.max(24, (category.seconds / maxCategory) * 100)}%`, '--category-color': category.color } as React.CSSProperties}>
            <span>0{index + 1}</span><b>{category.name}</b><i /><em>{Math.round(category.share)}%</em>
          </div>
        ))}
      </div>
    </section>
  );

  if (id === 'sprint' && busiestMonth) return (
    <section className="recap-scene recap-scene--sprint">
      <SceneKicker>Peak month</SceneKicker>
      <h1>{busiestMonth.label} played loudest.</h1>
      <p>{formatDuration(busiestMonth.seconds)} recorded. {busiestMonth.topApp ? `${busiestMonth.topApp} led that month.` : ''}</p>
      <div className="recap-months" aria-label="Recorded months">
        {timeline.filter((bucket) => bucket.seconds > 0).map((bucket) => <span key={bucket.key} className={bucket.key === busiestMonth.key ? 'is-peak' : ''} style={{ '--month-height': `${Math.max(12, bucket.intensity * 100)}%` } as React.CSSProperties}><i /><b>{bucket.label.slice(0, 3)}</b></span>)}
      </div>
    </section>
  );

  if (id === 'era' && era) return (
    <section className="recap-scene recap-scene--era" style={{ '--era-color': era.color } as React.CSSProperties}>
      <SceneKicker>Era</SceneKicker>
      <h1>{era.title}</h1>
      <p>{era.subtitle}</p>
      <div className="recap-era-stamp"><span>{era.start}</span><b>ERA</b><span>{era.end}</span></div>
    </section>
  );

  if (id === 'memory' && observation) return (
    <section className="recap-scene recap-scene--memory" style={{ '--memory-color': observation.accent } as React.CSSProperties}>
      <SceneKicker>{observation.eyebrow}</SceneKicker>
      <h1>“{observation.text}”</h1>
      <p>{observation.detail}</p>
      <div className="recap-memory-ticket"><b>{summary.label}</b></div>
    </section>
  );

  if (id === 'relationship' && relationship) return (
    <section className="recap-scene recap-scene--relationship"><SceneKicker>Power pair</SceneKicker><h1>{relationship.appA} + {relationship.appB}</h1><p>{relationship.transitions.toLocaleString()} close handoffs across {relationship.distinctDays.toLocaleString()} days.</p></section>
  );

  if (id === 'rhythm' && routine) return (
    <section className="recap-scene recap-scene--rhythm"><SceneKicker>Repeat play</SceneKicker><h1>{routine.apps.join(' → ')}</h1><p>This sequence returned {routine.occurrences.toLocaleString()} times across {routine.distinctDays.toLocaleString()} days.</p></section>
  );

  if (id === 'lifecycle' && lifecycle) return (
    <section className="recap-scene recap-scene--lifecycle"><SceneKicker>{lifecycle.kind.replace('-', ' ')}</SceneKicker><h1>{lifecycle.appName}</h1><p>{lifecycle.kind === 'comeback' && lifecycle.gapDays ? `Returned after ${lifecycle.gapDays} days away.` : `A real ${lifecycle.kind.replace('-', ' ')} from this recap.`}</p></section>
  );

  if (id === 'clue' && clue) return (
    <section className="recap-scene recap-scene--clue"><SceneKicker>Recovered clue</SceneKicker><h1>{clue.appName}</h1><p>{clue.detail ?? `${clue.eventType.replace('-', ' ')} on ${new Date(clue.occurredAt).toLocaleDateString()}.`} This clue did not add usage time.</p></section>
  );

  if (id === 'pin' && pin) return (
    <section className="recap-scene recap-scene--pin"><SceneKicker>Your memory</SceneKicker><h1>{pin.title}</h1>{pin.note && <p>{pin.note}</p>}</section>
  );

  if (id === 'record' && summary.longestSession) return (
    <section className="recap-scene recap-scene--record">
      <SceneKicker>Longest session</SceneKicker>
      <h1>{summary.longestSession.appName}</h1>
      <strong>{formatDuration(summary.longestSession.durationSeconds)}</strong>
      <p>Recorded on {new Date(summary.longestSession.startedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</p>
      <div className="recap-record-lines" aria-hidden="true"><i /><i /><i /></div>
    </section>
  );

  return (
    <section className="recap-scene recap-scene--finale">
      <SceneKicker>Your recap</SceneKicker>
      <h1>Keep the<br /><em>memory.</em></h1>
      <div className="finale-card">
        <span>{summary.label}</span>
        <strong>{total.value}{total.unit.startsWith('hour') ? 'H' : 'M'}</strong>
        {favorite && <b>{favorite.name} was your #1</b>}
        {observation && <p>{observation.text}</p>}
      </div>
      <div className="recap-share-actions">
      <button className="recap-share" onClick={async () => {
        const result = await saveShareCard(summary, api, 'portrait');
        setSaved(result.ok ? 'Saved to your PC.' : result.canceled ? '' : result.error ?? 'Could not save.');
      }}><Download /> Portrait</button>
      <button className="recap-share recap-share--secondary" onClick={async () => {
        const result = await saveShareCard(summary, api, 'story');
        setSaved(result.ok ? 'Saved to your PC.' : result.canceled ? '' : result.error ?? 'Could not save.');
      }}><Download /> Story</button>
      </div>
      <p className="recap-saved" aria-live="polite">{saved}</p>
    </section>
  );
}

export function YearlyRecap({ api, summary, timeline, onClose, selection = {
  kind: 'year', start: summary.rangeStart, end: summary.rangeEnd, label: summary.label, complete: summary.isComplete,
}, recoveredClues = [], pins = [] }: Props) {
  const sceneIds = useMemo(() => buildRecapScenes(summary, timeline, { recoveredClues, pins }), [pins, recoveredClues, summary, timeline]);
  const [scene, setScene] = useState(0);
  const reduceMotion = useReducedMotion();
  const next = useCallback(() => setScene((value) => Math.min(sceneIds.length - 1, value + 1)), [sceneIds.length]);
  const previous = useCallback(() => setScene((value) => Math.max(0, value - 1)), []);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') next();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [next, onClose, previous]);

  const sceneId = sceneIds[scene] ?? 'cover';
  return (
    <div className={`yearly-recap yearly-recap--${sceneId}`}>
      <header className="recap-header">
        <button onClick={onClose}><X /><span>Exit story</span></button>
        <div className="recap-progress" aria-label="Story scenes">
          {sceneIds.map((id, index) => <button key={id} className={index <= scene ? 'is-filled' : ''} onClick={() => setScene(index)} aria-label={`Go to scene ${index + 1}`} aria-current={index === scene ? 'step' : undefined} />)}
        </div>
        <span>{String(scene + 1).padStart(2, '0')} / {String(sceneIds.length).padStart(2, '0')}</span>
      </header>
      <AnimatePresence mode="wait">
        <motion.main key={sceneId} initial={reduceMotion ? false : { opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? undefined : { opacity: 0, x: -80 }} transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <Scene id={sceneId} summary={summary} timeline={timeline} api={api} selection={selection} recoveredClues={recoveredClues} pins={pins} />
        </motion.main>
      </AnimatePresence>
      <footer className="recap-controls">
        <button onClick={previous} disabled={scene === 0} aria-label="Previous scene"><ArrowLeft /></button>
        <button onClick={next} disabled={scene === sceneIds.length - 1} aria-label="Next scene"><ArrowRight /></button>
      </footer>
    </div>
  );
}
