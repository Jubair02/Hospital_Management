import { MAGNITUDE_RAMP, TONE_COLORS, formatCount, type ChartTone } from './chartTheme';

export interface DonutSlice {
  label: string;
  count: number;
  /** Use when the category has a meaning of its own (completed, overdue). */
  tone?: ChartTone;
}

interface DonutChartProps {
  slices: DonutSlice[];
  /** Word under the centre total, e.g. "orders". */
  centreLabel?: string;
  format?: (value: number) => string;
  emptyMessage?: string;
  ariaLabel: string;
}

const SIZE = 168;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Hairline gap between slices so adjacent arcs stay countable. */
const GAP = 2;

/**
 * Parts of a whole, with the total in the middle and a direct-labelled
 * legend beside it. Every slice is named and numbered in text, so the ring
 * is a shape aid rather than the only way to read the data — colour is never
 * the sole carrier of meaning.
 */
export default function DonutChart({
  slices,
  centreLabel,
  format = formatCount,
  emptyMessage = 'No data in this period.',
  ariaLabel,
}: DonutChartProps) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  if (slices.length === 0 || total === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  // Ranked so the ramp encodes magnitude when no semantic tone is given.
  const ranked = [...slices].sort((a, b) => b.count - a.count);

  let offset = 0;
  const arcs = ranked.map((slice, index) => {
    const share = slice.count / total;
    const length = Math.max(share * CIRCUMFERENCE - GAP, 0);
    const arc = {
      ...slice,
      share,
      length,
      offset,
      color: slice.tone
        ? TONE_COLORS[slice.tone]
        : MAGNITUDE_RAMP[Math.min(index, MAGNITUDE_RAMP.length - 1)]!,
    };
    offset += share * CIRCUMFERENCE;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-7">
      <div className="relative shrink-0">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[168px] w-[168px] -rotate-90"
          role="img"
          aria-label={ariaLabel}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#eef2f8"
            strokeWidth={STROKE}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-slate-900">
            {format(total)}
          </span>
          {centreLabel && (
            <span className="mt-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-slate-500">
              {centreLabel}
            </span>
          )}
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2.5">
        {arcs.map((arc) => (
          <li key={arc.label} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: arc.color }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-600" title={arc.label}>
              {arc.label}
            </span>
            <span className="tabular-nums font-semibold text-slate-900">{format(arc.count)}</span>
            <span className="w-11 text-right tabular-nums text-xs text-slate-500">
              {(arc.share * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
