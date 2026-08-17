import { useState } from 'react';
import useAuth from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import PageHeader, { SectionHeading } from '../../components/ui/PageHeader';
import AppointmentStatsCards from '../../components/appointments/AppointmentStatsCards';
import TodaysScheduleCard from '../../components/appointments/TodaysScheduleCard';
import ConsultationStatsCards from '../../components/consultations/ConsultationStatsCards';
import OpenConsultationsCard from '../../components/consultations/OpenConsultationsCard';
import WeekAheadCard from '../../components/appointments/WeekAheadCard';

export default function DoctorDashboard() {
  const { user } = useAuth();

  /**
   * One Refresh for the whole board. Every panel fetches for itself — a tile
   * failing should not blank the clinic list — so the button bumps a key they
   * all watch rather than owning their data here.
   */
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());

  const refresh = () => {
    setRefreshKey((key) => key + 1);
    setUpdatedAt(new Date());
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Doctor"
        title={`Welcome, Dr. ${user?.lastName ?? ''}`.trim()}
        subtitle="Your clinic for today, plus anything still open from earlier."
        meta={
          <p className="text-xs text-slate-500">
            Updated{' '}
            <span className="font-medium tabular-nums text-slate-700">
              {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
        }
        // Deliberately no "My appointments / My consultations / My availability"
        // buttons: all three are one click away in the navigation rail, and a
        // header of links to places rather than actions makes the page look busy
        // while doing nothing the rail does not already do.
        actions={
          <Button variant="secondary" onClick={refresh}>
            Refresh
          </Button>
        }
      />

      <section className="space-y-3">
        <SectionHeading title="Appointments" hint="Today's clinic and what is booked ahead" />
        <AppointmentStatsCards view="doctor" refreshKey={refreshKey} />
      </section>

      {/* The work itself, not a count of it: who is coming, and what is unfinished. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <TodaysScheduleCard view="doctor" refreshKey={refreshKey} />

        <div className="space-y-6">
          <OpenConsultationsCard refreshKey={refreshKey} />
          {/* Today is answered above; this is the question that used to have
              no answer anywhere — what the rest of the week looks like. */}
          <WeekAheadCard refreshKey={refreshKey} />
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeading title="Consultations" hint="Records started, locked, and still open" />
        <ConsultationStatsCards view="doctor" refreshKey={refreshKey} />
      </section>
    </div>
  );
}
