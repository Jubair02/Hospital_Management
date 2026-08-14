import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { canEditPatient } from '../../utils/permissions';
import { calculateAge, formatDate } from '../../utils/date';
import type { Patient } from '../../types';
import Table, { type Column } from '../ui/Table';
import Button from '../ui/Button';
import PatientStatusBadge from './PatientStatusBadge';
import type { ReactNode } from 'react';

interface PatientTableProps {
  patients: Patient[];
  loading?: boolean;
  emptyState?: ReactNode;
}

/**
 * Shared patient table for every role. The Edit action appears only for
 * roles that may edit; the backend enforces the same rule.
 */
export default function PatientTable({ patients, loading = false, emptyState }: PatientTableProps) {
  const { role } = useAuth();
  const showEdit = canEditPatient(role);

  const columns: Column<Patient>[] = [
    {
      key: 'patientId',
      header: 'Patient ID',
      render: (p) => <span className="font-medium text-brand-800">{p.patientId}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (p) => (
        <div>
          <p className="font-medium text-slate-800">
            {p.firstName} {p.lastName}
          </p>
          {p.email && <p className="text-slate-500">{p.email}</p>}
        </div>
      ),
    },
    {
      key: 'age',
      header: 'Age',
      render: (p) => p.age ?? calculateAge(p.dateOfBirth),
    },
    {
      key: 'gender',
      header: 'Gender',
      render: (p) => <span className="capitalize">{p.gender}</span>,
    },
    { key: 'phone', header: 'Phone' },
    {
      key: 'bloodGroup',
      header: 'Blood group',
      render: (p) => (p.bloodGroup === 'unknown' ? <span className="text-slate-400">—</span> : p.bloodGroup),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <PatientStatusBadge status={p.status} />,
    },
    {
      key: 'createdAt',
      header: 'Registered',
      render: (p) => formatDate(p.createdAt),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (p) => (
        <div className="flex justify-end gap-2">
          <Link to={`/patients/${p._id}`}>
            <Button variant="ghost" size="sm">
              View
            </Button>
          </Link>
          {showEdit && (
            <Link to={`/patients/${p._id}/edit`}>
              <Button variant="secondary" size="sm">
                Edit
              </Button>
            </Link>
          )}
        </div>
      ),
    },
  ];

  return <Table columns={columns} rows={patients} loading={loading} emptyState={emptyState} />;
}
