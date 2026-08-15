// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivityWatchImporter } from './activitywatch';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('ActivityWatchImporter', () => {
  it('imports current-window events as exact sessions', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pc-recap-aw-'));
    directories.push(directory);
    const source = join(directory, 'activitywatch.json');
    writeFileSync(source, JSON.stringify({ buckets: {
      'aw-watcher-window_test': { type: 'currentwindow', events: [{
        id: 17, timestamp: '2026-08-01T10:00:00.000Z', duration: 120,
        data: { app: 'Code.exe', title: 'PC Recap' },
      }] },
    } }));

    const result = await new ActivityWatchImporter().preview(source);

    expect(result.exactSessions).toHaveLength(1);
    expect(result.exactSessions[0]).toMatchObject({
      appName: 'Visual Studio Code', executable: 'Code.exe', durationSeconds: 120,
      sourceKind: 'activitywatch', sourceRecordId: 'aw-watcher-window_test:17',
    });
    expect(result.coverage).toEqual({ start: '2026-08-01T10:00:00.000Z', end: '2026-08-01T10:02:00.000Z' });
  });

  it('ignores non-window buckets instead of inventing foreground time', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pc-recap-aw-'));
    directories.push(directory);
    const source = join(directory, 'activitywatch.json');
    writeFileSync(source, JSON.stringify({ buckets: {
      'aw-watcher-afk_test': { type: 'afkstatus', events: [{ id: 1, timestamp: '2026-08-01T10:00:00Z', duration: 600, data: { status: 'not-afk' } }] },
    } }));

    expect((await new ActivityWatchImporter().preview(source)).exactSessions).toHaveLength(0);
  });
});
