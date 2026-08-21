import type { TrackingDiagnostics, TrackingSettings, TrackingStatus } from '../shared/types.js';
import type { PlatformActivityCapabilities } from './platform/types.js';

interface DiagnosticsDependencies {
  getVersion: () => string;
  platform: NodeJS.Platform;
  architecture: string;
  activityCapabilities: PlatformActivityCapabilities;
  getTrackingStatus: () => TrackingStatus;
  getSettings: () => TrackingSettings;
  getLatestActivitySample: () => string | undefined;
  getLatestPerformanceSample: () => string | undefined;
  isTrayAvailable: () => boolean;
}

const OS_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

export class DiagnosticsService {
  constructor(private readonly dependencies: DiagnosticsDependencies) {}

  get(): TrackingDiagnostics {
    const settings = this.dependencies.getSettings();
    const capabilities = this.dependencies.activityCapabilities;
    return {
      version: this.dependencies.getVersion(),
      os: OS_NAMES[this.dependencies.platform] ?? this.dependencies.platform,
      architecture: this.dependencies.architecture,
      activityCollector: capabilities.collector,
      collectorAvailable: capabilities.available,
      sessionType: capabilities.sessionType,
      windowTitleCapability: settings.captureWindowTitles ? capabilities.windowTitles : 'disabled',
      trackingState: this.dependencies.getTrackingStatus().state,
      latestActivitySample: validTimestamp(this.dependencies.getLatestActivitySample()),
      latestPerformanceSample: validTimestamp(this.dependencies.getLatestPerformanceSample()),
      idleThresholdSeconds: settings.idleThresholdSeconds,
      startupEnabled: settings.launchAtStartup,
      trayAvailable: this.dependencies.isTrayAvailable(),
      performanceHistoryEnabled: settings.performanceHistoryEnabled,
    };
  }

  format(): string {
    const value = this.get();
    return [
      `PC Recap ${value.version}`,
      `OS: ${value.os} (${value.architecture})`,
      `Collector: ${value.activityCollector}`,
      `Collector available: ${yesNo(value.collectorAvailable)}`,
      value.sessionType ? `Session type: ${value.sessionType}` : undefined,
      `Tracking state: ${value.trackingState}`,
      `Latest activity sample: ${value.latestActivitySample ?? 'Unavailable'}`,
      `Latest performance sample: ${value.latestPerformanceSample ?? 'Unavailable'}`,
      `Idle threshold: ${value.idleThresholdSeconds} seconds`,
      `Launch at login: ${yesNo(value.startupEnabled)}`,
      `Tray available: ${yesNo(value.trayAvailable)}`,
      `Performance history: ${value.performanceHistoryEnabled ? 'Enabled' : 'Disabled'}`,
      `Window titles: ${value.windowTitleCapability}`,
    ].filter(Boolean).join('\n');
  }
}

function validTimestamp(value: string | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No';
}
