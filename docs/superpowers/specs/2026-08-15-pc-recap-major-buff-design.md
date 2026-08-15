# PC Recap Major Buff Design

**Date:** 2026-08-15
**Status:** Proposed for implementation
**Target release:** 1.1.0
**Product:** PC Recap for Windows

## Summary

PC Recap 1.1.0 will strengthen the accuracy of foreground-activity collection, make every displayed statistic understandable, add opt-in recovery of history from before PC Recap was installed, and expand the product's deterministic storytelling features.

The release is deliberately ordered around trust. Tracking and comparison correctness must be established before the new Day Replay, relationship analysis, eras, lifecycle observations, Recap Studio, and Memory Pins consume those results. No generative AI, external LLM, telemetry, account, or cloud dependency will be introduced.

## Goals

1. Preserve live activity safely across crashes and show the current open session in recaps.
2. Correct idle-time attribution and reduce app-switch sampling error.
3. Remove PC Recap and Windows shell noise from normal recaps while retaining useful user-facing applications.
4. Make charts, comparisons, durations, labels, and statistical definitions understandable without guessing.
5. Recover trustworthy historical sessions from supported exports and represent Windows archaeological evidence without inventing duration.
6. Turn daily activity into an interactive sequence that feels like a personal time capsule.
7. Detect real app relationships, routines, lifecycle moments, and eras with deterministic rules.
8. Generate cinematic recaps for complete and in-progress periods, including historical years and custom ranges.
9. Let users attach small, local memories to dates and eras.
10. Resolve the visual, responsive, navigation, and category-management defects found in the 2026-08-15 audit.

## Non-goals

- No AI-generated observations or calls to external AI services.
- No telemetry or upload of activity history.
- No account system or cloud synchronization.
- No screenshots, keystrokes, clipboard capture, file-content inspection, or silent browser-history collection.
- No productivity scores, blocking, goals, employee monitoring, or surveillance features.
- No invented durations from Windows launch artifacts.
- No macOS or Linux activity collector in this release.
- No video-rendering engine in the desktop app.

## Product principles

### Exact data and recovered clues are different products

PC Recap will display two explicit provenance classes:

- **Recorded activity:** foreground intervals collected by PC Recap or imported from a source that provides concrete start, end, and duration values.
- **Recovered clue:** evidence that an application was installed, launched, or present around a date without enough information to calculate foreground duration.

Recovered clues may appear in the archive, lifecycle cards, and annotated recap scenes. They must never contribute to total time, longest sessions, time-of-day charts, comparisons, streaks, or records.

### In-progress periods must say so

Today, the current week, current month, and current year will be labeled “so far” where the distinction matters. Comparisons for an in-progress period will use the same elapsed portion of the previous period. Completed historical periods will use full-period comparisons.

### Every number must answer “what does this mean?”

Every non-obvious metric will have contextual copy or a hover/focus explanation. Labels such as “Sessions,” “First,” or an isolated percentage will not appear without a definition or baseline.

## Architecture

The existing Electron boundaries remain:

- `src/main`: Windows collection, SQLite persistence, imports, analytics services, and secure IPC.
- `src/shared`: domain types, calendar math, deterministic analytics, observations, and validation.
- `src/renderer`: React pages, charts, stories, search, and settings.

The release adds focused modules instead of enlarging the existing tracker and analytics files indefinitely:

- `src/main/tracking/`: session state, identity resolution, ignore rules, checkpoints, and recovery.
- `src/main/importers/`: one adapter per supported historical source.
- `src/main/recovery/`: Windows evidence readers and provenance normalization.
- `src/shared/analytics/`: comparisons, rhythms, transitions, lifecycle, eras, and recap facts.
- `src/renderer/components/charts/`: accessible chart primitives and tooltips.
- `src/renderer/pages/replay/`: Day Replay and day-detail UI.
- `src/renderer/pages/recap-studio/`: period selection and story launching.

Each importer and analyzer will expose a narrow typed interface and will be testable without Electron or the renderer.

## Persistence and migration

All schema changes will run transactionally. Before the first 1.1.0 migration, PC Recap will create a recoverable local backup of the existing database. A failed migration must leave the original database usable.

### Session provenance

`activity_sessions` will gain:

- `source_kind`: `pc_recap`, `pc_recap_backup`, `activitywatch`, `manictime`, `rescuetime`, `wakatime`, or another registered importer.
- `source_record_id`: stable external identifier when available.
- `confidence`: `recorded` or `imported_exact`.
- A unique source key used for idempotent imports.

Historical Windows clues will not be stored in `activity_sessions`.

### New tables

#### `open_session_checkpoints`

One row per machine containing the current application identity, start time, last confirmed sample time, optional window title, and checkpoint time. It is updated periodically and deleted after a normal finalization.

#### `recovered_events`

Stores non-duration evidence:

- application identity
- event type such as `installed`, `launched`, `present`, or `last_seen`
- observed time or bounded date range
- source
- confidence score and human-readable limitation
- source fingerprint for deduplication

#### `import_batches`

Tracks source type, source fingerprint, import time, record counts, date range, warnings, and rollback metadata.

#### `application_aliases`

Maps executable names, renamed products, hosted Windows identities, and imported source names onto a canonical application. Raw source identity remains available for diagnostics.

#### `memory_pins`

Stores a local title, note, timestamp or date range, optional linked application/category, color, and creation/update timestamps.

#### `achievement_unlocks`

Persists the actual time at which each achievement threshold was first crossed rather than assigning the first session date to every unlocked record.

## Tracking Accuracy 2.0

### Live session visibility

The tracker will expose a read-only snapshot of the open session. Analytics will merge that snapshot into queries at read time, clipped to the requested period, without writing a synthetic finalized session. The UI can therefore update the running duration without waiting for an app switch.

### Checkpoint and crash recovery

- Save an open-session checkpoint no more often than every 30 seconds.
- On startup, finalize a stale checkpoint at its last confirmed sample, never at the new startup time.
- Delete the checkpoint after normal session finalization.
- Deduplicate recovered and normally finalized records with a stable session identity.
- A crash should lose no more than the checkpoint interval and must never create hours of phantom activity.

### Idle correction

When Windows reports that the idle threshold has been crossed, the active session ends at the detected last-input time, bounded by the session start and last confirmed sample. The default five-minute idle threshold will no longer be counted as active use.

### Switch attribution

When an application change is observed between two samples, the transition time will use the midpoint between the last confirmed sample and the new sample. This reduces systematic attribution to the previous application while acknowledging sampling uncertainty.

### Immediate state changes

- Resuming tracking triggers an immediate sample.
- Pausing immediately finalizes the current session.
- Changing sample interval restarts the sampling timer safely.
- Idle and unavailable states remain visibly distinct from manually paused tracking.
- The header’s pause/resume action is based on the enabled setting, not merely the last status enum.

### Application identity and noise filtering

PC Recap will never count its own production executable or its development Electron host in user totals. Default ignore rules will remove shell-only surfaces such as SearchHost, ShellHost, ShellExperienceHost, CredentialUIBroker, PickerHost, Idle, and installer helpers.

Useful surfaces such as File Explorer remain trackable. For hosted Windows applications, the resolver will attempt to identify the child process, package identity, or application user model ID before falling back to a friendly “Windows app” identity. Users can reveal ignored applications and override defaults in Settings.

Existing aliases such as PC Wrapped and PC Recap will be mergeable into a canonical application without deleting raw history.

## Historical Recovery

Historical recovery is opt-in and user-initiated. Onboarding and Settings may offer it, but PC Recap will not silently scan external histories.

### Recovery flow

1. User chooses **Recover older history**.
2. PC Recap lists supported sources and the information each source contains.
3. User selects files or explicitly enables a local Windows scan.
4. PC Recap parses into a temporary preview model.
5. The preview shows date coverage, exact sessions, recovered clues, duplicates, skipped records, and privacy-sensitive fields.
6. User confirms the import.
7. A single database transaction commits the batch.
8. Repeating the same import produces no duplicates.

### Exact import adapters

Initial adapters:

- PC Recap `.pcr` backups
- ActivityWatch JSON bucket exports
- ManicTime application timeline exports or compatible database copies
- RescueTime CSV exports
- WakaTime export data for coding activity

Adapters may only produce duration sessions when the source provides a concrete interval. Coding or browser records that overlap a stronger foreground source will be deduplicated or retained as contextual events rather than double-counted.

### Windows recovery adapters

Best-effort, non-elevated readers will inspect only sources available to the current user:

- UserAssist launch evidence
- installed-application registry metadata
- readable Prefetch metadata
- legacy Windows Activity History databases when present

Browser history is a separate, disabled-by-default option with explicit explanation. If enabled, it contributes visit clues only, not browser foreground duration. Raw URLs and titles will not be placed into share cards automatically.

Each clue includes its source and limitation. Unavailable or unreadable sources are skipped without blocking the rest of the scan.

## Explainable statistics and charts

### Formatting

- Use locale-aware 12-hour or 24-hour time based on the user’s Windows preferences; default English output should read `12 AM`, `6 AM`, `12 PM`, and `6 PM`, not `00`, `06`, `12`, and `18`.
- Use `<1 min` for short non-zero durations.
- Use natural phrases where space allows: `2 hr 40 min`, `6 of 7 days`, and `49% of today`.
- Dates on weekly charts use weekday labels; month and year remain available in the tooltip.
- Monthly history uses month names and year context, not isolated values such as `08`.

### Accessible interactive charts

Every bar or segment will support mouse hover and keyboard focus. A custom tooltip will show:

- exact date or hour
- recorded duration
- share of the period
- leading application and category when available
- comparison to the relevant average

Zero values render as zero, not minimum-height activity. Charts include an accessible summary and preserve reduced-motion behavior.

### Metric explanations

- **App switches** replaces unexplained **Sessions** where it represents foreground runs, with a tooltip defining the rule.
- **First activity** includes the relevant day and context for multi-day periods.
- **Active days** displays the denominator.
- Percent changes display their baseline, such as `+18% vs last week so far`.
- Current periods identify incomplete data.

## Fair comparisons and personal baselines

For an in-progress period, the current range ends at `now`. The previous comparison range has the same elapsed duration relative to its own period start. Historical completed periods use their full boundaries.

New deterministic baseline facts include:

- typical first and last activity time
- average active duration per active day
- current day versus personal daily average
- weekday versus weekend split
- most consistent hour
- longest active-day streak
- late-night and early-morning share
- peak day and peak hour

Percentage-change observations require minimum prior duration, current duration, and absolute difference thresholds. Large ratios caused by tiny baselines will be replaced with concrete copy such as `23 min, up from 2 min` or suppressed.

## Day Replay

Day Replay presents one date as a chronological, zoomable ribbon of foreground sessions.

- Sessions are grouped visually by application and category but retain exact boundaries.
- The user can hover or focus a segment to see start, end, duration, application, and category.
- Clicking an application filters the ribbon and related facts.
- Clicking an hour zooms to that hour.
- A text summary names the first activity, last activity, longest uninterrupted session, busiest hour, major switches, and idle gaps.
- Memory Pins and recovered clues appear as visibly different annotations.
- Timeline day cards open the corresponding Day Replay instead of ending as disabled cards.

## Relationships and routines

The current same-day pair algorithm will be replaced.

### App relationships

Adjacent foreground sessions form a transition when their gap is within ten minutes. Pair strength uses:

- transition frequency
- number of distinct days
- directionality
- median gap
- total time surrounding the transition

“Power couple” requires repeated proximity across multiple days. Relationships with shell noise or insufficient evidence are excluded.

### Repeated routines

PC Recap will detect recurring two- and three-app sequences such as `Chrome → VS Code → Terminal`. A routine needs repeated occurrences on multiple days and will state the evidence rather than imply causation.

## Era and application lifecycle engine

### Eras

Era detection will use rolling application and category share rather than requiring only one monthly winner for two consecutive months. It supports:

- multi-month eras
- shorter “mini eras” when only weeks of history exist
- category eras
- mixed-app eras
- rising, peak, and fading boundaries

Era names remain deterministic, for example `The Roblox comeback`, `Your coding stretch`, or `The Opera era`.

### Lifecycle observations

Deterministic rules may surface:

- first meaningful use
- newly installed or newly discovered application
- one-time experiment
- abandoned application
- comeback after a long gap
- new personal record
- least-used meaningful application
- fastest-growing application with adequate baseline

An application is never called abandoned based on a few quiet days. Thresholds require adequate age, minimum recorded use, and a substantial inactivity window. Installation claims require registry or package metadata; otherwise copy says “first appeared in your archive.”

## Recap Studio

Recap Studio launches adaptive cinematic stories for:

- Today
- completed or in-progress week
- completed or in-progress month
- current year so far
- any historical recorded year
- a selected season
- a selected decade
- a custom date range

Story scenes are chosen by available evidence. Possible deterministic scenes include total time, favorite app, category mix, peak hour/day/month, rhythm, app relationship, routine, era, lifecycle moment, record, Memory Pin, recovered clue, and final summary.

The route and selection model will allow historical years instead of hard-coding the current year. Current stories use “so far”; completed stories use retrospective language. Existing portrait and story share cards remain, with provenance-safe facts only.

## Memory Pins

Users can attach a short local memory to a day, month, range, application, or detected era.

- Title up to 80 characters
- Note up to 500 characters
- Optional color and linked application/category
- Edit and delete controls
- Included in backups and restores
- Eligible for Recap Studio and On This Day scenes
- Excluded from sharing until the user explicitly includes it

Version 1.1.0 supports text only. Attachments are deferred.

## Navigation, search, and visual repairs

### Home and shelves

- Move archive-card symbols inward so arched card masks cannot clip them.
- Add overflow-safe wrapping and container-aware type sizing for long app names and observations.
- Add visible previous/next shelf controls, mouse-wheel handling, keyboard navigation, and a partial-card affordance.
- Place category management in a discoverable utility area rather than only at the end of the application shelf.

### Search

Search becomes a clear overlay with sections for applications, recap destinations, historical periods, and settings destinations. It provides result counts, keyboard selection, Escape-to-close, and an explicit no-results state. Application matching remains case-insensitive and opens the selected detail page.

### On This Day

Current-year activity is excluded from the nostalgic year count. When no earlier year exists, the page explains that a future On This Day memory is still being built. Current activity may appear separately as `Today so far` without pretending to be a prior-year memory.

### Timeline

The current anchor is always visible, for example `2026`, `August 2026`, or `August 15, 2026`. Switching scale retains or intentionally resets context with an explicit label. Day cards open Day Replay.

### Categories

Category management supports creating, renaming, recoloring, changing icons, deleting custom categories, and selecting a reassignment destination before deletion. Default categories cannot be accidentally deleted. Changes update historical analytics because session categories resolve through the canonical application record.

### Records

Achievement unlock time is calculated at the threshold-crossing event. The latest record is selected chronologically. Progress displays use human units, not raw seconds.

## IPC and security

- All new IPC channels use the existing trusted-sender assertion.
- File imports use native file pickers and validate extension, size, schema, ranges, and record counts before parsing fully.
- SQLite and CSV imports are read-only and never execute source-provided SQL.
- Import errors return sanitized messages to the renderer and detailed local diagnostics without including raw window titles by default.
- Recovery scans are explicit and source-scoped.
- Memory Pin content is escaped by React and never interpreted as HTML.
- Share generation excludes sensitive imported fields unless explicitly selected.

## Error handling

- A failed tracking checkpoint must not stop foreground collection; it records a local diagnostic and retries on the next checkpoint.
- Failed imports commit nothing.
- Partially unsupported source records are counted and explained in preview warnings.
- Unknown application identities receive a stable fallback identity rather than crashing analytics.
- Corrupt open-session checkpoints are quarantined and ignored.
- Empty and short histories produce intentionally reduced recaps instead of made-up scenes.

## Performance and decades of history

- Finalized raw sessions remain the source of truth.
- Daily rollups continue powering long-range summaries.
- New transition and lifecycle indexes avoid scanning decades of rows for ordinary screens.
- Open-session checkpoints are constant-size.
- Import adapters stream or batch records and enforce upper bounds.
- Long-term charts query rollups at the appropriate resolution: hours for a day, days for weeks/months, months for years, and years for decades.
- Database migration and analytics will be tested with multi-year generated test fixtures, never runtime demo data.

## Testing strategy

### Unit tests

- idle backdating and switch midpoint math
- checkpoint recovery and deduplication
- ignored-app and alias resolution
- matched-elapsed comparisons
- localized formatting and `<1 min`
- transition relationships and routine thresholds
- era and lifecycle thresholds
- observation suppression for tiny baselines
- On This Day current-year exclusion
- achievement threshold dates
- importer parsers, deduplication, and provenance
- Memory Pin validation

### Database and migration tests

- migrate a 1.0.1 database without changing existing totals
- migration rollback on injected failure
- stale checkpoint recovery
- exact import idempotency
- recovered clues excluded from duration rollups
- category reassignment and deletion
- backup/restore round-trip with all new entities

### Renderer tests

- search results, keyboard behavior, and no-results state
- accessible chart tooltips on hover and focus
- zero bars render as zero
- long-name wrapping at minimum supported width
- archive icons remain fully inside masks
- current-period wording and comparison labels
- timeline day navigation
- historical-year recap selection
- Memory Pin create/edit/delete flows
- category create/edit/delete/reassign flows

### End-to-end and visual checks

An isolated Electron profile will exercise onboarding, live collection, pause/resume, idle recovery, search, every navigation destination, Day Replay, import preview, Recap Studio, share generation, and close-to-tray behavior. Screenshots will be captured at the default and minimum supported window sizes.

Test data exists only inside test fixtures and isolated temporary profiles. Production onboarding and runtime screens will never insert demo activity.

### Release verification

Before completion:

- TypeScript checks pass.
- All unit, integration, renderer, migration, and end-to-end tests pass.
- Production renderer and Electron main process build successfully.
- Windows installer packages successfully.
- Installer and unpacked application launch successfully.
- Existing user history survives migration with unchanged totals.
- The final application is launched for manual user testing.

## Delivery sequence

1. Database migration, provenance, checkpoint, and alias foundations.
2. Tracking accuracy, recovery, and noise filtering.
3. Comparison, formatting, chart, and observation correctness.
4. Audit visual fixes, search, timeline, categories, and records.
5. Historical Recovery adapters and preview flow.
6. Day Replay.
7. Relationships, routines, eras, and lifecycle observations.
8. Recap Studio and historical period selection.
9. Memory Pins and backup integration.
10. Full verification, packaging, and manual launch.

## Acceptance criteria

The release is accepted when:

- No current session disappears from the dashboard or becomes phantom time after a crash.
- Idle threshold time is not counted as active use.
- PC Recap and default Windows shell noise do not appear in ordinary rankings.
- Every chart uses understandable labels and exposes rich hover/focus information.
- Every comparison names a fair baseline.
- Search has meaningful results and an explicit empty state.
- Archive icons and long names render correctly at the minimum window size.
- On This Day does not count the current year as nostalgia.
- Recovered clues are visually and mathematically separate from exact usage.
- Supported imports are previewed, transactional, and idempotent.
- Day Replay opens from historical day cards.
- App relationships reflect temporal proximity rather than mere same-day appearance.
- Current and historical recaps use correct tense and can be launched from Recap Studio.
- Memory Pins remain local, portable through backup, editable, and private by default in shares.
- Existing real history is preserved and all verification gates pass.
