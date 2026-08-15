import { readFile, stat } from 'node:fs/promises';
import { gunzip, gzipSync } from 'node:zlib';
import type { ActivitySession, Category, RecoveredEvent, TrackedApp } from '../shared/types.js';
import { isSupportedBackupProduct, PRODUCT_NAME } from '../shared/brand.js';
import type { ActivityRepository, BackupSnapshot } from './database.js';

const BACKUP_VERSION = 2;
const DEFAULT_LIMITS = {
  maxCompressedBytes: 64 * 1024 * 1024,
  maxDecodedBytes: 256 * 1024 * 1024,
};

interface BackupLimits {
  maxCompressedBytes: number;
  maxDecodedBytes: number;
}

interface BackupArchive {
  manifest: {
    version: number;
    product: string;
    exportedAt: string;
  };
  data: BackupSnapshot;
}

export class BackupService {
  private readonly limits: BackupLimits;

  constructor(private readonly repository: ActivityRepository, limits: Partial<BackupLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  exportBuffer(now = new Date()): Buffer {
    const archive: BackupArchive = {
      manifest: {
        version: BACKUP_VERSION,
        product: PRODUCT_NAME,
        exportedAt: now.toISOString(),
      },
      data: this.repository.exportSnapshot(),
    };
    return gzipSync(Buffer.from(JSON.stringify(archive), 'utf8'), { level: 9 });
  }

  async importFile(filePath: string) {
    const metadata = await stat(filePath);
    if (!metadata.isFile() || metadata.size > this.limits.maxCompressedBytes) throw backupTooLarge();
    return this.importBuffer(await readFile(filePath));
  }

  async importBuffer(buffer: Buffer) {
    if (buffer.byteLength > this.limits.maxCompressedBytes) throw backupTooLarge();
    const decoded = await decodeArchive(buffer, this.limits.maxDecodedBytes);
    let raw: unknown;
    try {
      raw = JSON.parse(decoded.toString('utf8')) as unknown;
    } catch {
      throw invalidBackup();
    }
    const archive = validateArchive(raw);
    return this.repository.importSnapshot(archive.data);
  }
}

async function decodeArchive(buffer: Buffer, maxDecodedBytes: number) {
  const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;
  if (!isGzip) {
    if (buffer.byteLength > maxDecodedBytes) throw backupTooLarge();
    return buffer;
  }
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      gunzip(buffer, { maxOutputLength: maxDecodedBytes }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/maxOutputLength|larger than|buffer too large/i.test(message)) throw backupTooLarge();
    throw invalidBackup();
  }
}

function validateArchive(value: unknown): BackupArchive {
  if (!isRecord(value) || !isRecord(value.manifest)) throw invalidBackup();
  const version = value.manifest.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw invalidBackup();
  if (version > BACKUP_VERSION) {
    throw new Error(`Unsupported backup version. Update ${PRODUCT_NAME} before importing this archive.`);
  }
  if (
    !isSupportedBackupProduct(value.manifest.product)
    || !isIsoDate(value.manifest.exportedAt)
    || !isRecord(value.data)
    || !Array.isArray(value.data.apps)
    || !Array.isArray(value.data.sessions)
    || !Array.isArray(value.data.categories)
    || !isRecord(value.data.settings)
    || !value.data.apps.every(isTrackedApp)
    || !value.data.sessions.every(isActivitySession)
    || !value.data.categories.every(isCategory)
    || (value.data.recoveredEvents !== undefined && (!Array.isArray(value.data.recoveredEvents) || !value.data.recoveredEvents.every(isRecoveredEvent)))
  ) {
    throw invalidBackup();
  }
  return value as unknown as BackupArchive;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const isOptionalString = (value: unknown, max = 500) => value === undefined || (typeof value === 'string' && value.length <= max);
const isIsoDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function isActivitySession(value: unknown): value is ActivitySession {
  if (!isRecord(value)) return false;
  const start = Date.parse(String(value.startedAt));
  const end = Date.parse(String(value.endedAt));
  return isString(value.id, 200)
    && isString(value.appId, 200)
    && isString(value.appName, 500)
    && isString(value.categoryId, 100)
    && isIsoDate(value.startedAt)
    && isIsoDate(value.endedAt)
    && end >= start
    && typeof value.durationSeconds === 'number'
    && Number.isFinite(value.durationSeconds)
    && value.durationSeconds >= 0
    && value.durationSeconds <= 31_536_000
    && isOptionalString(value.windowTitle, 10_000)
    && isOptionalString(value.machineId, 500);
}

function isTrackedApp(value: unknown): value is TrackedApp {
  return isRecord(value)
    && isString(value.id, 200)
    && isString(value.name, 500)
    && isString(value.executable, 500)
    && isOptionalString(value.path, 32_768)
    && isString(value.categoryId, 100)
    && typeof value.color === 'string'
    && /^#[0-9a-f]{6}$/i.test(value.color)
    && isIsoDate(value.firstSeenAt)
    && isIsoDate(value.lastSeenAt)
    && (value.isExcluded === undefined || typeof value.isExcluded === 'boolean');
}

function isCategory(value: unknown): value is Category {
  return isRecord(value)
    && isString(value.id, 100)
    && isString(value.name, 200)
    && typeof value.color === 'string'
    && /^#[0-9a-f]{6}$/i.test(value.color)
    && isString(value.icon, 100)
    && typeof value.isDefault === 'boolean';
}

function isRecoveredEvent(value: unknown): value is RecoveredEvent {
  return isRecord(value)
    && isString(value.id, 200)
    && isOptionalString(value.appId, 200)
    && isString(value.appName, 500)
    && ['installed', 'launched', 'recently-used', 'uninstalled', 'context'].includes(String(value.eventType))
    && isIsoDate(value.occurredAt)
    && isString(value.sourceKind, 200)
    && ['high', 'medium', 'low'].includes(String(value.confidence))
    && isOptionalString(value.detail, 10_000)
    && isOptionalString(value.importBatchId, 200);
}

function invalidBackup() {
  return new Error(`This is not a valid ${PRODUCT_NAME} backup.`);
}

function backupTooLarge() {
  return new Error(`This ${PRODUCT_NAME} backup is too large to import safely.`);
}
