import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { createTestApi } from './test-utils/create-test-api';

describe('PC Wrapped renderer', () => {
  it('opens on the cover shelf without dashboard chrome', async () => {
    const api = createTestApi();
    render(<App api={api} />);

    expect(await screen.findByRole('heading', { name: 'Your recaps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pause tracking/i })).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/private edition|local archive|side a|side b|tracking visual studio code/i)).not.toBeInTheDocument();
  });

  it('opens a cover as an interior route and returns home', async () => {
    const api = createTestApi();
    render(<App api={api} />);
    await screen.findByRole('heading', { name: 'From the archive' });

    fireEvent.click(screen.getByRole('button', { name: /open timeline/i }));

    expect(await screen.findByRole('heading', { name: /^timeline$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back home/i }));
    expect(await screen.findByRole('heading', { name: 'Your recaps' })).toBeInTheDocument();
  });

  it('shows an honest empty archive instead of invented statistics', async () => {
    const api = createTestApi();
    api.clearHistory();
    render(<App api={api} />);

    expect(await screen.findByRole('heading', { name: 'Your recaps' })).toBeInTheDocument();
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'From the archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your apps' })).not.toBeInTheDocument();
    expect(screen.queryByText(/today, so far/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hours|sessions|top app/i)).not.toBeInTheDocument();
  });
});
