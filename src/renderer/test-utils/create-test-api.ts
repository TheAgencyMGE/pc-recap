import type { PCRecapAPI } from '../../shared/ipc';
import { summarizeSessions } from '../../shared/analytics';
import { clipSessionToRange, localDayKey, localMonthKey, localYearKey } from '../../shared/calendar';
import { getPeriodRange } from '../../shared/periods';
import { DEFAULT_SETTINGS } from '../../shared/types';
import type {
  ActivitySession, Category, PeriodKind, TimelineBucket, TrackedApp, TrackingSettings, TrackingStatus,
} from '../../shared/types';

const categories: Category[] = [
  { id: 'coding', name: 'Coding', color: '#8D87FF', icon: 'code-2', isDefault: true },
  { id: 'browsing', name: 'Browsing', color: '#5AB7FF', icon: 'globe-2', isDefault: true },
];

export function createTestApi(overrides: Partial<TrackingSettings> = {}): PCRecapAPI & { clearHistory(): void } {
  const wallClock = new Date();
  // Keep the fixture stable in every time zone and at every CI start time. Its
  // sample sessions occur in the morning, so the reference clock must follow them.
  const now = new Date(wallClock.getFullYear(), wallClock.getMonth(), wallClock.getDate(), 12);
  const codeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9);
  const browserStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 5);
  let sessions: ActivitySession[] = [
    { id: 'test-code', appId: 'code', appName: 'Visual Studio Code', categoryId: 'coding', startedAt: codeStart.toISOString(), endedAt: new Date(codeStart.getTime() + 3_600_000).toISOString(), durationSeconds: 3_600, machineId: 'test-machine' },
    { id: 'test-browser', appId: 'browser', appName: 'Browser', categoryId: 'browsing', startedAt: browserStart.toISOString(), endedAt: new Date(browserStart.getTime() + 1_800_000).toISOString(), durationSeconds: 1_800, machineId: 'test-machine' },
  ];
  const apps: TrackedApp[] = [
    { id: 'code', name: 'Visual Studio Code', executable: 'Code.exe', categoryId: 'coding', color: '#8D87FF', firstSeenAt: sessions[0].startedAt, lastSeenAt: sessions[0].endedAt },
    { id: 'browser', name: 'Browser', executable: 'browser.exe', categoryId: 'browsing', color: '#5AB7FF', firstSeenAt: sessions[1].startedAt, lastSeenAt: sessions[1].endedAt },
  ];
  let settings: TrackingSettings = { ...DEFAULT_SETTINGS, onboardingComplete: true, ...overrides };
  let status: TrackingStatus = { state: 'tracking', activeApp: 'Visual Studio Code', since: sessions[0].startedAt };
  let memoryPins: import('../../shared/types').MemoryPin[] = [];

  const summary = (kind: PeriodKind, year?: number) => {
    const range = getPeriodRange(kind, now, year);
    return summarizeSessions(
      sessions.map((item) => clipSessionToRange(item, range.start, range.end)).filter((item): item is ActivitySession => Boolean(item)),
      [],
      { kind, label: range.label, rangeStart: range.start, rangeEnd: range.end },
    );
  };
  const timeline = (level: 'year' | 'month' | 'day', anchor?: string): TimelineBucket[] => {
    const keyFor = level === 'year' ? localYearKey : level === 'month' ? localMonthKey : localDayKey;
    const relevant = sessions.filter((item) => !anchor || keyFor(item.startedAt).startsWith(anchor));
    if (!relevant.length) return [];
    const key = keyFor(relevant[0].startedAt);
    return [{ key, label: key, seconds: relevant.reduce((sum, item) => sum + item.durationSeconds, 0), topApp: 'Visual Studio Code', categoryId: 'coding', intensity: 1 }];
  };

  return {
    clearHistory: () => { sessions = []; },
    getDashboard: async (kind = 'today', year) => ({ summary: summary(kind, year), timeline: timeline('month', kind === 'year' ? String(year ?? now.getFullYear()) : String(now.getFullYear())), achievements: [], trackingStatus: status }),
    getSummary: async (kind, year) => summary(kind, year),
    getTimeline: async (level, anchor) => timeline(level, anchor),
    getDayReplay: async (day) => {
      const daySessions = sessions.filter((session) => localDayKey(session.startedAt) === day);
      return {
        day,
        firstActivity: daySessions[0]?.startedAt,
        lastActivity: daySessions.at(-1)?.endedAt,
        busiestHour: daySessions[0] ? new Date(daySessions[0].startedAt).getHours() : undefined,
        longestSegment: undefined,
        appSwitches: Math.max(0, daySessions.length - 1),
        totalSeconds: daySessions.reduce((sum, session) => sum + session.durationSeconds, 0),
        segments: daySessions.map((session) => ({ ...session, color: apps.find((app) => app.id === session.appId)?.color ?? '#7D8493' })),
        idleGaps: [], relationships: [], recoveredClues: [], pins: memoryPins.filter((pin) => localDayKey(pin.start) === day),
      };
    },
    getRecap: async (selection) => ({
      selection,
      summary: summarizeSessions(
        sessions.map((session) => clipSessionToRange(session, selection.start, selection.end)).filter((session): session is ActivitySession => Boolean(session)),
        [],
        { kind: selection.kind === 'year' ? 'year' : 'all-time', label: selection.label, rangeStart: selection.start, rangeEnd: selection.end, isComplete: selection.complete },
      ),
      timeline: timeline('month', selection.start.slice(0, 4)),
      recoveredClues: [], pins: memoryPins.filter((pin) => pin.end > selection.start && pin.start < selection.end),
    }),
    getAppDetail: async () => null,
    getAppIcon: async () => null,
    listApps: async () => sessions.length ? apps : [],
    getAchievements: async () => [],
    getOnThisDay: async () => [],
    getSettings: async () => settings,
    updateSettings: async (patch) => (settings = { ...settings, ...patch }),
    getCategories: async () => categories,
    saveCategory: async (category) => category,
    updateCategory: async (category) => category,
    deleteCategory: async () => undefined,
    setAppCategory: async () => undefined,
    setAppExcluded: async () => undefined,
    getTrackingStatus: async () => status,
    setTrackingEnabled: async (enabled) => {
      settings = { ...settings, trackingEnabled: enabled };
      return (status = { state: enabled ? 'tracking' : 'paused' });
    },
    onTrackingStatus: () => () => undefined,
    exportBackup: async () => ({ ok: true, path: 'test.pcr' }),
    importBackup: async () => ({ ok: true, importedSessions: 0 }),
    previewHistoryFile: async () => null,
    scanWindowsHistory: async () => ({
      id: 'test-preview', sourceKind: 'windows_recovery', sourceLabel: 'This PC', exactSessions: [],
      exactSessionCount: 0, recoveredEvents: [], recoveredEventCount: 0, warnings: [], sources: [],
    }),
    commitHistoryImport: async () => ({ importedSessions: 0, duplicates: 0, recoveredEvents: 0 }),
    cancelHistoryPreview: async () => undefined,
    listMemoryPins: async (start, end) => memoryPins.filter((pin) => !start || !end || (pin.end > start && pin.start < end)),
    saveMemoryPin: async (pin) => {
      memoryPins = [...memoryPins.filter((item) => item.id !== pin.id), pin];
      return pin;
    },
    deleteMemoryPin: async (id) => { memoryPins = memoryPins.filter((pin) => pin.id !== id); },
    saveShareCard: async () => ({ ok: true, path: 'test.png' }),
    deleteAllHistory: async () => { sessions = []; },
    getVersion: async () => 'test',
  };
}
