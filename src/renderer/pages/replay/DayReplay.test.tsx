import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DayReplayData } from '../../../shared/types';
import { createTestApi } from '../../test-utils/create-test-api';
import { DayReplay } from './DayReplay';

describe('DayReplay', () => {
  it('shows proportional accessible segments and filters by app', async () => {
    const api = createTestApi();
    const at = (hour: number, minute = 0) => new Date(2026, 7, 15, hour, minute).toISOString();
    const data: DayReplayData = {
      day: '2026-08-15', firstActivity: at(9), lastActivity: at(11),
      busiestHour: 10, appSwitches: 1, totalSeconds: 5_400,
      segments: [
        { id: 'chrome', appId: 'chrome', appName: 'Chrome', categoryId: 'browsing', startedAt: at(9), endedAt: at(9, 30), durationSeconds: 1_800, color: '#5AB7FF' },
        { id: 'code', appId: 'code', appName: 'Visual Studio Code', categoryId: 'coding', startedAt: at(10), endedAt: at(11), durationSeconds: 3_600, color: '#8D87FF' },
      ],
      idleGaps: [{ startedAt: at(9, 30), endedAt: at(10), durationSeconds: 1_800 }],
      longestSegment: undefined, relationships: [], recoveredClues: [], pins: [],
    };
    api.getDayReplay = async () => data;

    render(<DayReplay api={api} day="2026-08-15" />);

    expect(await screen.findByRole('button', { name: /Chrome, 9:00 AM to 9:30 AM/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /Visual Studio Code, 10:00 AM to 11:00 AM/i })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Filter to Chrome' }));
    expect(screen.queryByRole('button', { name: /Visual Studio Code, 10:00 AM to 11:00 AM/i })).not.toBeInTheDocument();
  });
});
