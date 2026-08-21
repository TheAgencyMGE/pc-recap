// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DiagnosticsService } from './diagnostics-service';

describe('DiagnosticsService', () => {
  it('reports tracking capabilities without leaking activity or machine-identifying data', () => {
    const diagnostics = new DiagnosticsService({
      getVersion: () => '1.2.0',
      platform: 'linux',
      architecture: 'x64',
      activityCapabilities: {
        platform: 'linux', collector: 'linux-x11', available: true, sessionType: 'x11', windowTitles: 'available',
      },
      getTrackingStatus: () => ({
        state: 'tracking',
        activeApp: 'Secret Browser',
        reason: 'C:\\Users\\riley\\private.txt',
      }),
      getSettings: () => ({
        trackingEnabled: true,
        launchAtStartup: true,
        minimizeToTray: true,
        captureWindowTitles: false,
        sampleIntervalSeconds: 10,
        idleThresholdSeconds: 300,
        includeIdleInRecapTotals: false,
        performanceHistoryEnabled: true,
        performanceSampleIntervalSeconds: 10,
        excludedExecutables: ['secret-browser'],
        includedExecutables: [],
        onboardingComplete: true,
      }),
      getLatestActivitySample: () => '2026-08-20T12:00:00.000Z',
      getLatestPerformanceSample: () => undefined,
      isTrayAvailable: () => true,
    });

    expect(diagnostics.get()).toMatchObject({
      version: '1.2.0',
      os: 'Linux',
      architecture: 'x64',
      activityCollector: 'linux-x11',
      sessionType: 'x11',
      trackingState: 'tracking',
      latestActivitySample: '2026-08-20T12:00:00.000Z',
      latestPerformanceSample: undefined,
      startupEnabled: true,
      trayAvailable: true,
      performanceHistoryEnabled: true,
    });
    const copy = diagnostics.format();
    expect(copy).toContain('PC Recap 1.2.0');
    expect(copy).toContain('Collector: linux-x11');
    expect(copy).not.toContain('Secret Browser');
    expect(copy).not.toContain('riley');
    expect(copy).not.toContain('private.txt');
    expect(copy).not.toContain('secret-browser');
  });
});
