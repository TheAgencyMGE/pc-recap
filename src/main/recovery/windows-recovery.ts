import type { RecoveredEventInput } from '../../shared/types.js';
import { readWindowsActivityHistoryEvents } from './activity-history.js';
import { readInstalledAppEvents } from './installed-apps.js';
import { readPrefetchEvents } from './prefetch.js';
import { readUserAssistEvents } from './user-assist.js';

export interface RecoveryReader {
  id: string;
  label: string;
  read(): Promise<RecoveredEventInput[]>;
}

export interface RecoveryScanResult {
  events: RecoveredEventInput[];
  sources: Array<{ id: string; label: string; available: boolean; eventCount: number; limitation?: string }>;
  warnings: string[];
}

const defaultReaders = (): RecoveryReader[] => [
  { id: 'installed-apps', label: 'Installed apps', read: readInstalledAppEvents },
  { id: 'userassist', label: 'Windows UserAssist', read: readUserAssistEvents },
  { id: 'prefetch', label: 'Windows Prefetch', read: readPrefetchEvents },
  { id: 'activity-history', label: 'Windows Activity History', read: readWindowsActivityHistoryEvents },
];

export async function scanWindowsHistory(options: { platform?: NodeJS.Platform; readers?: RecoveryReader[] } = {}): Promise<RecoveryScanResult> {
  if ((options.platform ?? process.platform) !== 'win32') {
    return { events: [], sources: [], warnings: ['Pre-install history recovery is currently only available on Windows.'] };
  }
  const readers = options.readers ?? defaultReaders();
  const settled = await Promise.all(readers.map(async (reader) => {
    try {
      const events = await reader.read();
      return { reader, events, error: undefined };
    } catch (error) {
      return { reader, events: [] as RecoveredEventInput[], error: error instanceof Error ? error.message : 'Unavailable' };
    }
  }));
  const events = deduplicate(settled.flatMap((result) => result.events));
  return {
    events,
    sources: settled.map(({ reader, events: sourceEvents, error }) => ({
      id: reader.id,
      label: reader.label,
      available: !error,
      eventCount: sourceEvents.length,
      limitation: error,
    })),
    warnings: settled.flatMap(({ reader, error }) => error ? [`${reader.label}: ${error}`] : []),
  };
}

function deduplicate(events: RecoveredEventInput[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.sourceKind}\u0000${event.eventType}\u0000${event.appName.toLowerCase()}\u0000${event.occurredAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
