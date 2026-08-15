export type PeriodKind = 'today' | 'week' | 'month' | 'year' | 'all-time' | 'decade';

export interface PeriodRange {
  label: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  isComplete: boolean;
  comparisonLabel: string;
}

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

export interface LiveActivitySession extends ActivitySession {
  provisional: true;
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
  sessionId: string;
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

export type RecoveredEventInput = Omit<RecoveredEvent, 'id' | 'importBatchId'>;

export interface ImportBatch {
  id: string;
  sourceKind: string;
  sourceFingerprint: string;
  importedAt: string;
  exactSessionCount: number;
  recoveredEventCount: number;
}

export interface HistorySourceStatus {
  id: string;
  label: string;
  available: boolean;
  eventCount: number;
  limitation?: string;
}

export interface HistoryPreviewView {
  id: string;
  sourceKind: string;
  sourceLabel: string;
  exactSessions: Array<Pick<ActivitySession, 'appName' | 'startedAt' | 'durationSeconds'>>;
  exactSessionCount: number;
  recoveredEvents: RecoveredEventInput[];
  recoveredEventCount: number;
  warnings: string[];
  coverage?: { start: string; end: string };
  sources: HistorySourceStatus[];
}

export interface HistoryImportResult {
  importedSessions: number;
  duplicates: number;
  recoveredEvents: number;
  batchId?: string;
}

export interface MemoryPin {
  id: string;
  title: string;
  note: string;
  start: string;
  end: string;
  color: string;
  includeInRecaps: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DayReplaySegment {
  id: string;
  appId: string;
  appName: string;
  categoryId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  color: string;
}

export interface DayReplayGap {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface DayReplayData {
  day: string;
  firstActivity?: string;
  lastActivity?: string;
  busiestHour?: number;
  longestSegment?: DayReplaySegment;
  appSwitches: number;
  totalSeconds: number;
  segments: DayReplaySegment[];
  idleGaps: DayReplayGap[];
  relationships: AppRelationship[];
  recoveredClues: RecoveredEvent[];
  pins: MemoryPin[];
}

export interface RecapSelection {
  kind: 'day' | 'week' | 'month' | 'year' | 'season' | 'decade' | 'custom';
  start: string;
  end: string;
  label: string;
  complete: boolean;
}

export interface RecapStoryData {
  selection: RecapSelection;
  summary: PeriodSummary;
  timeline: TimelineBucket[];
  recoveredClues: RecoveredEvent[];
  pins: MemoryPin[];
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
  previousSeconds?: number;
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
  leadingApp?: string;
  leadingCategory?: string;
}

export interface AppPair {
  appA: string;
  appB: string;
  score: number;
  daysTogether: number;
}

export interface AppRelationship {
  appA: string;
  appB: string;
  transitions: number;
  distinctDays: number;
  medianGapSeconds: number;
  direction: 'a-to-b' | 'b-to-a' | 'balanced';
  score: number;
}

export interface RoutineSequence {
  apps: string[];
  occurrences: number;
  distinctDays: number;
  score: number;
}

export interface BaselineFacts {
  activeDays: number;
  averageDailySeconds: number;
  medianDailySeconds: number;
  busiestWeekday: number;
  typicalFirstHour: number;
  typicalLastHour: number;
  nightSeconds: number;
}

export interface LifecycleMoment {
  kind: 'first-use' | 'comeback' | 'abandoned' | 'brief-fling';
  appId: string;
  appName: string;
  occurredAt: string;
  gapDays?: number;
}

export interface Era {
  id: string;
  title: string;
  subtitle: string;
  start: string;
  end: string;
  appId: string;
  color: string;
  kind?: 'app' | 'category' | 'mixed';
  phase?: { rising?: string; peak: string; fading?: string };
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
  isComplete: boolean;
  comparisonLabel: string;
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
  relationships: AppRelationship[];
  routines: RoutineSequence[];
  baselines: BaselineFacts;
  lifecycle: LifecycleMoment[];
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
  includedExecutables: string[];
  onboardingComplete: boolean;
}

export interface TrackingStatus {
  state: 'tracking' | 'paused' | 'idle' | 'ignored' | 'unavailable';
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
  includedExecutables: [],
  onboardingComplete: false,
};

export const DEFAULT_IGNORED_APPLICATIONS = [
  { executable: 'searchhost.exe', label: 'Windows Search' },
  { executable: 'searchapp.exe', label: 'Windows Search (legacy)' },
  { executable: 'startmenuexperiencehost.exe', label: 'Start menu' },
  { executable: 'shellexperiencehost.exe', label: 'Windows shell' },
  { executable: 'textinputhost.exe', label: 'Windows text input' },
  { executable: 'applicationframehost.exe', label: 'Windows app host' },
  { executable: 'credentialuibroker.exe', label: 'Credential prompt' },
  { executable: 'pickerhost.exe', label: 'Windows picker' },
  { executable: 'lockapp.exe', label: 'Lock screen' },
  { executable: 'dwm.exe', label: 'Desktop compositor' },
  { executable: 'idle.exe', label: 'Idle placeholder' },
  { executable: 'msiexec.exe', label: 'Windows installer' },
] as const;
