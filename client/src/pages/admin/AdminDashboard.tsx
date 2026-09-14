import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import useSettings from '../../hooks/useSettings';
import { getAnalyticsOverview } from '../../services/analyticsService';
import { getErrorMessage } from '../../services/api';
import { bucketDelta, seriesValues } from '../../utils/series';
import { formatTime } from '../../utils/date';
import { ROLE_LABELS } from '../../utils/constants';
import type { AnalyticsOverview, ReportFilters } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Icon from '../../components/ui/icons';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import TimeSeriesChart from '../../components/charts/TimeSeriesChart';
import DateRangeFilter from '../../components/analytics/DateRangeFilter';
import SystemHealthCard from '../../components/admin/SystemHealthCard';
import ActivityFeedCard from '../../components/admin/ActivityFeedCard';

/** How the range label reads under a delta. */
const PER_BUCKET: Record<string, string> = {
  today: 'vs previous hour',
  week: 'vs previous day',
  month: 'vs previous day',
  quarter: 'vs previous week',
  year: 'vs previous month',
};

const formatCount = (value: number): string => value.toLocaleString();

/**
 * The administrator's operating picture.
 *
 * It used to be three stacked rows of counters and nothing else — twelve
 * point-in-time figures, none of which said whether it was going up or down,
 * and a subtitle promising a "live operating picture" that the page never
 * delivered. Meanwhile the analytics endpoint behind `/analytics` was already
 * returning eight time series that nothing on this screen touched.
 *
 * So the numbers now carry direction: every measure with a series behind it
 * gets a sparkline and a bucket-over-bucket delta, and the tiles link through
 * to the records they count. Underneath, the two things only an administrator
 * can act on — whether the software is healthy, and what has just happened in
 * it — get panels of their own rather than living on pages nobody remembers to
 * open.
 */
export default function AdminDashboard() {
  const { user, role } = useAuth();
  const { hospitalName } = useSettings();

  const [filters, setFilters] = useState<ReportFilters>({ range: 'week' });
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOverview(await getAnalyticsOverview(filters));
      setFetchedAt(new Date());
    } catch (err) {
      setOverview(null);
      setError(getErrorMessage(err, 'Unable to load the operating picture.'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const refresh = () => setRefreshKey((key) => key + 1);

  const kpis = overview?.kpis;
  const series = overview?.series;
  const deltaLabel = PER_BUCKET[filters.range ?? 'week'] ?? 'vs previous bucket';

  /**
   * Tiles are ordered demand → delivery → money, which is the sequence the
   * hospital actually runs in. Only measures the API returns a series for get
   * a trend; inventing one for a point-in-time figure would imply a history
   * the number does not have.
   */
  const tiles = [
    {
      label: 'Appointments',
      value: kpis?.totalAppointments,
      hint: 'Booked in this period',
      icon: 'appointments' as const,
      tone: 'brand' as const,
      points: series?.appointments,
      to: '/admin/appointments',
    },
    {
      label: 'Consultations',
      value: kpis?.completedConsultations,
      hint: 'Completed in this period',
      icon: 'clipboard' as const,
      tone: 'brand' as const,
      points: series?.consultations,
      to: '/admin/appointments',
    },
    {
      label: 'New registrations',
      value: kpis?.totalPatients,
      hint: 'Patients on the register',
      icon: 'patients' as const,
      tone: 'teal' as const,
      points: series?.registrations,
      to: '/admin/patients',
    },
    {
      label: 'Revenue',
      value: kpis?.totalRevenue,
      hint: 'Collected in this period',
      icon: 'cash' as const,
      tone: 'teal' as const,
      points: series?.revenue,
      money: true,
      to: '/billing',
    },
    {
      label: 'Inpatients',
      value: kpis?.currentInpatients,
      hint: 'In a bed right now',
      icon: 'bed' as const,
      tone: 'brand' as const,
      points: undefined,
      to: '/inpatient/admissions',
    },
    {
      label: 'Outstanding',
      value: kpis?.outstandingPayments,
      hint: 'Invoiced and unpaid',
      icon: 'alert' as const,
      tone: 'amber' as const,
      points: undefined,
      money: true,
      to: '/billing/invoices',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title={`Welcome back, ${user?.firstName ?? ''}`.trim()}
        subtitle={`Live operating picture for ${hospitalName}. Every figure is queried from the database, not cached.`}
        actions={
          <>
            <Link to="/admin/patients/new">
              <Button variant="secondary">
                <Icon name="plus" className="h-4 w-4" />
                Register patient
              </Button>
            </Link>
            <Button onClick={refresh} loading={loading}>
              Refresh
            </Button>
          </>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <DateRangeFilter value={filters} onChange={setFilters}>
        {fetchedAt && (
          <p className="text-xs tabular-nums text-slate-400">As of {formatTime(fetchedAt.toISOString())}</p>
        )}
      </DateRangeFilter>

      {/* One quiet wave rather than twelve tiles appearing at once. The delay
          is capped and `.rise` is a single settle, so a slow network never
          leaves the last tile visibly late. Reduced motion disables it. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile, index) => (
          <StatCard
            key={tile.label}
            className="rise"
            style={{ animationDelay: `${index * 45}ms` }}
            label={tile.label}
            value={loading ? null : tile.value}
            hint={tile.hint}
            icon={tile.icon}
            tone={tile.tone}
            money={tile.money}
            to={tile.to}
            trend={tile.points && seriesValues(tile.points)}
            delta={tile.points && bucketDelta(tile.points)}
            deltaLabel={tile.points ? deltaLabel : undefined}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Card
          title="Demand and delivery"
          subtitle="Appointments booked against consultations completed"
          icon="activity"
          actions={
            <Link
              to="/analytics"
              className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
            >
              Full analytics
              <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
            </Link>
          }
        >
          {loading || !series ? (
            <div className="h-[260px] w-full rounded-xl skeleton" aria-label="Loading activity" />
          ) : (
            <TimeSeriesChart
              height={260}
              format={formatCount}
              ariaLabel="Appointments booked and consultations completed over the selected period"
              series={[
                { name: 'Appointments', points: series.appointments },
                { name: 'Consultations', points: series.consultations },
              ]}
            />
          )}
        </Card>

        <SystemHealthCard refreshKey={refreshKey} />
      </div>

      <ActivityFeedCard refreshKey={refreshKey} />
    </div>
  );
}
