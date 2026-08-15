import { useState } from 'react';
import type { DayReplayData, DayReplaySegment } from '../../../shared/types';
import { formatClock, formatDurationLong } from '../../lib/format';

export function ReplayRibbon({ data, segments, hour }: { data: DayReplayData; segments: DayReplaySegment[]; hour?: number }) {
  const [focused, setFocused] = useState<DayReplaySegment>();
  const dayStart = localDayStart(data.day);
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1).getTime();
  const scaleStart = hour === undefined ? dayStart.getTime() : new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), hour).getTime();
  const scaleEnd = hour === undefined ? dayEnd : new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), hour + 1).getTime();
  const scaleDuration = scaleEnd - scaleStart;
  return <div className="replay-ribbon-wrap">
    <div className="replay-hours" aria-hidden="true">{hour === undefined
      ? [0, 4, 8, 12, 16, 20, 24].map((value) => <span key={value}>{value === 24 ? '12 AM' : clockHour(value)}</span>)
      : [0, 15, 30, 45, 60].map((minute) => <span key={minute}>{minute === 60 ? clockHour((hour + 1) % 24) : minute ? `:${minute}` : clockHour(hour)}</span>)}</div>
    <div className="replay-ribbon" aria-label={`Activity ribbon for ${data.day}`}>
      {segments.flatMap((segment) => {
        const start = Date.parse(segment.startedAt);
        const end = Date.parse(segment.endedAt);
        const clippedStart = Math.max(scaleStart, start);
        const clippedEnd = Math.min(scaleEnd, end);
        if (clippedEnd <= clippedStart) return [];
        const label = `${segment.appName}, ${formatClock(segment.startedAt)} to ${formatClock(segment.endedAt)}, ${formatDurationLong(segment.durationSeconds)}`;
        return [<button
          key={segment.id}
          className="replay-segment"
          aria-label={label}
          style={{
            '--segment-color': segment.color,
            left: `${((clippedStart - scaleStart) / scaleDuration) * 100}%`,
            width: `${Math.max(.35, ((clippedEnd - clippedStart) / scaleDuration) * 100)}%`,
          } as React.CSSProperties}
          onMouseEnter={() => setFocused(segment)}
          onMouseLeave={() => setFocused(undefined)}
          onFocus={() => setFocused(segment)}
          onBlur={() => setFocused(undefined)}
        ><span>{segment.appName}</span></button>];
      })}
      {data.recoveredClues.map((clue, index) => marker(clue.occurredAt, `Clue: ${clue.appName}`, scaleStart, scaleEnd, `clue-${index}`))}
      {data.pins.map((pin) => marker(pin.start, `Memory: ${pin.title}`, scaleStart, scaleEnd, `pin-${pin.id}`))}
    </div>
    <div className="replay-tooltip" aria-live="polite">{focused
      ? <><b>{focused.appName}</b><span>{formatClock(focused.startedAt)} to {formatClock(focused.endedAt)} · {formatDurationLong(focused.durationSeconds)}</span></>
      : <span>Focus a segment for exact times.</span>}</div>
  </div>;
}

function localDayStart(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

function clockHour(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return `${hour % 12} ${hour > 12 ? 'PM' : 'AM'}`;
}

function marker(iso: string, label: string, scaleStart: number, scaleEnd: number, key: string) {
  const at = Date.parse(iso);
  if (at < scaleStart || at > scaleEnd) return [];
  return <i key={key} className="replay-marker" role="img" title={label} aria-label={label} style={{ left: `${((at - scaleStart) / (scaleEnd - scaleStart)) * 100}%` }} />;
}
