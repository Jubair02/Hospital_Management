import { TONE_COLORS, type ChartTone } from '../charts/chartTheme';

/**
 * Pressure thresholds for a bed count. Chosen to be actionable rather than
 * decorative: below 75% a ward has room, from 75% the next few admissions need
 * planning, and from 90% it is effectively full.
 *
 * The tone is always accompanied by the printed percentage, so a viewer who
 * cannot separate the hues loses nothing — colour is emphasis here, never the
 * data itself.
 */
export const occupancyTone = (rate: number): ChartTone =>
  rate >= 90 ? 'rose' : rate >= 75 ? 'amber' : 'brand';

interface OccupancyMeterProps {
  occupied: number;
  total: number;
  /** Compact drops the bar to a hairline for use inside table rows. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Occupied share of a bed count, as a track plus the figure. A bare "83%" in a
 * table column is read one row at a time; the track lets a column of wards be
 * ranked by pressure at a glance without reading a single number.
 */
export default function OccupancyMeter({
  occupied,
  total,
  size = 'md',
  className = '',
}: OccupancyMeterProps) {
  const rate = total > 0 ? (occupied / total) * 100 : 0;
  const label = total === 0 ? '—' : `${Math.round(rate)}%`;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span
        className={`block min-w-12 flex-1 overflow-hidden rounded-full bg-slate-100 ${
          size === 'sm' ? 'h-1.5' : 'h-2'
        }`}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${Math.min(rate, 100)}%`,
            backgroundColor: TONE_COLORS[occupancyTone(rate)],
          }}
        />
      </span>
      <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-900">
        {label}
      </span>
    </div>
  );
}
