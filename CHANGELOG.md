# Changelog

All notable changes to PC Recap are documented here.

## [1.2.0] Beta - 2026-08-20

### Added

- Native foreground application collectors for macOS and Linux X11.
- Tracking Health diagnostics for collector state, permissions, and the latest successful sample.
- Separate active, idle, locked, suspended, and unavailable computer states.
- Optional CPU, memory, battery, and power context with bounded raw retention and durable rollups.
- Daily recovery backups, merge previews, canonical app identities, and long-archive performance improvements.
- Cross-platform Windows, macOS Intel, macOS Apple Silicon, AppImage, and deb release packages with checksums.

### Improved

- Clearer local-clock times, chart tooltips, stat explanations, and recap observations.
- Release packaging now verifies every artifact before a tag-driven GitHub Release is published.
- Wayland reports its collector as unavailable instead of creating false activity.

## [1.1.0] Beta - 2026-08-15

### Added

- Interactive Day Replay with proportional sessions and exact timeline details.
- Recap Studio for historical, seasonal, and custom stories.
- Memory Pins for local notes that stay out of stories and share cards unless included.
- Exact ActivityWatch and ManicTime interval imports, with separated RescueTime and WakaTime context.
- Historical Windows, Steam, and Epic clues that never convert evidence into invented usage time.
- App rhythms, relationships, lifecycle facts, period comparisons, and evidence-based observations.

### Improved

- Search navigation, responsive layouts, interactive chart explanations, app identity normalization, and foreground collector resilience.

## [1.0.1] Beta - 2026-08-08

### Added

- Windows foreground-application tracking with idle detection and system-tray controls.
- SQLite history, long-term rollups, per-app exclusions, and merge-safe `.pcr` backups.
- Today, Week, Month, Year, All-Time, Decade, On This Day, timeline, app, category, and record views.
- Deterministic observations, app pairings, streaks, comparisons, records, and era detection.
- Cinematic Yearly Recap scenes and local portrait/story share-card exports.
- Native Windows application icons and the responsive Cover Shelf interface.
- Static download site and public repository documentation.

[1.0.1]: https://github.com/TheAgencyMGE/pc-recap/releases/tag/v1.0.1
[1.1.0]: https://github.com/TheAgencyMGE/pc-recap/releases/tag/v1.1.0
[1.2.0]: https://github.com/TheAgencyMGE/pc-recap/releases/tag/v1.2.0
