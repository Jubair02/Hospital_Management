import { useCallback, useEffect, useState } from 'react';
import { getAppointments } from '../../services/appointmentService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Appointment, Pagination as PaginationInfo } from '../../types';
import Card from '../ui/Card';
import Table, { type Column } from '../ui/Table';
import Alert from '../ui/Alert';
import Pagination from '../ui/Pagination';
import AppointmentStatusBadge from './AppointmentStatusBadge';

/** Appointment history section on the patient profile. */
export default function PatientAppointmentsCard({ patientMongoId }: { patientMongoId: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAppointments({ patientId: patientMongoId, page, limit: 5 });
      setAppointments(data.appointments);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load appointment history.'));
    } finally {
      setLoading(false);
    }
  }, [patientMongoId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<Appointment>[] = [
    { key: 'date', header: 'Date', render: (a) => formatDate(a.appointmentDate) },
    {
      key: 'time',
      header: 'Time',
      render: (a) => `${a.startTime}–${a.endTime}`,
    },
    {
      key: 'doctor',
      header: 'Doctor',
      render: (a) =>
        a.doctorId ? `Dr. ${a.doctorId.firstName} ${a.doctorId.lastName}` : '—',
    },
    {
      key: 'department',
      header: 'Department',
      render: (a) => a.departmentId?.name ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <AppointmentStatusBadge status={a.status} />,
    },
  ];

  return (
    <Card title="Appointments" subtitle="Visit history for this patient">
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <Table
        columns={columns}
        rows={appointments}
        loading={loading}
        emptyState={<p className="text-center text-sm text-slate-500">No appointments yet.</p>}
      />
      <div className="mt-3">
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={setPage}
          disabled={loading}
        />
      </div>
    </Card>
  );
}
