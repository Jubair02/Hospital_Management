import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/date';
import type { Appointment } from '../../types';
import Table, { type Column } from '../ui/Table';
import Button from '../ui/Button';
import AppointmentStatusBadge from './AppointmentStatusBadge';
import type { ReactNode } from 'react';

interface AppointmentTableProps {
  appointments: Appointment[];
  loading?: boolean;
  emptyState?: ReactNode;
  /** Hide the doctor column on the doctor's own view. */
  showDoctor?: boolean;
}

export default function AppointmentTable({
  appointments,
  loading = false,
  emptyState,
  showDoctor = true,
}: AppointmentTableProps) {
  const columns: Column<Appointment>[] = [
    {
      key: 'appointmentId',
      header: 'ID',
      render: (a) => <span className="font-medium text-brand-800">{a.appointmentId}</span>,
    },
    {
      key: 'patient',
      header: 'Patient',
      render: (a) =>
        a.patientId ? (
          <div>
            <p className="font-medium text-slate-800">
              {a.patientId.firstName} {a.patientId.lastName}
            </p>
            <p className="text-slate-500">{a.patientId.patientId}</p>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    ...(showDoctor
      ? [
          {
            key: 'doctor',
            header: 'Doctor',
            render: (a: Appointment) =>
              a.doctorId ? (
                <div>
                  <p className="font-medium text-slate-800">
                    Dr. {a.doctorId.firstName} {a.doctorId.lastName}
                  </p>
                  <p className="text-slate-500">{a.doctorId.specialization}</p>
                </div>
              ) : (
                <span className="text-slate-400">—</span>
              ),
          } satisfies Column<Appointment>,
        ]
      : []),
    {
      key: 'department',
      header: 'Department',
      render: (a) => a.departmentId?.name ?? <span className="text-slate-400">—</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (a) => formatDate(a.appointmentDate),
    },
    {
      key: 'time',
      header: 'Time',
      render: (a) => (
        <span className="whitespace-nowrap">
          {a.startTime}–{a.endTime}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <AppointmentStatusBadge status={a.status} />,
    },
    {
      key: 'createdBy',
      header: 'Created by',
      render: (a) =>
        a.createdBy ? (
          `${a.createdBy.firstName} ${a.createdBy.lastName}`
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (a) => (
        <Link to={`/appointments/${a._id}`}>
          <Button variant="ghost" size="sm">
            View
          </Button>
        </Link>
      ),
    },
  ];

  return <Table columns={columns} rows={appointments} loading={loading} emptyState={emptyState} />;
}
