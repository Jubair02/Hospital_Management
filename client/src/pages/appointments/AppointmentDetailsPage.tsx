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
} from '../../utils/permissions';
import { formatDate } from '../../utils/date';
import {
  APPOINTMENT_TRANSITIONS,
  type Appointment,
  type AppointmentStatus,
} from '../../types';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Alert from '../../components/ui/Alert';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import AppointmentStatusBadge from '../../components/appointments/AppointmentStatusBadge';

const ACTION_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Mark scheduled',
  confirmed: 'Confirm',
  completed: 'Mark completed',
  cancelled: 'Cancel appointment',
  no_show: 'Mark no-show',
};

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">
        {value ? (
          <span className="text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </dd>
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

  // Valid transitions from the current status, intersected with what
  // this role may do (the backend re-validates both).
  const availableActions = APPOINTMENT_TRANSITIONS[appointment.status].filter((target) => {
    if (target === 'cancelled') return canCancelAppointment(role);
    return allowedStatusTargets(role).includes(target);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {appointment.appointmentId}
            </h1>
            <AppointmentStatusBadge status={appointment.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(appointment.appointmentDate)} · {appointment.startTime}–
            {appointment.endTime}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={appointmentsListPath(role)}>
            <Button variant="ghost">Back to list</Button>
          </Link>
          {role === 'doctor' &&
            (appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
              <Link to={`/doctor/appointments/${appointment._id}/consultation`}>
                <Button>Open consultation</Button>
              </Link>
            )}
          {availableActions.map((target) => (
            <Button
              key={target}
              variant={target === 'cancelled' ? 'danger' : 'secondary'}
              onClick={() => setPendingStatus(target)}
            >
              {ACTION_LABELS[target]}
            </Button>
          ))}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Appointment">
          <dl className="space-y-3">
            <Row label="Date" value={formatDate(appointment.appointmentDate)} />
            <Row label="Time" value={`${appointment.startTime}–${appointment.endTime}`} />
            <Row label="Reason" value={appointment.reason} />
            <Row label="Notes" value={appointment.notes} />
            <Row
              label="Created by"
              value={
                appointment.createdBy
                  ? `${appointment.createdBy.firstName} ${appointment.createdBy.lastName}`
                  : undefined
              }
            />
            <Row label="Booked on" value={formatDate(appointment.createdAt)} />
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title="Patient">
            {appointment.patientId ? (
              <dl className="space-y-3">
                <Row
                  label="Name"
                  value={`${appointment.patientId.firstName} ${appointment.patientId.lastName}`}
                />
                <Row label="Patient ID" value={appointment.patientId.patientId} />
                <Row label="Phone" value={appointment.patientId.phone} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">Patient record unavailable.</p>
            )}
            {appointment.patientId && (
              <div className="mt-4">
                <Link to={`/patients/${appointment.patientId._id}`}>
                  <Button variant="ghost" size="sm">
                    View patient profile
                  </Button>
                </Link>
              </div>
            )}
          </Card>

          <Card title="Doctor">
            {appointment.doctorId ? (
              <dl className="space-y-3">
                <Row
                  label="Name"
                  value={`Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`}
                />
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
        title={pendingStatus ? ACTION_LABELS[pendingStatus] : ''}
        confirmLabel={pendingStatus ? ACTION_LABELS[pendingStatus] : 'Confirm'}
        tone={pendingStatus === 'cancelled' ? 'danger' : 'primary'}
        busy={busy}
        onConfirm={applyStatus}
        onCancel={() => setPendingStatus(null)}
      >
        {pendingStatus === 'cancelled' ? (
          <p>
            This appointment will be cancelled. The record is kept for history and the time slot
            becomes available again.
          </p>
        ) : (
          <p>
            The appointment will be marked as{' '}
            <strong>{pendingStatus?.replace('_', '-')}</strong>.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
