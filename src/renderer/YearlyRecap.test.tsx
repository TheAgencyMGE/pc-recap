import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestApi } from './test-utils/create-test-api';
import { YearlyRecap } from './pages/YearlyRecap';
import { AppIconProvider } from './components/AppIcon';

describe('YearlyRecap', () => {
  it('moves through cinematic scenes with the keyboard', async () => {
    const api = createTestApi();
    const year = new Date().getFullYear();
    const [summary, timeline] = await Promise.all([api.getSummary('year', year), api.getTimeline('month', String(year))]);
    render(<AppIconProvider api={api}><YearlyRecap api={api} summary={summary} timeline={timeline} onClose={() => undefined} /></AppIconProvider>);

    expect(screen.getByRole('heading', { name: new RegExp(`your ${year} so far`, 'i') })).toBeInTheDocument();
    expect(screen.queryByText(/private playback|annual edition|pcw|wrapped/i)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { name: /hours, recorded/i })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByRole('heading', { name: new RegExp(`your ${year} so far`, 'i') })).toBeInTheDocument();
  });
});
