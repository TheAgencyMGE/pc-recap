import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchOverlay } from './SearchOverlay';

describe('SearchOverlay', () => {
  it('searches apps and destinations with an honest empty result', () => {
    const onNavigate = vi.fn();
    const { rerender } = render(<SearchOverlay
      open
      apps={[{ id: 'code', name: 'Visual Studio Code', executable: 'Code.exe', categoryId: 'coding', color: '#8D87FF', firstSeenAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-01-01T01:00:00.000Z' }]}
      onClose={() => undefined}
      onNavigate={onNavigate}
    />);

    expect(screen.getByRole('dialog', { name: 'Search PC Recap' })).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search PC Recap' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No results for “zzz”')).toBeVisible();

    rerender(<SearchOverlay open apps={[]} onClose={() => undefined} onNavigate={onNavigate} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search PC Recap' }), { target: { value: 'timeline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Timeline' }));
    expect(onNavigate).toHaveBeenCalledWith('timeline');
  });
});
