import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { downloadReportCsv } from '../../services/analyticsService';
import { getErrorMessage } from '../../services/api';
import type { ReportFilters } from '../../types';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
import PageHeader from '../ui/PageHeader';
import Spinner from '../ui/Spinner';
import DateRangeFilter from './DateRangeFilter';

export type ReportName =
  | 'appointments'
  | 'patients'
  | 'clinical'
  | 'pharmacy'
  | 'laboratory'
  | 'billing'
  | 'inpatient';

interface ReportShellProps<T> {
  title: string;
  description: string;
  report: ReportName;
  /** Fetches the report for the current range and extra filters. */
  load: (filters: ReportFilters) => Promise<T>;
  /** Extra query params sent to both the view and the CSV export. */
  exportParams?: Record<string, string | undefined>;
  /** Extra controls rendered beside the range selector. */
  controls?: ReactNode;
  children: (data: T) => ReactNode;
}

/**
 * Shared frame for every report: range selector, extra filters, CSV
 * export, and the loading / error / empty states. Each report only
 * supplies its fetcher and its body.
 */
export default function ReportShell<T>({
  title,
  description,
  report,
  load,
  exportParams = {},
  controls,
  children,
}: ReportShellProps<T>) {
  const [filters, setFilters] = useState<ReportFilters>({ range: 'month' });
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Only re-fetch when the range actually changes (a half-typed custom
  // date should not fire a request).
  const ready = filters.range !== 'custom' || Boolean(filters.from);

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError('');
    try {
      setData(await load(filters));
    } catch (err) {
      setError(getErrorMessage(err, `Unable to load the ${report} report.`));
    } finally {
      setLoading(false);
    }
    // `load` is redefined on each render by callers; the filters are the
    // real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, ready, report]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      await downloadReportCsv(report, {
        range: filters.range,
        from: filters.from,
        to: filters.to,
        ...exportParams,
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to export this report.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Report" title={title} subtitle={description} />

      <DateRangeFilter value={filters} onChange={setFilters}>
        {controls}
        <Button variant="secondary" loading={exporting} onClick={handleExport} disabled={!data}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </DateRangeFilter>

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" className="text-brand-600" />
        </div>
      ) : data ? (
        <div className={loading ? 'opacity-60 transition-opacity duration-200' : undefined}>
          {children(data)}
        </div>
      ) : (
        !error && <Alert tone="info">Choose a date range to build this report.</Alert>
      )}
    </div>
  );
}
