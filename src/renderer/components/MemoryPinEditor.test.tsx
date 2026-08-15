import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTestApi } from '../test-utils/create-test-api';
import { MemoryPinEditor } from './MemoryPinEditor';

describe('MemoryPinEditor', () => {
  it('saves a concise local memory with recap inclusion off by default', async () => {
    const api = createTestApi();
    api.saveMemoryPin = vi.fn(async (pin) => pin);
    const onSaved = vi.fn();
    render(<MemoryPinEditor api={api} start="2026-09-23T00:00:00.000Z" end="2026-09-24T00:00:00.000Z" onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Memory title'), { target: { value: 'Started college' } });
    fireEvent.change(screen.getByLabelText('Memory note'), { target: { value: 'First day at UW' } });
    expect(screen.getByRole('checkbox', { name: /include in recap stories/i })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));

    await waitFor(() => expect(api.saveMemoryPin).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Started college', note: 'First day at UW', includeInRecaps: false,
    })));
    expect(onSaved).toHaveBeenCalled();
  });
});
