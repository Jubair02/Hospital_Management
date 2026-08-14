import { useState, type ReactNode } from 'react';
import type { NamedCount } from '../../types';
import { MAGNITUDE_COLOR, formatCount } from '../charts/chartTheme';
import Icon from '../ui/icons';

interface RankBoardProps {
  items: NamedCount[];
  /** Rows drawn before the "show all" control; the rest stay one click away. */
  initialRows?: number;
  /** Node between the rank and the label — an initials plate, a glyph. */
  leading?: (item: NamedCount, index: number) => ReactNode;
  /** Denominator for the share column. Defaults to the sum of `items`. */
  total?: number;
  format?: (value: number) => string;
  emptyMessage?: string;
  ariaLabel: string;
}

/**
 * A ranked league table for one measure across named things.
 *
 * Differs from `BarList` on purpose: the label sits on its own line above the
 * bar, so a long diagnosis or a full doctor name reads in full instead of
 * being truncated into a narrow first column — and the rank is explicit, which
 * is what a "top N" list is actually being read for.
 *
 * Rows past `initialRows` are collapsed behind a control that states the real
 * count. Silently cutting a list at ten reads as "that's all there is".
 */
export default function RankBoard({
  items,
  initialRows = 8,
  leading,
  total,
  format = formatCount,
  emptyMessage = 'No data in this period.',
  ariaLabel,
}: RankBoardProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  const shown = expanded ? items : items.slice(0, initialRows);
  const hidden = items.length - shown.length;
  const max = Math.max(1, ...items.map((item) => item.count));
  const denominator = total ?? items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div>
      <ol role="img" aria-label={ariaLabel} className="space-y-0.5">
        {shown.map((item, index) => (
          <li
            key={item.label}
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-slate-50"
          >
            <span
              aria-hidden="true"
              className={`w-4 shrink-0 text-right text-xs font-semibold tabular-nums ${
                index < 3 ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {index + 1}
            </span>

            {leading?.(item, index)}

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-slate-800" title={item.label}>
                  {item.label}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {format(item.count)}
                  </span>
                  {denominator > 0 && (
                    <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                      {Math.round((item.count / denominator) * 100)}%
                    </span>
                  )}
                </span>
              </div>

              <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.max((item.count / max) * 100, item.count > 0 ? 3 : 0)}%`,
                    backgroundColor: MAGNITUDE_COLOR,
                  }}
                />
              </span>
            </div>
          </li>
        ))}
      </ol>

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-t border-line pt-3 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-800"
        >
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
          <Icon
            name="chevronDown"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${
              expanded ? '-rotate-180' : ''
            }`}
            strokeWidth="2.2"
          />
        </button>
      )}
    </div>
  );
}

/**
 * Initials plate for a person row. A squircle rather than a circle: the app's
 * corner language is soft-rectangular throughout, and avatar circles beside
 * rounded cards read as borrowed from somewhere else.
 */
export function InitialsPlate({ name }: { name: string }) {
  const initials =
    name
      .replace(/^dr\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?';

  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-[0.6875rem] font-semibold tracking-[0.02em] text-brand-700 ring-1 ring-inset ring-brand-100"
    >
      {initials}
    </span>
  );
}
