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

  it('renders a segment that reaches the next local midnight', async () => {
    const api = createTestApi();
    const start = new Date(2026, 7, 15, 23, 50);
    const end = new Date(2026, 7, 16, 0, 0);
    api.getDayReplay = async () => ({
      day: '2026-08-15', firstActivity: start.toISOString(), lastActivity: end.toISOString(),
      appSwitches: 0, totalSeconds: 600,
      segments: [{ id: 'late', appId: 'discord', appName: 'Discord', categoryId: 'social', startedAt: start.toISOString(), endedAt: end.toISOString(), durationSeconds: 600, color: '#ff746a' }],
      idleGaps: [], relationships: [], recoveredClues: [], pins: [],
    });
    render(<DayReplay api={api} day="2026-08-15" />);
    expect(await screen.findByRole('button', { name: /Discord, 11:50 PM to 12:00 AM/i })).toBeVisible();
  });

  it('labels active and idle time clearly and reveals optional performance history', async () => {
    const api = createTestApi();
    const at = (hour: number, minute = 0) => new Date(2026, 7, 15, hour, minute).toISOString();
    api.getDayReplay = async () => ({
      day: '2026-08-15', firstActivity: at(9), lastActivity: at(10),
      appSwitches: 0, totalSeconds: 2_700,
      segments: [{ id: 'code', appId: 'visual-studio-code', appName: 'Visual Studio Code', categoryId: 'coding', startedAt: at(9), endedAt: at(9, 45), durationSeconds: 2_700, color: '#8D87FF' }],
      idleGaps: [{ startedAt: at(9, 45), endedAt: at(10), durationSeconds: 900 }],
      activityStates: [{ id: 'idle-1', machineId: 'machine-1', source: 'os-idle', state: 'idle', startedAt: at(9, 45), endedAt: at(10), durationSeconds: 900 }],
      performanceSamples: [
        { id: 'perf-1', sampledAt: at(9), cpuPercent: 12, memoryPercent: 48 },
        { id: 'perf-2', sampledAt: at(9, 30), cpuPercent: 84, memoryPercent: 62 },
      ],
      relationships: [], recoveredClues: [], pins: [],
    });

    render(<DayReplay api={api} day="2026-08-15" />);

    expect(await screen.findByText('Active app time')).toBeVisible();
    expect(screen.getByText('45 minutes')).toBeVisible();
    expect(screen.getByText('Longest idle')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'System performance during this day' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show performance' }));
    expect(screen.getByRole('region', { name: 'System performance during this day' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide performance' })).toBeVisible();
  });
});
