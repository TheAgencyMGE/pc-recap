import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PeriodKind, PeriodSummary } from '../../shared/types';
import { AppIconProvider } from '../components/AppIcon';
import { createTestApi } from '../test-utils/create-test-api';
import { CollectionHome } from './CollectionHome';

describe('CollectionHome', () => {
  it('turns navigation into concise cover shelves', async () => {
    const api = createTestApi();
    const year = new Date().getFullYear();
    const kinds: PeriodKind[] = ['today', 'week', 'month', 'year', 'all-time', 'decade'];
    const summaries = Object.fromEntries(await Promise.all(kinds.map(async (kind) => [kind, await api.getSummary(kind, kind === 'year' ? year : undefined)]))) as Record<PeriodKind, PeriodSummary>;
    const [dashboard, apps, onThisDay] = await Promise.all([api.getDashboard(), api.listApps(), api.getOnThisDay()]);
    const onNavigate = vi.fn();

    render(<AppIconProvider api={api}><CollectionHome
      summaries={summaries}
      timeline={dashboard.timeline}
      achievements={dashboard.achievements}
      apps={apps}
      onThisDay={onThisDay}
      status={dashboard.trackingStatus}
      trackingEnabled
      onNavigate={onNavigate}
      onToggleTracking={() => undefined}
    /></AppIconProvider>);

    expect(screen.getByRole('heading', { name: 'Your recaps' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'From the archive' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your apps' })).toBeInTheDocument();
    expect(screen.queryByText(/private edition|local archive|side a|side b|tracking visual studio code/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search apps' }), { target: { value: 'Visual Studio' } });
    expect(screen.getByRole('button', { name: /open visual studio code/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open browser/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open this week/i }));
    expect(onNavigate).toHaveBeenCalledWith('week');
  });

  it('omits empty archive and app shelves without inventing covers', async () => {
    const api = createTestApi();
    api.clearHistory();
    const summary = await api.getSummary('today');

    render(<AppIconProvider api={api}><CollectionHome
      summaries={{ today: summary }}
      timeline={[]}
      achievements={[]}
      apps={[]}
      onThisDay={[]}
      status={{ state: 'tracking' }}
      trackingEnabled
      onNavigate={() => undefined}
      onToggleTracking={() => undefined}
    /></AppIconProvider>);

    expect(screen.getByRole('heading', { name: 'Your recaps' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'From the archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your apps' })).not.toBeInTheDocument();
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });
});
