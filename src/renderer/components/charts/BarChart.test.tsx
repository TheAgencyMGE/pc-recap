import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart } from './BarChart';

describe('BarChart', () => {
  it('shows friendly values on keyboard focus and leaves zero activity flat', () => {
    render(<BarChart data={[
      { label: '13', seconds: 0 },
      { label: '14', seconds: 3_600 },
    ]} scale="hour" />);

    const zero = screen.getByRole('button', { name: '1 PM, 0 minutes' });
    expect(zero).toHaveStyle({ height: '0%' });
    fireEvent.focus(zero);
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 PM');
    expect(screen.getByRole('tooltip')).toHaveTextContent('0 minutes');
  });

  it('provides a readable peak and average summary', () => {
    render(<BarChart data={[
      { label: '2026-08-14', seconds: 1_800 },
      { label: '2026-08-15', seconds: 3_600 },
    ]} scale="day" />);

    expect(screen.getByText(/Peak: Sat, Aug 15 at 1 hour/i)).toBeVisible();
    expect(screen.getByText(/Average: 45 minutes/i)).toBeVisible();
  });
});
