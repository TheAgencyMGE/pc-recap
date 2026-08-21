import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PerformanceTimeline } from './PerformanceTimeline';

describe('PerformanceTimeline', () => {
  it('reveals exact available values on hover or keyboard focus without inventing missing metrics', () => {
    render(<PerformanceTimeline samples={[
      { sampledAt: '2026-08-20T10:00:00.000Z', cpuPercent: 40, memoryPercent: 55, memoryUsedBytes: 8 * 1024 ** 3, memoryTotalBytes: 16 * 1024 ** 3 },
      { sampledAt: '2026-08-20T10:00:10.000Z', memoryPercent: 60, memoryUsedBytes: 9 * 1024 ** 3, memoryTotalBytes: 16 * 1024 ** 3 },
    ]} />);

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    const point = screen.getByLabelText(/CPU 40%.*memory 55%/i);
    fireEvent.mouseEnter(point);
    expect(screen.getByText('40% CPU')).toBeInTheDocument();
    expect(screen.getByText('8 GB / 16 GB memory')).toBeInTheDocument();
    expect(screen.getByLabelText(/CPU unavailable.*memory 60%/i)).toBeInTheDocument();
  });
});
