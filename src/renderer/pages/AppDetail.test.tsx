import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { AppDetail as AppDetailData } from '../../shared/types';
import { AppDetail } from './AppDetail';

const detail: AppDetailData = {
  app: {
    id: 'obsidian',
    name: 'Obsidian',
    executable: 'Obsidian.exe',
    categoryId: 'work',
    color: '#62D8C3',
    firstSeenAt: '2025-01-01T00:00:00.000Z',
    lastSeenAt: '2025-01-02T00:00:00.000Z',
    isExcluded: false,
  },
  totalSeconds: 3_600,
  sessionCount: 2,
  activeDays: 2,
  longestSessionSeconds: 1_800,
  favoriteHour: 20,
  timeline: [],
  companions: [],
  records: [],
};

describe('AppDetail privacy control', () => {
  it('reflects the saved exclusion state after the user excludes an app', async () => {
    function Harness() {
      const [excluded, setExcluded] = useState(false);
      return <AppDetail
        detail={{ ...detail, app: { ...detail.app, isExcluded: excluded } }}
        onSetExcluded={async (next) => setExcluded(next)}
      />;
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /exclude obsidian/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /include obsidian/i })).toBeInTheDocument());
    expect(screen.getByText('Excluded from tracking')).toBeInTheDocument();
  });
});
