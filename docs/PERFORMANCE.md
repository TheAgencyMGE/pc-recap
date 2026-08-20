# Performance budget and benchmark

PC Recap samples supported system metrics every 10 seconds by default. The performance collector is independent of foreground-app tracking, can be disabled, and never increases its polling rate to make a recap look more detailed.

Raw performance samples are retained for seven days. Hourly and daily rollups remain after raw samples expire. At the default interval this caps the steady-state raw history near 60,480 rows per machine, while long-term recaps use compact rollups.

Run the local benchmark with:

```sh
npm run benchmark:performance
```

The benchmark reports:

- process CPU and RSS for the sampler/database harness;
- average system-sample latency;
- average SQLite write-plus-rollup latency;
- a two-second idle CPU observation;
- database size after 1,000 realistic raw samples and their rollups;
- the expected write frequency at the default interval.

Treat results as approximate and record the operating system, architecture, Node/Electron version, and test-machine conditions with any published number. The harness isolates the background services; it is not a substitute for measuring the packaged renderer and main process together on each release candidate.

The release targets are an average sample-and-write cycle well below the 10-second interval, under 1% of one CPU core while the harness is idle on a typical development machine, and bounded raw database growth. These are regression signals, not promises for every device.
