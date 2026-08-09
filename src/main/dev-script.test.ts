// @vitest-environment node
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const waitOn = require('wait-on') as (options: { resources: string[]; timeout: number }) => Promise<void>;
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('development launcher', () => {
  it('opens its readiness gate when the local renderer port is listening', async () => {
    const server = createServer();
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not expose a TCP port.');

    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      scripts: { dev: string };
    };
    const configuredResource = packageJson.scripts.dev.match(/tcp:[^\s"]+/)?.[0];
    expect(configuredResource).toBeTruthy();
    const isolatedResource = configuredResource!.replace(/:\d+$/, `:${address.port}`);

    await expect(waitOn({ resources: [isolatedResource], timeout: 500 })).resolves.toBeUndefined();
  });
});
