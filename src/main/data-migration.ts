import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
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
  if (await fileExists(destination)) return destination;

  const candidates = [
    ...LEGACY_DATABASE_LOCATIONS.map(({ directory, file }) => join(appData, directory, file)),
    ...LEGACY_DATABASE_LOCATIONS.map(({ file }) => join(currentUserData, file)),
  ];
  const source = (await Promise.all(candidates.map(async (path) => ({ path, exists: await fileExists(path) }))))
    .find((candidate) => candidate.exists)?.path;
  if (!source) return destination;

  const legacy = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await legacy.backup(destination);
  } finally {
    legacy.close();
  }
  return destination;
}
