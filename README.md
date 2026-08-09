# PC Wrapped

PC Wrapped turns real computer activity into a private history of your digital life: daily snapshots, weekly and monthly recaps, a cinematic Yearly Wrapped, long-term eras, records, and an archive you can carry between computers.

![PC Wrapped cover shelf](website/og.png)

## What it does

- Records foreground application usage and session duration on Windows.
- Builds Today, Week, Month, Year, All-Time, Decade, and On This Day recaps.
- Finds deterministic observations, app pairings, streaks, records, and usage eras without AI services.
- Keeps history in local SQLite storage with per-app exclusions.
- Exports and merges versioned `.pcw` backups across computers.
- Runs from the system tray and continues collecting when the window is closed.
- Uses native application icons and exports shareable Wrapped cards locally.

PC Wrapped never creates demo activity or placeholder statistics. A new archive is empty until real sessions are collected or imported.

## Download

The current Windows installer is available from [GitHub Releases](https://github.com/TheAgencyMGE/pc-wrapped/releases/latest).

Requirements: Windows 10 or Windows 11, x64.

> Windows may show a SmartScreen warning because the installer is not yet signed with a publicly trusted Authenticode certificate.

## Privacy

- No account, telemetry, advertising identifier, cloud sync, or external AI API.
- No keystrokes, screenshots, clipboard contents, files, or browser history.
- Window titles are off by default.
- Tracking can be paused immediately and individual executables can be excluded.
- All history can be exported or erased from the app.

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
```

Create the Windows installer:

```powershell
npm run package
```

## Architecture

```text
Windows foreground bridge
          |
ActivityTracker -> SQLite repository -> daily rollups / backups
                                  |
                 analytics + deterministic rules
                                  |
                     validated Electron IPC
                                  |
                    React renderer experience
```

- `src/main` — Electron lifecycle, tray, Windows activity collection, SQLite, backups, and IPC.
- `src/shared` — domain contracts, period math, analytics, and the deterministic observation engine.
- `src/renderer` — React UI, archive visualizations, Yearly Wrapped, and share cards.
- `website` — dependency-free product and download site for static hosting.
- `scripts` — activity and website verification utilities.

The renderer runs with context isolation, sandboxing, no Node integration, and an explicit preload API. Platform-specific activity collection is isolated behind the activity-source boundary so additional operating systems can be added without changing analytics or persistence.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Activity data must remain local, observations must remain deterministic, and features must behave honestly with an empty archive.

## License

Copyright © 2026 Ryan Panda. All rights reserved.

No open-source license has been granted yet. The source is being prepared for public review; reuse or redistribution requires permission until a license is added.
