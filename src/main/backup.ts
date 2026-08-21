import { readFile, stat } from 'node:fs/promises';
import { gunzip, gzipSync } from 'node:zlib';
import type { ActivitySession, ActivityStateInterval, AppPerformanceRollup, Category, MemoryPin, PerformanceRollup, RecoveredEvent, SystemPerformanceSample, TrackedApp } from '../shared/types.js';
import { isSupportedBackupProduct, PRODUCT_NAME } from '../shared/brand.js';
import type { ActivityRepository, BackupSnapshot } from './database.js';

const BACKUP_VERSION = 3;
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
    || (value.data.memoryPins !== undefined && (!Array.isArray(value.data.memoryPins) || !value.data.memoryPins.every(isMemoryPin)))
    || (value.data.activityStates !== undefined && (!Array.isArray(value.data.activityStates) || !value.data.activityStates.every(isActivityStateInterval)))
    || (value.data.performanceSamples !== undefined && (!Array.isArray(value.data.performanceSamples) || !value.data.performanceSamples.every(isPerformanceSample)))
    || (value.data.performanceRollups !== undefined && (!Array.isArray(value.data.performanceRollups) || !value.data.performanceRollups.every(isPerformanceRollup)))
    || (value.data.appPerformanceRollups !== undefined && (!Array.isArray(value.data.appPerformanceRollups) || !value.data.appPerformanceRollups.every(isAppPerformanceRollup)))
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
    && (value.provenance === undefined || ['tracked', 'imported', 'recovered', 'inferred'].includes(String(value.provenance)))
    && isOptionalString(value.evidenceType, 200)
    && (value.datePrecision === undefined || ['exact', 'approximate'].includes(String(value.datePrecision)))
    && (value.durationKnown === undefined || typeof value.durationKnown === 'boolean')
    && optionalNumber(value.playtimeSeconds)
    && (value.represents === undefined || ['installation', 'execution', 'presence', 'context'].includes(String(value.represents)))
    && isOptionalString(value.detail, 10_000)
    && isOptionalString(value.importBatchId, 200);
}

function isMemoryPin(value: unknown): value is MemoryPin {
  return isRecord(value)
    && isString(value.id, 200)
    && isString(value.title, 80)
    && typeof value.note === 'string' && value.note.length <= 500
    && isIsoDate(value.start) && isIsoDate(value.end) && Date.parse(value.end) > Date.parse(value.start)
    && typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
    && typeof value.includeInRecaps === 'boolean'
    && isIsoDate(value.createdAt) && isIsoDate(value.updatedAt);
}

function isActivityStateInterval(value: unknown): value is ActivityStateInterval {
  return isRecord(value)
    && isString(value.id, 200)
    && ['idle', 'passive', 'locked', 'suspended', 'unavailable', 'untracked'].includes(String(value.state))
    && isIsoDate(value.startedAt) && isIsoDate(value.endedAt) && Date.parse(value.endedAt) >= Date.parse(value.startedAt)
    && isNumberInRange(value.durationSeconds, 0, 31_536_000)
    && isString(value.machineId, 200)
    && ['os-idle', 'power-monitor', 'collector', 'sampling-gap', 'privacy-rule'].includes(String(value.source))
    && isOptionalString(value.reason, 500);
}

function isPerformanceSample(value: unknown): value is SystemPerformanceSample {
  return isRecord(value)
    && isString(value.id, 200) && isIsoDate(value.sampledAt)
    && isString(value.machineId, 200) && isNumberInRange(value.intervalSeconds, 1, 3_600)
    && optionalNumber(value.cpuPercent, 100) && optionalNumber(value.memoryPercent, 100)
    && optionalNumber(value.batteryPercent, 100) && optionalNumber(value.gpuPercent, 100)
    && optionalNumber(value.memoryUsedBytes) && optionalNumber(value.memoryAvailableBytes)
    && optionalNumber(value.memoryTotalBytes) && optionalNumber(value.uptimeSeconds)
    && optionalNumber(value.gpuMemoryUsedBytes) && optionalNumber(value.diskReadBytesPerSecond)
    && optionalNumber(value.diskWriteBytesPerSecond)
    && (value.powerState === undefined || ['ac', 'battery', 'charging', 'unknown'].includes(String(value.powerState)))
    && (value.thermalState === undefined || ['nominal', 'fair', 'serious', 'critical'].includes(String(value.thermalState)))
    && isOptionalString(value.foregroundAppId, 200) && isOptionalString(value.foregroundAppName, 500);
}

function isPerformanceRollup(value: unknown): value is PerformanceRollup {
  return isRecord(value)
    && ['hour', 'day'].includes(String(value.kind)) && isIsoDate(value.bucketStart) && isString(value.machineId, 200)
    && numberFields(value, ['sampleCount', 'cpuSampleCount', 'memorySampleCount', 'batteryMetricCount', 'batterySampleCount', 'acSampleCount', 'chargingSampleCount', 'highLoadSeconds'])
    && optionalFields(value, ['cpuAverage', 'cpuMinimum', 'cpuMaximum', 'memoryPercentAverage', 'memoryPercentMinimum', 'memoryPercentMaximum', 'batteryAverage', 'batteryMinimum', 'batteryMaximum'], 100)
    && optionalFields(value, ['memoryUsedAverageBytes', 'memoryUsedMaximumBytes'])
    && (value.peakCpuAt === undefined || isIsoDate(value.peakCpuAt));
}

function isAppPerformanceRollup(value: unknown): value is AppPerformanceRollup {
  return isRecord(value) && isIsoDate(value.day) && isString(value.machineId, 200)
    && isString(value.appId, 200) && isString(value.appName, 500)
    && numberFields(value, ['sampleCount', 'cpuSampleCount', 'memorySampleCount', 'highLoadSeconds'])
    && optionalFields(value, ['cpuAverage', 'cpuMaximum', 'memoryPercentAverage', 'memoryPercentMaximum'], 100);
}

const isNumberInRange = (value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
const optionalNumber = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) => value === undefined || isNumberInRange(value, 0, maximum);
const numberFields = (value: Record<string, unknown>, fields: string[]) => fields.every((field) => isNumberInRange(value[field], 0));
const optionalFields = (value: Record<string, unknown>, fields: string[], maximum = Number.MAX_SAFE_INTEGER) => fields.every((field) => optionalNumber(value[field], maximum));

function invalidBackup() {
  return new Error(`This is not a valid ${PRODUCT_NAME} backup.`);
}

function backupTooLarge() {
  return new Error(`This ${PRODUCT_NAME} backup is too large to import safely.`);
}
