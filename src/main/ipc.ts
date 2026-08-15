import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { app, dialog, ipcMain } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { BACKUP_EXTENSION, LEGACY_BACKUP_EXTENSIONS, PRODUCT_NAME } from '../shared/brand.js';
import type { Category, PeriodKind, TrackingSettings } from '../shared/types.js';
import type { AnalyticsService } from './analytics-service.js';
import type { BackupService } from './backup.js';
import type { ActivityRepository } from './database.js';
import type { AppIconService } from './app-icon-service.js';
import type { HistoryRecoveryService } from './history-recovery-service.js';
import type { ActivityTracker } from './tracker.js';

interface IpcDependencies {
  repository: ActivityRepository;
  analytics: AnalyticsService;
  tracker: ActivityTracker;
  backup: BackupService;
  icons: AppIconService;
  history: HistoryRecoveryService;
  getMainWindow: () => BrowserWindow | null;
  trustedRendererUrl: string;
}

const PERIODS = new Set<PeriodKind>(['today', 'week', 'month', 'year', 'all-time', 'decade']);
const validatePeriod = (value: unknown): PeriodKind => PERIODS.has(value as PeriodKind) ? value as PeriodKind : 'today';
const safeYear = (value: unknown) => typeof value === 'number' && value >= 1970 && value <= 9999 ? Math.floor(value) : undefined;
const cleanName = (value: string) => basename(value).replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 80) || 'PC-Recap.png';

export function registerIpcHandlers({
  repository, analytics, tracker, backup, icons, history, getMainWindow, trustedRendererUrl,
}: IpcDependencies) {
  const handle = (channel: string, listener: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event, getMainWindow(), trustedRendererUrl);
      return listener(...args);
    });
  };

  handle('dashboard:get', (kind, year) => analytics.getDashboard(validatePeriod(kind), safeYear(year)));
  handle('summary:get', (kind, year) => analytics.getSummary(validatePeriod(kind), safeYear(year)));
  handle('timeline:get', (level, anchor) => {
    const safeLevel = level === 'year' || level === 'day' ? level : 'month';
    return repository.getTimeline(safeLevel, typeof anchor === 'string' ? anchor.slice(0, 10) : undefined);
  });
  handle('apps:list', () => repository.listApps());
  handle('app:detail', (appId) => analytics.getAppDetail(String(appId).slice(0, 200)));
  handle('app:icon', (appId) => icons.getDataUrl(String(appId).slice(0, 200)));
  handle('achievements:get', () => analytics.getAchievements());
  handle('on-this-day:get', () => analytics.getOnThisDay());
  handle('settings:get', () => repository.getSettings());
  handle('settings:update', (patch: Partial<TrackingSettings>) => {
    const allowed: Partial<TrackingSettings> = {};
    const keys: Array<keyof TrackingSettings> = [
      'trackingEnabled', 'launchAtStartup', 'minimizeToTray', 'captureWindowTitles',
      'sampleIntervalSeconds', 'idleThresholdSeconds', 'excludedExecutables',
      'onboardingComplete',
    ];
    for (const key of keys) if (Object.hasOwn(patch ?? {}, key)) (allowed as Record<string, unknown>)[key] = patch[key];
    const settings = repository.updateSettings(allowed);
    app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup });
    return settings;
  });
  handle('categories:get', () => repository.getCategories());
  handle('category:save', (category: Category) => {
    if (!category?.id || !category.name || !/^#[0-9a-f]{6}$/i.test(category.color)) throw new Error('Category details are invalid.');
    return repository.upsertCategory({ ...category, id: category.id.slice(0, 50), name: category.name.slice(0, 40) });
  });
  handle('category:update', (category: Category) => {
    if (!category?.id || !category.name?.trim() || !/^#[0-9a-f]{6}$/i.test(category.color)) throw new Error('Category details are invalid.');
    return repository.updateCategory({ ...category, id: category.id.slice(0, 50), name: category.name.trim().slice(0, 40) });
  });
  handle('category:delete', (categoryId, reassignToCategoryId) => repository.deleteCategory(
    String(categoryId).slice(0, 50), String(reassignToCategoryId).slice(0, 50),
  ));
  handle('app:set-category', (appId, categoryId) => repository.setAppCategory(String(appId), String(categoryId)));
  handle('app:set-excluded', (appId, excluded) => repository.setAppExcluded(String(appId), Boolean(excluded)));
  handle('tracking:status', () => tracker.getStatus());
  handle('tracking:set', (enabled) => {
    if (enabled) tracker.resume(); else tracker.pause();
    return tracker.getStatus();
  });
  handle('backup:export', async () => {
    const selected = await dialog.showSaveDialog({
      title: `Export your ${PRODUCT_NAME} archive`,
      defaultPath: `PC-Recap-${new Date().toISOString().slice(0, 10)}.${BACKUP_EXTENSION}`,
      filters: [{ name: `${PRODUCT_NAME} archive`, extensions: [BACKUP_EXTENSION] }],
    });
    if (selected.canceled || !selected.filePath) return { ok: false, canceled: true };
    await writeFile(selected.filePath, backup.exportBuffer());
    return { ok: true, path: selected.filePath };
  });
  handle('backup:import', async () => {
    const selected = await dialog.showOpenDialog({
      title: `Import a ${PRODUCT_NAME} archive`,
      properties: ['openFile'],
      filters: [{ name: `${PRODUCT_NAME} archive`, extensions: [BACKUP_EXTENSION, ...LEGACY_BACKUP_EXTENSIONS] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return { ok: false, canceled: true };
    try {
      const result = await backup.importFile(selected.filePaths[0]);
      return { ok: true, path: selected.filePaths[0], importedSessions: result.importedSessions };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Import failed.' };
    }
  });
  handle('history:preview-file', async () => {
    const selected = await dialog.showOpenDialog({
      title: 'Choose a tracker history export',
      properties: ['openFile'],
      filters: [
        { name: 'Supported history exports', extensions: ['json', 'csv', 'tsv', 'txt', 'db', 'sqlite', 'sqlite3'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return history.previewFile(selected.filePaths[0]);
  });
  handle('history:scan-windows', (includeBrowserHistory) => history.scanWindows(Boolean(includeBrowserHistory)));
  handle('history:commit-import', (previewId) => history.commit(String(previewId).slice(0, 100)));
  handle('history:cancel-preview', (previewId) => history.cancel(String(previewId).slice(0, 100)));
  handle('share:save', async (dataUrl: string, suggestedName: string) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 15_000_000) {
      return { ok: false, error: 'The share card is invalid.' };
    }
    const selected = await dialog.showSaveDialog({
      title: 'Save your Recap card',
      defaultPath: cleanName(suggestedName),
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (selected.canceled || !selected.filePath) return { ok: false, canceled: true };
    await writeFile(selected.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
    return { ok: true, path: selected.filePath };
  });
  handle('history:delete-all', () => repository.deleteAllHistory());
  handle('app:version', () => app.getVersion());
}

function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow | null, trustedRendererUrl: string) {
  if (
    !window
    || event.sender !== window.webContents
    || event.senderFrame !== window.webContents.mainFrame
    || event.senderFrame.url !== trustedRendererUrl
  ) {
    throw new Error('Unauthorized IPC sender.');
  }
}
