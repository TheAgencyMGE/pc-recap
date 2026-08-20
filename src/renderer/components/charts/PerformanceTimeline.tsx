import { useState } from 'react';
import type { SystemPerformanceSample } from '../../../shared/types';
import { formatClock } from '../../lib/format';

export function PerformanceTimeline({ samples }: { samples: SystemPerformanceSample[] }) {
  const [focused, setFocused] = useState<SystemPerformanceSample>();
  const points = samples.map((sample, index) => ({
    sample,
    x: samples.length <= 1 ? 500 : (index / (samples.length - 1)) * 1_000,
  }));
  return <section className="performance-timeline" aria-label="System performance during this day">
    <header><div><b>System load</b><span>Recorded alongside app activity</span></div><div className="performance-legend"><span><i className="is-cpu" />CPU</span><span><i className="is-memory" />Memory</span></div></header>
    <svg viewBox="0 0 1000 180" preserveAspectRatio="none" aria-hidden="false">
      <path className="performance-gridline" d="M0 45H1000M0 90H1000M0 135H1000" />
      <polyline className="performance-line is-memory" points={metricPoints(points, 'memoryPercent')} />
      <polyline className="performance-line is-cpu" points={metricPoints(points, 'cpuPercent')} />
      {points.map(({ sample, x }) => <circle
        key={sample.id ?? sample.sampledAt}
        className="performance-point"
        cx={x}
        cy={180 - ((sample.cpuPercent ?? sample.memoryPercent ?? 0) / 100) * 170}
        r="9"
        role="button"
        tabIndex={0}
        aria-label={sampleLabel(sample)}
        onMouseEnter={() => setFocused(sample)}
        onMouseLeave={() => setFocused(undefined)}
        onFocus={() => setFocused(sample)}
        onBlur={() => setFocused(undefined)}
      />)}
    </svg>
    <div className="performance-tooltip" aria-live="polite">{focused ? <>
      <b>{formatClock(focused.sampledAt)}</b>
      <span>{focused.cpuPercent === undefined ? 'CPU unavailable' : `${formatPercent(focused.cpuPercent)} CPU`}</span>
      <span>{memoryLabel(focused)}</span>
    </> : <span>Hover or focus a point for the recorded values.</span>}</div>
  </section>;
}

function metricPoints(points: Array<{ sample: SystemPerformanceSample; x: number }>, key: 'cpuPercent' | 'memoryPercent') {
  return points.flatMap(({ sample, x }) => sample[key] === undefined ? [] : [`${x},${180 - (sample[key] / 100) * 170}`]).join(' ');
}

function sampleLabel(sample: SystemPerformanceSample) {
  return `${formatClock(sample.sampledAt)}: CPU ${sample.cpuPercent === undefined ? 'unavailable' : formatPercent(sample.cpuPercent)}, memory ${sample.memoryPercent === undefined ? 'unavailable' : formatPercent(sample.memoryPercent)}`;
}

function memoryLabel(sample: SystemPerformanceSample) {
  if (sample.memoryUsedBytes !== undefined && sample.memoryTotalBytes !== undefined) {
    return `${formatBytes(sample.memoryUsedBytes)} / ${formatBytes(sample.memoryTotalBytes)} memory`;
  }
  return sample.memoryPercent === undefined ? 'Memory unavailable' : `${formatPercent(sample.memoryPercent)} memory`;
}

function formatPercent(value: number) {
  return `${Number(value.toFixed(1))}%`;
}

function formatBytes(value: number) {
  const gibibytes = value / 1024 ** 3;
  return `${Number(gibibytes.toFixed(gibibytes >= 10 ? 0 : 1))} GB`;
}
