import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTestApi } from '../test-utils/create-test-api';
import { Timeline } from './Timeline';

describe('Timeline', () => {
  it('drills from year to month to a playable day', async () => {
    const api = createTestApi();
    const onNavigate = vi.fn();
    const now = new Date();
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(now);
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(now);
    render(<Timeline api={api} onNavigate={onNavigate} />);

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`${now.getFullYear()}.*Visual Studio Code`) }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`${month}.*Visual Studio Code`) }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`${day}.*Visual Studio Code`) }));

    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(onNavigate).toHaveBeenCalledWith(`day:${dayKey}`);
  });
});
