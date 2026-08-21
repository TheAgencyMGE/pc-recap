import { DEFAULT_IGNORED_APPLICATIONS, type ApplicationAlias } from '../../shared/types.js';
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
  firefox: 'Firefox',
  opera: 'Opera',
  msedge: 'Microsoft Edge',
  discord: 'Discord',
  spotify: 'Spotify',
  obs64: 'OBS Studio',
  slack: 'Slack',
  teams: 'Microsoft Teams',
  'ms-teams': 'Microsoft Teams',
  devenv: 'Visual Studio',
  powershell: 'PowerShell',
  pwsh: 'PowerShell',
  notepad: 'Notepad',
  vlc: 'VLC',
  winword: 'Microsoft Word',
  excel: 'Microsoft Excel',
  outlook: 'Microsoft Outlook',
  windowsterminal: 'Windows Terminal',
  explorer: 'File Explorer',
  'pc wrapped': 'PC Recap',
  'pc recap': 'PC Recap',
};

interface CanonicalPackage {
  id: string;
  name: string;
  identifiers: readonly string[];
}

const CANONICAL_PACKAGES: CanonicalPackage[] = [
  { id: 'chrome', name: 'Chrome', identifiers: ['chrome', 'chrome.exe', 'google chrome', 'google-chrome', 'google-chrome-stable', 'com.google.chrome'] },
  { id: 'firefox', name: 'Firefox', identifiers: ['firefox', 'firefox.exe', 'org.mozilla.firefox'] },
  { id: 'microsoft-edge', name: 'Microsoft Edge', identifiers: ['msedge', 'msedge.exe', 'microsoft-edge', 'com.microsoft.edgemac'] },
  { id: 'discord', name: 'Discord', identifiers: ['discord', 'discord.exe', 'com.hnc.discord'] },
  { id: 'spotify', name: 'Spotify', identifiers: ['spotify', 'spotify.exe', 'com.spotify.client'] },
  { id: 'steam', name: 'Steam', identifiers: ['steam', 'steam.exe', 'com.valvesoftware.steam'] },
  { id: 'visual-studio-code', name: 'Visual Studio Code', identifiers: ['code', 'code.exe', 'visual studio code', 'com.microsoft.vscode'] },
  { id: 'visual-studio', name: 'Visual Studio', identifiers: ['devenv', 'devenv.exe', 'com.microsoft.visual-studio'] },
  { id: 'slack', name: 'Slack', identifiers: ['slack', 'slack.exe', 'com.tinyspeck.slackmacgap'] },
  { id: 'microsoft-teams', name: 'Microsoft Teams', identifiers: ['teams', 'teams.exe', 'ms-teams', 'ms-teams.exe', 'com.microsoft.teams2'] },
  { id: 'windows-terminal', name: 'Windows Terminal', identifiers: ['windowsterminal', 'windowsterminal.exe', 'microsoft.windows.terminal'] },
  { id: 'apple-terminal', name: 'Terminal', identifiers: ['terminal', 'com.apple.terminal'] },
  { id: 'iterm2', name: 'iTerm2', identifiers: ['iterm2', 'com.googlecode.iterm2'] },
  { id: 'pycharm', name: 'PyCharm', identifiers: ['pycharm', 'pycharm64.exe', 'com.jetbrains.pycharm'] },
  { id: 'intellij-idea', name: 'IntelliJ IDEA', identifiers: ['idea', 'idea64.exe', 'com.jetbrains.intellij'] },
  { id: 'webstorm', name: 'WebStorm', identifiers: ['webstorm', 'webstorm64.exe', 'com.jetbrains.webstorm'] },
];

const PACKAGE_BY_IDENTIFIER = new Map(
  CANONICAL_PACKAGES.flatMap((entry) => entry.identifiers.map((identifier) => [identifier, entry] as const)),
);

const SHELL_ONLY_EXECUTABLES = new Set<string>(DEFAULT_IGNORED_APPLICATIONS.map((item) => item.executable));

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

export function isSelfApplication(info: Pick<ActiveWindowInfo, 'name' | 'executable' | 'path' | 'title'>): boolean {
  const executable = info.executable.trim().toLowerCase();
  const name = info.name.trim().toLowerCase();
  const path = info.path?.toLowerCase() ?? '';
  const title = info.title?.toLowerCase() ?? '';
  return ['pc recap', 'pc wrapped'].includes(name)
    || executable === 'pc recap.exe' || executable === 'pc wrapped.exe' || path.includes('pc-recap.exe')
    || (executable === 'electron.exe' && (title.includes('pc recap') || title.includes('pc wrapped') || path.includes('pc-wrapped') || path.includes('pc-recap')));
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

  const packaged = resolveCanonicalPackage(info);
  if (packaged) {
    return {
      ...info,
      name: packaged.name,
      canonicalId: packaged.id,
      canonicalName: packaged.name,
      ignoredByDefault: isDefaultIgnoredApplication({ ...info, name: packaged.name }),
      identitySource: 'package',
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

function resolveCanonicalPackage(info: ActiveWindowInfo): CanonicalPackage | undefined {
  const identifiers = [info.bundleId, info.executable, info.name]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());
  return identifiers.map((value) => PACKAGE_BY_IDENTIFIER.get(value)).find(Boolean);
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
