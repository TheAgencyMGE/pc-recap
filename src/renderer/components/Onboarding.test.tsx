import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Onboarding } from './Onboarding';

describe('Onboarding', () => {
  it('starts with real tracking and never offers synthetic history', () => {
    render(<Onboarding onComplete={() => undefined} />);

    expect(screen.queryByText(/demo archive/i)).not.toBeInTheDocument();
    expect(screen.getByText('Active app')).toBeInTheDocument();
    expect(screen.getByText('Stored here')).toBeInTheDocument();
    expect(screen.getByText('Pause anytime')).toBeInTheDocument();
    expect(screen.queryByText(/no telemetry|your archive starts empty|everything you see|private/i)).not.toBeInTheDocument();
  });
});
