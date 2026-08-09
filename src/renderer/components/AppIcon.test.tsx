import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PCWrappedAPI } from '../../shared/ipc';
import { createTestApi } from '../test-utils/create-test-api';
import { AppIcon, AppIconProvider } from './AppIcon';

function apiWithIcon(result: string | null): PCWrappedAPI {
  return { ...createTestApi(), getAppIcon: async () => result };
}

describe('AppIcon', () => {
  it('shows the real local icon returned by the privileged API', async () => {
    render(<AppIconProvider api={apiWithIcon('data:image/png;base64,AAAA')}>
      <AppIcon appId="code" name="Visual Studio Code" color="#355CFF" />
    </AppIconProvider>);

    expect(await screen.findByRole('img', { name: 'Visual Studio Code icon' })).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('uses a truthful monogram when Windows has no icon', async () => {
    render(<AppIconProvider api={apiWithIcon(null)}>
      <AppIcon appId="code" name="Visual Studio Code" color="#355CFF" />
    </AppIconProvider>);

    await waitFor(() => expect(screen.getByLabelText('Visual Studio Code icon')).toHaveTextContent('VS'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
