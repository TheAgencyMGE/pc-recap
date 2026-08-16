# PC Recap

PC Recap turns real computer activity into a visual history of your digital life: daily snapshots, weekly and monthly recaps, a cinematic Yearly Recap, long-term eras, records, and an archive you can carry between computers.

[Website](https://pcrecap.online/) · [Download](https://github.com/TheAgencyMGE/pc-recap/releases/latest) · [GPL-3.0 license](LICENSE)

![PC Recap cover shelf](website/og.png)

> [!IMPORTANT]
> **PC Recap 1.1.0 is a public beta for Windows 10/11 x64.** The installer is currently unsigned, updates are installed manually from [GitHub Releases](https://github.com/TheAgencyMGE/pc-recap/releases), and beta users may encounter bugs. [Report a bug](https://github.com/TheAgencyMGE/pc-recap/issues/new?template=bug_report.yml) or [suggest an improvement](https://github.com/TheAgencyMGE/pc-recap/issues/new?template=feature_request.yml).

## What it does

- Records foreground application usage and session duration on Windows.
- Builds Today, Week, Month, Year, All-Time, Decade, and On This Day recaps.
- Finds deterministic observations, app pairings, streaks, records, and usage eras without AI services.
- Replays individual days on a proportional, interactive timeline with exact local-clock labels.
- Builds historical, seasonal, and custom stories in Recap Studio.
- Imports exact ActivityWatch and ManicTime intervals, plus clearly separated RescueTime and WakaTime context.
- Recovers opt-in Windows installation, launch, Prefetch, Activity History, and browser-domain clues without converting clues into usage time.
- Adds local Memory Pins that stay out of stories and share cards unless explicitly included.
- Keeps history in local SQLite storage with per-app exclusions.
- Exports and merges versioned `.pcr` backups across computers.
- Runs from the system tray and continues collecting when the window is closed.
- Uses native application icons and exports shareable Recap cards locally.

PC Recap never creates demo activity or placeholder statistics. A new archive is empty until real sessions are collected or imported.

## Download

The current Windows beta installer is available from the [PC Recap 1.1.0 Beta release](https://github.com/TheAgencyMGE/pc-recap/releases/tag/v1.1.0).

Requirements: Windows 10 or Windows 11, x64.

> Windows may show a SmartScreen warning because the installer is not yet signed with a publicly trusted Authenticode certificate.

PC Recap does not update automatically yet. Install newer beta versions manually from GitHub Releases.

## Privacy

- No account, telemetry, advertising identifier, cloud sync, or external AI API.
- No keystrokes, screenshots, clipboard contents, or file contents.
- Browser-domain recovery is off by default and runs only after explicit consent; recovered clues never count as usage duration.
- Window titles are off by default.
- Tracking can be paused immediately and individual executables can be excluded.
- All history can be exported or erased from the app.
- The marketing website uses Plausible for aggregate page and download analytics; the desktop app remains telemetry-free and never sends activity history.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

Third-party font notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

Requirements: Windows 10/11, Node.js 22 or newer, and npm.

```powershell
npm ci
npm run dev
```

`npm run dev` builds the Electron main process, starts the renderer development server, and opens the actual desktop application.

Quality checks:

```powershell
npm run test:run
npm run typecheck
npm run smoke:activity
npm run build
npm run smoke:visual
```

Create the Windows installer:

```powershell
npm run package
```

Prepare the current website, Netlify archive, and release post copy:

```powershell
npm run promotion:prepare
```

This refreshes versioned download links and sitemap dates, validates the static site, writes the deployable archive to `artifacts/pc-recap-netlify.zip`, and writes concise platform copy to `marketing/release-posts.md`. After the updated site is live, notify participating search engines with `npm run seo:submit`.

## Architecture

```text
Windows foreground bridge
          |
ActivityTracker -> SQLite repository -> daily rollups / recovery / backups
                                  |
                 analytics + deterministic rules
                                  |
                     validated Electron IPC
                                  |
                    React renderer experience
```

- `src/main` — Electron lifecycle, tray, Windows activity collection, SQLite, historical recovery, backups, and IPC.
- `src/shared` — domain contracts, period math, analytics, and the deterministic observation engine.
- `src/renderer` — React UI, archive visualizations, Day Replay, Recap Studio, Memory Pins, and share cards.
- `website` — dependency-free product and download site for static hosting.
- `scripts` — activity and website verification utilities.

The renderer runs with context isolation, sandboxing, no Node integration, and an explicit preload API. Platform-specific activity collection is isolated behind the activity-source boundary so additional operating systems can be added without changing analytics or persistence.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Activity data must remain local, observations must remain deterministic, and features must behave honestly with an empty archive.

## License

Copyright © 2026 Ryan Panda.

PC Recap's source code is licensed under the [GNU General Public License v3.0](LICENSE), using the `GPL-3.0-only` SPDX identifier. You may use, study, modify, and redistribute the code under those terms. Distributed versions must provide the corresponding source and preserve the same license.

The GPL covers the software, not the PC Recap name, logo, or visual identity. Those may be used to refer to the original project, but modified distributions should use distinct branding and must not imply endorsement.
