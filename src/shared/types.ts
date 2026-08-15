export type PeriodKind = 'today' | 'week' | 'month' | 'year' | 'all-time' | 'decade';

export type CategoryKey =
  | 'gaming'
  | 'coding'
  | 'browsing'
  | 'social'
  | 'music'
  | 'creative'
  | 'work'
  | 'utility'
  | 'other';

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

export interface TrackedApp {
  id: string;
  name: string;
  executable: string;
  path?: string;
  categoryId: string;
  color: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isExcluded?: boolean;
}

export interface ActivitySession {
  id: string;
  appId: string;
  appName: string;
  categoryId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  windowTitle?: string;
  machineId?: string;
  sourceKind?: SessionSourceKind;
  confidence?: SessionConfidence;
  sourceRecordId?: string;
  importBatchId?: string;
}

export type SessionSourceKind =
  | 'pc_recap'
  | 'pc_recap_backup'
  | 'activitywatch'
  | 'manictime'
  | 'rescuetime'
  | 'wakatime';

export type SessionConfidence = 'recorded' | 'imported_exact';

export interface OpenSessionCheckpoint {
  machineId: string;
  appId: string;
  appName: string;
  executable: string;
  path?: string;
  categoryId: string;
  startedAt: string;
  lastSampleAt: string;
  checkpointedAt: string;
  windowTitle?: string;
}

export interface ApplicationAlias {
  sourceExecutable: string;
  canonicalAppId: string;
  canonicalName: string;
  updatedAt: string;
}

export interface RecoveredEvent {
  id: string;
  appId?: string;
  appName: string;
  eventType: 'installed' | 'launched' | 'recently-used' | 'uninstalled' | 'context';
  occurredAt: string;
  sourceKind: string;
  confidence: 'high' | 'medium' | 'low';
  detail?: string;
  importBatchId?: string;
}

export interface ImportBatch {
  id: string;
  sourceKind: string;
  sourceFingerprint: string;
  importedAt: string;
  exactSessionCount: number;
  recoveredEventCount: number;
}

export interface AppUsage {
  appId: string;
  name: string;
  categoryId: string;
  seconds: number;
  sessions: number;
  share: number;
  color: string;
  changePercent?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

export interface CategoryUsage {
  categoryId: string;
  name: string;
  seconds: number;
  share: number;
  color: string;
}

export interface TimeBucket {
  label: string;
  seconds: number;
}

export interface AppPair {
  appA: string;
  appB: string;
  score: number;
  daysTogether: number;
}

export interface Era {
  id: string;
  title: string;
  subtitle: string;
  start: string;
  end: string;
  appId: string;
  color: string;
}

export interface Observation {
  id: string;
  eyebrow: string;
  text: string;
  detail: string;
  accent: string;
  priority: number;
}

export interface RecordItem {
  id: string;
  label: string;
  value: string;
  detail: string;
  achievedAt: string;
  icon: string;
}

export interface PeriodSummary {
  kind: PeriodKind;
  label: string;
  rangeStart: string;
  rangeEnd: string;
  totalSeconds: number;
  previousTotalSeconds: number;
  changePercent: number;
  firstActivity?: string;
  lastActivity?: string;
  longestSession?: ActivitySession;
  topApps: AppUsage[];
  categories: CategoryUsage[];
  hourly: TimeBucket[];
  hourlyApps?: Record<string, string>;
  daily: TimeBucket[];
  appPairs: AppPair[];
  eras: Era[];
  observations: Observation[];
  records: RecordItem[];
  sessionCount: number;
  activeDays: number;
}

export interface TimelineBucket {
  key: string;
  label: string;
  seconds: number;
  topApp: string;
  categoryId: string;
  intensity: number;
}

export interface AppDetail {
  app: TrackedApp;
  totalSeconds: number;
  sessionCount: number;
  activeDays: number;
  longestSessionSeconds: number;
  favoriteHour: number;
  timeline: TimeBucket[];
  companions: AppPair[];
  records: RecordItem[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  progress: number;
  target: number;
  accent: string;
}

export interface TrackingSettings {
  trackingEnabled: boolean;
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  captureWindowTitles: boolean;
  sampleIntervalSeconds: number;
  idleThresholdSeconds: number;
  excludedExecutables: string[];
  onboardingComplete: boolean;
}

export interface TrackingStatus {
  state: 'tracking' | 'paused' | 'idle' | 'unavailable';
  activeApp?: string;
  since?: string;
  reason?: string;
}

export interface DashboardData {
  summary: PeriodSummary;
  timeline: TimelineBucket[];
  achievements: Achievement[];
  trackingStatus: TrackingStatus;
}

export interface OnThisDayEntry {
  year: number;
  totalSeconds: number;
  topApp: string;
  firstActivity?: string;
  lastActivity?: string;
}

export interface BackupResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  importedSessions?: number;
  error?: string;
}

export const DEFAULT_SETTINGS: TrackingSettings = {
  trackingEnabled: true,
  launchAtStartup: false,
  minimizeToTray: true,
  captureWindowTitles: false,
  sampleIntervalSeconds: 10,
  idleThresholdSeconds: 300,
  excludedExecutables: [],
  onboardingComplete: false,
};
