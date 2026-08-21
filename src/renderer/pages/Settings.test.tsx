import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTestApi } from '../test-utils/create-test-api';
import { Settings } from './Settings';

describe('Settings', () => {
  it('explains idle totals, independent performance history, local storage, and tracking health', async () => {
    const api = createTestApi();
    render(<Settings
      api={api}
      settings={await api.getSettings()}
      onChanged={vi.fn()}
      onNavigate={vi.fn()}
    />);

    expect(screen.getByText('Idle threshold')).toBeInTheDocument();
    expect(screen.getByText('Include idle time in recap totals')).toBeInTheDocument();
    expect(screen.getByText('Performance history')).toBeInTheDocument();
    expect(screen.getByText('Performance interval')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Performance interval' })).toHaveValue('10');
    expect(screen.getByText('Stored locally')).toBeInTheDocument();
    expect(screen.getByText('No screenshots')).toBeInTheDocument();
    expect(screen.getByText('No keystrokes')).toBeInTheDocument();
    expect(screen.getByText('No browsing history')).toBeInTheDocument();
    expect(screen.getByText('No account required')).toBeInTheDocument();
    expect(screen.getByText('No activity telemetry')).toBeInTheDocument();
    expect(await screen.findByText('Tracking health')).toBeInTheDocument();
    expect(await screen.findByText('Collector available')).toBeInTheDocument();
    expect(screen.getByText('Launch at login')).toBeInTheDocument();
    expect(screen.getByText('Window-title access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy diagnostics' })).toBeInTheDocument();
  });
});
