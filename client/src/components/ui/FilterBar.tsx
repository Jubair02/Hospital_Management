import type { ReactNode } from 'react';

interface FilterBarProps {
  /** The controls themselves. The caller owns their grid. */
  children: ReactNode;
  /** Matching rows, from the server's pagination. */
  total?: number;
  /** Singular noun for the count — "medicine" reads as "3 medicines". */
  noun: string;
  /** True when a filter is narrowing the list, which is what offers the reset. */
  active?: boolean;
  onClear?: () => void;
  loading?: boolean;
}

/**
 * The strip of controls above a list, and what they left behind.
 *
 * Two things this fixes wherever it replaces a bare `<Card>`. A page that
 * filtered down to three rows showed no count at all, because `Pagination`
 * hides itself below two pages — so the one moment you most want to know how
 * many matched was the one moment nothing said. And a filter that is narrowing
 * a list needs a way out that is not "set every control back by hand".
 *
 * The reset only appears when something is actually filtered: a Clear button
 * that is always there is a permanent invitation to undo nothing.
 */
export default function FilterBar({
  children,
  total,
  noun,
  active = false,
  onClear,
  loading = false,
}: FilterBarProps) {
  const showSummary = (total !== undefined && !loading) || active;

  return (
    <section className="surface-card min-w-0">
      <div className="px-4 py-3.5 sm:px-5">{children}</div>

      {showSummary && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-2.5 sm:px-5">
          <p className="text-xs tabular-nums text-slate-500">
            {total === undefined || loading
              ? 'Filtering…'
              : `${total} ${total === 1 ? noun : `${noun}s`}${active ? ' match' : ''}`}
          </p>

          {active && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  );
}
