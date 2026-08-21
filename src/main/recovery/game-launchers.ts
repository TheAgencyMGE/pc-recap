import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RecoveredEventInput } from '../../shared/types.js';

interface VdfNode { [key: string]: string | VdfNode }

export function parseSteamEvidence(manifestText: string, localConfigText?: string): RecoveredEventInput | undefined {
  const manifest = parseVdf(manifestText);
  const state = findObject(manifest, 'AppState');
  const appId = stringValue(state, 'appid');
  const name = stringValue(state, 'name')?.trim();
  if (!appId || !name) return undefined;
  const localApps = localConfigText ? findObject(parseVdf(localConfigText), 'apps') : undefined;
  const local = localApps ? objectValue(localApps, appId) : undefined;
  const lastPlayed = unixTimestamp(stringValue(local, 'LastPlayed'));
  const playtimeMinutes = positiveNumber(stringValue(local, 'Playtime'));
  const playtimeSeconds = playtimeMinutes === undefined ? undefined : Math.round(playtimeMinutes * 60);
  if (lastPlayed) {
    return {
      appId: `steam-${appId}`,
      appName: name,
      eventType: 'launched',
      occurredAt: lastPlayed,
      sourceKind: 'steam_local_metadata',
      confidence: 'high',
      provenance: 'recovered',
      evidenceType: 'launcher-last-played',
      datePrecision: 'exact',
      durationKnown: playtimeSeconds !== undefined,
      playtimeSeconds,
      represents: 'execution',
      detail: playtimeSeconds === undefined
        ? 'Steam recorded when this game was last played. Local playtime was unavailable.'
        : `Steam recorded ${formatPlaytime(playtimeSeconds)} of local playtime and this last-played timestamp.`,
    };
  }
  const lastUpdated = unixTimestamp(stringValue(state, 'LastUpdated'));
  if (!lastUpdated) return undefined;
  return {
    appId: `steam-${appId}`,
    appName: name,
    eventType: 'context',
    occurredAt: lastUpdated,
    sourceKind: 'steam_local_metadata',
    confidence: 'low',
    provenance: 'inferred',
    evidenceType: 'launcher-manifest-updated',
    datePrecision: 'approximate',
    durationKnown: false,
    represents: 'presence',
    detail: 'A Steam installation manifest was updated around this time. This shows local presence, not verified playtime.',
  };
}

export function parseEpicManifest(text: string): RecoveredEventInput | undefined {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const manifest = value as Record<string, unknown>;
  const name = stringField(manifest.DisplayName) ?? stringField(manifest.AppName);
  const appName = stringField(manifest.AppName) ?? name;
  const installDate = stringField(manifest.InstallDate);
  if (!name || !appName || !installDate || !Number.isFinite(Date.parse(installDate))) return undefined;
  return {
    appId: `epic-${slug(appName)}`,
    appName: name,
    eventType: 'installed',
    occurredAt: new Date(installDate).toISOString(),
    sourceKind: 'epic_local_manifest',
    confidence: 'medium',
    provenance: 'recovered',
    evidenceType: 'launcher-install-manifest',
    datePrecision: 'exact',
    durationKnown: false,
    represents: 'installation',
    detail: 'Epic Games Launcher recorded this installation timestamp. No playtime was available.',
  };
}

export async function readSteamGameEvents(): Promise<RecoveredEventInput[]> {
  const roots = steamRoots().filter(existsSync);
  const libraries = new Set<string>();
  const localConfigs: string[] = [];
  for (const root of roots.slice(0, 12)) {
    libraries.add(root);
    const libraryText = await safeRead(join(root, 'steamapps', 'libraryfolders.vdf'));
    if (libraryText) for (const path of libraryPaths(libraryText)) libraries.add(path);
    const userData = join(root, 'userdata');
    for (const entry of await safeDirectories(userData, 100)) {
      const config = await safeRead(join(userData, entry, 'config', 'localconfig.vdf'));
      if (config) localConfigs.push(config);
    }
  }
  const localConfig = mergeSteamLocalConfigs(localConfigs);
  const events: RecoveredEventInput[] = [];
  for (const library of [...libraries].slice(0, 50)) {
    const steamApps = join(library, 'steamapps');
    for (const name of await safeFiles(steamApps, /^appmanifest_\d+\.acf$/i, 20_000)) {
      const manifest = await safeRead(join(steamApps, name));
      const appId = manifest ? stringValue(findObject(parseVdf(manifest), 'AppState'), 'appid') : undefined;
      const evidence = manifest ? parseSteamEvidence(manifest, appId ? localConfig.get(appId) : undefined) : undefined;
      if (evidence) events.push(evidence);
    }
  }
  return events.slice(0, 50_000);
}

export async function readEpicGameEvents(): Promise<RecoveredEventInput[]> {
  if (process.platform !== 'win32') return [];
  const programData = process.env.PROGRAMDATA;
  if (!programData) return [];
  const directory = join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  const events: RecoveredEventInput[] = [];
  for (const name of await safeFiles(directory, /\.item$/i, 20_000)) {
    const text = await safeRead(join(directory, name));
    const evidence = text ? parseEpicManifest(text) : undefined;
    if (evidence) events.push(evidence);
  }
  return events;
}

function parseVdf(text: string): VdfNode {
  const tokens = [...text.replace(/\/\/.*$/gm, '').matchAll(/"((?:\\.|[^"\\])*)"|([{}])/g)]
    .map((match) => match[2] ?? match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  let index = 0;
  const parseObject = (stopAtBrace = false): VdfNode => {
    const node: VdfNode = {};
    while (index < tokens.length) {
      if (tokens[index] === '}') { index += 1; break; }
      const key = tokens[index++];
      if (!key || key === '{') continue;
      if (tokens[index] === '{') {
        index += 1;
        node[key] = parseObject(true);
      } else if (tokens[index] !== undefined && tokens[index] !== '}') {
        node[key] = tokens[index++];
      } else if (!stopAtBrace) break;
    }
    return node;
  };
  return parseObject();
}

function findObject(node: VdfNode, key: string): VdfNode | undefined {
  for (const [candidate, value] of Object.entries(node)) {
    if (candidate.toLowerCase() === key.toLowerCase() && typeof value === 'object') return value;
    if (typeof value === 'object') {
      const nested = findObject(value, key);
      if (nested) return nested;
    }
  }
  return undefined;
}

function objectValue(node: VdfNode | undefined, key: string) {
  if (!node) return undefined;
  const match = Object.entries(node).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1];
  return typeof match === 'object' ? match : undefined;
}

function stringValue(node: VdfNode | undefined, key: string) {
  if (!node) return undefined;
  const match = Object.entries(node).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1];
  return typeof match === 'string' ? match : undefined;
}

function mergeSteamLocalConfigs(configs: string[]) {
  const result = new Map<string, string>();
  for (const config of configs) {
    const apps = findObject(parseVdf(config), 'apps');
    if (!apps) continue;
    for (const [appId, value] of Object.entries(apps)) {
      if (typeof value !== 'object') continue;
      const playtime = stringValue(value, 'Playtime');
      const lastPlayed = stringValue(value, 'LastPlayed');
      result.set(appId, `"apps" { "${appId}" { ${playtime ? `"Playtime" "${playtime}"` : ''} ${lastPlayed ? `"LastPlayed" "${lastPlayed}"` : ''} } }`);
    }
  }
  return result;
}

function libraryPaths(text: string) {
  const root = findObject(parseVdf(text), 'libraryfolders');
  if (!root) return [];
  return Object.values(root).flatMap((value) => typeof value === 'object' ? [stringValue(value, 'path')].filter(Boolean) as string[] : []);
}

function steamRoots() {
  const home = homedir();
  if (process.platform === 'win32') return [
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Steam') : '',
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Steam') : '',
  ].filter(Boolean);
  if (process.platform === 'darwin') return [join(home, 'Library', 'Application Support', 'Steam')];
  return [join(home, '.local', 'share', 'Steam'), join(home, '.steam', 'steam')];
}

async function safeRead(path: string) {
  try { return await readFile(path, 'utf8'); } catch { return undefined; }
}

async function safeDirectories(path: string, limit: number) {
  try { return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory()).slice(0, limit).map((entry) => entry.name); } catch { return []; }
}

async function safeFiles(path: string, pattern: RegExp, limit: number) {
  try { return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isFile() && pattern.test(entry.name)).slice(0, limit).map((entry) => entry.name); } catch { return []; }
}

function unixTimestamp(value?: string) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 946_684_800 ? new Date(seconds * 1_000).toISOString() : undefined;
}

function positiveNumber(value?: string) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function stringField(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'game'; }
function formatPlaytime(seconds: number) { return seconds >= 3_600 ? `${Number((seconds / 3_600).toFixed(1))} hours` : `${Math.round(seconds / 60)} minutes`; }
