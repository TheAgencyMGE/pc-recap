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
});
