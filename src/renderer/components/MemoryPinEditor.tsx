import { BookmarkPlus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';
import type { MemoryPin } from '../../shared/types';

export function MemoryPinEditor({ api, start, end, pin, onSaved, onCancel }: {
  api: PCRecapAPI;
  start: string;
  end: string;
  pin?: MemoryPin;
  onSaved: (pin?: MemoryPin) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(pin?.title ?? '');
  const [note, setNote] = useState(pin?.note ?? '');
  const [color, setColor] = useState(pin?.color ?? '#4256f4');
  const [includeInRecaps, setIncludeInRecaps] = useState(pin?.includeInRecaps ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!title.trim()) { setError('Give this memory a title.'); return; }
    setBusy(true);
    setError('');
    const now = new Date().toISOString();
    try {
      const saved = await api.saveMemoryPin({
        id: pin?.id ?? newPinId(),
        title: title.trim(), note: note.trim(), start, end, color, includeInRecaps,
        createdAt: pin?.createdAt ?? now, updatedAt: now,
      });
      onSaved(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this memory.');
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!pin) return;
    setBusy(true);
    try { await api.deleteMemoryPin(pin.id); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this memory.'); }
    finally { setBusy(false); }
  };
  return <section className="memory-pin-editor" aria-label="Memory Pin editor">
    <header><BookmarkPlus /><h2>{pin ? 'Edit memory' : 'Add a memory'}</h2>{onCancel && <button aria-label="Close Memory Pin editor" onClick={onCancel}><X /></button>}</header>
    <label>Title<input aria-label="Memory title" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Started college" /></label>
    <label>Note<textarea aria-label="Memory note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What made this stretch matter?" /></label>
    <div className="memory-pin-editor__options"><label>Color<input aria-label="Memory color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label className="memory-pin-editor__include"><input type="checkbox" checked={includeInRecaps} onChange={(event) => setIncludeInRecaps(event.target.checked)} /><span><b>Include in recap stories</b><small>Off by default. Included pins may also appear on share cards.</small></span></label></div>
    {error && <p>{error}</p>}
    <footer>{pin && <button className="memory-pin-delete" disabled={busy} onClick={() => { void remove(); }}><Trash2 /> Delete</button>}<button className="primary-button" disabled={busy || !title.trim()} onClick={() => { void save(); }}><Save /> Save memory</button></footer>
  </section>;
}

function newPinId() {
  return globalThis.crypto?.randomUUID ? `pin-${globalThis.crypto.randomUUID()}` : `pin-${Date.now().toString(36)}`;
}
