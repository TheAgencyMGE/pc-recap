# PC Recap Tracking Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PC Recap’s Windows activity collection crash-resilient, idle-correct, live in analytics, and free of self/system noise.

**Architecture:** Add explicit provenance and checkpoint persistence to SQLite, split tracking math and application identity into focused modules, and expose a live session snapshot to analytics without finalizing synthetic rows. Existing raw sessions remain the source of truth.

**Tech Stack:** Electron 43, TypeScript 5.7, better-sqlite3, Vitest

**Spec:** `docs/superpowers/specs/2026-08-15-pc-recap-major-buff-design.md`

## Global Constraints

- Windows-first; preserve secure context-isolated IPC.
- No telemetry, account, cloud dependency, screenshots, keystrokes, clipboard capture, or LLM API.
- Recovered clues never contribute to duration totals.
- Existing real history and totals must survive migration unchanged.
- Runtime screens must never insert demo activity.

---

### Task 1: Provenance and checkpoint schema

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/database.ts`
- Modify: `src/main/database.test.ts`
- Modify: `src/main/data-migration.ts`
- Modify: `src/main/data-migration.test.ts`

**Interfaces:**
- Produces: `SessionSourceKind`, `SessionConfidence`, `OpenSessionCheckpoint`, `RecoveredEvent`, `ImportBatch`, `ApplicationAlias`, and repository checkpoint/provenance methods.

- [ ] **Step 1: Write failing schema and checkpoint tests**

```ts
it('round-trips an open session checkpoint without changing finalized totals', () => {
  repository.saveOpenSessionCheckpoint({
    machineId: 'pc', appId: 'code', appName: 'Visual Studio Code', executable: 'Code.exe',
    categoryId: 'coding', startedAt: '2026-08-15T10:00:00.000Z',
    lastSampleAt: '2026-08-15T10:00:30.000Z', checkpointedAt: '2026-08-15T10:00:30.000Z',
  });
  expect(repository.getOpenSessionCheckpoint('pc')?.appId).toBe('code');
  expect(repository.getAllSessions()).toHaveLength(0);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm run test:run -- src/main/database.test.ts src/main/data-migration.test.ts`

Expected: FAIL because checkpoint types and methods do not exist.

- [ ] **Step 3: Add schema types and transactional migration**

```ts
export type SessionSourceKind = 'pc_recap' | 'pc_recap_backup' | 'activitywatch' | 'manictime' | 'rescuetime' | 'wakatime';
export type SessionConfidence = 'recorded' | 'imported_exact';

export interface OpenSessionCheckpoint {
  machineId: string;
  appId: string;
  appName: string;
  executable: string;
  path?: string;
  categoryId: string;
  startedAt: string;
  lastSampleAt: string;
  checkpointedAt: string;
  windowTitle?: string;
}
```

Create additive columns and the tables named in the design spec. Add repository methods `saveOpenSessionCheckpoint`, `getOpenSessionCheckpoint`, `clearOpenSessionCheckpoint`, `upsertApplicationAlias`, and `resolveApplicationAlias`. Create a pre-migration SQLite backup before the first schema-changing migration.

- [ ] **Step 4: Run database and migration tests**

Run: `npm run test:run -- src/main/database.test.ts src/main/data-migration.test.ts`

Expected: PASS, with existing session totals unchanged after migration.

- [ ] **Step 5: Commit the schema foundation**

```bash
git add src/shared/types.ts src/main/database.ts src/main/database.test.ts src/main/data-migration.ts src/main/data-migration.test.ts
git commit -m "feat: add activity provenance and checkpoints"
```

### Task 2: Correct tracking math and crash recovery

**Files:**
- Create: `src/main/tracking/session-math.ts`
- Create: `src/main/tracking/session-math.test.ts`
- Modify: `src/main/tracker.ts`
- Modify: `src/main/tracker.test.ts`

**Interfaces:**
- Consumes: repository checkpoint methods from Task 1.
- Produces: `idleEndTime(now, idleSeconds, startedAt)`, `transitionMidpoint(lastSampleAt, sampledAt)`, `ActivityTracker.getLiveSession()`, and startup checkpoint recovery.

- [ ] **Step 1: Write failing tracking-math tests**

```ts
expect(idleEndTime(new Date('2026-08-15T10:05:10Z'), 310, new Date('2026-08-15T09:00:00Z')).toISOString())
  .toBe('2026-08-15T10:00:00.000Z');
expect(transitionMidpoint(new Date('2026-08-15T10:00:00Z'), new Date('2026-08-15T10:00:10Z')).toISOString())
  .toBe('2026-08-15T10:00:05.000Z');
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- src/main/tracking/session-math.test.ts src/main/tracker.test.ts`

Expected: FAIL because the new helpers and live-session API are absent.

- [ ] **Step 3: Implement session math, checkpoints, and live snapshots**

```ts
export interface LiveActivitySession extends ActivitySession {
  provisional: true;
}

getLiveSession(at = this.now()): LiveActivitySession | undefined {
  if (!this.openSession) return undefined;
  return toActivitySession(this.openSession, at, this.machineId, true);
}
```

Checkpoint at most every 30 seconds, recover stale checkpoints only through their `lastSampleAt`, clear checkpoints after finalization, trigger an immediate sample on resume, and restart the timer if the interval changes.

- [ ] **Step 4: Test idle, switch, crash, resume, and deduplication behavior**

Run: `npm run test:run -- src/main/tracking/session-math.test.ts src/main/tracker.test.ts src/main/database.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit tracking accuracy**

```bash
git add src/main/tracking src/main/tracker.ts src/main/tracker.test.ts
git commit -m "fix: make foreground tracking crash resilient"
```

### Task 3: Canonical application identity and default ignore rules

**Files:**
- Create: `src/main/tracking/app-identity.ts`
- Create: `src/main/tracking/app-identity.test.ts`
- Modify: `src/main/activity-source.ts`
- Modify: `src/main/tracker.ts`
- Modify: `src/main/database.ts`

**Interfaces:**
- Produces: `normalizeApplication(info): ResolvedApplication`, `isDefaultIgnoredApplication(info): boolean`, and canonical alias persistence.

- [ ] **Step 1: Write failing identity tests**

```ts
expect(isDefaultIgnoredApplication({ name: 'SearchHost', executable: 'SearchHost.exe' })).toBe(true);
expect(isDefaultIgnoredApplication({ name: 'File Explorer', executable: 'explorer.exe' })).toBe(false);
expect(normalizeApplication({ name: 'PC Wrapped', executable: 'PC Wrapped.exe' }).canonicalName).toBe('PC Recap');
```

- [ ] **Step 2: Run identity tests and verify failure**

Run: `npm run test:run -- src/main/tracking/app-identity.test.ts`

Expected: FAIL because the identity module does not exist.

- [ ] **Step 3: Implement stable identities and hosted-app fallback**

```ts
export interface ResolvedApplication extends ActiveWindowInfo {
  canonicalId: string;
  canonicalName: string;
  ignoredByDefault: boolean;
  identitySource: 'process' | 'package' | 'alias' | 'fallback';
}
```

Ignore PC Recap itself, the development Electron host, and shell-only executables from the specification. Preserve File Explorer. Attempt package/child-process resolution for hosted windows, then use a friendly fallback.

- [ ] **Step 4: Run tracker and identity suites**

Run: `npm run test:run -- src/main/tracking/app-identity.test.ts src/main/tracker.test.ts src/main/database.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit identity cleanup**

```bash
git add src/main/tracking/app-identity.ts src/main/tracking/app-identity.test.ts src/main/activity-source.ts src/main/tracker.ts src/main/database.ts
git commit -m "feat: normalize tracked application identity"
```

### Task 4: Merge live activity into analytics and correct tracking controls

**Files:**
- Modify: `src/main/analytics-service.ts`
- Modify: `src/main/analytics-service.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/MinimalHeader.tsx`
- Modify: `src/renderer/App.test.tsx`

**Interfaces:**
- Consumes: `ActivityTracker.getLiveSession()`.
- Produces: summaries that include the current provisional session exactly once and tracking controls based on `TrackingSettings.trackingEnabled`.

- [ ] **Step 1: Write failing live-summary and idle-control tests**

```ts
expect(service.getSummary('today').totalSeconds).toBe(120);
expect(screen.getByRole('button', { name: 'Pause tracking' })).toBeEnabled();
```

The service fixture contains a 120-second live session and no finalized rows; the UI fixture reports `{ state: 'idle' }` while tracking remains enabled.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- src/main/analytics-service.test.ts src/renderer/App.test.tsx`

Expected: FAIL because live sessions are not merged and idle status renders Resume.

- [ ] **Step 3: Implement live merge and enabled-state controls**

Merge the provisional session before calling shared analytics, deduplicate by session ID, and clip it to the selected range. Pass `settings.trackingEnabled` into the header separately from status detail.

- [ ] **Step 4: Run tracking, analytics, and renderer suites**

Run: `npm run test:run -- src/main/tracker.test.ts src/main/analytics-service.test.ts src/renderer/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the integrated tracking foundation**

```bash
git add src/main/analytics-service.ts src/main/analytics-service.test.ts src/main/ipc.ts src/renderer/App.tsx src/renderer/components/MinimalHeader.tsx src/renderer/App.test.tsx
git commit -m "feat: show live activity in recaps"
```

