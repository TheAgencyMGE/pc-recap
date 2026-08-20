import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppIconProvider } from '../components/AppIcon';
import { createTestApi } from '../test-utils/create-test-api';
import { Dashboard } from './Dashboard';

describe('Visual Mixtape Today', () => {
  it('presents real activity as a cover, tracklist, and labeled hourly tape', async () => {
    const api = createTestApi();
    const dashboard = await api.getDashboard('today');

    render(<AppIconProvider api={api}>
      <Dashboard summary={dashboard.summary} timeline={dashboard.timeline} onNavigate={() => undefined} />
    </AppIconProvider>);

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Activity by hour' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Apps' })).toHaveTextContent('Visual Studio Code');
    expect(screen.queryByText(/pc today|side a|private|archive index|yearly story/i)).not.toBeInTheDocument();
  });

  it('explains idle and supported performance metrics without pretending missing metrics are zero', async () => {
    const api = createTestApi();
    const dashboard = await api.getDashboard('today');
    dashboard.summary.activity = {
      activeSeconds: 5_400, passiveSeconds: 0, idleSeconds: 900, lockedSeconds: 300,
      suspendedSeconds: 28_800, unavailableSeconds: 0, untrackedSeconds: 0,
      observedSeconds: 6_300, awayPercentage: 14, recapTotalSeconds: 5_400, includesIdleInRecapTotal: false,
    };
    dashboard.summary.performance = {
      sampleCount: 90, cpuSampleCount: 90, cpuAverage: 22.4, cpuPeak: 87, cpuPeakAt: '2026-08-15T20:42:00.000Z',
      memorySampleCount: 90, memoryPercentAverage: 58, memoryPercentPeak: 74,
      highLoadSeconds: 180, highestLoadContext: {
        appId: 'code', appName: 'Visual Studio Code', sampleCount: 45, cpuAverage: 51, cpuPeak: 87,
        memoryPercentAverage: 65, memoryPercentPeak: 74, highLoadSeconds: 180, wording: 'system-load-while-foreground',
      },
    };

    render(<AppIconProvider api={api}>
      <Dashboard summary={dashboard.summary} timeline={dashboard.timeline} onNavigate={() => undefined} />
    </AppIconProvider>);

    expect(screen.getByRole('heading', { name: 'Computer liner notes' })).toBeInTheDocument();
    expect(screen.getByText('Active app time')).toBeInTheDocument();
    expect(screen.getByText('Idle or locked')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.getByText((_, element) => Boolean(element?.classList.contains('system-liner-notes__context') && /Visual Studio Code was foreground/i.test(element.textContent ?? '')))).toBeInTheDocument();
    expect(screen.queryByText(/GPU 0%/i)).not.toBeInTheDocument();
  });
});
