import { access, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { DATABASE_FILE, LEGACY_DATABASE_LOCATIONS } from '../shared/brand.js';

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function prepareActivityDatabase(currentUserData: string, appData: string) {
  await mkdir(currentUserData, { recursive: true });
  const destination = join(currentUserData, DATABASE_FILE);
  if (await fileExists(destination)) {
    const backup = `${destination}.pre-1.1-backup`;
    if (!(await fileExists(backup))) await backupDatabase(destination, backup);
    return destination;
  }

  const candidates = [
    ...LEGACY_DATABASE_LOCATIONS.map(({ directory, file }) => join(appData, directory, file)),
    ...LEGACY_DATABASE_LOCATIONS.map(({ file }) => join(currentUserData, file)),
  ];
  const source = (await Promise.all(candidates.map(async (path) => ({ path, exists: await fileExists(path) }))))
    .find((candidate) => candidate.exists)?.path;
  if (!source) return destination;

  await backupDatabase(source, destination);
  return destination;
}

export async function removeMigrationSafetyCopy(databasePath: string) {
  const backup = `${databasePath}.pre-1.1-backup`;
  await Promise.all([
    removeKnownDatabaseFamily(backup, true),
    removeKnownDatabaseFamily(databasePath, false),
  ]);
}

export async function removeLegacyActivityDatabases(currentUserData: string, appData: string) {
  const current = join(currentUserData, DATABASE_FILE).toLowerCase();
  const candidates = [
    ...LEGACY_DATABASE_LOCATIONS.map(({ directory, file }) => join(appData, directory, file)),
    ...LEGACY_DATABASE_LOCATIONS.map(({ file }) => join(currentUserData, file)),
  ].filter((path, index, all) => path.toLowerCase() !== current && all.findIndex((item) => item.toLowerCase() === path.toLowerCase()) === index);
  await Promise.all(candidates.map((path) => removeKnownDatabaseFamily(path, true)));
}

async function backupDatabase(source: string, destination: string) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await removeKnownDatabaseFamily(temporary, true);
  const legacy = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await legacy.backup(temporary);
    await rename(temporary, destination);
  } catch (error) {
    await removeKnownDatabaseFamily(temporary, true);
    throw error;
  } finally {
    legacy.close();
  }
}

async function removeKnownDatabaseFamily(databasePath: string, removeDatabase: boolean) {
  const directory = dirname(databasePath);
  const file = basename(databasePath);
  const exactNames = removeDatabase
    ? new Set([file, `${file}-wal`, `${file}-shm`, `${file}-journal`])
    : new Set<string>();
  let entries: string[] = [];
  try { entries = await readdir(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const names = entries.filter((name) => exactNames.has(name) || name.startsWith(`${file}.tmp-`));
  await Promise.all(names.map((name) => rm(join(directory, name), { force: true })));
}
