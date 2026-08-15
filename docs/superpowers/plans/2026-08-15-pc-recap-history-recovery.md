# PC Recap Historical Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import exact history from supported trackers and recover clearly labeled pre-install Windows clues without fabricating usage time.

**Architecture:** Source adapters parse into a shared preview model, validation and deduplication occur before a single transactional commit, and non-duration Windows evidence is stored separately from activity sessions. The renderer never directly reads arbitrary files.

**Tech Stack:** Electron, TypeScript, better-sqlite3, native Windows registry/PowerShell readers, Vitest

**Spec:** `docs/superpowers/specs/2026-08-15-pc-recap-major-buff-design.md`

## Global Constraints

- Recovery is opt-in and user-initiated.
- Recovered clues never contribute to usage duration.
- Repeated imports are idempotent.
- Failed imports commit nothing.
- Browser history remains separately consented and disabled by default.

---

### Task 1: Shared importer contract, validation, preview, and transaction

**Files:**
- Create: `src/main/importers/types.ts`
- Create: `src/main/importers/validate.ts`
- Create: `src/main/importers/validate.test.ts`
- Create: `src/main/importers/import-service.ts`
- Create: `src/main/importers/import-service.test.ts`
- Modify: `src/main/database.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: `HistoryImporter`, `ImportPreview`, `ImportedExactSession`, `RecoveredEventInput`, `HistoryImportService.preview`, and `HistoryImportService.commit`.

- [ ] **Step 1: Write failing validation and idempotency tests**

```ts
expect(validateImportedSession({ startedAt, endedAt, durationSeconds: -1 })).toEqual({ ok: false, reason: 'invalid-duration' });
expect(await service.commit(preview)).toMatchObject({ importedSessions: 2, duplicates: 0 });
expect(await service.commit(preview)).toMatchObject({ importedSessions: 0, duplicates: 2 });
```

- [ ] **Step 2: Run importer foundation tests and verify failure**

Run: `npm run test:run -- src/main/importers/validate.test.ts src/main/importers/import-service.test.ts`

Expected: FAIL because the importer service does not exist.

- [ ] **Step 3: Implement the typed preview and transactional commit**

```ts
export interface HistoryImporter {
  kind: string;
  canRead(path: string): Promise<boolean>;
  preview(path: string): Promise<ImportPreview>;
}
```

Fingerprint source files and source record IDs, enforce size/date/count bounds, normalize application identities, and commit sessions, clues, and batch metadata in one transaction.

- [ ] **Step 4: Run importer and database tests**

Run: `npm run test:run -- src/main/importers src/main/database.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the importer foundation**

```bash
git add src/main/importers src/main/database.ts src/shared/types.ts
git commit -m "feat: add transactional history import framework"
```

### Task 2: Exact-source adapters

**Files:**
- Create: `src/main/importers/activitywatch.ts`
- Create: `src/main/importers/activitywatch.test.ts`
- Create: `src/main/importers/delimited.ts`
- Create: `src/main/importers/delimited.test.ts`
- Create: `src/main/importers/manictime.ts`
- Create: `src/main/importers/rescuetime.ts`
- Create: `src/main/importers/wakatime.ts`
- Modify: `src/main/backup.ts`
- Modify: `src/main/backup.test.ts`

**Interfaces:**
- Consumes: `HistoryImporter` and preview types from Task 1.
- Produces: adapters for PC Recap, ActivityWatch JSON, ManicTime exports/database copies, RescueTime CSV, and WakaTime exports.

- [ ] **Step 1: Add sanitized source fixtures and failing parser tests**

```ts
expect((await activityWatch.preview(fixture)).exactSessions[0]).toMatchObject({
  appName: 'Visual Studio Code', durationSeconds: 120, sourceKind: 'activitywatch',
});
expect(parseDelimited('Date,Time Spent\n2026-08-01,60')).toHaveLength(1);
```

- [ ] **Step 2: Run adapter tests and verify failure**

Run: `npm run test:run -- src/main/importers/activitywatch.test.ts src/main/importers/delimited.test.ts src/main/backup.test.ts`

Expected: FAIL because adapters are absent.

- [ ] **Step 3: Implement bounded streaming parsers**

Parse ActivityWatch `currentwindow` events, supported delimited headers, and read-only ManicTime structures. Only records with concrete intervals become exact sessions. WakaTime/context records overlapping foreground sessions become contextual recovered events instead of duplicate duration.

- [ ] **Step 4: Run all adapter tests**

Run: `npm run test:run -- src/main/importers src/main/backup.test.ts`

Expected: PASS with malformed, oversized, duplicate, and overlap cases covered.

- [ ] **Step 5: Commit exact adapters**

```bash
git add src/main/importers src/main/backup.ts src/main/backup.test.ts
git commit -m "feat: import history from established trackers"
```

### Task 3: Windows recovered-clue scanner

**Files:**
- Create: `src/main/recovery/windows-recovery.ts`
- Create: `src/main/recovery/windows-recovery.test.ts`
- Create: `src/main/recovery/user-assist.ts`
- Create: `src/main/recovery/installed-apps.ts`
- Create: `src/main/recovery/prefetch.ts`
- Create: `src/main/recovery/activity-history.ts`
- Modify: `src/main/importers/import-service.ts`

**Interfaces:**
- Produces: `scanWindowsHistory(options): Promise<RecoveryScanResult>` containing clues, source availability, and warnings.

- [ ] **Step 1: Write failing registry and provenance tests**

```ts
expect(decodeUserAssistName('P:\\Hfref\\Pbqr.rkr')).toBe('C:\\Users\\Code.exe');
expect(result.events[0]).toMatchObject({ eventType: 'launched', sourceKind: 'windows_userassist' });
expect(result.events[0]).not.toHaveProperty('durationSeconds');
```

- [ ] **Step 2: Run recovery tests and verify failure**

Run: `npm run test:run -- src/main/recovery`

Expected: FAIL because recovery readers do not exist.

- [ ] **Step 3: Implement non-elevated best-effort readers**

Use bounded PowerShell/registry reads with fixed scripts and no user-controlled command interpolation. Parse installed-app dates, UserAssist evidence, readable Prefetch metadata, and legacy Activity History if present. Each event states its source, confidence, and limitation.

- [ ] **Step 4: Run recovery and security tests**

Run: `npm run test:run -- src/main/recovery src/main/ipc-security.test.ts`

Expected: PASS on available, unavailable, malformed, and access-denied sources.

- [ ] **Step 5: Commit Windows recovery**

```bash
git add src/main/recovery src/main/importers/import-service.ts
git commit -m "feat: recover pre-install Windows history clues"
```

### Task 4: Recovery IPC and preview UI

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/ipc.ts`
- Create: `src/renderer/pages/HistoryRecovery.tsx`
- Create: `src/renderer/pages/HistoryRecovery.test.tsx`
- Modify: `src/renderer/pages/Settings.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/routes.ts`
- Modify: `src/renderer/styles/utility.css`

**Interfaces:**
- Produces: secure `history:preview-file`, `history:scan-windows`, `history:commit-import`, and `history:cancel-preview` flows.

- [ ] **Step 1: Write failing preview and consent tests**

```tsx
expect(screen.getByRole('heading', { name: 'Recover older history' })).toBeVisible();
expect(screen.getByText('Recovered clues do not add usage time.')).toBeVisible();
expect(screen.getByRole('button', { name: 'Import 24 exact sessions' })).toBeEnabled();
```

- [ ] **Step 2: Run UI and IPC tests and verify failure**

Run: `npm run test:run -- src/renderer/pages/HistoryRecovery.test.tsx src/main/ipc-security.test.ts`

Expected: FAIL because the route and channels do not exist.

- [ ] **Step 3: Implement source selection, preview, confirmation, and results**

Show exact sessions and clues separately, source availability, date coverage, duplicates, warnings, and explicit browser-history consent. Keep previews in main-process memory with opaque IDs so the renderer cannot submit arbitrary paths or records.

- [ ] **Step 4: Run importer, renderer, and IPC suites**

Run: `npm run test:run -- src/main/importers src/main/recovery src/renderer/pages/HistoryRecovery.test.tsx src/main/ipc-security.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Recovery UI**

```bash
git add src/shared/ipc.ts src/main/preload.ts src/main/ipc.ts src/renderer/pages/HistoryRecovery.tsx src/renderer/pages/HistoryRecovery.test.tsx src/renderer/pages/Settings.tsx src/renderer/App.tsx src/renderer/routes.ts src/renderer/styles/utility.css
git commit -m "feat: add historical recovery experience"
```

