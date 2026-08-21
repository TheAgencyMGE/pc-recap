import {
  Activity, ArchiveRestore, ClipboardCopy, Cpu, DatabaseBackup, Download, EyeOff, Gauge,
  History, Info, Power, ShieldCheck, TimerReset, Trash2, Upload,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';
import { DEFAULT_IGNORED_APPLICATIONS, type TrackingDiagnostics, type TrackingSettings } from '../../shared/types';
import type { RouteId } from '../routes';

function SettingRow({ icon, title, copy, control }: { icon: React.ReactNode; title: string; copy: string; control: React.ReactNode }) {
  return <div className="setting-row"><span className="setting-row__icon">{icon}</span><span><b>{title}</b><small>{copy}</small></span>{control}</div>;
}

function Toggle({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} aria-pressed={checked} className={`switch ${checked ? 'is-on' : ''}`} onClick={onClick}><i /></button>;
}

const PRIVACY_FACTS = ['Stored locally', 'No screenshots', 'No keystrokes', 'No browsing history', 'No account required', 'No activity telemetry'];

export function Settings({ api, settings, onChanged, onNavigate }: { api: PCRecapAPI; settings: TrackingSettings; onChanged: () => void; onNavigate: (route: RouteId) => void }) {
  const [message, setMessage] = useState('');
  const [diagnostics, setDiagnostics] = useState<TrackingDiagnostics>();
  const update = async (patch: Partial<TrackingSettings>) => {
    setMessage('');
    try {
      await api.updateSettings(patch);
      onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'That setting could not be changed.');
    }
  };
  useEffect(() => { void api.getTrackingDiagnostics().then(setDiagnostics); }, [api, settings]);

  const backup = async (kind: 'export' | 'import') => {
    const result = kind === 'export' ? await api.exportBackup() : await api.importBackup();
    setMessage(result.canceled ? '' : result.ok ? kind === 'export' ? 'Archive exported.' : `${result.importedSessions ?? 0} memories imported.` : result.error ?? 'That did not work.');
    if (result.ok) onChanged();
  };
  const copyDiagnostics = async () => {
    await api.copyTrackingDiagnostics();
    setMessage('Diagnostics copied.');
  };
  const confirmDelete = async () => {
    if (!window.confirm('Delete every tracked memory? This cannot be undone unless you exported a backup.')) return;
    await api.deleteAllHistory();
    setMessage('Your archive is now empty.');
    onChanged();
  };

  return <motion.div className="page settings-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
    <div className="simple-page-heading"><h1>Settings</h1></div>
    {message && <div className="toast-note">{message}</div>}
    <section className="privacy-facts" aria-label="PC Recap privacy facts">
      {PRIVACY_FACTS.map((fact) => <span key={fact}>{fact}</span>)}
    </section>
    <section className="settings-columns"><div>
      <article className="settings-group"><header><ShieldCheck /><div><h2>Tracking & privacy</h2><p>App activity and optional performance context stay on this computer.</p></div></header>
        <SettingRow icon={<Power />} title="Background tracking" copy="Remember the foreground app while the window is closed." control={<Toggle label="Background tracking" checked={settings.trackingEnabled} onClick={() => update({ trackingEnabled: !settings.trackingEnabled })} />} />
        <SettingRow icon={<EyeOff />} title="Window titles" copy="Off by default. When enabled, titles are stored locally with app sessions." control={<Toggle label="Window titles" checked={settings.captureWindowTitles} onClick={() => update({ captureWindowTitles: !settings.captureWindowTitles })} />} />
        <SettingRow icon={<TimerReset />} title="Idle threshold" copy="After this much OS-reported inactivity, time becomes away time instead of app time." control={<select aria-label="Idle threshold" value={settings.idleThresholdSeconds} onChange={(event) => update({ idleThresholdSeconds: Number(event.target.value) })}>
          <option value={120}>2 min</option><option value={300}>5 min</option><option value={600}>10 min</option><option value={900}>15 min</option>
        </select>} />
        <SettingRow icon={<Gauge />} title="Include idle time in recap totals" copy="Off by default. App rankings never treat idle as an application." control={<Toggle label="Include idle time in recap totals" checked={settings.includeIdleInRecapTotals} onClick={() => update({ includeIdleInRecapTotals: !settings.includeIdleInRecapTotals })} />} />
        <SettingRow icon={<Cpu />} title="Performance history" copy="Record lightweight CPU, memory, uptime, and supported power statistics locally." control={<Toggle label="Performance history" checked={settings.performanceHistoryEnabled} onClick={() => update({ performanceHistoryEnabled: !settings.performanceHistoryEnabled })} />} />
        <SettingRow icon={<TimerReset />} title="Performance interval" copy="A slower interval reduces collection and database work." control={<select aria-label="Performance interval" disabled={!settings.performanceHistoryEnabled} value={settings.performanceSampleIntervalSeconds} onChange={(event) => update({ performanceSampleIntervalSeconds: Number(event.target.value) })}>
          <option value={5}>5 sec</option><option value={10}>10 sec</option><option value={15}>15 sec</option><option value={30}>30 sec</option><option value={60}>60 sec</option>
        </select>} />
        {diagnostics?.os === 'Windows' && <details className="ignored-apps"><summary>Ignored Windows activity</summary><p>Short-lived system surfaces stay out of recaps. Turn one on if you want it counted.</p>{DEFAULT_IGNORED_APPLICATIONS.map((item) => {
          const included = settings.includedExecutables.includes(item.executable);
          return <label key={item.executable}><span><b>{item.label}</b><small>{item.executable}</small></span><input type="checkbox" checked={included} onChange={() => update({ includedExecutables: included ? settings.includedExecutables.filter((value) => value !== item.executable) : [...settings.includedExecutables, item.executable] })} /></label>;
        })}</details>}
      </article>
      <article className="settings-group"><header><Info /><div><h2>Desktop behavior</h2><p>How PC Recap starts and stays available.</p></div></header>
        <SettingRow icon={<Power />} title="Launch PC Recap at login" copy="Start in the background when you sign in. Existing users remain opted out." control={<Toggle label="Launch PC Recap at login" checked={settings.launchAtStartup} onClick={() => update({ launchAtStartup: !settings.launchAtStartup })} />} />
        <SettingRow icon={<ArchiveRestore />} title="Close to system tray" copy="Keep tracking when the main window closes." control={<Toggle label="Close to system tray" checked={settings.minimizeToTray} onClick={() => update({ minimizeToTray: !settings.minimizeToTray })} />} />
      </article>
    </div><div>
      <article className="settings-group diagnostics-card"><header><Activity /><div><h2>Tracking health</h2><p>Capability and collector status only. No activity history is copied.</p></div></header>
        {diagnostics ? <dl className="diagnostics-grid">
          <div><dt>Version</dt><dd>{diagnostics.version}</dd></div>
          <div><dt>System</dt><dd>{diagnostics.os} · {diagnostics.architecture}</dd></div>
          <div><dt>Collector</dt><dd>{diagnostics.activityCollector}</dd></div>
          <div><dt>Collector available</dt><dd>{diagnostics.collectorAvailable ? 'Yes' : 'No'}</dd></div>
          <div><dt>Session</dt><dd>{diagnostics.sessionType ?? 'Unavailable'}</dd></div>
          <div><dt>Tracking</dt><dd>{diagnostics.trackingState}</dd></div>
          <div><dt>Performance</dt><dd>{diagnostics.performanceHistoryEnabled ? 'Enabled' : 'Disabled'}</dd></div>
          <div><dt>Idle threshold</dt><dd>{Math.round(diagnostics.idleThresholdSeconds / 60)} min</dd></div>
          <div><dt>Launch at login</dt><dd>{diagnostics.startupEnabled ? 'Enabled' : 'Disabled'}</dd></div>
          <div><dt>Tray</dt><dd>{diagnostics.trayAvailable ? 'Available' : 'Unavailable'}</dd></div>
          <div><dt>Window-title access</dt><dd>{diagnostics.windowTitleCapability}</dd></div>
          <div><dt>Last activity sample</dt><dd title={diagnostics.latestActivitySample}>{diagnostics.latestActivitySample ? new Date(diagnostics.latestActivitySample).toLocaleString() : 'Unavailable'}</dd></div>
          <div><dt>Last performance sample</dt><dd title={diagnostics.latestPerformanceSample}>{diagnostics.latestPerformanceSample ? new Date(diagnostics.latestPerformanceSample).toLocaleString() : 'Unavailable'}</dd></div>
        </dl> : <p className="diagnostics-loading">Reading collector status…</p>}
        <button className="copy-diagnostics" onClick={copyDiagnostics}><ClipboardCopy /> Copy diagnostics</button>
      </article>
      <article className="settings-group backup-card"><header><DatabaseBackup /><div><h2>Portable history</h2><p>Carry decades of memories to your next computer.</p></div></header><div className="backup-actions"><button onClick={() => backup('export')}><Download /> <span><b>Export archive</b><small>Portable .pcr backup</small></span></button><button onClick={() => backup('import')}><Upload /> <span><b>Import archive</b><small>Merges without duplicate sessions</small></span></button></div></article>
      <button className="history-recovery-link" onClick={() => onNavigate('history-recovery')}><History /><span><b>Recover older history</b><small>Tracker exports and local computer clues</small></span></button>
      <article className="danger-zone"><Trash2 /><div><h2>Erase all history</h2><p>Settings stay. Sessions, performance history, recovery data, and migration backups are removed.</p></div><button onClick={confirmDelete}>Erase</button></article>
    </div></section>
  </motion.div>;
}
