# PC Recap Analytics and UI Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous statistics and misleading comparisons with understandable deterministic analytics, accessible charts, and repaired navigation and responsive layouts.

**Architecture:** Extend period metadata and analytics facts in shared pure modules, then consume them through reusable renderer components. Keep presentation formatting out of SQLite and keep deterministic rules independently testable.

**Tech Stack:** React 18, TypeScript 5.7, Framer Motion, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-15-pc-recap-major-buff-design.md`

## Global Constraints

- Use fair matched-elapsed comparisons for incomplete periods.
- All charts support hover and keyboard focus.
- No zero-duration bar may imply activity.
- Current-year language says “so far.”
- Search and category management must be usable at the minimum window size.

---

### Task 1: Period context, friendly formatting, and fair comparisons

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/periods.ts`
- Modify: `src/shared/periods.test.ts`
- Modify: `src/renderer/lib/format.ts`
- Create: `src/renderer/lib/format.test.ts`

**Interfaces:**
- Produces: `PeriodRange.isComplete`, `PeriodRange.comparisonLabel`, matched `previousEnd`, `formatDurationLong`, `formatBucketLabel`, and locale-aware hour labels.

- [ ] **Step 1: Write failing matched-period and formatting tests**

```ts
expect(getPeriodRange('week', new Date(2026, 7, 12, 12)).previousEnd)
  .toBe(new Date(2026, 7, 5, 12).toISOString());
expect(formatDuration(30)).toBe('<1m');
expect(formatBucketLabel('hour', '13')).toBe('1 PM');
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test:run -- src/shared/periods.test.ts src/renderer/lib/format.test.ts`

Expected: FAIL against full previous-period ranges and military labels.

- [ ] **Step 3: Implement matched elapsed ranges and friendly formatting**

```ts
export interface PeriodRange {
  label: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  isComplete: boolean;
  comparisonLabel: string;
}
```

Use `now` as the current-period query end and offset the same elapsed duration into the previous period. Preserve full boundaries for completed historical ranges.

- [ ] **Step 4: Run period and format suites**

Run: `npm run test:run -- src/shared/periods.test.ts src/renderer/lib/format.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit period clarity**

```bash
git add src/shared/types.ts src/shared/periods.ts src/shared/periods.test.ts src/renderer/lib/format.ts src/renderer/lib/format.test.ts
git commit -m "fix: make period comparisons understandable"
```

### Task 2: Baselines, temporal relationships, eras, and lifecycle facts

**Files:**
- Create: `src/shared/analytics/baselines.ts`
- Create: `src/shared/analytics/baselines.test.ts`
- Create: `src/shared/analytics/relationships.ts`
- Create: `src/shared/analytics/relationships.test.ts`
- Create: `src/shared/analytics/lifecycle.ts`
- Create: `src/shared/analytics/lifecycle.test.ts`
- Modify: `src/shared/analytics.ts`
- Modify: `src/shared/analytics.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: `BaselineFacts`, directional `AppRelationship`, `RoutineSequence`, `LifecycleMoment`, and rolling `Era` results.

- [ ] **Step 1: Write failing relationship and baseline tests**

```ts
expect(buildRelationships(sessions)[0]).toMatchObject({ appA: 'Chrome', appB: 'Code', transitions: 4, distinctDays: 2 });
expect(buildBaselines(sessions).averageDailySeconds).toBe(7_200);
expect(detectLifecycleMoments(sessions, now)).toContainEqual(expect.objectContaining({ kind: 'comeback' }));
```

- [ ] **Step 2: Run the new analytics suites and verify failure**

Run: `npm run test:run -- src/shared/analytics`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement deterministic thresholds and summaries**

```ts
export interface AppRelationship {
  appA: string;
  appB: string;
  transitions: number;
  distinctDays: number;
  medianGapSeconds: number;
  direction: 'a-to-b' | 'b-to-a' | 'balanced';
  score: number;
}
```

Only adjacent sessions within ten minutes qualify. Require repeated evidence on multiple days for “power couple.” Implement baseline facts, two/three-app routines, mini eras for short histories, rolling monthly eras, and conservative lifecycle thresholds.

- [ ] **Step 4: Run shared analytics tests**

Run: `npm run test:run -- src/shared/analytics.test.ts src/shared/analytics`

Expected: PASS.

- [ ] **Step 5: Commit analytics expansion**

```bash
git add src/shared/analytics src/shared/analytics.ts src/shared/analytics.test.ts src/shared/types.ts
git commit -m "feat: add rhythms relationships and lifecycle facts"
```

### Task 3: Deterministic observation rules and record dates

**Files:**
- Modify: `src/shared/observations.ts`
- Modify: `src/shared/observations.test.ts`
- Modify: `src/main/analytics-service.ts`
- Modify: `src/main/analytics-service.test.ts`
- Modify: `src/main/database.ts`

**Interfaces:**
- Consumes: baseline, relationship, era, and lifecycle facts.
- Produces: contextual observations with concrete baselines and chronologically correct achievement unlocks.

- [ ] **Step 1: Write failing suppression and unlock-date tests**

```ts
expect(generateObservations(summaryWithTwoMinuteBaseline).some(item => item.text.includes('1457%'))).toBe(false);
expect(service.getAchievements().find(item => item.id === 'week-in-life')?.unlockedAt)
  .toBe('2026-08-07T09:00:00.000Z');
```

- [ ] **Step 2: Verify failures**

Run: `npm run test:run -- src/shared/observations.test.ts src/main/analytics-service.test.ts`

Expected: FAIL because extreme percentages and first-session unlock dates remain.

- [ ] **Step 3: Implement minimum thresholds and chronological unlock calculation**

For change observations, require a meaningful prior duration, current duration, and absolute difference; otherwise use concrete from/to durations or suppress the rule. Calculate threshold-crossing timestamps by walking sessions chronologically and persist them in `achievement_unlocks`.

- [ ] **Step 4: Run observation and achievement tests**

Run: `npm run test:run -- src/shared/observations.test.ts src/main/analytics-service.test.ts src/main/database.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit observation quality**

```bash
git add src/shared/observations.ts src/shared/observations.test.ts src/main/analytics-service.ts src/main/analytics-service.test.ts src/main/database.ts
git commit -m "fix: make recap observations evidence based"
```

### Task 4: Accessible interactive charts and meaningful stat cards

**Files:**
- Create: `src/renderer/components/charts/BarChart.tsx`
- Create: `src/renderer/components/charts/BarChart.test.tsx`
- Create: `src/renderer/components/StatCard.tsx`
- Modify: `src/renderer/components/Visuals.tsx`
- Modify: `src/renderer/pages/Dashboard.tsx`
- Modify: `src/renderer/pages/PeriodView.tsx`
- Modify: `src/renderer/pages/AppDetail.tsx`
- Modify: `src/renderer/styles/recaps.css`

**Interfaces:**
- Produces: `BarChart` with formatted axis labels, focus/hover tooltip, zero-value handling, peak/average context, and accessible summary.

- [ ] **Step 1: Write failing tooltip and zero-bar tests**

```tsx
render(<BarChart data={[{ label: '13', seconds: 0 }]} scale="hour" />);
expect(screen.getByRole('button', { name: /1 PM.*0 minutes/i })).toHaveStyle({ height: '0%' });
await user.tab();
expect(screen.getByRole('tooltip')).toHaveTextContent('1 PM');
```

- [ ] **Step 2: Run renderer tests and verify failure**

Run: `npm run test:run -- src/renderer/components/charts/BarChart.test.tsx`

Expected: FAIL because `BarChart` does not exist.

- [ ] **Step 3: Implement chart and stat components**

Use buttons for focusable bars, a single positioned tooltip, `aria-describedby`, reduced-motion support, friendly duration/date formatting, and responsive axes. Replace bare caption strips with contextual stat cards where definitions are necessary.

- [ ] **Step 4: Run chart and page suites**

Run: `npm run test:run -- src/renderer/components/charts/BarChart.test.tsx src/renderer/pages/Dashboard.test.tsx src/renderer/pages/AppDetail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit accessible charts**

```bash
git add src/renderer/components/charts src/renderer/components/StatCard.tsx src/renderer/components/Visuals.tsx src/renderer/pages/Dashboard.tsx src/renderer/pages/PeriodView.tsx src/renderer/pages/AppDetail.tsx src/renderer/styles/recaps.css
git commit -m "feat: add explainable interactive charts"
```

### Task 5: Search, shelves, archive, timeline, categories, and responsive repairs

**Files:**
- Create: `src/renderer/components/SearchOverlay.tsx`
- Create: `src/renderer/components/SearchOverlay.test.tsx`
- Modify: `src/renderer/components/CoverShelf.tsx`
- Modify: `src/renderer/components/CollectionCover.tsx`
- Modify: `src/renderer/components/MinimalHeader.tsx`
- Modify: `src/renderer/pages/CollectionHome.tsx`
- Modify: `src/renderer/pages/OnThisDay.tsx`
- Modify: `src/renderer/pages/Timeline.tsx`
- Modify: `src/renderer/pages/Categories.tsx`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/database.ts`
- Modify: `src/renderer/styles/shell.css`
- Modify: `src/renderer/styles/archive.css`
- Modify: `src/renderer/styles/utility.css`

**Interfaces:**
- Produces: global searchable destinations, keyboard/arrow shelf navigation, unclipped archive symbols, contextual timeline anchors, and full category CRUD.

- [ ] **Step 1: Write failing interaction and layout tests**

```tsx
expect(screen.getByRole('dialog', { name: 'Search PC Recap' })).toBeVisible();
expect(screen.getByText('No results for “zzz”')).toBeVisible();
expect(screen.getByRole('button', { name: 'Next Your apps' })).toBeEnabled();
expect(screen.queryByText(/1 year/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run affected renderer suites and verify failure**

Run: `npm run test:run -- src/renderer/components/SearchOverlay.test.tsx src/renderer/pages/CollectionHome.test.tsx src/renderer/App.test.tsx`

Expected: FAIL because the overlay, shelf controls, and current-year exclusion are absent.

- [ ] **Step 3: Implement interaction and visual repairs**

Index applications, recap routes, timeline periods, and settings routes in the overlay. Add shelf buttons and keyboard scrolling. Move archive icons inside the curved safe area, apply `overflow-wrap:anywhere` and container-aware sizes, show timeline anchors, exclude current year from On This Day nostalgia, and expose Categories as a primary utility.

Add `category:update` and `category:delete` IPC with validation and mandatory reassignment before custom-category deletion.

- [ ] **Step 4: Run UI, IPC-security, and responsive tests**

Run: `npm run test:run -- src/renderer src/main/ipc-security.test.ts src/main/database.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the audit repairs**

```bash
git add src/renderer src/main/ipc.ts src/main/database.ts
git commit -m "fix: repair search navigation and responsive layouts"
```

