# Security Policy

## Supported versions

Security fixes are applied to the latest `1.x` release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting flow under **Security → Advisories → New draft security advisory**. Do not include vulnerabilities, captured activity, database files, backups, window titles, local paths, or other sensitive information in a public issue.

Include the affected PC Recap version, operating system and version, reproduction steps, impact, and any proposed mitigation. Reports will be acknowledged as soon as practical and kept private until a fix is available.

## Security model

PC Recap is local-first. The renderer is sandboxed and context-isolated, Node integration is disabled, IPC is allowlisted, and activity and optional performance history are stored on the user's machine. The application intentionally has no telemetry, cloud sync, account system, advertising identifiers, browser-history scanning, or external AI calls.
