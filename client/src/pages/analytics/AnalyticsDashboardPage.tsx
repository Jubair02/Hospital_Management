import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAnalyticsOverview } from '../../services/analyticsService';
import { getErrorMessage } from '../../services/api';
import type { AnalyticsOverview, ReportFilters, TimePoint } from '../../types';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import type { StatTone } from '../../components/ui/StatCard';
import type { IconName } from '../../components/ui/icons';
import DateRangeFilter from '../../components/analytics/DateRangeFilter';
import StatGrid, { type Stat } from '../../components/analytics/StatGrid';
import DonutChart from '../../components/charts/DonutChart';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';
import { formatBucket, formatMoneyShort } from '../../components/charts/chartTheme';

const REPORT_LINKS = [
  { to: '/reports/appointments', label: 'Appointments' },
  { to: '/reports/patients', label: 'Patients' },
  { to: '/reports/clinical', label: 'Clinical' },
  { to: '/reports/pharmacy', label: 'Pharmacy' },
  { to: '/reports/laboratory', label: 'Laboratory' },
  { to: '/reports/billing', label: 'Billing' },
  { to: '/reports/inpatient', label: 'Inpatient' },
];

const values = (points: TimePoint[]): number[] => points.map((point) => point.value);

/**
 * Percentage change between the last two buckets of a series. Returns
 * `undefined` rather than a made-up figure when there is nothing to compare
 * against, or when the previous bucket was zero — "up from nothing" has no
 * meaningful percentage.
 */
const bucketDelta = (points: TimePoint[]): number | undefined => {
  if (points.length < 2) return undefined;
  const latest = points[points.length - 1]!.value;
  const previous = points[points.length - 2]!.value;
  if (previous === 0) return undefined;
  return ((latest - previous) / previous) * 100;
};

/**
 * Hospital-wide overview. The charts are grouped into demand (what was asked
 * of the hospital), delivery (what it actually did) and money, so the page
 * tells a sequence rather than presenting nine equally-weighted plots.
 *
 * The KPIs are split the same way: the four measures the API returns a series
 * for get sparklines and a bucket-over-bucket delta, and the point-in-time
 * figures — register size, capacity, money owed — sit in their own row without
 * them. Splitting on "does this have a series" keeps every grid row an even
 * height, which mixing the two would not.
 */
export default function AnalyticsDashboardPage() {
  const [filters, setFilters] = useState<ReportFilters>({ range: 'month' });
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const ready = filters.range !== 'custom' || Boolean(filters.from);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError('');
    try {
      setOverview(await getAnalyticsOverview(filters));
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load analytics.'));
    } finally {
      setLoading(false);
    }
  }, [filters, ready]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = overview?.kpis;
  const range = overview?.range;
  const perBucket = `vs previous ${range?.granularity ?? 'bucket'}`;

  /** Measures with a series behind them: sparkline + bucket-over-bucket delta. */
  const activity = (
    label: string,
    value: number,
    hint: string,
    icon: IconName,
    tone: StatTone,
    points: TimePoint[] | undefined
  ): Stat => ({
    label,
    value,
    hint,
    icon,
    tone,
    trend: points && values(points),
    delta: points && bucketDelta(points),
    deltaLabel: perBucket,
  });

  const activityStats: Stat[] = [
    activity(
      'Appointments',
      kpis?.totalAppointments ?? 0,
      'Booked in this period',
      'appointments',
      'brand',
      overview?.series.appointments
    ),
    activity(
      'Consultations',
      kpis?.completedConsultations ?? 0,
      'Completed in this period',
      'clipboard',
      'brand',
      overview?.series.consultations
    ),
    activity(
      'Pharmacy dispensing',
      kpis?.pharmacyDispensings ?? 0,
      'Dispensing events',
      'pill',
      'teal',
      overview?.series.pharmacy
    ),
    activity(
      'Lab orders',
      kpis?.laboratoryOrders ?? 0,
      'Ordered in this period',
      'flask',
      'teal',
      overview?.series.laboratory
    ),
  ];

  /** Point-in-time figures: no series exists, so no trend is invented. */
  const positionStats: Stat[] = [
    {
      label: 'Total patients',
      value: kpis?.totalPatients ?? 0,
      hint: 'All registered patients',
      icon: 'patients',
      tone: 'brand',
    },
    {
      label: 'Active doctors',
      value: kpis?.totalDoctors ?? 0,
      hint: 'Bookable doctors',
      icon: 'doctors',
      tone: 'brand',
    },
    {
      label: 'Current inpatients',
      value: kpis?.currentInpatients ?? 0,
      hint: 'Admitted right now',
      icon: 'bed',
      tone: 'amber',
    },
    {
      label: 'Revenue',
      value: kpis?.totalRevenue ?? 0,
      money: true,
      hint: 'Payments minus refunds',
      icon: 'cash',
      tone: 'teal',
    },
    {
      label: 'Outstanding',
      value: kpis?.outstandingPayments ?? 0,
      money: true,
      alert: true,
      hint: 'Due across issued invoices',
      icon: 'alert',
      tone: 'rose',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Hospital overview"
        subtitle="Activity from live records — every number here is queried from the database, never cached."
        meta={
          range ? (
            <>
              <Badge tone="brand">
                {formatBucket(range.start.slice(0, 10))} — {formatBucket(range.end.slice(0, 10))}
              </Badge>
              <Badge tone="slate">Bucketed by {range.granularity}</Badge>
            </>
          ) : undefined
        }
        actions={
          <>
            <Button variant="secondary" onClick={load} loading={loading}>
              Refresh
            </Button>
            <Link to="/reports/billing">
              <Button variant="ghost">Billing report</Button>
            </Link>
          </>
        }
      />

      <DateRangeFilter value={filters} onChange={setFilters} />

      {error && <Alert tone="error">{error}</Alert>}

      {loading && !overview ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" className="text-brand-600" />
        </div>
      ) : (
        <div
          className={loading ? 'space-y-8 opacity-60 transition-opacity duration-200' : 'space-y-8'}
        >
          <section className="space-y-3">
            <SectionHeading title="Activity" hint="Volumes in this period, with their trend" />
            <StatGrid stats={activityStats} loading={!overview} columns={4} />
          </section>

          <section className="space-y-3">
            <SectionHeading title="Position" hint="Register size, capacity, and money" />
            <StatGrid stats={positionStats} loading={!overview} columns={4} />
          </section>

          {overview && (
            <>
              <section className="space-y-3">
                <SectionHeading
                  title="Demand"
                  hint="What the hospital was asked to do in this period"
                />
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                  <Card title="Appointments" subtitle="Bookings per bucket" icon="appointments">
                    <TimeSeriesChart
                      series={[{ name: 'Appointments', points: overview.series.appointments }]}
                      ariaLabel="Appointments booked over the selected period"
                    />
                  </Card>

                  <Card
                    title="Patient registrations"
                    subtitle="New patient records"
                    icon="patients"
                  >
                    <TimeSeriesChart
                      series={[{ name: 'Registrations', points: overview.series.registrations }]}
                      ariaLabel="Patient registrations over the selected period"
                    />
                  </Card>
                </div>
              </section>

              <section className="space-y-3">
                <SectionHeading title="Delivery" hint="What was actually carried out" />
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                  <Card title="Consultations" subtitle="Clinical volume" icon="clipboard">
                    <TimeSeriesChart
                      series={[{ name: 'Consultations', points: overview.series.consultations }]}
                      ariaLabel="Consultations over the selected period"
                    />
                  </Card>

                  <Card
                    title="Pharmacy & laboratory"
                    subtitle="Service activity on one shared scale"
                    icon="flask"
                  >
                    <TimeSeriesChart
                      series={[
                        { name: 'Dispensing', points: overview.series.pharmacy },
                        { name: 'Lab orders', points: overview.series.laboratory },
                      ]}
                      ariaLabel="Pharmacy dispensing events and laboratory orders over the selected period"
                    />
                  </Card>

                  <Card
                    title="Admissions & discharges"
                    subtitle="Inpatient flow — a widening gap means beds filling"
                    icon="bed"
                  >
                    <TimeSeriesChart
                      series={[
                        { name: 'Admissions', points: overview.series.admissions },
                        { name: 'Discharges', points: overview.series.discharges },
                      ]}
                      ariaLabel="Admissions and discharges over the selected period"
                    />
                  </Card>

                  <Card title="Revenue" subtitle="Payments minus refunds" icon="cash">
                    <TimeSeriesChart
                      series={[{ name: 'Revenue', points: overview.series.revenue }]}
                      format={formatMoneyShort}
                      ariaLabel="Revenue collected over the selected period"
                    />
                  </Card>
                </div>
              </section>

              <section className="space-y-3">
                <SectionHeading title="Money" hint="Collected against what is still owed" />
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                  <Card
                    title="Billing position"
                    subtitle="Collected versus outstanding across issued invoices"
                    icon="cash"
                  >
                    <DonutChart
                      slices={[
                        {
                          label: 'Collected',
                          count: Math.max(overview.kpis.totalRevenue, 0),
                          tone: 'teal',
                        },
                        {
                          label: 'Outstanding',
                          count: Math.max(overview.kpis.outstandingPayments, 0),
                          tone: 'amber',
                        },
                      ]}
                      centreLabel="billed"
                      format={formatMoneyShort}
                      emptyMessage="Nothing billed in this period."
                      ariaLabel="Collected revenue compared with outstanding payments"
                    />
                  </Card>

                  <Card
                    title="Detailed reports"
                    subtitle="Filterable, exportable breakdowns"
                    icon="reports"
                  >
                    <div className="flex flex-wrap gap-2">
                      {REPORT_LINKS.map((link) => (
                        <Link key={link.to} to={link.to}>
                          <Button variant="secondary" size="sm">
                            {link.label}
                          </Button>
                        </Link>
                      ))}
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-slate-500">
                      Each report opens with its own range selector and exports to CSV with the
                      filters applied server-side, so an export always matches what is on screen.
                    </p>
                  </Card>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
