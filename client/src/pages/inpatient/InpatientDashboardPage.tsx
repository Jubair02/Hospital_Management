import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { getInpatientStats, getWards } from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import type { InpatientStats, Ward } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/icons';
import PageHeader from '../../components/ui/PageHeader';
import StatGrid from '../../components/analytics/StatGrid';
import StackedBar, { type BarSegment } from '../../components/charts/StackedBar';
import OccupancyMeter from '../../components/inpatient/OccupancyMeter';

/** Wards listed on the board before the reader is sent to the full list. */
const WARDS_SHOWN = 8;

interface WardPressure {
  id: string;
  name: string;
  type: string;
  occupied: number;
  available: number;
  total: number;
  rate: number;
}

export default function InpatientDashboardPage() {
  const { role } = useAuth();
  const [stats, setStats] = useState<InpatientStats | null>(null);
  const [wards, setWards] = useState<WardPressure[] | null>(null);
  const [wardTotal, setWardTotal] = useState(0);
  const [wardsFailed, setWardsFailed] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const canAdmit = role === 'admin' || role === 'receptionist';

  const load = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      // The ward list only sharpens the picture — a failure there should not
      // take the headline bed figures down with it, so they settle separately.
      const [statsData, wardData] = await Promise.all([
        getInpatientStats(),
        getWards({ limit: 100, status: 'active' }).catch(() => null),
      ]);
      setStats(statsData);
      setUpdatedAt(new Date());
      setWardsFailed(wardData === null);
      if (wardData) {
        setWards(wardData.wards.map(toPressure).sort(byPressure));
        setWardTotal(wardData.pagination.total);
      } else {
        setWards([]);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load the inpatient board.'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inpatient"
        title="Ward operations"
        subtitle="Live bed state across every active ward, and today's movement in and out."
        meta={
          updatedAt && (
            <p className="text-xs text-slate-500">
              Updated{' '}
              <span className="font-medium tabular-nums text-slate-700">
                {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          )
        }
        actions={
          <>
            <Button variant="secondary" onClick={load} loading={refreshing}>
              Refresh
            </Button>
            <Link to="/inpatient/admissions">
              <Button variant="secondary">Admissions</Button>
            </Link>
            {canAdmit && (
              <Link to="/inpatient/admissions/new">
                <Button>Admit patient</Button>
              </Link>
            )}
          </>
        }
      />

      {error && (
        <Alert tone="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={load} loading={refreshing}>
              Try again
            </Button>
          </div>
        </Alert>
      )}

      <StatGrid
        loading={!stats && !error}
        stats={[
          {
            label: 'Current inpatients',
            value: stats?.currentInpatients ?? 0,
            icon: 'bed',
            tone: 'brand',
            hint: 'Admitted right now',
            to: '/inpatient/admissions',
          },
          {
            label: 'Available beds',
            value: stats?.availableBeds ?? 0,
            icon: 'check',
            tone: 'teal',
            hint: 'Ready for admission',
            to: '/inpatient/beds',
          },
          {
            label: "Today's admissions",
            value: stats?.todaysAdmissions ?? 0,
            icon: 'plus',
            tone: 'brand',
            hint: 'Since midnight',
          },
          {
            label: "Today's discharges",
            value: stats?.todaysDischarges ?? 0,
            icon: 'logout',
            tone: 'slate',
            hint: 'Since midnight',
          },
        ]}
      />

      {(stats || !error) && <BedState stats={stats} />}

      <Card
        title="Ward pressure"
        subtitle="Fullest wards first"
        icon="building"
        actions={
          <Link
            to="/inpatient/wards"
            className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
          >
            All wards
            <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
          </Link>
        }
        footer={
          wards && wardTotal > WARDS_SHOWN
            ? `Showing the ${WARDS_SHOWN} fullest of ${wardTotal} active wards.`
            : undefined
        }
      >
        <WardPressureList wards={wards} failed={wardsFailed} />
      </Card>
    </div>
  );
}

/**
 * Where the beds actually are. The four bed states are one measure split by
 * status, so they belong on one track rather than in four tiles that force the
 * reader to add up before they can see the shape of the hospital.
 */
function BedState({ stats }: { stats: InpatientStats | null }) {
  if (!stats) {
    return (
      <Card>
        <div className="h-32 w-full rounded-xl skeleton" aria-label="Loading bed state" />
      </Card>
    );
  }

  const { totalBeds, occupiedBeds, availableBeds, reservedBeds, maintenanceBeds } = stats;
  // Beds can also sit inactive, which none of the four named counts covers.
  const inactive = Math.max(
    0,
    totalBeds - occupiedBeds - availableBeds - reservedBeds - maintenanceBeds
  );
  const rate = totalBeds === 0 ? 0 : (occupiedBeds / totalBeds) * 100;
  const net = stats.todaysAdmissions - stats.todaysDischarges;

  const segments: BarSegment[] = [
    { label: 'Occupied', count: occupiedBeds, tone: 'brand' },
    { label: 'Available', count: availableBeds, tone: 'teal' },
    { label: 'Reserved', count: reservedBeds, tone: 'amber' },
    { label: 'Out of service', count: maintenanceBeds, tone: 'rose' },
    ...(inactive > 0
      ? [{ label: 'Inactive', count: inactive, tone: 'slate' } satisfies BarSegment]
      : []),
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 p-5">
          <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-[0.9375rem] font-semibold text-slate-900">Bed state</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {totalBeds.toLocaleString()} bed{totalBeds === 1 ? '' : 's'} across{' '}
                {stats.totalWards.toLocaleString()} ward{stats.totalWards === 1 ? '' : 's'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[1.75rem] font-semibold leading-none tabular-nums text-slate-900">
                {totalBeds === 0 ? '—' : `${rate.toFixed(0)}%`}
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

        <div className="flex flex-col gap-5 border-t border-line bg-slate-50/60 p-5 lg:border-l lg:border-t-0">
          <div>
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Net movement today
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
                {net === 0 ? 'beds unchanged' : net > 0 ? 'more beds in use' : 'beds freed'}
              </span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {stats.todaysAdmissions.toLocaleString()} admitted against{' '}
              {stats.todaysDischarges.toLocaleString()} discharged since midnight.
            </p>
          </div>

          <div className="border-t border-line pt-4">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Unusable beds
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              <span className="font-semibold tabular-nums text-slate-900">
                {(reservedBeds + maintenanceBeds).toLocaleString()}
              </span>{' '}
              {reservedBeds + maintenanceBeds === 1 ? 'bed is' : 'beds are'} held or out of service —{' '}
              {maintenanceBeds.toLocaleString()} awaiting maintenance.
            </p>
            <Link
              to="/inpatient/beds"
              className="-ml-1.5 mt-2 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-100/70 hover:text-brand-800"
            >
              Manage beds
              <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

function WardPressureList({
  wards,
  failed,
}: {
  wards: WardPressure[] | null;
  failed: boolean;
}) {
  // The ward list is the one part of this board that can fail on its own, so
  // it says so in place rather than leaving a panel of skeletons running.
  if (failed) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        The ward breakdown could not be loaded. The bed totals above are unaffected.
      </p>
    );
  }

  if (wards === null) {
    return (
      <ul className="space-y-2.5" aria-label="Loading wards">
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="h-11 w-full rounded-xl skeleton" />
        ))}
      </ul>
    );
  }

  if (wards.length === 0) {
    return (
      <EmptyState
        title="No active wards"
        description="Add a ward, then add beds to it, and this board starts filling in."
      />
    );
  }

  return (
    <ul className="space-y-0.5">
      {wards.slice(0, WARDS_SHOWN).map((ward) => (
        <li key={ward.id}>
          <Link
            to={`/inpatient/wards/${ward.id}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(7rem,11rem)]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{ward.name}</p>
              <p className="mt-0.5 text-xs uppercase tracking-[0.06em] text-slate-500">
                {ward.type}
              </p>
            </div>

            <p className="text-right text-xs tabular-nums text-slate-500 sm:text-left">
              {ward.total === 0 ? (
                'No beds'
              ) : (
                <>
                  <span className="font-semibold text-slate-900">{ward.available}</span> free of{' '}
                  {ward.total}
                </>
              )}
            </p>

            <OccupancyMeter
              occupied={ward.occupied}
              total={ward.total}
              className="col-span-2 sm:col-span-1"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const toPressure = (ward: Ward): WardPressure => {
  const beds = ward.bedSummary ?? {};
  const total = beds.total ?? 0;
  const occupied = beds.occupied ?? 0;

  return {
    id: ward._id,
    name: ward.name,
    type: ward.type,
    occupied,
    available: beds.available ?? 0,
    total,
    rate: total === 0 ? -1 : (occupied / total) * 100,
  };
};

/** Fullest first; wards with no beds configured sink to the bottom. */
const byPressure = (a: WardPressure, b: WardPressure): number =>
  b.rate - a.rate || b.total - a.total || a.name.localeCompare(b.name);
