const { contextBridge } = require('electron');

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const yearStart = new Date(year, 0, 1).toISOString();
const todayStart = new Date(year, now.getMonth(), now.getDate()).toISOString();
const hour = (value) => new Date(year, now.getMonth(), now.getDate(), value).toISOString();
const apps = [
  { id: 'code', name: 'Visual Studio Code', executable: 'Code.exe', categoryId: 'coding', color: '#8D87FF', firstSeenAt: yearStart, lastSeenAt: hour(11) },
  { id: 'chrome', name: 'Chrome', executable: 'chrome.exe', categoryId: 'browsing', color: '#5AB7FF', firstSeenAt: yearStart, lastSeenAt: hour(10) },
  { id: 'discord', name: 'Discord', executable: 'Discord.exe', categoryId: 'social', color: '#FF746A', firstSeenAt: yearStart, lastSeenAt: hour(9) },
];
const sessions = [
  { id: 'code-session', appId: 'code', appName: 'Visual Studio Code', categoryId: 'coding', startedAt: hour(9), endedAt: hour(11), durationSeconds: 7200, color: '#8D87FF' },
  { id: 'chrome-session', appId: 'chrome', appName: 'Chrome', categoryId: 'browsing', startedAt: hour(8), endedAt: hour(9), durationSeconds: 3600, color: '#5AB7FF' },
];

function summary(kind = 'today', label = kind === 'year' ? String(year) : kind === 'month' ? now.toLocaleString('en-US', { month: 'long', year: 'numeric' }) : kind === 'week' ? 'This week' : kind === 'all-time' ? 'Your complete archive' : kind === 'decade' ? `${Math.floor(year / 10) * 10}s` : 'Today') {
  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  return {
    kind, label, rangeStart: kind === 'year' ? yearStart : todayStart, rangeEnd: now.toISOString(), isComplete: false,
    comparisonLabel: 'Previous period', totalSeconds, previousTotalSeconds: 7200, changePercent: 50,
    firstActivity: hour(8), lastActivity: hour(11), longestSession: sessions[0],
    topApps: [
      { appId: 'code', name: 'Visual Studio Code', categoryId: 'coding', seconds: 7200, sessions: 1, share: 66.7, color: '#8D87FF' },
      { appId: 'chrome', name: 'Chrome', categoryId: 'browsing', seconds: 3600, sessions: 1, share: 33.3, color: '#5AB7FF' },
    ],
    categories: [
      { categoryId: 'coding', name: 'Coding', seconds: 7200, share: 66.7, color: '#8D87FF' },
      { categoryId: 'browsing', name: 'Browsing', seconds: 3600, share: 33.3, color: '#5AB7FF' },
    ],
    hourly: Array.from({ length: 24 }, (_, value) => ({ label: String(value), seconds: value >= 8 && value < 11 ? 3600 : 0 })),
    hourlyApps: { 8: 'Chrome', 9: 'Visual Studio Code', 10: 'Visual Studio Code' },
    daily: [{ label: `${year}-${month}-${day}`, seconds: totalSeconds }],
    appPairs: [{ appA: 'Chrome', appB: 'Visual Studio Code', score: 2, daysTogether: 1 }],
    relationships: [{ appA: 'Chrome', appB: 'Visual Studio Code', transitions: 2, distinctDays: 1, medianGapSeconds: 20, direction: 'a-to-b', score: 2 }],
    routines: [], baselines: { activeDays: 1, averageDailySeconds: totalSeconds, medianDailySeconds: totalSeconds, busiestWeekday: now.getDay(), typicalFirstHour: 8, typicalLastHour: 11, nightSeconds: 0 },
    lifecycle: [], eras: [], observations: [{ id: 'real-fixture', eyebrow: 'HANDOFF', text: 'Chrome handed the day to Visual Studio Code.', detail: 'Based on two isolated smoke-test sessions.', accent: '#4256F4', priority: 1 }],
    records: [], sessionCount: sessions.length, activeDays: 1,
  };
}

const timeline = (level) => level === 'year'
  ? [{ key: String(year), label: String(year), seconds: 10800, topApp: 'Visual Studio Code', categoryId: 'coding', intensity: 1 }]
  : level === 'month'
    ? [{ key: `${year}-${month}`, label: `${year}-${month}`, seconds: 10800, topApp: 'Visual Studio Code', categoryId: 'coding', intensity: 1 }]
    : [{ key: `${year}-${month}-${day}`, label: `${year}-${month}-${day}`, seconds: 10800, topApp: 'Visual Studio Code', categoryId: 'coding', intensity: 1 }];

const api = {
  getDashboard: async (kind = 'today') => ({ summary: summary(kind), timeline: timeline('month'), achievements: [], trackingStatus: { state: 'tracking', activeApp: 'Visual Studio Code', since: hour(9) } }),
  getSummary: async (kind) => summary(kind),
  getTimeline: async (level) => timeline(level),
  getDayReplay: async () => ({ day: `${year}-${month}-${day}`, firstActivity: hour(8), lastActivity: hour(11), busiestHour: 9, appSwitches: 1, totalSeconds: 10800, longestSegment: sessions[0], segments: sessions, idleGaps: [], relationships: [], recoveredClues: [], pins: [] }),
  getRecap: async (selection) => ({ selection, summary: summary('year', selection.label), timeline: timeline('month'), recoveredClues: [], pins: [] }),
  getAppDetail: async () => null,
  getAppIcon: async () => null,
  listApps: async () => apps,
  getAchievements: async () => [],
  getOnThisDay: async () => [],
  getSettings: async () => ({ trackingEnabled: true, launchAtStartup: false, minimizeToTray: true, captureWindowTitles: false, sampleIntervalSeconds: 10, idleThresholdSeconds: 300, excludedExecutables: [], onboardingComplete: true }),
  updateSettings: async (patch) => ({ trackingEnabled: true, launchAtStartup: false, minimizeToTray: true, captureWindowTitles: false, sampleIntervalSeconds: 10, idleThresholdSeconds: 300, excludedExecutables: [], onboardingComplete: true, ...patch }),
  getCategories: async () => [{ id: 'coding', name: 'Coding', color: '#8D87FF', icon: 'code-2', isDefault: true }, { id: 'browsing', name: 'Browsing', color: '#5AB7FF', icon: 'globe-2', isDefault: true }],
  saveCategory: async (category) => category, updateCategory: async (category) => category, deleteCategory: async () => {}, setAppCategory: async () => {}, setAppExcluded: async () => {},
  getTrackingStatus: async () => ({ state: 'tracking' }), setTrackingEnabled: async (enabled) => ({ state: enabled ? 'tracking' : 'paused' }), onTrackingStatus: () => () => {},
  exportBackup: async () => ({ ok: true }), importBackup: async () => ({ ok: true, importedSessions: 0 }),
  previewHistoryFile: async () => null, scanWindowsHistory: async () => ({ id: 'preview', sourceKind: 'windows_recovery', sourceLabel: 'This PC', exactSessions: [], exactSessionCount: 0, recoveredEvents: [], recoveredEventCount: 0, warnings: [], sources: [] }),
  commitHistoryImport: async () => ({ importedSessions: 0, duplicates: 0, recoveredEvents: 0 }), cancelHistoryPreview: async () => {},
  listMemoryPins: async () => [], saveMemoryPin: async (pin) => pin, deleteMemoryPin: async () => {},
  saveShareCard: async () => ({ ok: true }), deleteAllHistory: async () => {}, getVersion: async () => '1.1.0',
};

contextBridge.exposeInMainWorld('pcRecap', api);
