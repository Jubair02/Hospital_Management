import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdmissions } from '../../services/inpatientService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { Admission, Pagination as PaginationInfo } from '../../types';
import Card from '../ui/Card';
import Alert from '../ui/Alert';
import Table, { type Column } from '../ui/Table';
import Pagination from '../ui/Pagination';
import { AdmissionStatusBadge } from './InpatientBadges';

/** Admission history section on the patient profile. */
export default function PatientAdmissionsCard({ patientMongoId }: { patientMongoId: string }) {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
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
      const data = await getAdmissions({ patientId: patientMongoId, page, limit: 5 });
      setAdmissions(data.admissions);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load admission history.'));
    } finally {
      setLoading(false);
    }
  }, [patientMongoId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const current = admissions.find((a) => a.isActive);

  const columns: Column<Admission>[] = [
    {
      key: 'admissionId',
      header: 'Admission',
      render: (a) => (
        <Link
          to={`/inpatient/admissions/${a._id}`}
          className="font-medium text-brand-800 hover:underline"
        >
          {a.admissionId}
        </Link>
      ),
    },
    { key: 'ward', header: 'Ward', render: (a) => a.wardId?.name ?? '—' },
    { key: 'bed', header: 'Bed', render: (a) => a.bedId?.bedNumber ?? '—' },
    { key: 'admitted', header: 'Admitted', render: (a) => formatDate(a.admissionDate) },
    {
      key: 'discharged',
      header: 'Discharged',
      render: (a) => (a.dischargeDate ? formatDate(a.dischargeDate) : '—'),
    },
    { key: 'status', header: 'Status', render: (a) => <AdmissionStatusBadge status={a.status} /> },
  ];

  return (
    <Card
      title="Admissions"
      subtitle={
        current
          ? `Currently admitted — ${current.wardId?.name ?? ''} / bed ${current.bedId?.bedNumber ?? ''}`
          : 'Inpatient history'
      }
    >
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <Table
        columns={columns}
        rows={admissions}
        loading={loading}
        emptyState={<p className="text-center text-sm text-slate-500">No admissions yet.</p>}
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
