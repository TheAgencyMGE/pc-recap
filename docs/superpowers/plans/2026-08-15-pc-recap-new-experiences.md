# PC Recap New Experiences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Day Replay, historical/custom Recap Studio, and local Memory Pins, then verify and launch PC Recap 1.1.0.

**Architecture:** Add day-level query models and pin persistence behind secure IPC, reuse the deterministic recap-scene system with a period selection model, and integrate both into the archive and backup format. Finish with full Electron and installer verification.

**Tech Stack:** Electron, React, TypeScript, Framer Motion, better-sqlite3, Vitest, electron-builder

**Spec:** `docs/superpowers/specs/2026-08-15-pc-recap-major-buff-design.md`

## Global Constraints

- Stories adapt to available real data and never generate fake scenes.
- Current periods use “so far”; completed periods use retrospective tense.
- Memory Pins remain local and are excluded from shares unless explicitly included.
- Day Replay is accessible by keyboard and opens from timeline day cards.
- Final delivery must build, package, and launch successfully on Windows.

---

### Task 1: Day Replay domain query and secure IPC

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/analytics-service.ts`
- Modify: `src/main/analytics-service.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/preload.ts`

**Interfaces:**
- Produces: `DayReplayData`, `DayReplaySegment`, and `PCRecapAPI.getDayReplay(day: string)`.

- [ ] **Step 1: Write failing day-replay query tests**

```ts
expect(service.getDayReplay('2026-08-15')).toMatchObject({
  day: '2026-08-15', firstActivity: '2026-08-15T09:00:00.000Z', busiestHour: 10,
});
expect(result.segments.map(segment => segment.appName)).toEqual(['Chrome', 'Code']);
```

- [ ] **Step 2: Run the analytics test and verify failure**

Run: `npm run test:run -- src/main/analytics-service.test.ts`

Expected: FAIL because `getDayReplay` does not exist.

- [ ] **Step 3: Implement clipped ordered segments and summary facts**

```ts
export interface DayReplaySegment {
  id: string;
  appId: string;
  appName: string;
  categoryId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  color: string;
}
```

Clip sessions at local-day boundaries, merge the live session, and calculate first/last activity, longest segment, busiest hour, app switches, idle gaps, relationships, pins, and recovered clues.

- [ ] **Step 4: Run analytics and IPC-security tests**

Run: `npm run test:run -- src/main/analytics-service.test.ts src/main/ipc-security.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Day Replay data**

```bash
git add src/shared/types.ts src/shared/ipc.ts src/main/analytics-service.ts src/main/analytics-service.test.ts src/main/ipc.ts src/main/preload.ts
git commit -m "feat: add day replay analytics"
```

### Task 2: Interactive Day Replay page and timeline navigation

**Files:**
- Create: `src/renderer/pages/replay/DayReplay.tsx`
- Create: `src/renderer/pages/replay/DayReplay.test.tsx`
- Create: `src/renderer/pages/replay/ReplayRibbon.tsx`
- Modify: `src/renderer/pages/Timeline.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/routes.ts`
- Create: `src/renderer/styles/replay.css`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `PCRecapAPI.getDayReplay`.
- Produces: route `day:YYYY-MM-DD`, focusable segments, hour/app filters, and timeline day navigation.

- [ ] **Step 1: Write failing navigation and tooltip tests**

```tsx
expect(screen.getByRole('button', { name: /Chrome, 9:00 AM to 9:30 AM/i })).toBeVisible();
await user.click(screen.getByRole('button', { name: /Chrome/ }));
expect(screen.queryByRole('button', { name: /Code/ })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run page tests and verify failure**

Run: `npm run test:run -- src/renderer/pages/replay/DayReplay.test.tsx`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement ribbon, zoom, filters, facts, and annotations**

Use a horizontal time scale with actual proportional positions, keyboard-focusable segments, a shared tooltip, an hour zoom control, application filters, and distinct recovered-clue/pin markers.

- [ ] **Step 4: Run replay and timeline suites**

Run: `npm run test:run -- src/renderer/pages/replay/DayReplay.test.tsx src/renderer/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Day Replay UI**

```bash
git add src/renderer/pages/replay src/renderer/pages/Timeline.tsx src/renderer/App.tsx src/renderer/routes.ts src/renderer/styles/replay.css src/renderer/styles.css
git commit -m "feat: add interactive day replay"
```

### Task 3: Recap Studio and historical/custom stories

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/periods.ts`
- Create: `src/renderer/pages/recap-studio/RecapStudio.tsx`
- Create: `src/renderer/pages/recap-studio/RecapStudio.test.tsx`
- Modify: `src/renderer/lib/recap-scenes.ts`
- Modify: `src/renderer/lib/recap-scenes.test.ts`
- Modify: `src/renderer/pages/YearlyRecap.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/routes.ts`
- Modify: `src/renderer/styles/recap.css`

**Interfaces:**
- Produces: `RecapSelection`, adaptive story scenes for day/week/month/year/season/decade/custom, and historical year selection.

- [ ] **Step 1: Write failing tense and historical-selection tests**

```tsx
expect(screen.getByRole('button', { name: 'Play 2025 recap' })).toBeEnabled();
expect(buildRecapHeading(currentYearSelection)).toBe('Your 2026 so far.');
expect(buildRecapHeading(completedYearSelection)).toBe('This was your 2025.');
```

- [ ] **Step 2: Run recap tests and verify failure**

Run: `npm run test:run -- src/renderer/pages/recap-studio/RecapStudio.test.tsx src/renderer/lib/recap-scenes.test.ts`

Expected: FAIL because selection and tense helpers are absent.

- [ ] **Step 3: Implement Studio selections and adaptive scenes**

```ts
export interface RecapSelection {
  kind: 'day' | 'week' | 'month' | 'year' | 'season' | 'decade' | 'custom';
  start: string;
  end: string;
  label: string;
  complete: boolean;
}
```

Reuse existing scene rendering while adding rhythm, relationship, lifecycle, recovered clue, and Memory Pin scene eligibility. Never render a scene with missing evidence.

- [ ] **Step 4: Run all recap and share-card tests**

Run: `npm run test:run -- src/renderer/lib/recap-scenes.test.ts src/renderer/YearlyRecap.test.tsx src/renderer/share-card.test.ts src/renderer/pages/recap-studio/RecapStudio.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Recap Studio**

```bash
git add src/shared/types.ts src/shared/periods.ts src/renderer/pages/recap-studio src/renderer/lib/recap-scenes.ts src/renderer/lib/recap-scenes.test.ts src/renderer/pages/YearlyRecap.tsx src/renderer/App.tsx src/renderer/routes.ts src/renderer/styles/recap.css
git commit -m "feat: add Recap Studio"
```

### Task 4: Memory Pins persistence, editing, backup, and story integration

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/database.ts`
- Modify: `src/main/database.test.ts`
- Modify: `src/main/backup.ts`
- Modify: `src/main/backup.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/preload.ts`
- Create: `src/renderer/components/MemoryPinEditor.tsx`
- Create: `src/renderer/components/MemoryPinEditor.test.tsx`
- Modify: `src/renderer/pages/replay/DayReplay.tsx`
- Modify: `src/renderer/pages/recap-studio/RecapStudio.tsx`

**Interfaces:**
- Produces: `listMemoryPins`, `saveMemoryPin`, `deleteMemoryPin`, backup integration, and opt-in story/share inclusion.

- [ ] **Step 1: Write failing CRUD and backup tests**

```ts
expect(repository.saveMemoryPin({ id: 'pin', title: 'Started college', note: 'First day', start: day, end: day })).toMatchObject({ id: 'pin' });
expect(roundTripped.memoryPins).toContainEqual(expect.objectContaining({ title: 'Started college' }));
```

- [ ] **Step 2: Run database, backup, and component tests and verify failure**

Run: `npm run test:run -- src/main/database.test.ts src/main/backup.test.ts src/renderer/components/MemoryPinEditor.test.tsx`

Expected: FAIL because pin APIs are absent.

- [ ] **Step 3: Implement validated local CRUD and explicit sharing**

Validate the 80-character title and 500-character note limits, use secure IPC, include pins in `.pcr` backups, render pins in Day Replay and eligible stories, and default share inclusion to false.

- [ ] **Step 4: Run pin, backup, replay, and recap tests**

Run: `npm run test:run -- src/main/database.test.ts src/main/backup.test.ts src/renderer/components/MemoryPinEditor.test.tsx src/renderer/pages/replay/DayReplay.test.tsx src/renderer/pages/recap-studio/RecapStudio.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Memory Pins**

```bash
git add src/shared/types.ts src/shared/ipc.ts src/main/database.ts src/main/database.test.ts src/main/backup.ts src/main/backup.test.ts src/main/ipc.ts src/main/preload.ts src/renderer/components/MemoryPinEditor.tsx src/renderer/components/MemoryPinEditor.test.tsx src/renderer/pages/replay/DayReplay.tsx src/renderer/pages/recap-studio/RecapStudio.tsx
git commit -m "feat: add local Memory Pins"
```

### Task 5: Version, full verification, installer, and manual launch

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/visual-smoke.mjs`
- Create: `scripts/visual-smoke.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces: PC Recap 1.1.0 build, installer, visual smoke artifacts, and a launched application for user testing.

- [ ] **Step 1: Add a deterministic isolated-profile smoke script and test**

```js
assert.equal(await page.locator('[aria-label="Search apps"]').count(), 1);
assert.equal(await page.locator('.collection-cover__symbol').evaluate(el => {
  const r = el.getBoundingClientRect();
  const p = el.parentElement.getBoundingClientRect();
  return r.left >= p.left && r.right <= p.right && r.top >= p.top;
}), true);
```

The script uses test-only fixtures in a temporary profile and captures default/minimum-size screenshots. It never writes demo activity into production user data.

- [ ] **Step 2: Run the complete verification matrix**

Run:

```bash
npm run typecheck
npm run test:run
npm run build
npm run smoke:activity
node scripts/visual-smoke.mjs
```

Expected: all commands exit 0.

- [ ] **Step 3: Bump version and document the release**

Set package version to `1.1.0`, update the lockfile, and document historical recovery, Day Replay, explainable charts, Recap Studio, Memory Pins, and the no-fabricated-history guarantee.

- [ ] **Step 4: Package and inspect the Windows installer**

Run:

```bash
npm run package
npm run release:inspect
```

Expected: `release/PC-Recap-1.1.0-Setup.exe` exists and passes installer inspection.

- [ ] **Step 5: Launch the packaged or unpacked application for manual testing**

Start PC Recap with its normal user-data directory only after isolated verification passes. Confirm the main window appears and the existing history total matches the pre-migration baseline.

- [ ] **Step 6: Commit release readiness**

```bash
git add package.json package-lock.json scripts/visual-smoke.mjs scripts/visual-smoke.test.mjs README.md
git commit -m "release: prepare PC Recap 1.1.0"
```

