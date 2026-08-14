import { TONE_COLORS, formatCount, type ChartTone } from './chartTheme';

export interface BarSegment {
  label: string;
  count: number;
  /** Status meaning, not category identity — mirrors the StatCard tones. */
  tone: ChartTone;
}

interface StackedBarProps {
  segments: BarSegment[];
  format?: (value: number) => string;
  emptyMessage?: string;
  ariaLabel: string;
}

/**
 * One measure split by status, drawn as a single track. A donut needs a legend
 * lookup to answer "how much is settled"; a stacked track answers it by
 * proportion at a glance, which is what a status mix is usually asked for.
 *
 * Segments grow by ratio rather than by percentage width, so the hairline gaps
 * between them come out of the track instead of overflowing it. Every segment
 * is named and numbered underneath — colour never carries the meaning alone.
 */
export default function StackedBar({
  segments,
  format = formatCount,
  emptyMessage = 'No records in this period.',
  ariaLabel,
}: StackedBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  if (total === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full bg-slate-100"
      >
        {segments
          .filter((segment) => segment.count > 0)
          .map((segment) => (
            <span
              key={segment.label}
              className="h-full rounded-full transition-[flex-grow] duration-500 ease-out"
              style={{
                flexGrow: segment.count,
                flexBasis: 0,
                minWidth: '0.375rem',
                backgroundColor: TONE_COLORS[segment.tone],
              }}
            />
          ))}
      </div>

      <ul className="mt-3.5 space-y-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: TONE_COLORS[segment.tone] }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-600">{segment.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {format(segment.count)}
            </span>
            <span className="w-10 text-right text-xs tabular-nums text-slate-500">
              {Math.round((segment.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
