import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDispensings } from '../../services/pharmacyService';
import { getErrorMessage } from '../../services/api';
import { formatDate } from '../../utils/date';
import type { DispensingRecord, Pagination as PaginationInfo } from '../../types';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Table, { type Column } from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import PageHeader from '../../components/ui/PageHeader';

export default function DispensingHistoryPage() {
  const [records, setRecords] = useState<DispensingRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDispensings({ page, limit: 10 });
      setRecords(data.records);
      setPagination(data.pagination);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load dispensing history.'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: Column<DispensingRecord>[] = [
    {
      key: 'dispensingId',
      header: 'ID',
      render: (d) => <span className="font-medium text-brand-800">{d.dispensingId}</span>,
    },
    { key: 'date', header: 'Date', render: (d) => formatDate(d.createdAt) },
    {
      key: 'patient',
      header: 'Patient',
      render: (d) =>
        d.patientId ? (
          <div>
            <p className="font-medium text-slate-800">
              {d.patientId.firstName} {d.patientId.lastName}
            </p>
            <p className="text-slate-500">{d.patientId.patientId}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'items',
      header: 'Medicines',
      render: (d) => d.items.map((i) => `${i.medicineName} × ${i.quantity}`).join(', '),
    },
    {
      key: 'dispensedBy',
      header: 'Dispensed by',
      render: (d) =>
        d.dispensedBy ? `${d.dispensedBy.firstName} ${d.dispensedBy.lastName}` : '—',
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (d) =>
        typeof d.consultationId === 'object' && d.consultationId ? (
          <Link to={`/pharmacy/prescriptions/${d.consultationId._id}`}>
            <Button variant="ghost" size="sm">
              Open prescription
            </Button>
          </Link>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispensing history"
        subtitle="Every dispensing event, newest first."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Table
        columns={columns}
        rows={records}
        loading={loading}
        emptyState={<p className="text-center text-sm text-slate-500">Nothing dispensed yet.</p>}
        footer={
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            disabled={loading}
          />
        }
      />
    </div>
  );
}
