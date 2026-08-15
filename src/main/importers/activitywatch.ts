import { extname } from 'node:path';
import { normalizeApplication } from '../tracking/app-identity.js';
import { coverageFor, fingerprintBuffer, readBoundedFile } from './file-utils.js';
import type { HistoryImporter, ImportPreview, ImportedExactSession } from './types.js';

interface ActivityWatchEvent {
  id?: string | number;
  timestamp?: string;
  duration?: number;
  data?: { app?: string; title?: string };
}

interface ActivityWatchBucket {
  type?: string;
  events?: ActivityWatchEvent[];
}

export class ActivityWatchImporter implements HistoryImporter {
  readonly kind = 'activitywatch';

  async canRead(path: string) {
    return extname(path).toLowerCase() === '.json';
  }

  async preview(path: string): Promise<ImportPreview> {
    const buffer = await readBoundedFile(path);
    const parsed = JSON.parse(buffer.toString('utf8')) as { buckets?: Record<string, ActivityWatchBucket> } | Record<string, ActivityWatchBucket>;
    const buckets = 'buckets' in parsed && parsed.buckets ? parsed.buckets : parsed as Record<string, ActivityWatchBucket>;
    const exactSessions: ImportedExactSession[] = [];
    for (const [bucketId, bucket] of Object.entries(buckets)) {
      if (!isWindowBucket(bucketId, bucket) || !Array.isArray(bucket.events)) continue;
      if (bucket.events.length > 1_000_000) throw new Error('ActivityWatch export contains too many events.');
      const events = bucket.events as ActivityWatchEvent[];
      events.forEach((event, index) => {
        const started = event.timestamp ? Date.parse(event.timestamp) : Number.NaN;
        const duration = Number(event.duration);
        const executable = event.data?.app?.trim() ?? '';
        if (!Number.isFinite(started) || !Number.isFinite(duration) || duration <= 0 || !executable) return;
        const normalized = normalizeApplication({ name: executable.replace(/\.exe$/i, ''), executable, title: event.data?.title });
        exactSessions.push({
          sourceKind: 'activitywatch',
          sourceRecordId: `${bucketId}:${event.id ?? index}`,
          appName: normalized.canonicalName,
          executable,
          startedAt: new Date(started).toISOString(),
          endedAt: new Date(started + duration * 1_000).toISOString(),
          durationSeconds: duration,
          windowTitle: event.data?.title,
        });
      });
    }
    return {
      sourceKind: this.kind,
      sourceFingerprint: fingerprintBuffer(buffer),
      sourceLabel: 'ActivityWatch export',
      exactSessions,
      recoveredEvents: [],
      warnings: exactSessions.length ? [] : ['No current-window events were found in this ActivityWatch export.'],
      coverage: coverageFor(exactSessions),
    };
  }
}

function isWindowBucket(id: string, bucket: ActivityWatchBucket) {
  return bucket.type?.toLowerCase() === 'currentwindow' || id.toLowerCase().includes('watcher-window');
}
