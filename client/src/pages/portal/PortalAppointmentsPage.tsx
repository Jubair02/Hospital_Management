import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAppointments, cancelAppointment } from '../../services/portalService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Pagination as PaginationInfo, PortalAppointment } from '../../types';
import { APPOINTMENT_STATUSES } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Select from '../../components/ui/Select';
import Table, { type Column } from '../../components/ui/Table';
import { AppointmentStatusBadge, doctorLabel, humanize } from './portalShared';

const CANCELLABLE = new Set(['scheduled', 'confirmed']);

export default function PortalAppointmentsPage() {
  const [appointments, setAppointments] = useState<PortalAppointment[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [cancelling, setCancelling] = useState<PortalAppointment | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAppointments({ page, limit: 10, status: status || undefined });
      setAppointments(data.appointments);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load your appointments.'));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async () => {
    if (!cancelling) return;
    setCancelBusy(true);
    setError('');
    try {
      await cancelAppointment(cancelling._id);
      setNotice(`Appointment ${cancelling.appointmentId} cancelled.`);
      setCancelling(null);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to cancel this appointment.'));
      setCancelling(null);
    } finally {
      setCancelBusy(false);
    }
  };

  const columns: Column<PortalAppointment>[] = [
    {
      key: 'when',
      header: 'When',
      render: (a) => (
        <div>
          <p className="font-medium text-slate-800">{formatDate(a.appointmentDate)}</p>
          <p className="text-slate-500">
            {a.startTime}–{a.endTime}
          </p>
        </div>
      ),
    },
    {
      key: 'doctor',
      header: 'Doctor',
      render: (a) => (
        <div>
          <p className="font-medium text-slate-800">{doctorLabel(a.doctorId)}</p>
          {a.departmentId && <p className="text-slate-500">{a.departmentId.name}</p>}
        </div>
      ),
    },
    { key: 'reason', header: 'Reason', render: (a) => <span className="text-slate-600">{a.reason}</span> },
    { key: 'status', header: 'Status', render: (a) => <AppointmentStatusBadge status={a.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (a) => (
        <div className="flex justify-end gap-2">
          <Link to={`/patient/appointments/${a._id}`}>
            <Button variant="ghost" size="sm">
              Details
            </Button>
          </Link>
          {CANCELLABLE.has(a.status) && (
            <Button variant="secondary" size="sm" onClick={() => setCancelling(a)}>
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Patient portal"
        title="My appointments"
        subtitle="Everything you have booked — upcoming and past."
        actions={
          <Link to="/patient/appointments/new">
            <Button>Book appointment</Button>
          </Link>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="mb-4 max-w-56">
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={APPOINTMENT_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
            placeholder="All statuses"
          />
        </div>

        <Table
          columns={columns}
          rows={appointments}
          loading={loading}
          emptyState={
            <EmptyState
              title="No appointments"
              description="Book your first visit with a doctor."
              action={
                <Link to="/patient/appointments/new">
                  <Button size="sm">Book appointment</Button>
                </Link>
              }
            />
          }
        />

        <div className="mt-4">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        </div>
      </Card>

      <ConfirmDialog
        open={cancelling !== null}
        title="Cancel this appointment?"
        confirmLabel="Cancel appointment"
        tone="danger"
        busy={cancelBusy}
        onConfirm={handleCancel}
        onCancel={() => setCancelling(null)}
      >
        {cancelling
          ? `${doctorLabel(cancelling.doctorId)} on ${formatDate(cancelling.appointmentDate)} at ${cancelling.startTime}. The time slot will be released.`
          : ''}
      </ConfirmDialog>
    </div>
  );
}
