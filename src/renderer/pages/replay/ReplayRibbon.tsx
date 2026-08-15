import { useState } from 'react';
import type { DayReplayData, DayReplaySegment } from '../../../shared/types';
import { formatClock, formatDurationLong } from '../../lib/format';

export function ReplayRibbon({ data, segments, hour }: { data: DayReplayData; segments: DayReplaySegment[]; hour?: number }) {
  const [focused, setFocused] = useState<DayReplaySegment>();
  const scaleStartMinutes = hour === undefined ? 0 : hour * 60;
  const scaleMinutes = hour === undefined ? 24 * 60 : 60;
  return <div className="replay-ribbon-wrap">
    <div className="replay-hours" aria-hidden="true">{hour === undefined
      ? [0, 4, 8, 12, 16, 20, 24].map((value) => <span key={value}>{value === 24 ? '12 AM' : clockHour(value)}</span>)
      : [0, 15, 30, 45, 60].map((minute) => <span key={minute}>{minute === 60 ? clockHour((hour + 1) % 24) : minute ? `:${minute}` : clockHour(hour)}</span>)}</div>
    <div className="replay-ribbon" aria-label={`Activity ribbon for ${data.day}`}>
      {segments.flatMap((segment) => {
        const start = localMinute(segment.startedAt);
        const end = localMinute(segment.endedAt);
        const clippedStart = Math.max(scaleStartMinutes, start);
        const clippedEnd = Math.min(scaleStartMinutes + scaleMinutes, end);
        if (clippedEnd <= clippedStart) return [];
        const label = `${segment.appName}, ${formatClock(segment.startedAt)} to ${formatClock(segment.endedAt)}, ${formatDurationLong(segment.durationSeconds)}`;
        return [<button
          key={segment.id}
          className="replay-segment"
          aria-label={label}
          style={{
            '--segment-color': segment.color,
            left: `${((clippedStart - scaleStartMinutes) / scaleMinutes) * 100}%`,
            width: `${Math.max(.35, ((clippedEnd - clippedStart) / scaleMinutes) * 100)}%`,
          } as React.CSSProperties}
          onMouseEnter={() => setFocused(segment)}
          onMouseLeave={() => setFocused(undefined)}
          onFocus={() => setFocused(segment)}
          onBlur={() => setFocused(undefined)}
        ><span>{segment.appName}</span></button>];
      })}
      {data.recoveredClues.map((clue, index) => marker(clue.occurredAt, `Clue: ${clue.appName}`, scaleStartMinutes, scaleMinutes, `clue-${index}`))}
      {data.pins.map((pin) => marker(pin.start, `Memory: ${pin.title}`, scaleStartMinutes, scaleMinutes, `pin-${pin.id}`))}
    </div>
    <div className="replay-tooltip" aria-live="polite">{focused
      ? <><b>{focused.appName}</b><span>{formatClock(focused.startedAt)} to {formatClock(focused.endedAt)} · {formatDurationLong(focused.durationSeconds)}</span></>
      : <span>Focus a segment for exact times.</span>}</div>
  </div>;
}

function localMinute(iso: string) {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function clockHour(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return `${hour % 12} ${hour > 12 ? 'PM' : 'AM'}`;
}

function marker(iso: string, label: string, scaleStart: number, scaleMinutes: number, key: string) {
  const minute = localMinute(iso);
  if (minute < scaleStart || minute > scaleStart + scaleMinutes) return [];
  return <i key={key} className="replay-marker" role="img" title={label} aria-label={label} style={{ left: `${((minute - scaleStart) / scaleMinutes) * 100}%` }} />;
}
