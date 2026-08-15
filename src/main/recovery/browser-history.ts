import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { RecoveredEventInput } from '../../shared/types.js';

interface BrowserDatabase { appName: string; path: string; kind: 'chromium' | 'firefox' }

export async function readBrowserHistoryEvents(): Promise<RecoveredEventInput[]> {
  const databases = findBrowserDatabases().slice(0, 40);
  return databases.flatMap(readBrowserDatabase).slice(0, 100_000);
}

function findBrowserDatabases(): BrowserDatabase[] {
  const results: BrowserDatabase[] = [];
  const local = process.env.LOCALAPPDATA;
  const roaming = process.env.APPDATA;
  if (local) {
    const chromiumRoots: Array<[string, string]> = [
      ['Chrome', join(local, 'Google', 'Chrome', 'User Data')],
      ['Microsoft Edge', join(local, 'Microsoft', 'Edge', 'User Data')],
      ['Brave', join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
    ];
    for (const [appName, root] of chromiumRoots) {
      if (!existsSync(root)) continue;
      for (const profile of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^(Default|Profile \d+)$/i.test(entry.name))) {
        const path = join(root, profile.name, 'History');
        if (existsSync(path)) results.push({ appName, path, kind: 'chromium' });
      }
    }
  }
  if (roaming) {
    const root = join(roaming, 'Mozilla', 'Firefox', 'Profiles');
    if (existsSync(root)) {
      for (const profile of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
        const path = join(root, profile.name, 'places.sqlite');
        if (existsSync(path)) results.push({ appName: 'Firefox', path, kind: 'firefox' });
      }
    }
  }
  return results;
}

function readBrowserDatabase(source: BrowserDatabase): RecoveredEventInput[] {
  const directory = mkdtempSync(join(tmpdir(), 'pc-recap-browser-'));
  const copy = join(directory, basename(source.path));
  try {
    copyFileSync(source.path, copy);
    const database = new Database(copy, { readonly: true, fileMustExist: true });
    try {
      const rows = source.kind === 'chromium'
        ? database.prepare(`SELECT u.url, v.visit_time AS visited FROM visits v JOIN urls u ON u.id = v.url ORDER BY v.visit_time DESC LIMIT 50000`).all() as Array<{ url: string; visited: number }>
        : database.prepare(`SELECT p.url, v.visit_date AS visited FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id ORDER BY v.visit_date DESC LIMIT 50000`).all() as Array<{ url: string; visited: number }>;
      return rows.flatMap((row) => {
        const occurredAt = browserTime(row.visited, source.kind);
        const host = safeHost(row.url);
        if (!occurredAt || !host) return [];
        return [{
          appName: source.appName,
          eventType: 'context' as const,
          occurredAt,
          sourceKind: `browser_history_${source.kind}`,
          confidence: 'high' as const,
          detail: `Visited ${host}. Browser clues do not add foreground usage time.`,
        }];
      });
    } finally {
      database.close();
    }
  } catch {
    return [];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function browserTime(value: number, kind: BrowserDatabase['kind']) {
  const milliseconds = kind === 'chromium' ? value / 1_000 - 11_644_473_600_000 : value / 1_000;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}

function safeHost(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return undefined; }
}
