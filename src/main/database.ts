import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type {
  ActivitySession,
  ActivityStateInterval,
  AppPerformanceRollup,
  ApplicationAlias,
  Category,
  ImportBatch,
  MemoryPin,
  OpenSessionCheckpoint,
  PerformanceRollup,
  RecoveredEvent,
  RecoveredEventInput,
  TimelineBucket,
  TrackedApp,
  TrackingSettings,
  SystemPerformanceSample,
} from '../shared/types.js';
import { DEFAULT_SETTINGS } from '../shared/types.js';
import { clipSessionToRange, localDayKey, localMonthKey, localYearKey, splitSessionByLocalDay } from '../shared/calendar.js';
import { normalizeApplication } from './tracking/app-identity.js';

interface SessionRow {
  id: string;
  app_id: string;
  app_name: string;
  category_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  window_title: string | null;
  machine_id: string;
  source_kind: ActivitySession['sourceKind'];
  confidence: ActivitySession['confidence'];
  source_record_id: string | null;
  import_batch_id: string | null;
}

interface AppRow {
  id: string;
  name: string;
  executable: string;
  path: string | null;
  category_id: string;
  color: string;
  first_seen_at: string;
  last_seen_at: string;
  is_excluded: number;
}

interface DailyRow {
  day: string;
  duration_seconds: number;
  session_count: number;
  first_activity: string;
  last_activity: string;
}

interface ActivityStateRow {
  id: string;
  state: ActivityStateInterval['state'];
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  machine_id: string;
  source: ActivityStateInterval['source'];
  reason: string | null;
}

interface PerformanceSampleRow {
  id: string;
  sampled_at: string;
  machine_id: string;
  interval_seconds: number;
  cpu_percent: number | null;
  memory_used_bytes: number | null;
  memory_available_bytes: number | null;
  memory_total_bytes: number | null;
  memory_percent: number | null;
  uptime_seconds: number | null;
  battery_percent: number | null;
  power_state: SystemPerformanceSample['powerState'] | null;
  thermal_state: SystemPerformanceSample['thermalState'] | null;
  gpu_percent: number | null;
  gpu_memory_used_bytes: number | null;
  disk_read_bytes_per_second: number | null;
  disk_write_bytes_per_second: number | null;
  foreground_app_id: string | null;
  foreground_app_name: string | null;
}

interface PerformanceRollupRow {
  bucket_kind: PerformanceRollup['kind'];
  bucket_start: string;
  machine_id: string;
  sample_count: number;
  cpu_count: number;
  cpu_sum: number;
  cpu_min: number | null;
  cpu_max: number | null;
  memory_count: number;
  memory_percent_sum: number;
  memory_percent_min: number | null;
  memory_percent_max: number | null;
  memory_used_sum: number;
  memory_used_max: number | null;
  battery_metric_count: number;
  battery_sum: number;
  battery_min: number | null;
  battery_max: number | null;
  battery_power_count: number;
  ac_power_count: number;
  charging_power_count: number;
  high_load_seconds: number;
  peak_cpu_at: string | null;
}

interface AppPerformanceRollupRow {
  day: string;
  machine_id: string;
  app_id: string;
  app_name: string;
  sample_count: number;
  cpu_count: number;
  cpu_sum: number;
  cpu_max: number | null;
  memory_count: number;
  memory_percent_sum: number;
  memory_percent_max: number | null;
  high_load_seconds: number;
}

export interface BackupSnapshot {
  apps: TrackedApp[];
  sessions: ActivitySession[];
  categories: Category[];
  settings: TrackingSettings;
  recoveredEvents?: RecoveredEvent[];
  memoryPins?: MemoryPin[];
  activityStates?: ActivityStateInterval[];
  performanceSamples?: SystemPerformanceSample[];
  performanceRollups?: PerformanceRollup[];
  appPerformanceRollups?: AppPerformanceRollup[];
}

export interface HistoryBatchInput {
  batch: ImportBatch;
  sessions: Array<{ session: ActivitySession; app?: Partial<TrackedApp> }>;
  recoveredEvents: Array<RecoveredEventInput & Pick<RecoveredEvent, 'id' | 'importBatchId'>>;
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'gaming', name: 'Gaming', color: '#75C46B', icon: 'gamepad-2', isDefault: true },
  { id: 'coding', name: 'Coding', color: '#8D87FF', icon: 'code-2', isDefault: true },
  { id: 'browsing', name: 'Browsing', color: '#5AB7FF', icon: 'globe-2', isDefault: true },
  { id: 'social', name: 'Social', color: '#FF746A', icon: 'messages-square', isDefault: true },
  { id: 'music', name: 'Music', color: '#F2C66D', icon: 'music-2', isDefault: true },
  { id: 'creative', name: 'Creative', color: '#F08CC6', icon: 'palette', isDefault: true },
  { id: 'work', name: 'Work', color: '#62D8C3', icon: 'briefcase-business', isDefault: true },
  { id: 'utility', name: 'Utility', color: '#9AA5B8', icon: 'wrench', isDefault: true },
  { id: 'other', name: 'Other', color: '#7D8493', icon: 'shapes', isDefault: true },
];

const sessionFromRow = (row: SessionRow): ActivitySession => ({
  id: row.id,
  appId: row.app_id,
  appName: row.app_name,
  categoryId: row.category_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  durationSeconds: row.duration_seconds,
  windowTitle: row.window_title ?? undefined,
  machineId: row.machine_id,
  sourceKind: row.source_kind,
  confidence: row.confidence,
  sourceRecordId: row.source_record_id ?? undefined,
  importBatchId: row.import_batch_id ?? undefined,
});

const appFromRow = (row: AppRow): TrackedApp => ({
  id: row.id,
  name: row.name,
  executable: row.executable,
  path: row.path ?? undefined,
  categoryId: row.category_id,
  color: row.color,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
  isExcluded: Boolean(row.is_excluded),
});

const activityStateFromRow = (row: ActivityStateRow): ActivityStateInterval => ({
  id: row.id,
  state: row.state,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  durationSeconds: row.duration_seconds,
  machineId: row.machine_id,
  source: row.source,
  reason: row.reason ?? undefined,
});

const performanceSampleFromRow = (row: PerformanceSampleRow): SystemPerformanceSample => ({
  id: row.id,
  sampledAt: row.sampled_at,
  machineId: row.machine_id,
  intervalSeconds: row.interval_seconds,
  cpuPercent: row.cpu_percent ?? undefined,
  memoryUsedBytes: row.memory_used_bytes ?? undefined,
  memoryAvailableBytes: row.memory_available_bytes ?? undefined,
  memoryTotalBytes: row.memory_total_bytes ?? undefined,
  memoryPercent: row.memory_percent ?? undefined,
  uptimeSeconds: row.uptime_seconds ?? undefined,
  batteryPercent: row.battery_percent ?? undefined,
  powerState: row.power_state ?? undefined,
  thermalState: row.thermal_state ?? undefined,
  gpuPercent: row.gpu_percent ?? undefined,
  gpuMemoryUsedBytes: row.gpu_memory_used_bytes ?? undefined,
  diskReadBytesPerSecond: row.disk_read_bytes_per_second ?? undefined,
  diskWriteBytesPerSecond: row.disk_write_bytes_per_second ?? undefined,
  foregroundAppId: row.foreground_app_id ?? undefined,
  foregroundAppName: row.foreground_app_name ?? undefined,
});

const performanceRollupFromRow = (row: PerformanceRollupRow): PerformanceRollup => ({
  kind: row.bucket_kind,
  bucketStart: row.bucket_start,
  machineId: row.machine_id,
  sampleCount: row.sample_count,
  cpuSampleCount: row.cpu_count,
  cpuAverage: row.cpu_count ? roundMetric(row.cpu_sum / row.cpu_count) : undefined,
  cpuMinimum: row.cpu_min ?? undefined,
  cpuMaximum: row.cpu_max ?? undefined,
  memorySampleCount: row.memory_count,
  memoryPercentAverage: row.memory_count ? roundMetric(row.memory_percent_sum / row.memory_count) : undefined,
  memoryPercentMinimum: row.memory_percent_min ?? undefined,
  memoryPercentMaximum: row.memory_percent_max ?? undefined,
  memoryUsedAverageBytes: row.memory_count ? Math.round(row.memory_used_sum / row.memory_count) : undefined,
  memoryUsedMaximumBytes: row.memory_used_max ?? undefined,
  batteryMetricCount: row.battery_metric_count,
  batteryAverage: row.battery_metric_count ? roundMetric(row.battery_sum / row.battery_metric_count) : undefined,
  batteryMinimum: row.battery_min ?? undefined,
  batteryMaximum: row.battery_max ?? undefined,
  batterySampleCount: row.battery_power_count,
  acSampleCount: row.ac_power_count,
  chargingSampleCount: row.charging_power_count,
  highLoadSeconds: row.high_load_seconds,
  peakCpuAt: row.peak_cpu_at ?? undefined,
});

const appPerformanceRollupFromRow = (row: AppPerformanceRollupRow): AppPerformanceRollup => ({
  day: row.day,
  machineId: row.machine_id,
  appId: row.app_id,
  appName: row.app_name,
  sampleCount: row.sample_count,
  cpuSampleCount: row.cpu_count,
  cpuAverage: row.cpu_count ? roundMetric(row.cpu_sum / row.cpu_count) : undefined,
  cpuMaximum: row.cpu_max ?? undefined,
  memorySampleCount: row.memory_count,
  memoryPercentAverage: row.memory_count ? roundMetric(row.memory_percent_sum / row.memory_count) : undefined,
  memoryPercentMaximum: row.memory_percent_max ?? undefined,
  highLoadSeconds: row.high_load_seconds,
});

export class ActivityRepository {
  private readonly database: Database.Database;

  constructor(location: string) {
    this.database = new Database(location);
    try {
      this.migrate();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  private migrate() {
    this.database.pragma('foreign_keys = ON');
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = NORMAL');
    this.database.exec('BEGIN IMMEDIATE');
    try {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        executable TEXT NOT NULL,
        path TEXT,
        category_id TEXT NOT NULL REFERENCES categories(id),
        color TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        is_excluded INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS activity_sessions (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL REFERENCES applications(id),
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0),
        window_title TEXT,
        machine_id TEXT NOT NULL DEFAULT 'local',
        source_kind TEXT NOT NULL DEFAULT 'pc_recap',
        confidence TEXT NOT NULL DEFAULT 'recorded',
        source_record_id TEXT,
        import_batch_id TEXT,
        day TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON activity_sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_day_app ON activity_sessions(day, app_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_machine ON activity_sessions(machine_id, started_at);
      CREATE TABLE IF NOT EXISTS activity_state_intervals (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK(state IN ('idle', 'passive', 'locked', 'suspended', 'unavailable', 'untracked')),
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0),
        machine_id TEXT NOT NULL DEFAULT 'local',
        source TEXT NOT NULL,
        reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_activity_states_range ON activity_state_intervals(started_at, ended_at);
      CREATE INDEX IF NOT EXISTS idx_activity_states_machine ON activity_state_intervals(machine_id, started_at);
      CREATE TABLE IF NOT EXISTS performance_samples (
        id TEXT PRIMARY KEY,
        sampled_at TEXT NOT NULL,
        machine_id TEXT NOT NULL DEFAULT 'local',
        interval_seconds INTEGER NOT NULL,
        cpu_percent REAL,
        memory_used_bytes INTEGER,
        memory_available_bytes INTEGER,
        memory_total_bytes INTEGER,
        memory_percent REAL,
        uptime_seconds INTEGER,
        battery_percent REAL,
        power_state TEXT,
        thermal_state TEXT,
        gpu_percent REAL,
        gpu_memory_used_bytes INTEGER,
        disk_read_bytes_per_second INTEGER,
        disk_write_bytes_per_second INTEGER,
        foreground_app_id TEXT,
        foreground_app_name TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_performance_samples_time ON performance_samples(sampled_at);
      CREATE TABLE IF NOT EXISTS performance_rollups (
        bucket_kind TEXT NOT NULL CHECK(bucket_kind IN ('hour', 'day')),
        bucket_start TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        sample_count INTEGER NOT NULL,
        cpu_count INTEGER NOT NULL,
        cpu_sum REAL NOT NULL,
        cpu_min REAL,
        cpu_max REAL,
        memory_count INTEGER NOT NULL,
        memory_percent_sum REAL NOT NULL,
        memory_percent_min REAL,
        memory_percent_max REAL,
        memory_used_sum REAL NOT NULL,
        memory_used_max INTEGER,
        battery_metric_count INTEGER NOT NULL,
        battery_sum REAL NOT NULL,
        battery_min REAL,
        battery_max REAL,
        battery_power_count INTEGER NOT NULL,
        ac_power_count INTEGER NOT NULL,
        charging_power_count INTEGER NOT NULL,
        high_load_seconds INTEGER NOT NULL,
        peak_cpu_at TEXT,
        PRIMARY KEY(bucket_kind, bucket_start, machine_id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_performance_rollups_range ON performance_rollups(bucket_kind, bucket_start);
      CREATE TABLE IF NOT EXISTS performance_app_rollups (
        day TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        app_name TEXT NOT NULL,
        sample_count INTEGER NOT NULL,
        cpu_count INTEGER NOT NULL,
        cpu_sum REAL NOT NULL,
        cpu_max REAL,
        memory_count INTEGER NOT NULL,
        memory_percent_sum REAL NOT NULL,
        memory_percent_max REAL,
        high_load_seconds INTEGER NOT NULL,
        PRIMARY KEY(day, machine_id, app_id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_performance_app_range ON performance_app_rollups(day, app_id);
      CREATE TABLE IF NOT EXISTS daily_app_rollups (
        day TEXT NOT NULL,
        app_id TEXT NOT NULL REFERENCES applications(id),
        duration_seconds INTEGER NOT NULL,
        session_count INTEGER NOT NULL,
        first_activity TEXT NOT NULL,
        last_activity TEXT NOT NULL,
        PRIMARY KEY(day, app_id)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS daily_rollups (
        day TEXT PRIMARY KEY,
        duration_seconds INTEGER NOT NULL,
        session_count INTEGER NOT NULL,
        first_activity TEXT NOT NULL,
        last_activity TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        unlocked_at TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}'
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY,
        imported_at TEXT NOT NULL,
        session_count INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS open_session_checkpoints (
        machine_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        app_name TEXT NOT NULL,
        executable TEXT NOT NULL,
        path TEXT,
        category_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        last_sample_at TEXT NOT NULL,
        checkpointed_at TEXT NOT NULL,
        window_title TEXT
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS application_aliases (
        source_executable TEXT PRIMARY KEY,
        canonical_app_id TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL UNIQUE,
        imported_at TEXT NOT NULL,
        exact_session_count INTEGER NOT NULL DEFAULT 0,
        recovered_event_count INTEGER NOT NULL DEFAULT 0
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS recovered_events (
        id TEXT PRIMARY KEY,
        app_id TEXT,
        app_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        confidence TEXT NOT NULL,
        provenance TEXT NOT NULL DEFAULT 'recovered',
        evidence_type TEXT,
        date_precision TEXT NOT NULL DEFAULT 'approximate',
        duration_known INTEGER NOT NULL DEFAULT 0,
        playtime_seconds INTEGER,
        represents TEXT,
        detail TEXT,
        import_batch_id TEXT REFERENCES import_batches(id)
      );
      CREATE INDEX IF NOT EXISTS idx_recovered_events_occurred ON recovered_events(occurred_at);
      CREATE TABLE IF NOT EXISTS memory_pins (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        color TEXT NOT NULL,
        include_in_recaps INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_pins_range ON memory_pins(start_at, end_at);
    `);
    this.ensureSessionProvenanceColumns();
    this.ensureRecoveredEventProvenanceColumns();
    this.ensureCheckpointSessionIdColumn();
    this.database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_source_record
        ON activity_sessions(source_kind, source_record_id) WHERE source_record_id IS NOT NULL;
    `);
    this.removeLegacySyntheticHistory();
    const insertCategory = this.database.prepare(`
      INSERT OR IGNORE INTO categories(id, name, color, icon, is_default) VALUES (?, ?, ?, ?, ?)
    `);
    for (const category of DEFAULT_CATEGORIES) {
      insertCategory.run(category.id, category.name, category.color, category.icon, category.isDefault ? 1 : 0);
    }
    this.normalizeKnownApplicationNames();
    this.migrateCalendarRollups();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }

  insertSession(session: ActivitySession, app?: Partial<TrackedApp>): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.insertSessionWithinTransaction(session, app);
      if (!inserted) {
        this.database.exec('ROLLBACK');
        return false;
      }
      this.database.exec('COMMIT');
      return true;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  finalizeOpenSession(session: ActivitySession, app: Partial<TrackedApp>, machineId: string): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const inserted = session.durationSeconds > 0 ? this.insertSessionWithinTransaction(session, app) : false;
      this.database.prepare('DELETE FROM open_session_checkpoints WHERE machine_id = ?').run(machineId);
      this.database.exec('COMMIT');
      return inserted;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private insertSessionWithinTransaction(session: ActivitySession, app?: Partial<TrackedApp>): boolean {
    const executable = app?.executable ?? `${session.appName.toLowerCase().replaceAll(' ', '-')}.exe`;
    const color = app?.color ?? DEFAULT_CATEGORIES.find((item) => item.id === session.categoryId)?.color ?? '#7D8493';
    const firstSeen = app?.firstSeenAt ?? session.startedAt;
    const lastSeen = app?.lastSeenAt ?? session.endedAt;
    this.database.prepare(`
        INSERT INTO applications(id, name, executable, path, category_id, color, first_seen_at, last_seen_at, is_excluded)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          executable = excluded.executable,
          path = COALESCE(excluded.path, applications.path),
          last_seen_at = MAX(applications.last_seen_at, excluded.last_seen_at)
      `).run(
        session.appId, session.appName, executable, app?.path ?? null, session.categoryId, color,
        firstSeen, lastSeen, app?.isExcluded ? 1 : 0,
      );
    const durationSeconds = Math.max(0, Math.round(session.durationSeconds));
    const normalizedSession = { ...session, durationSeconds };
    const inserted = this.database.prepare(`
        INSERT OR IGNORE INTO activity_sessions(
          id, app_id, started_at, ended_at, duration_seconds, window_title, machine_id,
          source_kind, confidence, source_record_id, import_batch_id, day
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id, session.appId, session.startedAt, session.endedAt, durationSeconds,
        session.windowTitle ?? null, session.machineId ?? 'local', session.sourceKind ?? 'pc_recap',
        session.confidence ?? 'recorded', session.sourceRecordId ?? null, session.importBatchId ?? null,
        localDayKey(session.startedAt),
      );
    if (Number(inserted.changes) === 0) return false;
    for (const allocation of splitSessionByLocalDay(normalizedSession)) {
      this.addRollupAllocation(session.appId, allocation);
    }
    return true;
  }

  commitHistoryBatch(input: HistoryBatchInput) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = this.commitHistoryBatchWithinTransaction(input);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private commitHistoryBatchWithinTransaction(input: HistoryBatchInput) {
    const batchInsert = this.database.prepare(`
      INSERT OR IGNORE INTO import_batches(
        id, source_kind, source_fingerprint, imported_at, exact_session_count, recovered_event_count
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.batch.id, input.batch.sourceKind, input.batch.sourceFingerprint, input.batch.importedAt,
      input.batch.exactSessionCount, input.batch.recoveredEventCount,
    );
    if (Number(batchInsert.changes) === 0) {
      return { importedSessions: 0, duplicates: input.sessions.length, recoveredEvents: 0, batchId: input.batch.id };
    }
    let importedSessions = 0;
    for (const item of input.sessions) {
      if (this.insertSessionWithinTransaction({ ...item.session, importBatchId: input.batch.id }, item.app)) importedSessions += 1;
    }
    const insertEvent = this.database.prepare(`
      INSERT OR IGNORE INTO recovered_events(
        id, app_id, app_name, event_type, occurred_at, source_kind, confidence,
        provenance, evidence_type, date_precision, duration_known, playtime_seconds, represents,
        detail, import_batch_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let recoveredEvents = 0;
    for (const event of input.recoveredEvents) {
      recoveredEvents += Number(insertEvent.run(
        event.id, event.appId ?? null, event.appName, event.eventType, event.occurredAt,
        event.sourceKind, event.confidence, event.provenance ?? 'recovered', event.evidenceType ?? null,
        event.datePrecision ?? 'approximate', event.durationKnown ? 1 : 0, event.playtimeSeconds ?? null,
        event.represents ?? null, event.detail ?? null, input.batch.id,
      ).changes);
    }
    return {
      importedSessions,
      duplicates: input.sessions.length - importedSessions,
      recoveredEvents,
      batchId: input.batch.id,
    };
  }

  listRecoveredEvents(): RecoveredEvent[] {
    const rows = this.database.prepare(`
      SELECT id, app_id, app_name, event_type, occurred_at, source_kind, confidence,
        provenance, evidence_type, date_precision, duration_known, playtime_seconds, represents,
        detail, import_batch_id
      FROM recovered_events ORDER BY occurred_at ASC, id ASC
    `).all() as Array<{
      id: string; app_id: string | null; app_name: string; event_type: RecoveredEvent['eventType'];
      occurred_at: string; source_kind: string; confidence: RecoveredEvent['confidence'];
      provenance: RecoveredEvent['provenance']; evidence_type: string | null;
      date_precision: RecoveredEvent['datePrecision']; duration_known: number; playtime_seconds: number | null;
      represents: RecoveredEvent['represents'] | null; detail: string | null; import_batch_id: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      appId: row.app_id ?? undefined,
      appName: row.app_name,
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      sourceKind: row.source_kind,
      confidence: row.confidence,
      provenance: row.provenance ?? 'recovered',
      evidenceType: row.evidence_type ?? undefined,
      datePrecision: row.date_precision ?? 'approximate',
      durationKnown: Boolean(row.duration_known),
      playtimeSeconds: row.playtime_seconds ?? undefined,
      represents: row.represents ?? undefined,
      detail: row.detail ?? undefined,
      importBatchId: row.import_batch_id ?? undefined,
    }));
  }

  saveMemoryPin(pin: MemoryPin): MemoryPin {
    validateMemoryPin(pin);
    this.database.prepare(`
      INSERT INTO memory_pins(id, title, note, start_at, end_at, color, include_in_recaps, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        note = excluded.note,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        color = excluded.color,
        include_in_recaps = excluded.include_in_recaps,
        updated_at = excluded.updated_at
    `).run(
      pin.id, pin.title.trim(), pin.note.trim(), pin.start, pin.end, pin.color,
      pin.includeInRecaps ? 1 : 0, pin.createdAt, pin.updatedAt,
    );
    return this.listMemoryPins().find((item) => item.id === pin.id)!;
  }

  listMemoryPins(start?: string, end?: string): MemoryPin[] {
    const rows = (start && end ? this.database.prepare(`
      SELECT * FROM memory_pins WHERE end_at > ? AND start_at < ? ORDER BY start_at, id
    `).all(start, end) : this.database.prepare('SELECT * FROM memory_pins ORDER BY start_at, id').all()) as Array<{
      id: string; title: string; note: string; start_at: string; end_at: string; color: string;
      include_in_recaps: number; created_at: string; updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id, title: row.title, note: row.note, start: row.start_at, end: row.end_at,
      color: row.color, includeInRecaps: Boolean(row.include_in_recaps), createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }

  deleteMemoryPin(id: string) {
    this.database.prepare('DELETE FROM memory_pins WHERE id = ?').run(id);
  }

  querySessions(start: string, end: string): ActivitySession[] {
    const rows = this.database.prepare(`
      SELECT s.id, s.app_id, a.name AS app_name, a.category_id, s.started_at, s.ended_at,
             s.duration_seconds, s.window_title, s.machine_id, s.source_kind, s.confidence,
             s.source_record_id, s.import_batch_id
      FROM activity_sessions s
      JOIN applications a ON a.id = s.app_id
      WHERE s.ended_at > ? AND s.started_at < ?
      ORDER BY s.started_at ASC, s.id ASC
    `).all(start, end) as SessionRow[];
    return rows.map(sessionFromRow)
      .map((session) => clipSessionToRange(session, start, end))
      .filter((session): session is ActivitySession => Boolean(session));
  }

  getAllSessions(): ActivitySession[] {
    return this.querySessions('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z');
  }

  insertActivityStateInterval(interval: ActivityStateInterval): boolean {
    const allowedStates = new Set<ActivityStateInterval['state']>([
      'idle', 'passive', 'locked', 'suspended', 'unavailable', 'untracked',
    ]);
    const start = Date.parse(interval.startedAt);
    const end = Date.parse(interval.endedAt);
    if (
      !interval.id?.trim()
      || interval.id.length > 200
      || !allowedStates.has(interval.state)
      || !Number.isFinite(start)
      || !Number.isFinite(end)
      || end < start
      || !interval.machineId?.trim()
      || interval.machineId.length > 200
      || !interval.source?.trim()
      || interval.source.length > 80
      || (interval.reason?.length ?? 0) > 500
    ) {
      throw new Error('Activity state interval is invalid.');
    }
    const durationSeconds = Math.max(0, Math.round((end - start) / 1_000));
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO activity_state_intervals(
        id, state, started_at, ended_at, duration_seconds, machine_id, source, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      interval.id,
      interval.state,
      new Date(start).toISOString(),
      new Date(end).toISOString(),
      durationSeconds,
      interval.machineId,
      interval.source,
      interval.reason?.trim() || null,
    );
    return result.changes > 0;
  }

  queryActivityStateIntervals(start: string, end: string): ActivityStateInterval[] {
    const rangeStart = Date.parse(start);
    const rangeEnd = Date.parse(end);
    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) return [];
    const rows = this.database.prepare(`
      SELECT id, state, started_at, ended_at, duration_seconds, machine_id, source, reason
      FROM activity_state_intervals
      WHERE ended_at > ? AND started_at < ?
      ORDER BY started_at, id
    `).all(new Date(rangeStart).toISOString(), new Date(rangeEnd).toISOString()) as ActivityStateRow[];
    return rows.map(activityStateFromRow).map((interval) => {
      const clippedStart = Math.max(rangeStart, Date.parse(interval.startedAt));
      const clippedEnd = Math.min(rangeEnd, Date.parse(interval.endedAt));
      return {
        ...interval,
        startedAt: new Date(clippedStart).toISOString(),
        endedAt: new Date(clippedEnd).toISOString(),
        durationSeconds: Math.max(0, Math.round((clippedEnd - clippedStart) / 1_000)),
      };
    });
  }

  getAllActivityStateIntervals(): ActivityStateInterval[] {
    const rows = this.database.prepare(`
      SELECT id, state, started_at, ended_at, duration_seconds, machine_id, source, reason
      FROM activity_state_intervals ORDER BY started_at, id
    `).all() as ActivityStateRow[];
    return rows.map(activityStateFromRow);
  }

  insertPerformanceSample(sample: SystemPerformanceSample): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.insertPerformanceSampleWithinTransaction(sample);
      this.database.exec('COMMIT');
      return inserted;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private insertPerformanceSampleWithinTransaction(sample: SystemPerformanceSample, updateRollups = true): boolean {
    const normalized = normalizePerformanceSample(sample);
    const result = this.database.prepare(`
        INSERT OR IGNORE INTO performance_samples(
          id, sampled_at, machine_id, interval_seconds, cpu_percent, memory_used_bytes,
          memory_available_bytes, memory_total_bytes, memory_percent, uptime_seconds,
          battery_percent, power_state, thermal_state, gpu_percent, gpu_memory_used_bytes,
          disk_read_bytes_per_second, disk_write_bytes_per_second, foreground_app_id, foreground_app_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalized.id, normalized.sampledAt, normalized.machineId, normalized.intervalSeconds,
      normalized.cpuPercent ?? null, normalized.memoryUsedBytes ?? null, normalized.memoryAvailableBytes ?? null,
      normalized.memoryTotalBytes ?? null, normalized.memoryPercent ?? null, normalized.uptimeSeconds ?? null,
      normalized.batteryPercent ?? null, normalized.powerState ?? null, normalized.thermalState ?? null,
      normalized.gpuPercent ?? null, normalized.gpuMemoryUsedBytes ?? null,
      normalized.diskReadBytesPerSecond ?? null, normalized.diskWriteBytesPerSecond ?? null,
      normalized.foregroundAppId ?? null, normalized.foregroundAppName ?? null,
    );
    if (!result.changes) return false;
    if (updateRollups) {
      this.updatePerformanceRollup('hour', normalized);
      this.updatePerformanceRollup('day', normalized);
      if (normalized.foregroundAppId && normalized.foregroundAppName) this.updateAppPerformanceRollup(normalized);
    }
    return true;
  }

  queryPerformanceSamples(start: string, end: string): SystemPerformanceSample[] {
    if (!validRange(start, end)) return [];
    const rows = this.database.prepare(`
      SELECT * FROM performance_samples WHERE sampled_at >= ? AND sampled_at < ? ORDER BY sampled_at, id
    `).all(new Date(start).toISOString(), new Date(end).toISOString()) as PerformanceSampleRow[];
    return rows.map(performanceSampleFromRow);
  }

  getAllPerformanceSamples(): SystemPerformanceSample[] {
    return (this.database.prepare('SELECT * FROM performance_samples ORDER BY sampled_at, id').all() as PerformanceSampleRow[])
      .map(performanceSampleFromRow);
  }

  queryPerformanceRollups(kind: 'hour' | 'day', start: string, end: string): PerformanceRollup[] {
    if (!validRange(start, end)) return [];
    const rows = this.database.prepare(`
      SELECT * FROM performance_rollups
      WHERE bucket_kind = ? AND bucket_start >= ? AND bucket_start < ?
      ORDER BY bucket_start, machine_id
    `).all(kind, new Date(start).toISOString(), new Date(end).toISOString()) as PerformanceRollupRow[];
    return rows.map(performanceRollupFromRow);
  }

  getAllPerformanceRollups(): PerformanceRollup[] {
    return (this.database.prepare('SELECT * FROM performance_rollups ORDER BY bucket_kind, bucket_start, machine_id').all() as PerformanceRollupRow[])
      .map(performanceRollupFromRow);
  }

  queryAppPerformanceRollups(start: string, end: string): AppPerformanceRollup[] {
    if (!validRange(start, end)) return [];
    const startDay = new Date(start).toISOString();
    const endDay = new Date(end).toISOString();
    const rows = this.database.prepare(`
      SELECT * FROM performance_app_rollups WHERE day >= ? AND day < ? ORDER BY app_name, day, machine_id
    `).all(startDay, endDay) as AppPerformanceRollupRow[];
    return rows.map(appPerformanceRollupFromRow);
  }

  getAllAppPerformanceRollups(): AppPerformanceRollup[] {
    return (this.database.prepare('SELECT * FROM performance_app_rollups ORDER BY day, machine_id, app_id').all() as AppPerformanceRollupRow[])
      .map(appPerformanceRollupFromRow);
  }

  prunePerformanceSamples(before: string): number {
    if (!Number.isFinite(Date.parse(before))) return 0;
    return this.database.prepare('DELETE FROM performance_samples WHERE sampled_at < ?')
      .run(new Date(before).toISOString()).changes;
  }

  private updatePerformanceRollup(kind: 'hour' | 'day', sample: Required<Pick<SystemPerformanceSample, 'id' | 'sampledAt' | 'machineId' | 'intervalSeconds'>> & SystemPerformanceSample) {
    const bucketStart = performanceBucketStart(sample.sampledAt, kind);
    const existing = this.database.prepare(`
      SELECT * FROM performance_rollups WHERE bucket_kind = ? AND bucket_start = ? AND machine_id = ?
    `).get(kind, bucketStart, sample.machineId) as PerformanceRollupRow | undefined;
    const cpuCount = (existing?.cpu_count ?? 0) + (sample.cpuPercent === undefined ? 0 : 1);
    const memoryCount = (existing?.memory_count ?? 0) + (sample.memoryPercent === undefined ? 0 : 1);
    const batteryMetricCount = (existing?.battery_metric_count ?? 0) + (sample.batteryPercent === undefined ? 0 : 1);
    const peakCpuAt = sample.cpuPercent !== undefined && (existing?.cpu_max == null || sample.cpuPercent > existing.cpu_max)
      ? sample.sampledAt
      : existing?.peak_cpu_at ?? null;
    const next: PerformanceRollupRow = {
      bucket_kind: kind,
      bucket_start: bucketStart,
      machine_id: sample.machineId,
      sample_count: (existing?.sample_count ?? 0) + 1,
      cpu_count: cpuCount,
      cpu_sum: (existing?.cpu_sum ?? 0) + (sample.cpuPercent ?? 0),
      cpu_min: metricMin(existing?.cpu_min, sample.cpuPercent),
      cpu_max: metricMax(existing?.cpu_max, sample.cpuPercent),
      memory_count: memoryCount,
      memory_percent_sum: (existing?.memory_percent_sum ?? 0) + (sample.memoryPercent ?? 0),
      memory_percent_min: metricMin(existing?.memory_percent_min, sample.memoryPercent),
      memory_percent_max: metricMax(existing?.memory_percent_max, sample.memoryPercent),
      memory_used_sum: (existing?.memory_used_sum ?? 0) + (sample.memoryUsedBytes ?? 0),
      memory_used_max: metricMax(existing?.memory_used_max, sample.memoryUsedBytes),
      battery_metric_count: batteryMetricCount,
      battery_sum: (existing?.battery_sum ?? 0) + (sample.batteryPercent ?? 0),
      battery_min: metricMin(existing?.battery_min, sample.batteryPercent),
      battery_max: metricMax(existing?.battery_max, sample.batteryPercent),
      battery_power_count: (existing?.battery_power_count ?? 0) + (sample.powerState === 'battery' ? 1 : 0),
      ac_power_count: (existing?.ac_power_count ?? 0) + (sample.powerState === 'ac' ? 1 : 0),
      charging_power_count: (existing?.charging_power_count ?? 0) + (sample.powerState === 'charging' ? 1 : 0),
      high_load_seconds: (existing?.high_load_seconds ?? 0) + ((sample.cpuPercent ?? 0) >= 75 ? sample.intervalSeconds : 0),
      peak_cpu_at: peakCpuAt,
    };
    this.database.prepare(`
      INSERT INTO performance_rollups(
        bucket_kind, bucket_start, machine_id, sample_count,
        cpu_count, cpu_sum, cpu_min, cpu_max,
        memory_count, memory_percent_sum, memory_percent_min, memory_percent_max, memory_used_sum, memory_used_max,
        battery_metric_count, battery_sum, battery_min, battery_max,
        battery_power_count, ac_power_count, charging_power_count, high_load_seconds, peak_cpu_at
      ) VALUES (
        @bucket_kind, @bucket_start, @machine_id, @sample_count,
        @cpu_count, @cpu_sum, @cpu_min, @cpu_max,
        @memory_count, @memory_percent_sum, @memory_percent_min, @memory_percent_max, @memory_used_sum, @memory_used_max,
        @battery_metric_count, @battery_sum, @battery_min, @battery_max,
        @battery_power_count, @ac_power_count, @charging_power_count, @high_load_seconds, @peak_cpu_at
      )
      ON CONFLICT(bucket_kind, bucket_start, machine_id) DO UPDATE SET
        sample_count = excluded.sample_count,
        cpu_count = excluded.cpu_count, cpu_sum = excluded.cpu_sum, cpu_min = excluded.cpu_min, cpu_max = excluded.cpu_max,
        memory_count = excluded.memory_count, memory_percent_sum = excluded.memory_percent_sum,
        memory_percent_min = excluded.memory_percent_min, memory_percent_max = excluded.memory_percent_max,
        memory_used_sum = excluded.memory_used_sum, memory_used_max = excluded.memory_used_max,
        battery_metric_count = excluded.battery_metric_count, battery_sum = excluded.battery_sum,
        battery_min = excluded.battery_min, battery_max = excluded.battery_max,
        battery_power_count = excluded.battery_power_count, ac_power_count = excluded.ac_power_count,
        charging_power_count = excluded.charging_power_count,
        high_load_seconds = excluded.high_load_seconds, peak_cpu_at = excluded.peak_cpu_at
    `).run(next);
  }

  private updateAppPerformanceRollup(sample: Required<Pick<SystemPerformanceSample, 'id' | 'sampledAt' | 'machineId' | 'intervalSeconds'>> & SystemPerformanceSample) {
    if (!sample.foregroundAppId || !sample.foregroundAppName) return;
    const day = performanceBucketStart(sample.sampledAt, 'day');
    const existing = this.database.prepare(`
      SELECT * FROM performance_app_rollups WHERE day = ? AND machine_id = ? AND app_id = ?
    `).get(day, sample.machineId, sample.foregroundAppId) as AppPerformanceRollupRow | undefined;
    const next: AppPerformanceRollupRow = {
      day,
      machine_id: sample.machineId,
      app_id: sample.foregroundAppId,
      app_name: sample.foregroundAppName,
      sample_count: (existing?.sample_count ?? 0) + 1,
      cpu_count: (existing?.cpu_count ?? 0) + (sample.cpuPercent === undefined ? 0 : 1),
      cpu_sum: (existing?.cpu_sum ?? 0) + (sample.cpuPercent ?? 0),
      cpu_max: metricMax(existing?.cpu_max, sample.cpuPercent),
      memory_count: (existing?.memory_count ?? 0) + (sample.memoryPercent === undefined ? 0 : 1),
      memory_percent_sum: (existing?.memory_percent_sum ?? 0) + (sample.memoryPercent ?? 0),
      memory_percent_max: metricMax(existing?.memory_percent_max, sample.memoryPercent),
      high_load_seconds: (existing?.high_load_seconds ?? 0) + ((sample.cpuPercent ?? 0) >= 75 ? sample.intervalSeconds : 0),
    };
    this.database.prepare(`
      INSERT INTO performance_app_rollups(
        day, machine_id, app_id, app_name, sample_count, cpu_count, cpu_sum, cpu_max,
        memory_count, memory_percent_sum, memory_percent_max, high_load_seconds
      ) VALUES (
        @day, @machine_id, @app_id, @app_name, @sample_count, @cpu_count, @cpu_sum, @cpu_max,
        @memory_count, @memory_percent_sum, @memory_percent_max, @high_load_seconds
      )
      ON CONFLICT(day, machine_id, app_id) DO UPDATE SET
        app_name = excluded.app_name, sample_count = excluded.sample_count,
        cpu_count = excluded.cpu_count, cpu_sum = excluded.cpu_sum, cpu_max = excluded.cpu_max,
        memory_count = excluded.memory_count, memory_percent_sum = excluded.memory_percent_sum,
        memory_percent_max = excluded.memory_percent_max, high_load_seconds = excluded.high_load_seconds
    `).run(next);
  }

  private insertArchivedPerformanceRollup(rollup: PerformanceRollup) {
    validatePerformanceRollup(rollup);
    this.database.prepare(`
      INSERT OR IGNORE INTO performance_rollups(
        bucket_kind, bucket_start, machine_id, sample_count,
        cpu_count, cpu_sum, cpu_min, cpu_max,
        memory_count, memory_percent_sum, memory_percent_min, memory_percent_max, memory_used_sum, memory_used_max,
        battery_metric_count, battery_sum, battery_min, battery_max,
        battery_power_count, ac_power_count, charging_power_count, high_load_seconds, peak_cpu_at
      ) VALUES (
        @bucket_kind, @bucket_start, @machine_id, @sample_count,
        @cpu_count, @cpu_sum, @cpu_min, @cpu_max,
        @memory_count, @memory_percent_sum, @memory_percent_min, @memory_percent_max, @memory_used_sum, @memory_used_max,
        @battery_metric_count, @battery_sum, @battery_min, @battery_max,
        @battery_power_count, @ac_power_count, @charging_power_count, @high_load_seconds, @peak_cpu_at
      )
    `).run({
      bucket_kind: rollup.kind,
      bucket_start: new Date(rollup.bucketStart).toISOString(),
      machine_id: rollup.machineId,
      sample_count: rollup.sampleCount,
      cpu_count: rollup.cpuSampleCount,
      cpu_sum: (rollup.cpuAverage ?? 0) * rollup.cpuSampleCount,
      cpu_min: rollup.cpuMinimum ?? null,
      cpu_max: rollup.cpuMaximum ?? null,
      memory_count: rollup.memorySampleCount,
      memory_percent_sum: (rollup.memoryPercentAverage ?? 0) * rollup.memorySampleCount,
      memory_percent_min: rollup.memoryPercentMinimum ?? null,
      memory_percent_max: rollup.memoryPercentMaximum ?? null,
      memory_used_sum: (rollup.memoryUsedAverageBytes ?? 0) * rollup.memorySampleCount,
      memory_used_max: rollup.memoryUsedMaximumBytes ?? null,
      battery_metric_count: rollup.batteryMetricCount,
      battery_sum: (rollup.batteryAverage ?? 0) * rollup.batteryMetricCount,
      battery_min: rollup.batteryMinimum ?? null,
      battery_max: rollup.batteryMaximum ?? null,
      battery_power_count: rollup.batterySampleCount,
      ac_power_count: rollup.acSampleCount,
      charging_power_count: rollup.chargingSampleCount,
      high_load_seconds: rollup.highLoadSeconds,
      peak_cpu_at: rollup.peakCpuAt ?? null,
    });
  }

  private insertArchivedAppPerformanceRollup(rollup: AppPerformanceRollup) {
    validateAppPerformanceRollup(rollup);
    this.database.prepare(`
      INSERT OR IGNORE INTO performance_app_rollups(
        day, machine_id, app_id, app_name, sample_count, cpu_count, cpu_sum, cpu_max,
        memory_count, memory_percent_sum, memory_percent_max, high_load_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date(rollup.day).toISOString(), rollup.machineId, rollup.appId, rollup.appName,
      rollup.sampleCount, rollup.cpuSampleCount, (rollup.cpuAverage ?? 0) * rollup.cpuSampleCount,
      rollup.cpuMaximum ?? null, rollup.memorySampleCount,
      (rollup.memoryPercentAverage ?? 0) * rollup.memorySampleCount,
      rollup.memoryPercentMaximum ?? null, rollup.highLoadSeconds,
    );
  }

  getDailyRollups(startDay: string, endDay: string) {
    const rows = this.database.prepare(`
      SELECT day, duration_seconds, session_count, first_activity, last_activity
      FROM daily_rollups WHERE day >= ? AND day <= ? ORDER BY day
    `).all(startDay, endDay) as DailyRow[];
    return rows.map((row) => ({
      day: row.day,
      durationSeconds: row.duration_seconds,
      sessionCount: row.session_count,
      firstActivity: row.first_activity,
      lastActivity: row.last_activity,
    }));
  }

  getTimeline(level: 'year' | 'month' | 'day', anchor?: string): TimelineBucket[] {
    const sessions = this.getAllSessions();
    const formatKey = (iso: string) => level === 'year' ? localYearKey(iso) : level === 'month' ? localMonthKey(iso) : localDayKey(iso);
    const groups = new Map<string, { seconds: number; apps: Map<string, number>; category: string }>();
    for (const item of sessions) {
      for (const allocation of splitSessionByLocalDay(item)) {
        const key = formatKey(allocation.startedAt);
        if (anchor && !key.startsWith(anchor)) continue;
        const group = groups.get(key) ?? { seconds: 0, apps: new Map<string, number>(), category: item.categoryId };
        group.seconds += allocation.seconds;
        group.apps.set(item.appName, (group.apps.get(item.appName) ?? 0) + allocation.seconds);
        groups.set(key, group);
      }
    }
    const max = Math.max(1, ...[...groups.values()].map((group) => group.seconds));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => ({
      key,
      label: key,
      seconds: group.seconds,
      topApp: [...group.apps.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'Unknown',
      categoryId: group.category,
      intensity: group.seconds / max,
    }));
  }

  getSettings(): TrackingSettings {
    const row = this.database.prepare(`SELECT value FROM settings WHERE key = 'tracking'`).get() as { value: string } | undefined;
    if (!row) return { ...DEFAULT_SETTINGS };
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } as TrackingSettings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveAchievementUnlock(id: string, unlockedAt: string) {
    this.database.prepare(`
      INSERT OR IGNORE INTO achievements(id, unlocked_at, payload) VALUES (?, ?, '{}')
    `).run(id, unlockedAt);
  }

  getAchievementUnlock(id: string): string | undefined {
    const row = this.database.prepare('SELECT unlocked_at FROM achievements WHERE id = ?')
      .get(id) as { unlocked_at: string } | undefined;
    return row?.unlocked_at;
  }

  saveOpenSessionCheckpoint(checkpoint: OpenSessionCheckpoint) {
    this.database.prepare(`
      INSERT INTO open_session_checkpoints(
        machine_id, session_id, app_id, app_name, executable, path, category_id, started_at,
        last_sample_at, checkpointed_at, window_title
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(machine_id) DO UPDATE SET
        session_id = excluded.session_id,
        app_id = excluded.app_id,
        app_name = excluded.app_name,
        executable = excluded.executable,
        path = excluded.path,
        category_id = excluded.category_id,
        started_at = excluded.started_at,
        last_sample_at = excluded.last_sample_at,
        checkpointed_at = excluded.checkpointed_at,
        window_title = excluded.window_title
    `).run(
      checkpoint.machineId, checkpoint.sessionId, checkpoint.appId, checkpoint.appName, checkpoint.executable,
      checkpoint.path ?? null, checkpoint.categoryId, checkpoint.startedAt, checkpoint.lastSampleAt,
      checkpoint.checkpointedAt, checkpoint.windowTitle ?? null,
    );
  }

  getOpenSessionCheckpoint(machineId: string): OpenSessionCheckpoint | undefined {
    const row = this.database.prepare(`
      SELECT machine_id, session_id, app_id, app_name, executable, path, category_id, started_at,
             last_sample_at, checkpointed_at, window_title
      FROM open_session_checkpoints WHERE machine_id = ?
    `).get(machineId) as {
      machine_id: string; session_id: string | null; app_id: string; app_name: string; executable: string; path: string | null;
      category_id: string; started_at: string; last_sample_at: string; checkpointed_at: string;
      window_title: string | null;
    } | undefined;
    if (!row) return undefined;
    return {
      sessionId: row.session_id ?? stableCheckpointSessionId(row.machine_id, row.started_at),
      machineId: row.machine_id,
      appId: row.app_id,
      appName: row.app_name,
      executable: row.executable,
      path: row.path ?? undefined,
      categoryId: row.category_id,
      startedAt: row.started_at,
      lastSampleAt: row.last_sample_at,
      checkpointedAt: row.checkpointed_at,
      windowTitle: row.window_title ?? undefined,
    };
  }

  clearOpenSessionCheckpoint(machineId: string) {
    this.database.prepare('DELETE FROM open_session_checkpoints WHERE machine_id = ?').run(machineId);
  }

  upsertApplicationAlias(alias: ApplicationAlias) {
    this.database.prepare(`
      INSERT INTO application_aliases(source_executable, canonical_app_id, canonical_name, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_executable) DO UPDATE SET
        canonical_app_id = excluded.canonical_app_id,
        canonical_name = excluded.canonical_name,
        updated_at = excluded.updated_at
    `).run(alias.sourceExecutable.toLowerCase(), alias.canonicalAppId, alias.canonicalName, alias.updatedAt);
  }

  resolveApplicationAlias(sourceExecutable: string): ApplicationAlias | undefined {
    const row = this.database.prepare(`
      SELECT source_executable, canonical_app_id, canonical_name, updated_at
      FROM application_aliases WHERE source_executable = ?
    `).get(sourceExecutable.toLowerCase()) as {
      source_executable: string; canonical_app_id: string; canonical_name: string; updated_at: string;
    } | undefined;
    return row ? {
      sourceExecutable: row.source_executable,
      canonicalAppId: row.canonical_app_id,
      canonicalName: row.canonical_name,
      updatedAt: row.updated_at,
    } : undefined;
  }

  updateSettings(patch: Partial<TrackingSettings>): TrackingSettings {
    const current = this.getSettings();
    const executableList = (value: unknown, fallback: string[]) => (Array.isArray(value) ? value : fallback)
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toLowerCase().slice(0, 260))
      .filter(Boolean);
    const next: TrackingSettings = {
      ...current,
      ...patch,
      sampleIntervalSeconds: Math.min(60, Math.max(5, patch.sampleIntervalSeconds ?? current.sampleIntervalSeconds)),
      idleThresholdSeconds: Math.min(3_600, Math.max(60, patch.idleThresholdSeconds ?? current.idleThresholdSeconds)),
      performanceSampleIntervalSeconds: Math.min(60, Math.max(5, patch.performanceSampleIntervalSeconds ?? current.performanceSampleIntervalSeconds)),
      excludedExecutables: [...new Set(executableList(patch.excludedExecutables, current.excludedExecutables))],
      includedExecutables: [...new Set(executableList(patch.includedExecutables, current.includedExecutables))],
    };
    this.database.prepare(`
      INSERT INTO settings(key, value) VALUES ('tracking', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(next));
    return next;
  }

  getCategories(): Category[] {
    const rows = this.database.prepare(`SELECT id, name, color, icon, is_default FROM categories ORDER BY is_default DESC, name`).all() as Array<{
      id: string; name: string; color: string; icon: string; is_default: number;
    }>;
    return rows.map((row) => ({ id: row.id, name: row.name, color: row.color, icon: row.icon, isDefault: Boolean(row.is_default) }));
  }

  upsertCategory(category: Category): Category {
    this.database.prepare(`
      INSERT INTO categories(id, name, color, icon, is_default) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, icon = excluded.icon
    `).run(category.id, category.name.trim(), category.color, category.icon, category.isDefault ? 1 : 0);
    return category;
  }

  updateCategory(category: Category): Category {
    const existing = this.database.prepare('SELECT is_default FROM categories WHERE id = ?')
      .get(category.id) as { is_default: number } | undefined;
    if (!existing) throw new Error('Category not found.');
    return this.upsertCategory({ ...category, isDefault: Boolean(existing.is_default) });
  }

  deleteCategory(categoryId: string, reassignToCategoryId: string) {
    if (categoryId === reassignToCategoryId) throw new Error('Choose a different category for reassignment.');
    const category = this.database.prepare('SELECT is_default FROM categories WHERE id = ?')
      .get(categoryId) as { is_default: number } | undefined;
    if (!category) throw new Error('Category not found.');
    if (category.is_default) throw new Error('Default categories cannot be deleted.');
    const replacement = this.database.prepare('SELECT 1 FROM categories WHERE id = ?').get(reassignToCategoryId);
    if (!replacement) throw new Error('Replacement category not found.');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('UPDATE applications SET category_id = ? WHERE category_id = ?')
        .run(reassignToCategoryId, categoryId);
      this.database.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  listApps(): TrackedApp[] {
    return (this.database.prepare(`SELECT * FROM applications ORDER BY last_seen_at DESC, name`).all() as AppRow[]).map(appFromRow);
  }

  setAppCategory(appId: string, categoryId: string) {
    this.database.prepare(`UPDATE applications SET category_id = ? WHERE id = ?`).run(categoryId, appId);
  }

  setAppExcluded(appId: string, excluded: boolean) {
    this.database.prepare(`UPDATE applications SET is_excluded = ? WHERE id = ?`).run(excluded ? 1 : 0, appId);
  }

  isAppExcluded(executable: string) {
    const row = this.database.prepare(`
      SELECT is_excluded FROM applications WHERE LOWER(executable) = ? LIMIT 1
    `).get(executable.toLowerCase()) as { is_excluded: number } | undefined;
    return Boolean(row?.is_excluded);
  }

  private removeLegacySyntheticHistory() {
    const legacyColumn = 'is_demo';
    const appColumns = this.database.prepare('PRAGMA table_info(applications)').all() as Array<{ name: string }>;
    const sessionColumns = this.database.prepare('PRAGMA table_info(activity_sessions)').all() as Array<{ name: string }>;
    const appsMarked = appColumns.some((column) => column.name === legacyColumn);
    const sessionsMarked = sessionColumns.some((column) => column.name === legacyColumn);

    const settingsRow = this.database.prepare(`SELECT value FROM settings WHERE key = 'tracking'`).get() as { value: string } | undefined;
    if (settingsRow) {
      try {
        const parsed = JSON.parse(settingsRow.value) as Record<string, unknown>;
        if (Object.hasOwn(parsed, 'demoMode')) {
          delete parsed.demoMode;
          this.database.prepare(`UPDATE settings SET value = ? WHERE key = 'tracking'`).run(JSON.stringify(parsed));
        }
      } catch {
        // Invalid settings are replaced by defaults when read.
      }
    }

    if (!appsMarked && !sessionsMarked) return;
    if (sessionsMarked) this.database.exec(`DELETE FROM activity_sessions WHERE ${legacyColumn} = 1;`);
    this.rebuildRollups();
    if (appsMarked) this.database.exec(`DELETE FROM applications WHERE ${legacyColumn} = 1;`);
    if (sessionsMarked) this.database.exec(`ALTER TABLE activity_sessions DROP COLUMN ${legacyColumn};`);
    if (appsMarked) this.database.exec(`ALTER TABLE applications DROP COLUMN ${legacyColumn};`);
  }

  private normalizeKnownApplicationNames() {
    const rows = this.database.prepare('SELECT id, name, executable, path FROM applications').all() as Array<{
      id: string;
      name: string;
      executable: string;
      path: string | null;
    }>;
    const updateApplication = this.database.prepare('UPDATE applications SET name = ? WHERE id = ?');
    const updateCheckpoint = this.database.prepare('UPDATE open_session_checkpoints SET app_name = ? WHERE app_id = ?');
    for (const row of rows) {
      const friendly = normalizeApplication({ name: row.name, executable: row.executable, path: row.path ?? undefined }).canonicalName;
      if (friendly === row.name) continue;
      updateApplication.run(friendly, row.id);
      updateCheckpoint.run(friendly, row.id);
    }
  }

  deleteAllHistory() {
    this.database.pragma('secure_delete = ON');
    const erase = this.database.transaction(() => this.database.exec(`
        DELETE FROM recovered_events;
        DELETE FROM import_batches;
        DELETE FROM imports;
        DELETE FROM open_session_checkpoints;
        DELETE FROM application_aliases;
        DELETE FROM memory_pins;
        DELETE FROM activity_state_intervals;
        DELETE FROM performance_samples;
        DELETE FROM performance_rollups;
        DELETE FROM performance_app_rollups;
        DELETE FROM daily_app_rollups;
        DELETE FROM daily_rollups;
        DELETE FROM activity_sessions;
        DELETE FROM applications;
        DELETE FROM achievements;
      `));
    erase();
    this.database.pragma('wal_checkpoint(TRUNCATE)');
    this.database.exec('VACUUM');
    this.database.pragma('wal_checkpoint(TRUNCATE)');
  }

  private rebuildRollups() {
    this.database.exec('DELETE FROM daily_app_rollups; DELETE FROM daily_rollups;');
    const rows = this.database.prepare(`
      SELECT id, app_id, started_at, ended_at, duration_seconds, window_title, machine_id
      FROM activity_sessions ORDER BY started_at
    `).all() as Array<{
      id: string; app_id: string; started_at: string; ended_at: string;
      duration_seconds: number; window_title: string | null; machine_id: string;
    }>;
    const updateDay = this.database.prepare('UPDATE activity_sessions SET day = ? WHERE id = ?');
    for (const row of rows) {
      const session: ActivitySession = {
        id: row.id,
        appId: row.app_id,
        appName: '',
        categoryId: 'other',
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationSeconds: row.duration_seconds,
        windowTitle: row.window_title ?? undefined,
        machineId: row.machine_id,
      };
      updateDay.run(localDayKey(session.startedAt), session.id);
      for (const allocation of splitSessionByLocalDay(session)) this.addRollupAllocation(session.appId, allocation);
    }
  }

  private ensureSessionProvenanceColumns() {
    const columns = new Set((this.database.prepare('PRAGMA table_info(activity_sessions)').all() as Array<{ name: string }>)
      .map((column) => column.name));
    const additions = [
      ['source_kind', "TEXT NOT NULL DEFAULT 'pc_recap'"],
      ['confidence', "TEXT NOT NULL DEFAULT 'recorded'"],
      ['source_record_id', 'TEXT'],
      ['import_batch_id', 'TEXT'],
    ] as const;
    for (const [name, definition] of additions) {
      if (!columns.has(name)) this.database.exec(`ALTER TABLE activity_sessions ADD COLUMN ${name} ${definition}`);
    }
  }

  private ensureRecoveredEventProvenanceColumns() {
    const columns = new Set((this.database.prepare('PRAGMA table_info(recovered_events)').all() as Array<{ name: string }>)
      .map((column) => column.name));
    const additions = [
      ['provenance', "TEXT NOT NULL DEFAULT 'recovered'"],
      ['evidence_type', 'TEXT'],
      ['date_precision', "TEXT NOT NULL DEFAULT 'approximate'"],
      ['duration_known', 'INTEGER NOT NULL DEFAULT 0'],
      ['playtime_seconds', 'INTEGER'],
      ['represents', 'TEXT'],
    ] as const;
    for (const [name, definition] of additions) {
      if (!columns.has(name)) this.database.exec(`ALTER TABLE recovered_events ADD COLUMN ${name} ${definition}`);
    }
  }

  private ensureCheckpointSessionIdColumn() {
    const columns = new Set((this.database.prepare('PRAGMA table_info(open_session_checkpoints)').all() as Array<{ name: string }>)
      .map((column) => column.name));
    if (!columns.has('session_id')) this.database.exec('ALTER TABLE open_session_checkpoints ADD COLUMN session_id TEXT');
  }

  private migrateCalendarRollups() {
    const version = 2;
    const migrated = this.database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
    if (migrated) return;
    this.rebuildRollups();
    this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
      .run(version, new Date().toISOString());
  }

  private addRollupAllocation(appId: string, allocation: { startedAt: string; endedAt: string; seconds: number }) {
    const day = localDayKey(allocation.startedAt);
    this.database.prepare(`
      INSERT INTO daily_app_rollups(day, app_id, duration_seconds, session_count, first_activity, last_activity)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(day, app_id) DO UPDATE SET
        duration_seconds = daily_app_rollups.duration_seconds + excluded.duration_seconds,
        session_count = daily_app_rollups.session_count + 1,
        first_activity = MIN(daily_app_rollups.first_activity, excluded.first_activity),
        last_activity = MAX(daily_app_rollups.last_activity, excluded.last_activity)
    `).run(day, appId, allocation.seconds, allocation.startedAt, allocation.endedAt);
    this.database.prepare(`
      INSERT INTO daily_rollups(day, duration_seconds, session_count, first_activity, last_activity)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(day) DO UPDATE SET
        duration_seconds = daily_rollups.duration_seconds + excluded.duration_seconds,
        session_count = daily_rollups.session_count + 1,
        first_activity = MIN(daily_rollups.first_activity, excluded.first_activity),
        last_activity = MAX(daily_rollups.last_activity, excluded.last_activity)
    `).run(day, allocation.seconds, allocation.startedAt, allocation.endedAt);
  }

  exportSnapshot(): BackupSnapshot {
    return {
      apps: this.listApps(),
      sessions: this.getAllSessions(),
      categories: this.getCategories(),
      settings: this.getSettings(),
      recoveredEvents: this.listRecoveredEvents(),
      memoryPins: this.listMemoryPins(),
      activityStates: this.getAllActivityStateIntervals(),
      performanceSamples: this.getAllPerformanceSamples(),
      performanceRollups: this.getAllPerformanceRollups(),
      appPerformanceRollups: this.getAllAppPerformanceRollups(),
    };
  }

  importSnapshot(snapshot: BackupSnapshot) {
    let importedSessions = 0;
    const archivedSessions = snapshot.sessions ?? [];
    const realSessions = archivedSessions.filter((session) => !(session as ActivitySession & { isDemo?: boolean }).isDemo);
    let skippedSessions = archivedSessions.length - realSessions.length;
    const apps = new Map((snapshot.apps ?? [])
      .filter((app) => !(app as TrackedApp & { isDemo?: boolean }).isDemo)
      .map((app) => [app.id, app]));
    const recoveredEvents = snapshot.recoveredEvents ?? [];
    let importedRecoveredEvents = 0;
    let importedMemoryPins = 0;
    for (const pin of snapshot.memoryPins ?? []) validateMemoryPin(pin);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const category of snapshot.categories ?? []) this.upsertCategory(category);
      for (const session of realSessions) {
        if (this.insertSessionWithinTransaction(session, apps.get(session.appId))) importedSessions += 1;
        else skippedSessions += 1;
      }
      if (recoveredEvents.length) {
        const fingerprint = createHash('sha256').update(recoveredEvents.map((event) => event.id).sort().join('\u0000')).digest('hex');
        const batchId = `backup-batch-${fingerprint.slice(0, 32)}`;
        importedRecoveredEvents = this.commitHistoryBatchWithinTransaction({
          batch: {
            id: batchId,
            sourceKind: 'pc_recap_backup',
            sourceFingerprint: `backup-events:${fingerprint}`,
            importedAt: new Date().toISOString(),
            exactSessionCount: 0,
            recoveredEventCount: recoveredEvents.length,
          },
          sessions: [],
          recoveredEvents: recoveredEvents.map((event) => ({ ...event, importBatchId: batchId })),
        }).recoveredEvents;
      }
      for (const pin of snapshot.memoryPins ?? []) {
        this.saveMemoryPin(pin);
        importedMemoryPins += 1;
      }
      for (const interval of snapshot.activityStates ?? []) this.insertActivityStateInterval(interval);
      const rebuildPerformanceRollups = !(snapshot.performanceRollups?.length || snapshot.appPerformanceRollups?.length);
      for (const sample of snapshot.performanceSamples ?? []) {
        this.insertPerformanceSampleWithinTransaction(sample, rebuildPerformanceRollups);
      }
      for (const rollup of snapshot.performanceRollups ?? []) this.insertArchivedPerformanceRollup(rollup);
      for (const rollup of snapshot.appPerformanceRollups ?? []) this.insertArchivedAppPerformanceRollup(rollup);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return { importedSessions, skippedSessions, importedRecoveredEvents, importedMemoryPins };
  }
}

function stableCheckpointSessionId(machineId: string, startedAt: string) {
  return `session-${createHash('sha256').update(`${machineId}:${startedAt}`).digest('hex').slice(0, 32)}`;
}

function validateMemoryPin(pin: MemoryPin) {
  if (!pin.id?.trim() || pin.id.length > 200 || !pin.title?.trim() || pin.title.trim().length > 80 || pin.note.length > 500) {
    throw new Error('Memory Pin text is invalid.');
  }
  const start = Date.parse(pin.start);
  const end = Date.parse(pin.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !/^#[0-9a-f]{6}$/i.test(pin.color)) {
    throw new Error('Memory Pin range is invalid.');
  }
}

function validatePerformanceRollup(rollup: PerformanceRollup) {
  if (
    !['hour', 'day'].includes(rollup.kind)
    || !Number.isFinite(Date.parse(rollup.bucketStart))
    || !rollup.machineId?.trim() || rollup.machineId.length > 200
    || !validNonNegativeCounts([
      rollup.sampleCount, rollup.cpuSampleCount, rollup.memorySampleCount, rollup.batteryMetricCount,
      rollup.batterySampleCount, rollup.acSampleCount, rollup.chargingSampleCount, rollup.highLoadSeconds,
    ])
    || !validOptionalMetrics([
      rollup.cpuAverage, rollup.cpuMinimum, rollup.cpuMaximum,
      rollup.memoryPercentAverage, rollup.memoryPercentMinimum, rollup.memoryPercentMaximum,
      rollup.batteryAverage, rollup.batteryMinimum, rollup.batteryMaximum,
    ], 100)
    || !validOptionalMetrics([rollup.memoryUsedAverageBytes, rollup.memoryUsedMaximumBytes], Number.MAX_SAFE_INTEGER)
    || (rollup.peakCpuAt !== undefined && !Number.isFinite(Date.parse(rollup.peakCpuAt)))
  ) throw new Error('Performance rollup is invalid.');
}

function validateAppPerformanceRollup(rollup: AppPerformanceRollup) {
  if (
    !Number.isFinite(Date.parse(rollup.day))
    || !rollup.machineId?.trim() || rollup.machineId.length > 200
    || !rollup.appId?.trim() || rollup.appId.length > 200
    || !rollup.appName?.trim() || rollup.appName.length > 500
    || !validNonNegativeCounts([
      rollup.sampleCount, rollup.cpuSampleCount, rollup.memorySampleCount, rollup.highLoadSeconds,
    ])
    || !validOptionalMetrics([
      rollup.cpuAverage, rollup.cpuMaximum, rollup.memoryPercentAverage, rollup.memoryPercentMaximum,
    ], 100)
  ) throw new Error('Application performance rollup is invalid.');
}

function validNonNegativeCounts(values: number[]) {
  return values.every((value) => Number.isFinite(value) && value >= 0 && Number.isInteger(value));
}

function validOptionalMetrics(values: Array<number | undefined>, maximum: number) {
  return values.every((value) => value === undefined || (Number.isFinite(value) && value >= 0 && value <= maximum));
}

function normalizePerformanceSample(sample: SystemPerformanceSample) {
  const sampledAt = Date.parse(sample.sampledAt);
  const id = sample.id?.trim();
  const machineId = sample.machineId?.trim() || 'local';
  const intervalSeconds = sample.intervalSeconds ?? 10;
  if (
    !id || id.length > 200 || !Number.isFinite(sampledAt)
    || machineId.length > 200
    || !Number.isFinite(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 3_600
  ) throw new Error('Performance sample identity is invalid.');
  return {
    ...sample,
    id,
    sampledAt: new Date(sampledAt).toISOString(),
    machineId,
    intervalSeconds: Math.round(intervalSeconds),
    cpuPercent: optionalPercent(sample.cpuPercent, 'CPU'),
    memoryPercent: optionalPercent(sample.memoryPercent, 'memory'),
    batteryPercent: optionalPercent(sample.batteryPercent, 'battery'),
    gpuPercent: optionalPercent(sample.gpuPercent, 'GPU'),
    memoryUsedBytes: optionalCount(sample.memoryUsedBytes, 'memory used'),
    memoryAvailableBytes: optionalCount(sample.memoryAvailableBytes, 'memory available'),
    memoryTotalBytes: optionalCount(sample.memoryTotalBytes, 'memory total'),
    uptimeSeconds: optionalCount(sample.uptimeSeconds, 'uptime'),
    gpuMemoryUsedBytes: optionalCount(sample.gpuMemoryUsedBytes, 'GPU memory'),
    diskReadBytesPerSecond: optionalCount(sample.diskReadBytesPerSecond, 'disk read'),
    diskWriteBytesPerSecond: optionalCount(sample.diskWriteBytesPerSecond, 'disk write'),
    foregroundAppId: sample.foregroundAppId?.trim().slice(0, 200) || undefined,
    foregroundAppName: sample.foregroundAppName?.trim().slice(0, 200) || undefined,
  };
}

function optionalPercent(value: number | undefined, label: string) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label} percentage is invalid.`);
  return roundMetric(value);
}

function optionalCount(value: number | undefined, label: string) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error(`${label} metric is invalid.`);
  return Math.round(value);
}

function validRange(start: string, end: string) {
  const rangeStart = Date.parse(start);
  const rangeEnd = Date.parse(end);
  return Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && rangeEnd > rangeStart;
}

function performanceBucketStart(sampledAt: string, kind: 'hour' | 'day') {
  const date = new Date(sampledAt);
  return new Date(
    date.getFullYear(), date.getMonth(), date.getDate(), kind === 'hour' ? date.getHours() : 0,
  ).toISOString();
}

function metricMin(previous: number | null | undefined, next: number | undefined) {
  if (next === undefined) return previous ?? null;
  return previous == null ? next : Math.min(previous, next);
}

function metricMax(previous: number | null | undefined, next: number | undefined) {
  if (next === undefined) return previous ?? null;
  return previous == null ? next : Math.max(previous, next);
}

function roundMetric(value: number) {
  return Number(value.toFixed(1));
}
