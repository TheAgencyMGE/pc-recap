import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, nativeImage, powerMonitor, Tray } from 'electron';
import { APP_ID, PRODUCT_NAME } from '../shared/brand.js';
import { DEFAULT_SETTINGS } from '../shared/types.js';
import { createPlatformActivitySource } from './activity-source.js';
import { AppIconService } from './app-icon-service.js';
import { AnalyticsService } from './analytics-service.js';
import { BackupService } from './backup.js';
import { ActivityRepository } from './database.js';
import { prepareActivityDatabase, removeLegacyActivityDatabases, removeMigrationSafetyCopy } from './data-migration.js';
import { registerIpcHandlers } from './ipc.js';
import { HistoryRecoveryService } from './history-recovery-service.js';
import { HistoryImportService } from './importers/import-service.js';
import { isTrustedNavigation, resolveRendererTarget } from './renderer-security.js';
import { ActivityTracker } from './tracker.js';
import { DiagnosticsService } from './diagnostics-service.js';
import { PerformanceTracker } from './performance/performance-tracker.js';
import { createPlatformPowerReader } from './performance/power-source.js';
import { createNodeMetricProvider, SystemPerformanceSampler } from './performance/system-sampler.js';
import { configureLaunchAtStartup } from './startup.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
app.setName(PRODUCT_NAME);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let repository: ActivityRepository | null = null;
let tracker: ActivityTracker | null = null;
let performanceTracker: PerformanceTracker | null = null;
const startHidden = process.argv.includes('--hidden');

const rendererTarget = resolveRendererTarget({
  isPackaged: app.isPackaged,
  developmentUrl: process.env.VITE_DEV_SERVER_URL,
  rendererFile: join(currentDirectory, '../renderer/index.html'),
});

const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#F4F0E6"/><rect x="7" y="7" width="50" height="50" fill="#FA4B3D" stroke="#181818" stroke-width="5"/><text x="32" y="41" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="900" fill="#181818">PC</text></svg>`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: PRODUCT_NAME,
    backgroundColor: '#F4F0E6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => { if (!startHidden) mainWindow?.show(); });
  mainWindow.on('close', (event) => {
    if (!isQuitting && repository?.getSettings().minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
    if (!isTrustedNavigation(url, rendererTarget)) event.preventDefault();
  };
  mainWindow.webContents.on('will-navigate', preventUntrustedNavigation);
  mainWindow.webContents.on('will-redirect', preventUntrustedNavigation);
  if (rendererTarget.kind === 'url') void mainWindow.loadURL(rendererTarget.location);
  else void mainWindow.loadFile(rendererTarget.location);
}

function createTray() {
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(traySvg).toString('base64')}`).resize({ width: 20, height: 20 });
  tray = new Tray(image);
  tray.setToolTip(PRODUCT_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Open ${PRODUCT_NAME}`, click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Pause tracking', click: () => { void tracker?.pause(); } },
    { label: 'Resume tracking', click: () => { void tracker?.resume(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);
  const databasePath = await prepareActivityDatabase(app.getPath('userData'), app.getPath('appData'));
  repository = new ActivityRepository(databasePath);
  const activitySource = createPlatformActivitySource({
    captureWindowTitles: () => repository?.getSettings().captureWindowTitles ?? false,
  });
  tracker = new ActivityTracker(repository, activitySource.source, {
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    machineId: hostname(),
    onStatus: (status) => mainWindow?.webContents.send('tracking:changed', status),
  });
  performanceTracker = new PerformanceTracker(
    repository,
    new SystemPerformanceSampler(createNodeMetricProvider(createPlatformPowerReader())),
    {
      machineId: hostname(),
      getForegroundSession: () => {
        const session = tracker?.getLiveSession();
        return session ? { appId: session.appId, appName: session.appName } : undefined;
      },
    },
  );
  const setLaunchAtStartup = async (enabled: boolean) => {
    await configureLaunchAtStartup({
      platform: process.platform,
      enabled,
      isPackaged: app.isPackaged,
      executablePath: process.execPath,
      setNativeLoginItemSettings: (settings) => app.setLoginItemSettings(settings),
    });
  };
  try {
    await setLaunchAtStartup(repository.getSettings().launchAtStartup);
  } catch {
    repository.updateSettings({ launchAtStartup: false });
  }
  const analytics = new AnalyticsService(
    repository,
    () => tracker?.getStatus() ?? { state: 'unavailable' },
    () => new Date(),
    () => tracker?.getLiveSession(),
  );
  const icons = new AppIconService(repository, {
    getFileIcon: (path) => app.getFileIcon(path, { size: 'normal' }),
  });
  const history = new HistoryRecoveryService(new HistoryImportService(repository));
  const diagnostics = new DiagnosticsService({
    getVersion: () => app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    activityCapabilities: activitySource.capabilities,
    getTrackingStatus: () => tracker?.getStatus() ?? { state: 'unavailable' },
    getSettings: () => repository?.getSettings() ?? { ...DEFAULT_SETTINGS },
    getLatestActivitySample: () => tracker?.getLatestSuccessfulSampleAt(),
    getLatestPerformanceSample: () => performanceTracker?.getLatestSuccessfulSampleAt(),
    isTrayAvailable: () => Boolean(tray),
  });
  registerIpcHandlers({
    repository,
    analytics,
    tracker,
    backup: new BackupService(repository),
    history,
    diagnostics,
    setLaunchAtStartup,
    getVersion: () => app.getVersion(),
    eraseHistory: async () => {
      const resumeTracking = repository?.getSettings().trackingEnabled ?? false;
      await tracker?.suspendForErase();
      await performanceTracker?.suspendForErase();
      history.clearPreviews();
      try {
        await removeMigrationSafetyCopy(databasePath);
        await removeLegacyActivityDatabases(app.getPath('userData'), app.getPath('appData'));
        repository?.deleteAllHistory();
      } finally {
        if (resumeTracking) await tracker?.resumeAfterErase();
        await performanceTracker?.resumeAfterErase();
      }
    },
    icons,
    getMainWindow: () => mainWindow,
    trustedRendererUrl: rendererTarget.trustedUrl,
  });
  createWindow();
  createTray();
  powerMonitor.on('lock-screen', () => tracker?.handleLock());
  powerMonitor.on('unlock-screen', () => {
    tracker?.handleUnlock();
    void tracker?.sample();
  });
  powerMonitor.on('suspend', () => tracker?.handleSuspend());
  powerMonitor.on('resume', () => {
    tracker?.handleResume();
    void tracker?.sample();
  });
  tracker.start();
  performanceTracker.start();
  app.on('activate', () => { if (!mainWindow) createWindow(); else mainWindow.show(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !repository?.getSettings().minimizeToTray) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  tracker?.stop();
  performanceTracker?.stop();
  repository?.close();
  repository = null;
});
