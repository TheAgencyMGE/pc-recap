// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chooseHostedApplication, isDefaultIgnoredApplication, normalizeApplication } from './app-identity';

describe('application identity', () => {
  it('filters shell-only processes but preserves File Explorer', () => {
    expect(isDefaultIgnoredApplication({ name: 'SearchHost', executable: 'SearchHost.exe' })).toBe(true);
    expect(isDefaultIgnoredApplication({ name: 'StartMenuExperienceHost', executable: 'StartMenuExperienceHost.exe' })).toBe(true);
    expect(isDefaultIgnoredApplication({ name: 'File Explorer', executable: 'explorer.exe' })).toBe(false);
  });

  it('recognizes current and former PC Recap identities as the app itself', () => {
    expect(isDefaultIgnoredApplication({ name: 'PC Recap', executable: 'PC Recap.exe' })).toBe(true);
    expect(isDefaultIgnoredApplication({ name: 'PC Wrapped', executable: 'PC Wrapped.exe' })).toBe(true);
    expect(normalizeApplication({ name: 'PC Wrapped', executable: 'PC Wrapped.exe' }).canonicalName).toBe('PC Recap');
  });

  it('uses a saved alias to keep executable renames in one application history', () => {
    expect(normalizeApplication(
      { name: 'Code - Insiders', executable: 'Code - Insiders.exe' },
      { sourceExecutable: 'code - insiders.exe', canonicalAppId: 'code-exe', canonicalName: 'Visual Studio Code', updatedAt: '2026-08-15T00:00:00.000Z' },
    )).toMatchObject({
      canonicalId: 'code-exe', canonicalName: 'Visual Studio Code', identitySource: 'alias',
    });
  });

  it('gives unfamiliar processes a stable friendly fallback', () => {
    expect(normalizeApplication({ name: '', executable: 'my-cool_app.exe' })).toMatchObject({
      canonicalId: 'my-cool-app-exe', canonicalName: 'my cool app', identitySource: 'fallback',
    });
  });

  it('normalizes common lower-case Windows process names for display', () => {
    expect(normalizeApplication({ name: 'opera', executable: 'opera.exe' }).canonicalName).toBe('Opera');
    expect(normalizeApplication({ name: 'firefox', executable: 'firefox.exe' }).canonicalName).toBe('Firefox');
    expect(normalizeApplication({ name: 'obs64', executable: 'obs64.exe' }).canonicalName).toBe('OBS Studio');
  });

  it('prefers a concrete packaged child over a generic Windows frame host', () => {
    expect(chooseHostedApplication(
      { name: 'ApplicationFrameHost', executable: 'ApplicationFrameHost.exe' },
      [{ name: 'CalculatorApp', executable: 'CalculatorApp.exe', path: 'C:\\Program Files\\WindowsApps\\CalculatorApp.exe' }],
    )).toMatchObject({ executable: 'CalculatorApp.exe' });
  });

  it('maps explicit Windows, macOS, and Linux identifiers to one Chrome history', () => {
    const windows = normalizeApplication({ name: 'chrome', executable: 'chrome.exe' });
    const mac = normalizeApplication({
      name: 'Google Chrome',
      executable: 'Google Chrome',
      bundleId: 'com.google.Chrome',
      path: '/Applications/Google Chrome.app',
    });
    const linux = normalizeApplication({ name: 'Google Chrome', executable: 'google-chrome-stable' });

    expect([windows, mac, linux].map((item) => item.canonicalId)).toEqual(['chrome', 'chrome', 'chrome']);
    expect([windows, mac, linux].map((item) => item.canonicalName)).toEqual(['Chrome', 'Chrome', 'Chrome']);
  });

  it('maps explicit VS Code identities without fuzzy substring merging', () => {
    expect(normalizeApplication({ name: 'Code', executable: 'Code.exe' })).toMatchObject({
      canonicalId: 'visual-studio-code', canonicalName: 'Visual Studio Code', identitySource: 'package',
    });
    expect(normalizeApplication({
      name: 'Visual Studio Code', executable: 'Electron', bundleId: 'com.microsoft.VSCode',
    }).canonicalId).toBe('visual-studio-code');
    expect(normalizeApplication({ name: 'My Chrome Helper', executable: 'my-chrome-helper' }).canonicalId)
      .toBe('my-chrome-helper');
  });
});
