import type { ReactNode } from 'react';
import Spinner from './Spinner';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
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
}

/**
 * Generic data table. Rows need a stable `_id` (or `id`).
 */
export default function Table<T extends { _id?: string; id?: string }>({
  columns,
  rows,
  loading = false,
  emptyState = null,
  footer = null,
}: TableProps<T>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
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
                      {col.render
                        ? col.render(row)
                        : ((row as Record<string, unknown>)[col.key] as ReactNode)}
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
  );
}
