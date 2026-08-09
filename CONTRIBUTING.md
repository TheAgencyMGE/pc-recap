# Contributing to PC Recap

Thanks for helping make PC Recap better.

## Before you start

- Open an issue before beginning a large feature or architecture change.
- Keep activity data on-device. Telemetry, remote analytics, accounts, and external AI features are out of scope.
- Never add seeded sessions, demo activity, placeholder statistics, or nondeterministic observations to runtime code.
- Keep Windows-specific tracking behind the activity-source boundary.
- Do not include personal databases, `.pcr` backups, logs, screenshots with private data, or local paths in commits.

## Development workflow

```powershell
npm ci
npm run test:run
npm run typecheck
npm run smoke:activity
npm run build
```

Write a failing regression test before fixing a bug. UI changes should support keyboard navigation, visible focus, reduced motion, the minimum 980×680 desktop window, and honest empty states.

## Pull requests

Keep pull requests focused. Explain the user-facing change, the privacy impact, the checks you ran, and include screenshots only when they contain no personal activity data.
