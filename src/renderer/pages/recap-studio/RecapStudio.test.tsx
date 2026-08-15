import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTestApi } from '../../test-utils/create-test-api';
import { RecapStudio } from './RecapStudio';

describe('RecapStudio', () => {
  it('plays a real historical year and exposes custom ranges', async () => {
    const api = createTestApi();
    const currentYear = new Date().getFullYear();
    api.getTimeline = async (level) => level === 'year' ? [
      { key: String(currentYear - 12), label: String(currentYear - 12), seconds: 1_800, topApp: 'Minecraft', categoryId: 'gaming', intensity: .25 },
      { key: String(currentYear - 1), label: String(currentYear - 1), seconds: 3_600, topApp: 'Code', categoryId: 'coding', intensity: .5 },
      { key: String(currentYear), label: String(currentYear), seconds: 7_200, topApp: 'Chrome', categoryId: 'browsing', intensity: 1 },
    ] : [];
    const onPlay = vi.fn();
    render(<RecapStudio api={api} onPlay={onPlay} />);

    fireEvent.click(screen.getByRole('button', { name: /This week/i }));
    await waitFor(() => expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ selection: expect.objectContaining({ kind: 'week' }) })));

    fireEvent.click(await screen.findByRole('button', { name: `Play ${currentYear - 1} recap` }));
    await waitFor(() => expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ selection: expect.objectContaining({ label: String(currentYear - 1), complete: true }) })));
    const historicalDecade = Math.floor((currentYear - 12) / 10) * 10;
    fireEvent.click(screen.getByRole('button', { name: `Play ${historicalDecade}–${historicalDecade + 9} recap` }));
    await waitFor(() => expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ selection: expect.objectContaining({ kind: 'decade', complete: true }) })));
    expect(screen.getByRole('combobox', { name: 'Season year' })).toHaveValue(String(currentYear));
    expect(screen.getByLabelText('Custom start')).toBeVisible();
    expect(screen.getByLabelText('Custom end')).toBeVisible();
  });
});
