import type {
  Achievement,
  AppDetail,
  BackupResult,
  Category,
  DashboardData,
  DayReplayData,
  HistoryImportResult,
  HistoryPreviewView,
  MemoryPin,
  OnThisDayEntry,
  PeriodKind,
  PeriodSummary,
  RecapSelection,
  RecapStoryData,
  TimelineBucket,
  TrackedApp,
  TrackingSettings,
  TrackingDiagnostics,
  TrackingStatus,
} from './types.js';

export interface PCRecapAPI {
  getDashboard(kind?: PeriodKind, year?: number): Promise<DashboardData>;
  getSummary(kind: PeriodKind, year?: number): Promise<PeriodSummary>;
  getTimeline(level: 'year' | 'month' | 'day', anchor?: string): Promise<TimelineBucket[]>;
  getDayReplay(day: string): Promise<DayReplayData>;
  getRecap(selection: RecapSelection): Promise<RecapStoryData>;
  getAppDetail(appId: string): Promise<AppDetail | null>;
  getAppIcon(appId: string): Promise<string | null>;
  listApps(): Promise<TrackedApp[]>;
  getAchievements(): Promise<Achievement[]>;
  getOnThisDay(): Promise<OnThisDayEntry[]>;
  getSettings(): Promise<TrackingSettings>;
  updateSettings(patch: Partial<TrackingSettings>): Promise<TrackingSettings>;
  getCategories(): Promise<Category[]>;
  saveCategory(category: Category): Promise<Category>;
  updateCategory(category: Category): Promise<Category>;
  deleteCategory(categoryId: string, reassignToCategoryId: string): Promise<void>;
  setAppCategory(appId: string, categoryId: string): Promise<void>;
  setAppExcluded(appId: string, excluded: boolean): Promise<void>;
  getTrackingStatus(): Promise<TrackingStatus>;
  getTrackingDiagnostics(): Promise<TrackingDiagnostics>;
  copyTrackingDiagnostics(): Promise<void>;
  setTrackingEnabled(enabled: boolean): Promise<TrackingStatus>;
  onTrackingStatus(callback: (status: TrackingStatus) => void): () => void;
  exportBackup(): Promise<BackupResult>;
  importBackup(): Promise<BackupResult>;
  previewHistoryFile(): Promise<HistoryPreviewView | null>;
  scanWindowsHistory(): Promise<HistoryPreviewView>;
  commitHistoryImport(previewId: string): Promise<HistoryImportResult>;
  cancelHistoryPreview(previewId: string): Promise<void>;
  listMemoryPins(start?: string, end?: string): Promise<MemoryPin[]>;
  saveMemoryPin(pin: MemoryPin): Promise<MemoryPin>;
  deleteMemoryPin(id: string): Promise<void>;
  saveShareCard(dataUrl: string, suggestedName: string): Promise<BackupResult>;
  deleteAllHistory(): Promise<void>;
  getVersion(): Promise<string>;
}

declare global {
  interface Window {
    pcRecap?: PCRecapAPI;
  }
}
