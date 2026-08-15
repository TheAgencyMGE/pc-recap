import type { ApplicationAlias } from '../../shared/types.js';
import type { ActiveWindowInfo } from '../activity-source.js';

export interface ResolvedApplication extends ActiveWindowInfo {
  canonicalId: string;
  canonicalName: string;
  ignoredByDefault: boolean;
  identitySource: 'process' | 'package' | 'alias' | 'fallback';
}

const FRIENDLY_NAMES: Record<string, string> = {
  code: 'Visual Studio Code',
  chrome: 'Chrome',
  msedge: 'Microsoft Edge',
  discord: 'Discord',
  spotify: 'Spotify',
  windowsterminal: 'Windows Terminal',
  explorer: 'File Explorer',
  'pc wrapped': 'PC Recap',
  'pc recap': 'PC Recap',
};

const SHELL_ONLY_EXECUTABLES = new Set([
  'searchhost.exe',
  'searchapp.exe',
  'startmenuexperiencehost.exe',
  'shellexperiencehost.exe',
  'textinputhost.exe',
  'applicationframehost.exe',
  'lockapp.exe',
  'dwm.exe',
]);

export function isDefaultIgnoredApplication(info: Pick<ActiveWindowInfo, 'name' | 'executable' | 'path' | 'title'>): boolean {
  const executable = info.executable.trim().toLowerCase();
  const name = info.name.trim().toLowerCase();
  const path = info.path?.toLowerCase() ?? '';
  const title = info.title?.toLowerCase() ?? '';
  if (SHELL_ONLY_EXECUTABLES.has(executable)) return true;
  if (['pc recap', 'pc wrapped'].includes(name)) return true;
  if (executable === 'pc recap.exe' || executable === 'pc wrapped.exe' || path.includes('pc-recap.exe')) return true;
  return executable === 'electron.exe' && (
    title.includes('pc recap') || title.includes('pc wrapped') || path.includes('pc-wrapped') || path.includes('pc-recap')
  );
}

export function normalizeApplication(info: ActiveWindowInfo, alias?: ApplicationAlias): ResolvedApplication {
  if (alias) {
    return {
      ...info,
      name: alias.canonicalName,
      canonicalId: alias.canonicalAppId,
      canonicalName: alias.canonicalName,
      ignoredByDefault: isDefaultIgnoredApplication(info),
      identitySource: 'alias',
    };
  }

  const processName = info.executable.replace(/\.exe$/i, '').trim();
  const rawName = info.name.trim();
  const lookup = (rawName || processName).toLowerCase();
  const canonicalName = FRIENDLY_NAMES[lookup]
    ?? FRIENDLY_NAMES[processName.toLowerCase()]
    ?? rawName
    ?? friendlyFallback(processName);
  const meaningfulName = canonicalName || friendlyFallback(processName);
  return {
    ...info,
    name: meaningfulName,
    canonicalId: slug(info.executable || meaningfulName),
    canonicalName: meaningfulName,
    ignoredByDefault: isDefaultIgnoredApplication({ ...info, name: meaningfulName }),
    identitySource: rawName ? 'process' : 'fallback',
  };
}

export function chooseHostedApplication(host: ActiveWindowInfo, children: ActiveWindowInfo[]): ActiveWindowInfo {
  if (host.executable.toLowerCase() !== 'applicationframehost.exe') return host;
  return children.find((child) => child.executable && child.executable.toLowerCase() !== 'applicationframehost.exe') ?? host;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown-app';
}

function friendlyFallback(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown app';
}
