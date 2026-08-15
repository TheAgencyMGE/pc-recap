import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { HistoryPreviewView } from '../shared/types.js';
import { ActivityWatchImporter } from './importers/activitywatch.js';
import type { HistoryImportService } from './importers/import-service.js';
import { ManicTimeImporter } from './importers/manictime.js';
import { RescueTimeImporter } from './importers/rescuetime.js';
import type { HistoryImporter, ImportPreview } from './importers/types.js';
import { WakaTimeImporter } from './importers/wakatime.js';
import { scanWindowsHistory } from './recovery/windows-recovery.js';

interface StoredPreview { preview: ImportPreview; createdAt: number; sources?: HistoryPreviewView['sources'] }

export class HistoryRecoveryService {
  private readonly previews = new Map<string, StoredPreview>();
  private readonly importers: HistoryImporter[];
  private generation = 0;

  constructor(private readonly importer: HistoryImportService, importers?: HistoryImporter[]) {
    this.importers = importers ?? [new ActivityWatchImporter(), new ManicTimeImporter(), new RescueTimeImporter(), new WakaTimeImporter()];
  }

  async previewFile(path: string): Promise<HistoryPreviewView> {
    const generation = this.generation;
    const candidates: HistoryImporter[] = [];
    for (const importer of this.importers) if (await importer.canRead(path)) candidates.push(importer);
    const results: ImportPreview[] = [];
    for (const importer of candidates) {
      try {
        const preview = await importer.preview(path);
        if (preview.exactSessions.length || preview.recoveredEvents.length) results.push(preview);
      } catch {
        // A different adapter may match this extension.
      }
    }
    if (!results.length) throw new Error('No supported history records were found in that file.');
    const name = basename(path).toLowerCase();
    const selected = results.sort((a, b) => score(b, name) - score(a, name))[0];
    return this.store(selected, [], generation);
  }

  async scanWindows(includeBrowserHistory = false): Promise<HistoryPreviewView> {
    const generation = this.generation;
    const result = await scanWindowsHistory({ includeBrowserHistory });
    const serialized = JSON.stringify(result.events);
    const preview: ImportPreview = {
      sourceKind: 'windows_recovery',
      sourceFingerprint: `sha256:${createHash('sha256').update(serialized).digest('hex')}`,
      sourceLabel: 'This PC',
      exactSessions: [],
      recoveredEvents: result.events,
      warnings: result.warnings,
      coverage: eventCoverage(result.events),
    };
    return this.store(preview, result.sources, generation);
  }

  async commit(id: string) {
    const stored = this.previews.get(id);
    if (!stored) throw new Error('This history preview expired. Scan or choose the file again.');
    if (stored.createdAt < Date.now() - 15 * 60 * 1_000) {
      this.previews.delete(id);
      throw new Error('This history preview expired. Scan or choose the file again.');
    }
    const result = await this.importer.commit(stored.preview);
    this.previews.delete(id);
    return result;
  }

  cancel(id: string) {
    this.previews.delete(id);
  }

  clearPreviews() {
    this.generation += 1;
    this.previews.clear();
  }

  private store(preview: ImportPreview, sources: HistoryPreviewView['sources'] = [], generation = this.generation) {
    if (generation !== this.generation) throw new Error('This history preview was cleared. Scan or choose the file again.');
    this.prune();
    const id = randomUUID();
    this.previews.set(id, { preview, createdAt: Date.now(), sources });
    return toView(id, preview, sources);
  }

  private prune() {
    const cutoff = Date.now() - 15 * 60 * 1_000;
    for (const [id, stored] of this.previews) if (stored.createdAt < cutoff) this.previews.delete(id);
    while (this.previews.size >= 5) this.previews.delete(this.previews.keys().next().value as string);
  }
}

function score(preview: ImportPreview, fileName: string) {
  const nameBonus = fileName.includes(preview.sourceKind) ? 10_000 : 0;
  return nameBonus + preview.exactSessions.length * 10 + preview.recoveredEvents.length;
}

function toView(id: string, preview: ImportPreview, sources: HistoryPreviewView['sources']): HistoryPreviewView {
  return {
    id,
    sourceKind: preview.sourceKind,
    sourceLabel: preview.sourceLabel,
    exactSessions: preview.exactSessions.slice(0, 100).map(({ appName, startedAt, durationSeconds }) => ({ appName, startedAt, durationSeconds })),
    exactSessionCount: preview.exactSessions.length,
    recoveredEvents: preview.recoveredEvents.slice(0, 100),
    recoveredEventCount: preview.recoveredEvents.length,
    warnings: preview.warnings,
    coverage: preview.coverage,
    sources,
  };
}

function eventCoverage(events: ImportPreview['recoveredEvents']) {
  if (!events.length) return undefined;
  const timestamps = events.map((event) => event.occurredAt).sort();
  return { start: timestamps[0], end: timestamps[timestamps.length - 1] };
}
