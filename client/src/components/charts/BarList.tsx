import type { NamedCount } from '../../types';
import { MAGNITUDE_COLOR, formatCount } from './chartTheme';

interface BarListProps {
  items: NamedCount[];
  /** Formats the value shown at the end of each bar. */
  format?: (value: number) => string;
  /** Caps how many rows render; the rest are summarized. */
  limit?: number;
  emptyMessage?: string;
  ariaLabel: string;
}

/**
 * Horizontal bars for one measure across categories. Magnitude of a single
 * measure means one hue — never a colour per category, which would imply the
 * categories differ in kind rather than in size. The value is direct-labelled
 * at the end of every row, so identity is never carried by colour alone.
 */
export default function BarList({
  items,
  format = formatCount,
  limit = 10,
  emptyMessage = 'No data in this period.',
  ariaLabel,
}: BarListProps) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  const shown = items.slice(0, limit);
  const hidden = items.length - shown.length;
  const max = Math.max(1, ...shown.map((item) => item.count));

  return (
    <div role="img" aria-label={ariaLabel}>
      <ul className="space-y-1">
        {shown.map((item) => (
          <li
            key={item.label}
            className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-slate-50"
          >
            <span className="truncate text-sm text-slate-700" title={item.label}>
              {item.label}
            </span>
            <span className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${Math.max((item.count / max) * 100, item.count > 0 ? 3 : 0)}%`,
                  backgroundColor: MAGNITUDE_COLOR,
                }}
              />
            </span>
            <span className="w-14 text-right text-sm font-semibold tabular-nums text-slate-900">
              {format(item.count)}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-3 border-t border-line pt-2.5 text-xs text-slate-500">
          + {hidden} more not shown (top {limit} by volume).
        </p>
      )}
    </div>
  );
}
