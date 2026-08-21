// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop tracking wiring', () => {
  it('selects the platform collector and forwards lock/suspend lifecycle events', () => {
    const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

    expect(source).toContain('createPlatformActivitySource');
    expect(source).not.toContain('new WindowsActivitySource()');
    expect(source).toContain("powerMonitor.on('lock-screen'");
    expect(source).toContain("powerMonitor.on('unlock-screen'");
    expect(source).toContain("powerMonitor.on('suspend'");
    expect(source).toContain("powerMonitor.on('resume'");
    expect(source).toContain('tracker?.handleLock()');
    expect(source).toContain('tracker?.handleSuspend()');
  });
});
