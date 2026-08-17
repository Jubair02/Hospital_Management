import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAppointments } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import { localDay } from '../../utils/date';
import type { Appointment, Consultation } from '../../types';
import ConsultationAction from '../consultations/ConsultationAction';
import useLiveConsultations from '../../hooks/useLiveConsultations';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/icons';
import AppointmentStatusBadge from './AppointmentStatusBadge';

/** Rows on the board before the reader is sent to the full schedule. */
const SHOWN = 6;

/** A patient is either still to be seen, or already dealt with. */
const OPEN_STATUSES = new Set(['scheduled', 'confirmed']);

/** Where the workbench returns a doctor who reached it from the dashboard. */
const DASHBOARD_ORIGIN = { to: '/doctor/dashboard', label: 'Dashboard' };

interface TodaysScheduleCardProps {
  /**
   * `doctor` rows open the consultation workbench, because seeing the patient
   * is what a doctor does with a booking. `receptionist` rows open the
   * appointment itself, which is what the desk changes.
   */
  view: 'doctor' | 'receptionist';
  /** Bumped by the dashboard's Refresh, so one control reloads every panel. */
  refreshKey?: number;
}

/**
 * Today's bookings in clock order.
 *
 * The dashboards used to carry counters alone — "6 appointments today" with no
 * way to see who they were. This is the list those counters are counting, with
 * the next thing to do on each row.
 */
export default function TodaysScheduleCard({ view, refreshKey = 0 }: TodaysScheduleCardProps) {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const live = useLiveConsultations(view === 'doctor', refreshKey);

  const load = useCallback(async () => {
    setError('');
    try {
      const today = localDay();
      // Doctors are scoped to their own diary server-side.
      const data = await getAppointments({ dateFrom: today, dateTo: today, limit: 50 });
      setAppointments(
        [...data.appointments].sort((a, b) => a.startTime.localeCompare(b.startTime))
      );
      setTotal(data.pagination.total);
    } catch (err) {
      setAppointments([]);
      setError(getErrorMessage(err, "Unable to load today's schedule."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <Card
      title={view === 'doctor' ? "Today's clinic" : "Today's schedule"}
      subtitle="In clock order"
      icon="appointments"
      actions={
        <Link
          to={`/${view}/appointments`}
          className="-mr-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800"
        >
          Full schedule
          <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
        </Link>
      }
      footer={
        appointments && total > SHOWN
          ? `Showing the next ${SHOWN} of ${total} booked today.`
          : undefined
      }
    >
      {error ? (
        <p className="py-8 text-center text-sm text-slate-500">{error}</p>
      ) : appointments === null ? (
        <ul className="space-y-2.5" aria-label="Loading today's schedule">
          {[0, 1, 2, 3].map((row) => (
            <li key={row} className="h-12 w-full rounded-xl skeleton" />
          ))}
        </ul>
      ) : appointments.length === 0 ? (
        <EmptyState
          title="Nothing booked today"
          description={
            view === 'doctor'
              ? 'Your clinic is clear. Anything booked later today appears here.'
              : 'Book an appointment and it shows up here, in time order.'
          }
          action={
            view === 'receptionist' ? (
              <Link to="/receptionist/appointments/new">
                <Button size="sm">Book appointment</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {appointments.slice(0, SHOWN).map((appointment) => (
            <Row
              key={appointment._id}
              appointment={appointment}
              view={view}
              live={live}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function Row({
  appointment,
  view,
  live,
}: {
  appointment: Appointment;
  view: 'doctor' | 'receptionist';
  live: Map<string, Consultation>;
}) {
  const open = OPEN_STATUSES.has(appointment.status);
  const patient = appointment.patientId;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="w-14 shrink-0">
        <p className="text-sm font-semibold tabular-nums text-slate-900">
          {appointment.startTime}
        </p>
        <p className="text-[0.6875rem] tabular-nums text-slate-500">{appointment.endTime}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {patient ? `${patient.firstName} ${patient.lastName}` : 'Patient removed'}
        </p>
        <p className="truncate text-xs text-slate-500">
          {patient && <span className="tabular-nums">{patient.patientId}</span>}
          {view === 'receptionist' && appointment.doctorId && (
            <> · Dr. {appointment.doctorId.firstName} {appointment.doctorId.lastName}</>
          )}
          {appointment.reason && <> · {appointment.reason}</>}
        </p>
      </div>

      <AppointmentStatusBadge status={appointment.status} />

      {view === 'doctor' && open ? (
        <ConsultationAction appointment={appointment} live={live} origin={DASHBOARD_ORIGIN} />
      ) : (
        <Link to={`/appointments/${appointment._id}`}>
          <Button variant="ghost" size="sm">
            Details
            <Icon name="chevronRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
          </Button>
        </Link>
      )}
    </li>
  );
}
