// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppIconService } from './app-icon-service';
import { ActivityRepository } from './database';

const repositories: ActivityRepository[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
});

function repositoryWithApp(path?: string) {
  const repository = new ActivityRepository(':memory:');
  repositories.push(repository);
  repository.insertSession({
    id: 'session-1',
    appId: 'code',
    appName: 'Visual Studio Code',
    categoryId: 'coding',
    startedAt: '2026-08-08T16:00:00.000Z',
    endedAt: '2026-08-08T16:05:00.000Z',
    durationSeconds: 300,
  }, { executable: 'Code.exe', path });
  return repository;
}

describe('AppIconService', () => {
  it('extracts a local PNG icon for a known stored application', async () => {
    const getFileIcon = vi.fn(async () => ({
      isEmpty: () => false,
      toDataURL: () => 'data:image/png;base64,AAAA',
    }));
    const service = new AppIconService(repositoryWithApp('C:\\Apps\\Code.exe'), { getFileIcon });

    await expect(service.getDataUrl('code')).resolves.toBe('data:image/png;base64,AAAA');
    expect(getFileIcon).toHaveBeenCalledWith('C:\\Apps\\Code.exe');
  });

  it('does not accept an unknown app id as a filesystem lookup', async () => {
    const getFileIcon = vi.fn();
    const service = new AppIconService(repositoryWithApp('C:\\Apps\\Code.exe'), { getFileIcon });

    await expect(service.getDataUrl('C:\\Windows\\secret.exe')).resolves.toBeNull();
    expect(getFileIcon).not.toHaveBeenCalled();
  });

  it('returns null when the stored app has no executable path', async () => {
    const getFileIcon = vi.fn();
    const service = new AppIconService(repositoryWithApp(), { getFileIcon });

    await expect(service.getDataUrl('code')).resolves.toBeNull();
    expect(getFileIcon).not.toHaveBeenCalled();
  });

  it('caches extraction results by application and path', async () => {
    const getFileIcon = vi.fn(async () => ({
      isEmpty: () => false,
      toDataURL: () => 'data:image/png;base64,AAAA',
    }));
    const service = new AppIconService(repositoryWithApp('C:\\Apps\\Code.exe'), { getFileIcon });

    await service.getDataUrl('code');
    await service.getDataUrl('code');

    expect(getFileIcon).toHaveBeenCalledTimes(1);
  });
});
