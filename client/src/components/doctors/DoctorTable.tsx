import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { canManageDoctors } from '../../utils/permissions';
import type { Doctor } from '../../types';
import Table, { type Column } from '../ui/Table';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import type { ReactNode } from 'react';

const departmentName = (doctor: Doctor): string =>
  typeof doctor.departmentId === 'object' && doctor.departmentId
    ? doctor.departmentId.name
    : '—';

interface DoctorTableProps {
  doctors: Doctor[];
  loading?: boolean;
  emptyState?: ReactNode;
  onToggleStatus?: (doctor: Doctor) => void;
  togglingId?: string | null;
}

/** Shared doctor directory table; management actions appear for admin only. */
export default function DoctorTable({
  doctors,
  loading = false,
  emptyState,
  onToggleStatus,
  togglingId = null,
}: DoctorTableProps) {
  const { role } = useAuth();
  const manage = canManageDoctors(role);

  const columns: Column<Doctor>[] = [
    {
      key: 'doctorId',
      header: 'Doctor ID',
      render: (d) => <span className="font-medium text-brand-800">{d.doctorId}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (d) => (
        <div>
          <p className="font-medium text-slate-800">
            Dr. {d.firstName} {d.lastName}
          </p>
          <p className="text-slate-500">{d.email}</p>
        </div>
      ),
    },
    { key: 'specialization', header: 'Specialization' },
    { key: 'department', header: 'Department', render: departmentName },
    {
      key: 'phone',
      header: 'Phone',
      render: (d) => d.phone || <span className="text-slate-400">—</span>,
    },
    {
      key: 'experienceYears',
      header: 'Experience',
      render: (d) =>
        d.experienceYears !== undefined ? `${d.experienceYears} yrs` : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) =>
        d.status === 'active' ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (d) => (
        <div className="flex justify-end gap-2">
          {manage && (
            <>
              <Link to={`/admin/doctors/${d._id}`}>
                <Button variant="ghost" size="sm">
                  View
                </Button>
              </Link>
              <Link to={`/admin/doctors/${d._id}/edit`}>
                <Button variant="secondary" size="sm">
                  Edit
                </Button>
              </Link>
              {onToggleStatus && (
                <Button
                  variant={d.status === 'active' ? 'danger' : 'secondary'}
                  size="sm"
                  loading={togglingId === d._id}
                  onClick={() => onToggleStatus(d)}
                >
                  {d.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return <Table columns={columns} rows={doctors} loading={loading} emptyState={emptyState} />;
}
