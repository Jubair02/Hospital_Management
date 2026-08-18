import { useId } from 'react';
import type { Observation, VitalSigns } from '../../types';

/**
 * Which measurements are worth a line, and the band each sits in when well.
 *
 * The band is drawn behind the trace so a reading can be placed without
 * counting gridlines — the question at a bedside is "is this drifting out",
 * not "what exactly was it at 04:00". Ranges are the conventional adult
 * observation bands; they are a reading aid, not a diagnosis, which is why
 * nothing here colours a point red or raises an alert.
 */
const TRACKS: {
  key: keyof VitalSigns;
  label: string;
  unit: string;
  normal: [number, number];
}[] = [
  { key: 'temperature', label: 'Temp', unit: '°C', normal: [36.1, 37.5] },
  { key: 'heartRate', label: 'HR', unit: 'bpm', normal: [60, 100] },
  { key: 'bloodPressureSystolic', label: 'Systolic', unit: 'mmHg', normal: [90, 140] },
  { key: 'oxygenSaturation', label: 'SpO2', unit: '%', normal: [95, 100] },
];

interface Point {
  at: number;
  value: number;
}

/** A single track's line, drawn only when there is more than one reading. */
function Sparkline({
  points,
  normal,
}: {
  points: Point[];
  normal: [number, number];
}) {
  const gradientId = useId();

  const width = 120;
  const height = 28;

  const values = points.map((point) => point.value);
  // The band is included in the extent so it stays visible even when every
  // reading sits well inside it — otherwise a stable patient shows no context.
  const low = Math.min(...values, normal[0]);
  const high = Math.max(...values, normal[1]);
  const span = high - low || 1;

  const x = (index: number) =>
    points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
  const y = (value: number) => height - ((value - low) / span) * height;

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' ');
  const bandTop = y(normal[1]);
  const bandHeight = Math.max(y(normal[0]) - bandTop, 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-7 w-full max-w-[7.5rem] overflow-visible"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect
        x="0"
        y={bandTop}
        width={width}
        height={bandHeight}
        className="fill-emerald-500/10"
        rx="2"
      />

      <path
        d={path}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* The latest reading is the one being looked for, so it gets a mark. */}
      <circle
        cx={x(points.length - 1)}
        cy={y(points[points.length - 1].value)}
        r="2.5"
        className="fill-current"
      />
    </svg>
  );
}

/**
 * How a patient's numbers are moving.
 *
 * The observation list answers "what was the last reading"; three temperatures
 * over six hours answer a different question, and reading a trend out of a
 * column of text is exactly the work a chart exists to remove. Drawn from the
 * readings already loaded for the list, so it costs no extra request.
 */
export default function VitalTrend({ observations }: { observations: Observation[] }) {
  // The feed arrives newest first; a trend reads left to right through time.
  const chronological = [...observations].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  const tracks = TRACKS.map((track) => {
    const points: Point[] = [];
    for (const observation of chronological) {
      const value = observation.vitalSigns?.[track.key];
      if (typeof value === 'number') {
        points.push({ at: new Date(observation.recordedAt).getTime(), value });
      }
    }
    return { ...track, points };
  }).filter((track) => track.points.length >= 2);

  // One reading is not a trend, and a chart drawn from it would imply one.
  if (tracks.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-line bg-slate-50/60 px-3 py-2.5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
        Trend · last {chronological.length} readings
      </p>

      <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {tracks.map((track) => {
          const latest = track.points[track.points.length - 1].value;
          const first = track.points[0].value;
          const change = latest - first;

          return (
            <li key={track.key} className="flex items-center gap-3">
              <div className="w-16 shrink-0">
                <p className="text-[0.6875rem] font-medium text-slate-500">{track.label}</p>
                <p className="text-sm font-semibold tabular-nums text-slate-900">
                  {latest}
                  <span className="ml-0.5 text-[0.625rem] font-normal text-slate-400">
                    {track.unit}
                  </span>
                </p>
              </div>

              <div className="min-w-0 flex-1 text-brand-600">
                <Sparkline points={track.points} normal={track.normal} />
              </div>

              <p
                className={`w-12 shrink-0 text-right text-[0.6875rem] tabular-nums ${
                  Math.abs(change) < 0.05 ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                {change > 0 ? '+' : ''}
                {Math.round(change * 10) / 10}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
