// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('renderer target security', () => {
  it('ignores a development-server environment variable in packaged builds', async () => {
    const security = await import('./renderer-security').catch(() => undefined);
    const result = security?.resolveRendererTarget({
      isPackaged: true,
      developmentUrl: 'https://malicious.example/',
      rendererFile: 'C:\\Program Files\\PC Wrapped\\resources\\app.asar\\dist\\renderer\\index.html',
    });

    expect(result).toEqual({
      kind: 'file',
      location: 'C:\\Program Files\\PC Wrapped\\resources\\app.asar\\dist\\renderer\\index.html',
      trustedUrl: 'file:///C:/Program%20Files/PC%20Wrapped/resources/app.asar/dist/renderer/index.html',
    });
  });
});
