import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../utils/constants';
import Button from '../../components/ui/Button';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import Icon from '../../components/ui/icons';
import PatientStatsCards from '../../components/patients/PatientStatsCards';
import AppointmentStatsCards from '../../components/appointments/AppointmentStatsCards';
import TodaysScheduleCard from '../../components/appointments/TodaysScheduleCard';

export default function ReceptionistDashboard() {
  const { user, role } = useAuth();

  /** One Refresh for the whole board; each panel watches the key and refetches. */
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());

  const refresh = () => {
    setRefreshKey((key) => key + 1);
    setUpdatedAt(new Date());
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={role ? ROLE_LABELS[role] : undefined}
        title={`Welcome, ${user?.firstName ?? ''}`.trim()}
        subtitle="Front desk at a glance — who is expected today, and the patient register behind them."
        meta={
          <p className="text-xs text-slate-500">
            Updated{' '}
            <span className="font-medium tabular-nums text-slate-700">
              {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
        }
        actions={
          <>
            <Button variant="secondary" onClick={refresh}>
              Refresh
            </Button>
            <Link to="/receptionist/patients/new">
              <Button variant="secondary">Register patient</Button>
            </Link>
            <Link to="/receptionist/appointments/new">
              <Button>
                <Icon name="plus" className="h-4 w-4" />
                Book appointment
              </Button>
            </Link>
          </>
        }
      />

      {/* The day itself first. The counters below say how many; this says who. */}
      <TodaysScheduleCard view="receptionist" refreshKey={refreshKey} />

      <section className="space-y-3">
        <SectionHeading title="Today's appointments" hint="Booked, confirmed, and cancelled today" />
        <AppointmentStatsCards view="receptionist" refreshKey={refreshKey} />
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Patients"
          hint="Register size and this month's intake"
          actions={
            <Link
              to="/receptionist/patients"
              className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
            >
              Open register
              <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
            </Link>
          }
        />
        <PatientStatsCards refreshKey={refreshKey} />
      </section>
    </div>
  );
}
