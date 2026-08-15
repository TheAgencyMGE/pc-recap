// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManicTimeImporter } from './manictime';
import { RescueTimeImporter } from './rescuetime';
import { WakaTimeImporter } from './wakatime';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));
const fixture = (name: string, body: string) => {
  const directory = mkdtempSync(join(tmpdir(), 'pc-recap-import-'));
  directories.push(directory);
  const source = join(directory, name);
  writeFileSync(source, body);
  return source;
};

describe('supported tracker adapters', () => {
  it('imports concrete ManicTime intervals', async () => {
    const source = fixture('manictime.csv', 'Start,End,Application,Executable\n2026-08-01T10:00:00Z,2026-08-01T10:05:00Z,Blender,blender.exe');
    expect((await new ManicTimeImporter().preview(source)).exactSessions[0]).toMatchObject({ appName: 'Blender', durationSeconds: 300 });
  });

  it('labels aggregate RescueTime rows as context without adding duration', async () => {
    const source = fixture('rescuetime.csv', 'Date,Time Spent (seconds),Activity\n2026-08-01,600,Chrome');
    const result = await new RescueTimeImporter().preview(source);
    expect(result.exactSessions).toEqual([]);
    expect(result.recoveredEvents[0]).toMatchObject({ appName: 'Chrome', eventType: 'context', sourceKind: 'rescuetime', confidence: 'medium' });
    expect(result.recoveredEvents[0]).not.toHaveProperty('durationSeconds');
  });

  it('keeps WakaTime coding activity as context rather than foreground time', async () => {
    const source = fixture('wakatime.json', JSON.stringify({ data: [{ time: 1785588000, duration: 90, project: 'PC Recap', entity: 'C:\\Users\\ryan\\PrivateProject\\App.tsx' }] }));
    const result = await new WakaTimeImporter().preview(source);
    expect(result.exactSessions).toEqual([]);
    expect(result.recoveredEvents[0]).toMatchObject({ appName: 'PC Recap', eventType: 'context', sourceKind: 'wakatime' });
    expect(result.recoveredEvents[0].detail).toContain('App.tsx was edited');
    expect(result.recoveredEvents[0].detail).not.toContain('PrivateProject');
  });
});
