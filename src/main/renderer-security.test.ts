// @vitest-environment node
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('renderer target security', () => {
  it('ignores a development-server environment variable in packaged builds', async () => {
    const security = await import('./renderer-security').catch(() => undefined);
    const rendererFile = join(process.cwd(), 'dist', 'renderer', 'index.html');
    const result = security?.resolveRendererTarget({
      isPackaged: true,
      developmentUrl: 'https://malicious.example/',
      rendererFile,
    });

    expect(result).toEqual({
      kind: 'file',
      location: rendererFile,
      trustedUrl: pathToFileURL(rendererFile).href,
    });
    expect(result?.trustedUrl).not.toContain('malicious.example');
  });
});
