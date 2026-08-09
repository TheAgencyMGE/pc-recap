import type { ActivityRepository } from './database.js';

export interface FileIconReader {
  getFileIcon(path: string): Promise<{
    isEmpty(): boolean;
    toDataURL(): string;
  }>;
}

export class AppIconService {
  private readonly cache = new Map<string, string | null>();

  constructor(
    private readonly repository: ActivityRepository,
    private readonly reader: FileIconReader,
  ) {}

  async getDataUrl(appId: string): Promise<string | null> {
    if (!appId || appId.length > 200) return null;
    const trackedApp = this.repository.listApps().find((item) => item.id === appId);
    if (!trackedApp) return null;

    const cacheKey = `${trackedApp.id}:${trackedApp.path ?? ''}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) ?? null;
    if (!trackedApp.path) {
      this.cache.set(cacheKey, null);
      return null;
    }

    try {
      const icon = await this.reader.getFileIcon(trackedApp.path);
      const dataUrl = icon.isEmpty() ? null : icon.toDataURL();
      const safeDataUrl = dataUrl?.startsWith('data:image/png;base64,') ? dataUrl : null;
      this.cache.set(cacheKey, safeDataUrl);
      return safeDataUrl;
    } catch {
      this.cache.set(cacheKey, null);
      return null;
    }
  }
}
