import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/date';
import { isAppointmentOverdue, type Appointment } from '../../types';
import Table, { type Column } from '../ui/Table';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import AppointmentStatusBadge from './AppointmentStatusBadge';
import type { ReactNode } from 'react';

interface AppointmentTableProps {
  appointments: Appointment[];
  loading?: boolean;
  emptyState?: ReactNode;
  /** Hide the doctor column on the doctor's own view. */
  showDoctor?: boolean;
  /**
   * Passed straight to the table's own footer strip — pagination belongs
   * inside the surface holding the rows it pages through, not floating
   * beneath it.
   */
  footer?: ReactNode;
  /**
   * Replaces the row's View button. A doctor's list opens clinical records
   * rather than booking details, so the action differs by who is reading.
   */
  renderAction?: (appointment: Appointment) => ReactNode;
}

export default function AppointmentTable({
  appointments,
  loading = false,
  emptyState,
  showDoctor = true,
  footer,
  renderAction,
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
      render: (a) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <AppointmentStatusBadge status={a.status} />
          {/* Its day has gone but it still holds the doctor's time. Nothing
              closes these on their own, so the list is where they surface. */}
          {isAppointmentOverdue(a) && <Badge tone="amber">Overdue</Badge>}
        </div>
      ),
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
      render: (a) =>
        renderAction ? (
          renderAction(a)
        ) : (
          <Link to={`/appointments/${a._id}`}>
            <Button variant="ghost" size="sm">
              View
            </Button>
          </Link>
        ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={appointments}
      loading={loading}
      emptyState={emptyState}
      footer={footer}
    />
  );
}
