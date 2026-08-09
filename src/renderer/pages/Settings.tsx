import { ArchiveRestore, DatabaseBackup, Download, EyeOff, Info, Power, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';
import type { TrackingSettings } from '../../shared/types';

function SettingRow({ icon, title, copy, control }: { icon: React.ReactNode; title: string; copy: string; control: React.ReactNode }) {
  return <div className="setting-row"><span className="setting-row__icon">{icon}</span><span><b>{title}</b><small>{copy}</small></span>{control}</div>;
}

export function Settings({ api, settings, onChanged }: { api: PCRecapAPI; settings: TrackingSettings; onChanged: () => void }) {
  const [message, setMessage] = useState('');
  const update = async (patch: Partial<TrackingSettings>) => { await api.updateSettings(patch); onChanged(); };
  const backup = async (kind: 'export' | 'import') => {
    const result = kind === 'export' ? await api.exportBackup() : await api.importBackup();
    setMessage(result.canceled ? '' : result.ok ? kind === 'export' ? 'Archive exported.' : `${result.importedSessions ?? 0} memories imported.` : result.error ?? 'That did not work.');
    if (result.ok) onChanged();
  };
  const confirmDelete = async () => { if (window.confirm('Delete every tracked memory? This cannot be undone unless you exported a backup.')) { await api.deleteAllHistory(); setMessage('Your archive is now empty.'); onChanged(); } };
  return <motion.div className="page settings-page" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
    <div className="simple-page-heading"><h1>Settings</h1></div>
    {message && <div className="toast-note">{message}</div>}
    <section className="settings-columns"><div>
      <article className="settings-group"><header><ShieldCheck /><div><h2>Tracking & privacy</h2><p>Foreground apps only. Never keystrokes or screen contents.</p></div></header>
        <SettingRow icon={<Power />} title="Background tracking" copy="Remember the foreground app while PC Recap is closed." control={<button className={`switch ${settings.trackingEnabled ? 'is-on' : ''}`} onClick={() => update({ trackingEnabled: !settings.trackingEnabled })}><i /></button>} />
        <SettingRow icon={<EyeOff />} title="Window titles" copy="Off by default. App names are enough for every recap." control={<button className={`switch ${settings.captureWindowTitles ? 'is-on' : ''}`} onClick={() => update({ captureWindowTitles: !settings.captureWindowTitles })}><i /></button>} />
      </article>
      <article className="settings-group"><header><Info /><div><h2>Desktop behavior</h2><p>How PC Recap lives alongside everything else.</p></div></header>
        <SettingRow icon={<Power />} title="Launch at sign-in" copy="Start remembering when Windows starts." control={<button className={`switch ${settings.launchAtStartup ? 'is-on' : ''}`} onClick={() => update({ launchAtStartup: !settings.launchAtStartup })}><i /></button>} />
        <SettingRow icon={<ArchiveRestore />} title="Close to system tray" copy="Keep tracking quietly when the window closes." control={<button className={`switch ${settings.minimizeToTray ? 'is-on' : ''}`} onClick={() => update({ minimizeToTray: !settings.minimizeToTray })}><i /></button>} />
      </article>
    </div><div>
      <article className="settings-group backup-card"><header><DatabaseBackup /><div><h2>Portable history</h2><p>Carry decades of memories to your next computer.</p></div></header><div className="backup-actions"><button onClick={() => backup('export')}><Download /> <span><b>Export archive</b><small>Encrypted-device-friendly .pcr file</small></span></button><button onClick={() => backup('import')}><Upload /> <span><b>Import archive</b><small>Merges without duplicate sessions</small></span></button></div></article>
      <article className="danger-zone"><Trash2 /><div><h2>Erase all history</h2><p>Settings stay. Every app session and record goes.</p></div><button onClick={confirmDelete}>Erase</button></article>
    </div></section>
  </motion.div>;
}
