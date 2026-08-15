import Database from 'better-sqlite3';
import type {
  ActivitySession,
  ApplicationAlias,
  Category,
  OpenSessionCheckpoint,
  TimelineBucket,
  TrackedApp,
  TrackingSettings,
} from '../shared/types.js';
import { DEFAULT_SETTINGS } from '../shared/types.js';
import { clipSessionToRange, localDayKey, localMonthKey, localYearKey, splitSessionByLocalDay } from '../shared/calendar.js';

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

export interface BackupSnapshot {
  apps: TrackedApp[];
  sessions: ActivitySession[];
  categories: Category[];
  settings: TrackingSettings;
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

export class ActivityRepository {
  private readonly database: Database.Database;

  constructor(location: string) {
    this.database = new Database(location);
    this.migrate();
  }

  private migrate() {
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
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
        detail TEXT,
        import_batch_id TEXT REFERENCES import_batches(id)
      );
      CREATE INDEX IF NOT EXISTS idx_recovered_events_occurred ON recovered_events(occurred_at);
    `);
    this.ensureSessionProvenanceColumns();
    this.removeLegacySyntheticHistory();
    const insertCategory = this.database.prepare(`
      INSERT OR IGNORE INTO categories(id, name, color, icon, is_default) VALUES (?, ?, ?, ?, ?)
    `);
    for (const category of DEFAULT_CATEGORIES) {
      insertCategory.run(category.id, category.name, category.color, category.icon, category.isDefault ? 1 : 0);
    }
    this.migrateCalendarRollups();
  }

  close() {
    this.database.close();
  }

  insertSession(session: ActivitySession, app?: Partial<TrackedApp>): boolean {
    const executable = app?.executable ?? `${session.appName.toLowerCase().replaceAll(' ', '-')}.exe`;
    const color = app?.color ?? DEFAULT_CATEGORIES.find((item) => item.id === session.categoryId)?.color ?? '#7D8493';
    const firstSeen = app?.firstSeenAt ?? session.startedAt;
    const lastSeen = app?.lastSeenAt ?? session.endedAt;
    this.database.exec('BEGIN IMMEDIATE');
    try {
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
      if (Number(inserted.changes) === 0) {
        this.database.exec('ROLLBACK');
        return false;
      }
      for (const allocation of splitSessionByLocalDay(normalizedSession)) {
        this.addRollupAllocation(session.appId, allocation);
      }
      this.database.exec('COMMIT');
      return true;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
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

  saveOpenSessionCheckpoint(checkpoint: OpenSessionCheckpoint) {
    this.database.prepare(`
      INSERT INTO open_session_checkpoints(
        machine_id, app_id, app_name, executable, path, category_id, started_at,
        last_sample_at, checkpointed_at, window_title
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(machine_id) DO UPDATE SET
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
      checkpoint.machineId, checkpoint.appId, checkpoint.appName, checkpoint.executable,
      checkpoint.path ?? null, checkpoint.categoryId, checkpoint.startedAt, checkpoint.lastSampleAt,
      checkpoint.checkpointedAt, checkpoint.windowTitle ?? null,
    );
  }

  getOpenSessionCheckpoint(machineId: string): OpenSessionCheckpoint | undefined {
    const row = this.database.prepare(`
      SELECT machine_id, app_id, app_name, executable, path, category_id, started_at,
             last_sample_at, checkpointed_at, window_title
      FROM open_session_checkpoints WHERE machine_id = ?
    `).get(machineId) as {
      machine_id: string; app_id: string; app_name: string; executable: string; path: string | null;
      category_id: string; started_at: string; last_sample_at: string; checkpointed_at: string;
      window_title: string | null;
    } | undefined;
    if (!row) return undefined;
    return {
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
    const next: TrackingSettings = {
      ...current,
      ...patch,
      sampleIntervalSeconds: Math.min(60, Math.max(5, patch.sampleIntervalSeconds ?? current.sampleIntervalSeconds)),
      idleThresholdSeconds: Math.min(3_600, Math.max(60, patch.idleThresholdSeconds ?? current.idleThresholdSeconds)),
      excludedExecutables: [...new Set(patch.excludedExecutables ?? current.excludedExecutables)].map((item) => item.toLowerCase()),
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
    this.database.exec('BEGIN IMMEDIATE');
    try {
      if (sessionsMarked) this.database.exec(`DELETE FROM activity_sessions WHERE ${legacyColumn} = 1;`);
      this.rebuildRollups();
      if (appsMarked) this.database.exec(`DELETE FROM applications WHERE ${legacyColumn} = 1;`);
      if (sessionsMarked) this.database.exec(`ALTER TABLE activity_sessions DROP COLUMN ${legacyColumn};`);
      if (appsMarked) this.database.exec(`ALTER TABLE applications DROP COLUMN ${legacyColumn};`);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  deleteAllHistory() {
    this.database.exec(`
      DELETE FROM daily_app_rollups;
      DELETE FROM daily_rollups;
      DELETE FROM activity_sessions;
      DELETE FROM applications;
      DELETE FROM achievements;
    `);
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

  private migrateCalendarRollups() {
    const version = 2;
    const migrated = this.database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
    if (migrated) return;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.rebuildRollups();
      this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(version, new Date().toISOString());
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
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
    };
  }

  importSnapshot(snapshot: BackupSnapshot) {
    for (const category of snapshot.categories ?? []) this.upsertCategory(category);
    let importedSessions = 0;
    const archivedSessions = snapshot.sessions ?? [];
    const realSessions = archivedSessions.filter((session) => !(session as ActivitySession & { isDemo?: boolean }).isDemo);
    let skippedSessions = archivedSessions.length - realSessions.length;
    const apps = new Map((snapshot.apps ?? [])
      .filter((app) => !(app as TrackedApp & { isDemo?: boolean }).isDemo)
      .map((app) => [app.id, app]));
    for (const session of realSessions) {
      if (this.insertSession(session, apps.get(session.appId))) importedSessions += 1;
      else skippedSessions += 1;
    }
    return { importedSessions, skippedSessions };
  }
}
