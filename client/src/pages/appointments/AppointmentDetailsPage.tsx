import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import {
  getAppointmentById,
  updateAppointmentStatus,
} from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import {
  allowedStatusTargets,
  appointmentsListPath,
  canCancelAppointment,
  canMarkAppointmentCompleted,
} from '../../utils/permissions';
import { formatDate } from '../../utils/date';
import { toMinutes } from '../../components/appointments/appointmentSlots';
import {
  APPOINTMENT_TRANSITIONS,
  isAppointmentOverdue,
  MANUAL_APPOINTMENT_ACTIONS,
  type Appointment,
  type AppointmentStatus,
} from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Icon from '../../components/ui/icons';
import AppointmentStatusBadge from '../../components/appointments/AppointmentStatusBadge';

/**
 * The transitions a person drives. Confirmation has no button at all —
 * starting a consultation is what confirms an appointment — and `scheduled`
 * was never a target of any transition, so it never had one either.
 */
const ACTION_LABELS: Partial<Record<AppointmentStatus, string>> = {
  completed: 'Mark completed',
  no_show: 'Mark no-show',
  cancelled: 'Cancel appointment',
};

/** A short fact: label left, value right. Wrong shape for prose — see `Field`. */
function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right">
        {value ? (
          <span className="text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </dd>
    </div>
  );
}

/**
 * A fact that is a sentence rather than a value. Reason and notes were being
 * right-aligned in a two-column row, so a full sentence ran back towards the
 * middle of the card and wrapped against its own label.
 */
function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1.5 text-pretty text-sm leading-relaxed text-slate-800">
        {value || <span className="text-slate-400">Not recorded</span>}
      </dd>
    </div>
  );
}

/**
 * The date as a calendar chip. An appointment is a thing that happens at a
 * time, and "Thu 20 Aug" read off a tile answers that before any label is.
 *
 * Parsed the same way `formatDate` parses it, so the tile and every date
 * printed beside it always agree.
 */
function DateTile({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString(undefined, options);

  return (
    <div
      aria-hidden="true"
      className="flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md ring-1 ring-inset ring-brand-700/20"
    >
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-brand-100">
        {part({ weekday: 'short' })}
      </span>
      <span className="text-2xl font-semibold leading-none tabular-nums">
        {part({ day: 'numeric' })}
      </span>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-brand-100">
        {part({ month: 'short' })}
      </span>
    </div>
  );
}

export default function AppointmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { role } = useAuth();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );
  const [pendingStatus, setPendingStatus] = useState<AppointmentStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      setAppointment(await getAppointmentById(id));
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this appointment.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const applyStatus = async () => {
    if (!appointment || !pendingStatus) return;
    setBusy(true);
    try {
      const updated = await updateAppointmentStatus(appointment._id, pendingStatus);
      setAppointment(updated);
      setNotice(`Appointment marked as ${pendingStatus.replace('_', '-')}.`);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update the status.'));
    } finally {
      setBusy(false);
      setPendingStatus(null);
    }
  };

  if (loading) return <FullPageSpinner label="Loading appointment" />;

  if (!appointment) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error || 'Appointment not found.'}</Alert>
        <Link to={appointmentsListPath(role)}>
          <Button variant="secondary">Back to appointments</Button>
        </Link>
      </div>
    );
  }

  // Three filters, in this order: what the status allows, which of those a
  // person drives, and which of those this role may apply. Iterating the
  // action list rather than the transition list is what fixes the order on
  // screen. The backend re-validates every one of them.
  const availableActions = MANUAL_APPOINTMENT_ACTIONS.filter((target) =>
    APPOINTMENT_TRANSITIONS[appointment.status].includes(target)
  ).filter((target) => {
    if (target === 'cancelled') return canCancelAppointment(role);
    if (target === 'completed') return canMarkAppointmentCompleted(role);
    return allowedStatusTargets(role).includes(target);
  });

  const open = appointment.status === 'scheduled' || appointment.status === 'confirmed';
  const consultationLabel =
    appointment.status === 'scheduled' ? 'Start consultation' : 'Open consultation';

  const patientName = appointment.patientId
    ? `${appointment.patientId.firstName} ${appointment.patientId.lastName}`
    : undefined;
  const doctorName = appointment.doctorId
    ? `Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`
    : undefined;

  // Shown rather than assumed: slot length is a system setting, and an older
  // appointment may have been booked under a different one.
  const durationMinutes = toMinutes(appointment.endTime) - toMinutes(appointment.startTime);

  return (
    <div className="space-y-6">
      {/* Grouped with the heading rather than spaced a whole section away: a
          back link reads as belonging to what it sits above. */}
      <div className="space-y-3">
        {/* Navigation, deliberately not in the action row. That row is for
            things that change the appointment, and mixing the two put a
            harmless escape hatch beside Cancel appointment. */}
        <Link
          to={appointmentsListPath(role)}
          className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-900"
        >
          <Icon name="chevronLeft" className="h-4 w-4" strokeWidth="2.2" />
          Appointments
        </Link>

        {/* One surface carrying who, with whom, and when - the three things
            anyone opening an appointment came to read. The reference number
            used to be the heading; it is a filing code, not the subject. */}
        <section className="surface-card relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-white"
          />

          <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-6">
            <DateTile value={appointment.appointmentDate} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-xl font-semibold tracking-[-0.014em] text-slate-900 sm:text-2xl">
                  {patientName ?? appointment.appointmentId}
                </h1>
                <AppointmentStatusBadge status={appointment.status} />
              </div>

              {doctorName && (
                <p className="mt-1.5 text-sm text-slate-600">
                  with {doctorName}
                  {appointment.doctorId?.specialization && (
                    <span className="text-slate-400"> &middot; {appointment.doctorId.specialization}</span>
                  )}
                </p>
              )}

              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
                <span className="font-medium tabular-nums">
                  {appointment.startTime}&ndash;{appointment.endTime}
                </span>
                {durationMinutes > 0 && (
                  <span className="text-slate-400">&middot; {durationMinutes} minutes</span>
                )}
                <span className="text-slate-300" aria-hidden="true">
                  &middot;
                </span>
                <span className="text-slate-500">{formatDate(appointment.appointmentDate)}</span>
              </p>

              <p className="mt-3 text-xs text-slate-500">
                Reference{' '}
                <span className="font-semibold tabular-nums text-slate-700">
                  {appointment.appointmentId}
                </span>
              </p>
            </div>
          </div>

          {/* Actions sit on the same surface as the thing they act on, and
              only render when there is something to do. */}
          {(availableActions.length > 0 || (role === 'doctor' && open)) && (
            <div className="relative flex flex-col gap-2 border-t border-line bg-slate-50/70 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {role === 'doctor' && open && (
                <p className="text-xs leading-relaxed text-slate-500 sm:mr-auto sm:max-w-[20rem]">
                  {appointment.status === 'confirmed'
                    ? 'Finishing the consultation completes this appointment. '
                    : ''}
                  Reception moves and cancels appointments.
                </p>
              )}

              {availableActions.map((target) => (
                <Button
                  key={target}
                  variant={target === 'cancelled' ? 'dangerGhost' : 'secondary'}
                  className="w-full sm:w-auto"
                  onClick={() => setPendingStatus(target)}
                >
                  {ACTION_LABELS[target]}
                </Button>
              ))}

              {/* Last, so the one action that moves the appointment forward
                  sits where the eye finishes. */}
              {role === 'doctor' && open && (
                <Link to={`/doctor/appointments/${appointment._id}/consultation`}>
                  <Button className="w-full sm:w-auto">{consultationLabel}</Button>
                </Link>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Said once, plainly: this one is still holding a slot. */}
      {isAppointmentOverdue(appointment) && (
        <Alert tone="warning">
          This appointment's date has passed while it is still {appointment.status}. Until it is
          closed out it keeps holding the doctor's time, so that slot cannot be booked again.
        </Alert>
      )}

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {/* Prose on the left where it has room to be a sentence; the two people
          on the right, each with the way through to their record. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <Card
          title="Visit"
          icon="clipboard"
          footer={
            <span>
              Booked {formatDate(appointment.createdAt)}
              {appointment.createdBy &&
                ` by ${appointment.createdBy.firstName} ${appointment.createdBy.lastName}`}
            </span>
          }
        >
          <dl className="space-y-5">
            <Field label="Reason for visit" value={appointment.reason} />
            <Field label="Notes" value={appointment.notes} />
          </dl>
        </Card>

        <div className="space-y-6">
          <Card
            title="Patient"
            icon="patients"
            actions={
              appointment.patientId && (
                <Link
                  to={`/patients/${appointment.patientId._id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-800"
                >
                  Open record
                  <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
                </Link>
              )
            }
          >
            {appointment.patientId ? (
              <dl className="space-y-3">
                <Row label="Name" value={patientName} />
                <Row label="Patient ID" value={appointment.patientId.patientId} />
                <Row label="Phone" value={appointment.patientId.phone} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">Patient record unavailable.</p>
            )}
          </Card>

          <Card
            title="Doctor"
            icon="doctors"
            actions={
              // Only admins have a doctor profile route; linking it for anyone
              // else would be a dead end.
              role === 'admin' &&
              appointment.doctorId && (
                <Link
                  to={`/admin/doctors/${appointment.doctorId._id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-800"
                >
                  Open record
                  <Icon name="arrowRight" className="h-3.5 w-3.5" strokeWidth="2.2" />
                </Link>
              )
            }
          >
            {appointment.doctorId ? (
              <dl className="space-y-3">
                <Row label="Name" value={doctorName} />
                <Row label="Doctor ID" value={appointment.doctorId.doctorId} />
                <Row label="Specialization" value={appointment.doctorId.specialization} />
                <Row label="Department" value={appointment.departmentId?.name} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">Doctor record unavailable.</p>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title={(pendingStatus && ACTION_LABELS[pendingStatus]) || ''}
        confirmLabel={(pendingStatus && ACTION_LABELS[pendingStatus]) || 'Confirm'}
        // Completing is a tidy-up, not a destructive act — only the two that
        // close an appointment against the patient carry the red treatment.
        tone={pendingStatus === 'completed' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={applyStatus}
        onCancel={() => setPendingStatus(null)}
      >
        {/* All three are terminal, so each one says so in its own terms. */}
        {pendingStatus === 'completed' ? (
          <p>
            Use this when the patient was seen but the consultation record was never finished.
            The appointment closes for good and its time slot is released. The clinical record is
            not affected — if a consultation is still open, it stays open.
          </p>
        ) : pendingStatus === 'cancelled' ? (
          <p>
            This appointment will be cancelled and cannot be reopened. The record is kept for
            history, and the time slot becomes available to book again.
          </p>
        ) : (
          <p>
            This records that the patient did not attend. It cannot be undone, and the time slot
            becomes available to book again.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
