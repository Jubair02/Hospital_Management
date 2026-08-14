import type { ReactNode } from 'react';
import Spinner from './Spinner';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  /**
   * Applied to the `th` and `td`. Layout for the table only — the stacked card
   * view ignores it, because these are mostly breakpoint rules like
   * `hidden lg:table-cell` that exist to thin out a wide table. Reapplying
   * them to a card would hide the very fields the card exists to show.
   */
  className?: string;
  /** Keep this column out of the card view (below `md`). */
  hideOnCard?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyState?: ReactNode;
  /**
   * Strip under a closing hairline, for pagination and row counts. Belongs
   * inside the table's own border: a pagination bar floating beneath the
   * surface reads as unrelated to the rows it controls.
   */
  footer?: ReactNode;
  /**
   * Set false to keep the real table at every width — for the rare grid whose
   * meaning is the comparison down a column rather than the individual row.
   */
  cardsOnMobile?: boolean;
}

const cellOf = <T,>(row: T, col: Column<T>): ReactNode =>
  col.render ? col.render(row) : ((row as Record<string, unknown>)[col.key] as ReactNode);

/**
 * Generic data table. Rows need a stable `_id` (or `id`).
 *
 * Below `md` the same data is rendered as stacked cards instead. A row here
 * carries eight or nine fields, and eight columns on a phone is a horizontal
 * scrollbar hiding most of them with the actions stranded off the right edge.
 * The card view is built from the same `columns` array, so every list screen
 * gets it without touching a single page:
 *
 *   - the first column is the row's identity, so it becomes the card heading
 *   - a column keyed `actions` becomes the card's foot, unlabelled
 *   - everything else becomes a labelled field, two per line
 *
 * Only one of the two is in the DOM's accessibility tree at a time (`hidden`
 * removes it), so a screen reader is never read the same list twice.
 */
export default function Table<T extends { _id?: string; id?: string }>({
  columns,
  rows,
  loading = false,
  emptyState = null,
  footer = null,
  cardsOnMobile = true,
}: TableProps<T>) {
  const cardColumns = columns.filter((col) => !col.hideOnCard);
  const [heading, ...restColumns] = cardColumns;
  const actions = restColumns.find((col) => col.key === 'actions');
  const fields = restColumns.filter((col) => col.key !== 'actions');

  const placeholder = loading ? (
    <div className="flex justify-center py-14">
      <Spinner className="text-brand-600" />
    </div>
  ) : (
    <div className="py-10">
      {emptyState ?? <p className="text-center text-slate-500">No records found.</p>}
    </div>
  );

  const empty = loading || rows.length === 0;

  return (
    <>
      <div
        className={`overflow-hidden rounded-2xl border border-line bg-white shadow-sm ${
          cardsOnMobile ? 'hidden md:block' : ''
        }`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`whitespace-nowrap px-4 py-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-slate-500 ${
                      col.className ?? ''
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-14 text-center">
                    <Spinner className="text-brand-600" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-14">
                    {emptyState ?? <p className="text-center text-slate-500">No records found.</p>}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row._id ?? row.id} className="transition-colors hover:bg-brand-50/40">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3.5 text-slate-700 ${col.className ?? ''}`}
                      >
                        {cellOf(row, col)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {footer && <div className="border-t border-line bg-slate-50/60 px-4 py-3">{footer}</div>}
      </div>

      {cardsOnMobile && (
        <div className="md:hidden">
          {empty ? (
            <div className="rounded-2xl border border-line bg-white px-4 shadow-sm">
              {placeholder}
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li
                  key={row._id ?? row.id}
                  className="rounded-2xl border border-line bg-white p-4 shadow-sm"
                >
                  {heading && (
                    <div className="text-[0.9375rem] font-semibold text-slate-900">
                      {cellOf(row, heading)}
                    </div>
                  )}

                  {fields.length > 0 && (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 text-sm">
                      {fields.map((col) => (
                        <div key={col.key} className="min-w-0">
                          <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-slate-500">
                            {col.header}
                          </dt>
                          <dd className="mt-1 text-slate-700">{cellOf(row, col)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {actions && (
                    // The cell brings its own alignment from the table, where
                    // it is right-aligned so buttons line up down the edge.
                    // Left as authored rather than overridden — a card's
                    // actions sitting on its right edge still reads correctly,
                    // and fighting it here would mean a specificity trick that
                    // silently breaks the first time a page aligns differently.
                    <div className="mt-3 border-t border-line pt-3">{cellOf(row, actions)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {footer && !empty && (
            <div className="mt-3 rounded-2xl border border-line bg-slate-50/60 px-4 py-3 shadow-sm">
              {footer}
            </div>
          )}
        </div>
      )}
    </>
  );
}
