import { DatabaseZap, FileUp, HardDriveDownload, SearchCheck, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';
import type { HistoryImportResult, HistoryPreviewView } from '../../shared/types';
import { formatDate, formatDuration } from '../lib/format';

export function HistoryRecovery({ api, onChanged }: { api: PCRecapAPI; onChanged: () => void }) {
  const [preview, setPreview] = useState<HistoryPreviewView>();
  const [includeBrowserHistory, setIncludeBrowserHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HistoryImportResult>();
  const exactCount = preview?.exactSessionCount ?? preview?.exactSessions.length ?? 0;
  const clueCount = preview?.recoveredEventCount ?? preview?.recoveredEvents.length ?? 0;

  const run = async (operation: () => Promise<HistoryPreviewView | null>) => {
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      if (preview) {
        await api.cancelHistoryPreview(preview.id);
        setPreview(undefined);
      }
      const next = await operation();
      if (next) setPreview(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read that history.');
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const next = await api.commitHistoryImport(preview.id);
      setResult(next);
      setPreview(undefined);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import failed.');
    } finally { setBusy(false); }
  };

  return <motion.main className="page recovery-page" initial={false} animate={{ opacity: 1, y: 0 }}>
    <div className="simple-page-heading"><h1>Recover older history</h1><p>Bring real records forward from trackers and Windows.</p></div>
    <div className="recovery-truth"><ShieldCheck /><b>Recovered clues do not add usage time.</b><span>Only records with an exact start and end become sessions.</span></div>

    <section className="recovery-actions">
      <button aria-label="Choose tracker export" disabled={busy} onClick={() => { void run(() => api.previewHistoryFile()); }}><FileUp /><span><b>Choose tracker export</b><small>ActivityWatch, ManicTime, RescueTime, or WakaTime</small></span></button>
      <button aria-label="Scan this PC" disabled={busy} onClick={() => { void run(() => api.scanWindowsHistory(includeBrowserHistory)); }}><HardDriveDownload /><span><b>Scan this PC</b><small>Install dates, launch clues, Prefetch, and Activity History</small></span></button>
    </section>

    <label className="browser-consent"><input type="checkbox" checked={includeBrowserHistory} onChange={(event) => setIncludeBrowserHistory(event.target.checked)} /><span><b>Include browser history clues</b><small>Off by default. Stores visited domains as clues, never browsing duration.</small></span></label>
    {busy && <div className="recovery-status"><SearchCheck /> Reading available history...</div>}
    {error && <div className="toast-note recovery-error">{error}</div>}
    {result && <div className="recovery-result"><DatabaseZap /><div><b>{result.importedSessions} sessions added</b><span>{result.recoveredEvents} clues added{result.duplicates ? `, ${result.duplicates} duplicates skipped` : ''}.</span></div></div>}

    {preview && <section className="recovery-preview">
      <header><div><small>{preview.sourceLabel}</small><h2>{exactCount} exact sessions</h2><p>{clueCount} recovered clues</p></div>{preview.coverage && <span>{formatDate(preview.coverage.start)} to {formatDate(preview.coverage.end)}</span>}</header>
      {preview.sources.length > 0 && <div className="recovery-sources">{preview.sources.map((source) => <div key={source.id} className={source.available ? '' : 'is-unavailable'}><i /> <span><b>{source.label}</b><small>{source.available ? `${source.eventCount} clues` : source.limitation ?? 'Unavailable'}</small></span></div>)}</div>}
      <div className="recovery-samples">
        {preview.exactSessions.slice(0, 5).map((session, index) => <div key={`${session.startedAt}-${index}`}><b>{session.appName}</b><span>{formatDate(session.startedAt)} · {formatDuration(session.durationSeconds)}</span></div>)}
        {preview.recoveredEvents.slice(0, 5).map((event, index) => <div key={`${event.sourceKind}-${event.occurredAt}-${index}`}><b>{event.appName}</b><span>{formatDate(event.occurredAt)} · {event.eventType.replace('-', ' ')}</span>{event.detail && <small title={event.detail}>{event.detail}</small>}</div>)}
      </div>
      {preview.warnings.map((warning) => <p className="recovery-warning" key={warning}>{warning}</p>)}
      <button className="primary-button" disabled={busy || exactCount + clueCount === 0} onClick={() => { void commit(); }}>
        {exactCount ? `Import ${exactCount} exact sessions` : `Import ${clueCount} recovered clues`}
      </button>
    </section>}
  </motion.main>;
}
