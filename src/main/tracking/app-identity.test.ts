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

  it('prefers a concrete packaged child over a generic Windows frame host', () => {
    expect(chooseHostedApplication(
      { name: 'ApplicationFrameHost', executable: 'ApplicationFrameHost.exe' },
      [{ name: 'CalculatorApp', executable: 'CalculatorApp.exe', path: 'C:\\Program Files\\WindowsApps\\CalculatorApp.exe' }],
    )).toMatchObject({ executable: 'CalculatorApp.exe' });
  });
});
