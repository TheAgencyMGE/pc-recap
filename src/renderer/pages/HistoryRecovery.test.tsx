import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTestApi } from '../test-utils/create-test-api';
import { HistoryRecovery } from './HistoryRecovery';

describe('HistoryRecovery', () => {
  it('separates exact sessions from recovered clues before confirmation', async () => {
    const api = createTestApi();
    api.previewHistoryFile = vi.fn().mockResolvedValue({
      id: 'preview-1',
      sourceKind: 'activitywatch',
      sourceLabel: 'ActivityWatch export',
      exactSessions: Array.from({ length: 24 }, (_, index) => ({
        appName: index ? 'Chrome' : 'Visual Studio Code',
        startedAt: `2026-08-01T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
        durationSeconds: 120,
      })),
      recoveredEvents: Array.from({ length: 8 }, (_, index) => ({
        appName: 'Blender', eventType: 'installed' as const, occurredAt: `2026-07-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
        sourceKind: 'windows_installed_apps', confidence: 'medium' as const,
      })),
      warnings: [],
      coverage: { start: '2026-07-01T12:00:00.000Z', end: '2026-08-01T23:02:00.000Z' },
      sources: [],
    });
    api.commitHistoryImport = vi.fn().mockResolvedValue({ importedSessions: 24, duplicates: 0, recoveredEvents: 8, batchId: 'batch-1' });

    render(<HistoryRecovery api={api} onChanged={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Recover older history' })).toBeVisible();
    expect(screen.getByText('Recovered clues do not add usage time.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Choose tracker export' }));
    expect(await screen.findByText('24 exact sessions')).toBeVisible();
    expect(screen.getByText('8 recovered clues')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Import 24 exact sessions' }));
    expect(await screen.findByText('24 sessions added')).toBeVisible();
    expect(api.commitHistoryImport).toHaveBeenCalledWith('preview-1');
  });

  it('keeps browser history disabled until explicit consent', () => {
    render(<HistoryRecovery api={createTestApi()} onChanged={() => undefined} />);
    expect(screen.getByRole('checkbox', { name: /include browser history clues/i })).not.toBeChecked();
  });
});
