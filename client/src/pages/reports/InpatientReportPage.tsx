import { useCallback } from 'react';
import { getInpatientReport } from '../../services/analyticsService';
import type { InpatientReportData, ReportFilters } from '../../types';
import Card from '../../components/ui/Card';
import { SectionHeading } from '../../components/ui/PageHeader';
import Table, { type Column } from '../../components/ui/Table';
import ReportShell from '../../components/analytics/ReportShell';
import StatGrid from '../../components/analytics/StatGrid';
import StackedBar, { type BarSegment } from '../../components/charts/StackedBar';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';
import OccupancyMeter from '../../components/inpatient/OccupancyMeter';

type WardRow = InpatientReportData['byWard'][number] & { id: string };

export default function InpatientReportPage() {
  const load = useCallback((filters: ReportFilters) => getInpatientReport(filters), []);

  return (
    <ReportShell<InpatientReportData>
      title="Inpatient report"
      description="Admission flow across the selected range, and bed occupancy as it stands right now."
      report="inpatient"
      load={load}
    >
      {(report) => <InpatientReportBody report={report} />}
    </ReportShell>
  );
}

function InpatientReportBody({ report }: { report: InpatientReportData }) {
  const { currentInpatients, admissions, discharges, transfers } = report.summary;

  return (
    <div className="space-y-6">
      <StatGrid
        stats={[
          {
            label: 'Current inpatients',
            value: currentInpatients,
            icon: 'bed',
            tone: 'brand',
            hint: 'Admitted right now',
          },
          {
            label: 'Admissions',
            value: admissions,
            icon: 'plus',
            tone: 'brand',
            hint: 'In this period',
          },
          {
            label: 'Discharges',
            value: discharges,
            icon: 'logout',
            tone: 'teal',
            hint: 'In this period',
          },
          {
            label: 'Transfers',
            value: transfers,
            icon: 'activity',
            tone: 'slate',
            hint: 'Bed or ward moves',
          },
        ]}
      />

      <Capacity report={report} />

      <Card title="Admissions and discharges" subtitle="Inpatient flow per bucket" icon="activity">
        <TimeSeriesChart
          series={[
            { name: 'Admissions', points: report.admissionSeries },
            { name: 'Discharges', points: report.dischargeSeries },
          ]}
          height={236}
          ariaLabel="Admissions and discharges over the selected period"
        />
      </Card>

      <section className="space-y-3">
        <SectionHeading
          title="Occupancy by ward"
          hint="Current bed use, fullest ward first. Not scoped to the selected range."
        />
        <WardTable rows={report.byWard} />
      </section>
    </div>
  );
}

/**
 * Bed capacity as it stands. Deliberately separated from the flow figures
 * above it, and labelled: occupancy is a live reading, so showing it as a
 * seventh tile in a grid of range-scoped counts invites it to be read as a
 * figure "for this period", which it is not.
 *
 * The rate also cannot sit in a `StatCard` — that renders its value as a count,
 * so 78.3 would read as 78 beds rather than 78% of them.
 */
function Capacity({ report }: { report: InpatientReportData }) {
  const { totalBeds, occupiedBeds, availableBeds, occupancyRate, admissions, discharges } =
    report.summary;
  // available + occupied does not have to be the whole estate: beds can also be
  // reserved, out of service, or inactive.
  const other = Math.max(0, totalBeds - occupiedBeds - availableBeds);
  const net = admissions - discharges;

  const segments: BarSegment[] = [
    { label: 'Occupied', count: occupiedBeds, tone: 'brand' },
    { label: 'Available', count: availableBeds, tone: 'teal' },
    ...(other > 0
      ? [{ label: 'Reserved or out of service', count: other, tone: 'amber' } satisfies BarSegment]
      : []),
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 p-5">
          <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-slate-900">Bed capacity</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {totalBeds.toLocaleString()} bed{totalBeds === 1 ? '' : 's'} · as of now
              </p>
            </div>
            <div className="text-right">
              <p className="text-[1.75rem] font-semibold leading-none tabular-nums text-slate-900">
                {totalBeds === 0 ? '—' : `${occupancyRate.toFixed(1)}%`}
              </p>
              <p className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                occupied
              </p>
            </div>
          </header>

          <StackedBar
            segments={segments}
            ariaLabel="Beds by status"
            emptyMessage="No beds configured yet."
          />
        </div>

        <div className="border-t border-line bg-slate-50/60 p-5 lg:border-l lg:border-t-0">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Net census change
          </h3>
          <p className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-[1.75rem] font-semibold leading-none tabular-nums ${
                net > 0 ? 'text-brand-700' : net < 0 ? 'text-accent-700' : 'text-slate-900'
              }`}
            >
              {net > 0 ? '+' : ''}
              {net.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">
              {net === 0 ? 'no change' : net > 0 ? 'more in than out' : 'more out than in'}
            </span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {admissions.toLocaleString()} admission{admissions === 1 ? '' : 's'} against{' '}
            {discharges.toLocaleString()} discharge{discharges === 1 ? '' : 's'} in this range.
            Transfers move a patient between beds and do not change the census.
          </p>
        </div>
      </div>
    </Card>
  );
}

function WardTable({ rows }: { rows: InpatientReportData['byWard'] }) {
  // Fullest first — the reason to open this table is to find where the
  // pressure is. Wards with no beds configured sort to the bottom.
  const rate = (row: WardRow): number => (row.total === 0 ? -1 : row.occupied / row.total);
  const ranked: WardRow[] = [...rows]
    .map((row, index) => ({ ...row, id: String(index) }))
    .sort((a, b) => rate(b) - rate(a) || b.total - a.total || a.label.localeCompare(b.label));

  const columns: Column<WardRow>[] = [
    {
      key: 'label',
      header: 'Ward',
      render: (row) => <span className="font-medium text-slate-900">{row.label}</span>,
    },
    {
      key: 'count',
      header: 'Inpatients',
      className: 'text-right',
      render: (row) => <span className="tabular-nums">{row.count.toLocaleString()}</span>,
    },
    {
      key: 'beds',
      header: 'Beds in use',
      className: 'text-right',
      render: (row) => (
        <span className="tabular-nums">
          <span className="font-semibold text-slate-900">{row.occupied.toLocaleString()}</span>
          <span className="text-slate-400"> / {row.total.toLocaleString()}</span>
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Occupancy',
      className: 'w-52',
      render: (row) => <OccupancyMeter occupied={row.occupied} total={row.total} size="sm" />,
    },
  ];

  return (
    <Table
      columns={columns}
      rows={ranked}
      emptyState={<p className="text-center text-sm text-slate-500">No wards configured.</p>}
    />
  );
}
