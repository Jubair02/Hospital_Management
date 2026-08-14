import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getAppointment, cancelAppointment } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { PortalAppointment } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import FullPageSpinner from '../../components/ui/FullPageSpinner';
import PageHeader from '../../components/ui/PageHeader';
import { AppointmentStatusBadge, doctorLabel } from './portalShared';

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value ?? '—'}</dd>
    </div>
  );
}

export default function PortalAppointmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const [appointment, setAppointment] = useState<PortalAppointment | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>(
    () => (location.state as { flash?: string } | null)?.flash ?? ''
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setAppointment(await getAppointment(id));
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load this appointment.'));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async () => {
    if (!appointment) return;
    setBusy(true);
    try {
      const updated = await cancelAppointment(appointment._id);
      setAppointment(updated);
      setNotice('Appointment cancelled. The time slot has been released.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to cancel this appointment.'));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  if (error && !appointment) return <Alert tone="error">{error}</Alert>;
  if (!appointment) return <FullPageSpinner label="Loading appointment" />;

  const cancellable = appointment.status === 'scheduled' || appointment.status === 'confirmed';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title={appointment.appointmentId}
        subtitle={`${formatDate(appointment.appointmentDate)} · ${appointment.startTime}–${appointment.endTime}`}
        meta={<AppointmentStatusBadge status={appointment.status} />}
        actions={
          <>
            <Link to="/patient/appointments">
              <Button variant="secondary">All appointments</Button>
            </Link>
            {cancellable && (
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                Cancel appointment
              </Button>
            )}
          </>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Visit">
          <dl className="divide-y divide-slate-100">
            <Row label="Date" value={formatDate(appointment.appointmentDate)} />
            <Row label="Time" value={`${appointment.startTime}–${appointment.endTime}`} />
            <Row label="Reason" value={appointment.reason} />
            {appointment.notes && <Row label="Notes" value={appointment.notes} />}
            <Row label="Booked on" value={formatDate(appointment.createdAt)} />
          </dl>
        </Card>

        <Card title="Care team">
          <dl className="divide-y divide-slate-100">
            <Row label="Doctor" value={doctorLabel(appointment.doctorId)} />
            <Row label="Department" value={appointment.departmentId?.name} />
          </dl>
          <p className="mt-4 text-sm text-slate-500">
            Arrive 10 minutes early. If you cannot attend, please cancel so the slot can help
            someone else.
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Cancel this appointment?"
        confirmLabel="Cancel appointment"
        tone="danger"
        busy={busy}
        onConfirm={handleCancel}
        onCancel={() => setConfirmOpen(false)}
      >
        {`${doctorLabel(appointment.doctorId)} on ${formatDate(appointment.appointmentDate)} at ${appointment.startTime}. This cannot be undone from the portal.`}
      </ConfirmDialog>
    </div>
  );
}
